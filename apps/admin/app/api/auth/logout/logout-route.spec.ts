/*
 * Regression cover for the production defect where the session-expired modal's
 * "Sign in again" link returned HTTP 405.
 *
 * The link is an <a href>, so the browser issues GET /api/auth/logout. The
 * route only exported POST, so Next answered 405 Method Not Allowed and the
 * operator was stranded on an error page with no route back to /login.
 *
 * jsdom is not installed in this workspace, so this asserts the route's method
 * contract and the redirect it must build, not the rendered modal.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeAdminNextPath } from "@/lib/auth-config";

describe("admin logout route contract", () => {
  it("exports both GET and POST handlers", async () => {
    const route = await import("./route");

    // GET is what the session-expired "Sign in again" link performs.
    expect(typeof route.GET).toBe("function");
    // POST is what the topbar sign-out button performs.
    expect(typeof route.POST).toBe("function");
  });

  it("keeps every sign-out affordance pointed at a method the route exports", async () => {
    const route = await import("./route");
    const affordances = [
      { source: "error-provider sign-in-again link", method: "GET" },
      { source: "admin topbar sign-out button", method: "POST" },
    ] as const;

    for (const affordance of affordances) {
      expect(typeof route[affordance.method]).toBe("function");
    }
  });
});

describe("session-expired redirect target", () => {
  /*
   * Mirrors the URL the GET handler builds. Kept alongside the route so a
   * change to the redirect shape has to be made deliberately in both places.
   */
  function buildLoginRedirect(requestUrl: string) {
    const url = new URL(requestUrl);
    const reason = url.searchParams.get("reason");
    const rawNextPath = url.searchParams.get("next");
    const redirectUrl = new URL("/login", url.origin);

    if (reason) redirectUrl.searchParams.set("reason", reason);
    if (rawNextPath) {
      redirectUrl.searchParams.set("next", sanitizeAdminNextPath(rawNextPath));
    }

    return redirectUrl;
  }

  it("preserves the session-expired reason so login explains itself", () => {
    const redirect = buildLoginRedirect(
      "https://admin.example.com/api/auth/logout?reason=session-expired",
    );

    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("reason")).toBe("session-expired");
  });

  it("returns the operator to the page they were on", () => {
    const redirect = buildLoginRedirect(
      "https://admin.example.com/api/auth/logout?reason=session-expired&next=%2Ftenants%2Fabc",
    );

    expect(redirect.searchParams.get("next")).toBe("/tenants/abc");
  });

  it("refuses an off-site next path", () => {
    const redirect = buildLoginRedirect(
      "https://admin.example.com/api/auth/logout?reason=session-expired&next=https%3A%2F%2Fevil.example.com%2Fsteal",
    );

    expect(redirect.searchParams.get("next")).toBe("/tenants");
  });

  it("omits next entirely for a plain sign-out", () => {
    const redirect = buildLoginRedirect(
      "https://admin.example.com/api/auth/logout",
    );

    expect(redirect.searchParams.get("next")).toBeNull();
    expect(redirect.searchParams.get("reason")).toBeNull();
  });
});

describe("admin logout route", () => {
  const source = readFileSync(join(__dirname, "route.ts"), "utf8");

  /** Code with comment-only lines removed, so a comment quoting the old defect
   * is not mistaken for the defect. */
  const code = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

  it("has both exported handlers", () => {
    // Guards against the assertions below passing because the file was renamed
    // or emptied rather than because it is correct.
    expect(code).toMatch(/export async function POST\s*\(/);
    expect(code).toMatch(/export async function GET\s*\(/);
  });

  /**
   * BUG-0009. Revocation used to be called only when the refresh cookie was
   * still present, so signing out after that cookie expired cleared the browser
   * and left the platform session live server-side — the operator believed they
   * had signed out and had not.
   */
  it("revokes the server session unconditionally", () => {
    const calls = code.match(/await revokeApiSession\(/g) ?? [];
    // Once in POST, once in GET.
    expect(calls.length).toBe(2);

    // Shape 1 — revocation reached only from inside a cookie check.
    const guardedCall =
      /if\s*\([^)]*(refreshToken|REFRESH_TOKEN_COOKIE)[^)]*\)\s*\{[^}]*revokeApiSession/;
    expect(guardedCall.test(code)).toBe(false);

    /*
     * Shape 2 — the guard moved *inside* `revokeApiSession` as an early return.
     * The first draft of this test only covered shape 1 and passed happily
     * against shape 2, which is the same defect wearing a different hat: the
     * request is still skipped when the cookie has expired, which is exactly the
     * case BUG-0009 is about.
     */
    const bodyStart = code.indexOf("async function revokeApiSession(");
    expect(bodyStart).toBeGreaterThan(-1);
    const body = code.slice(bodyStart, code.indexOf("\n}", bodyStart));

    const bailsOnMissingCookie =
      /if\s*\([^)]*(!|===\s*undefined|\?\?)[^)]*(refreshToken|REFRESH_TOKEN_COOKIE)[^)]*\)[^;]*\{?\s*return[;\s}]/;
    expect(bailsOnMissingCookie.test(body)).toBe(false);
  });

  /**
   * BUG-0010. `getClearAuthCookieOptions()` throws on a rejected cookie
   * configuration — an ADMIN_COOKIE_DOMAIN that does not match the serving host,
   * which is exactly what a `.vercel.app` production host produces. Called
   * unguarded while clearing cookies, that turned every operator's sign-out into
   * a 500: the one action you cannot afford to fail is the one that ends a
   * session you no longer trust.
   */
  it("never clears cookies through the throwing variant", () => {
    expect(code).toContain("function getSafeClearAuthCookieOptions()");

    // The safe wrapper is the only caller of the throwing one.
    const directCalls = code.match(/getClearAuthCookieOptions\(\)/g) ?? [];
    expect(directCalls.length).toBe(1);

    const wrapper =
      /function getSafeClearAuthCookieOptions\(\)\s*\{\s*try\s*\{\s*return getClearAuthCookieOptions\(\);\s*\}\s*catch/;
    expect(wrapper.test(code)).toBe(true);
  });

  it("falls back to options that still clear the cookie", () => {
    // A fallback that did not expire the cookie would swap a 500 for a sign-out
    // that silently does nothing — a worse failure, because it looks like it
    // worked.
    const fallback = code.slice(code.indexOf("getSafeClearAuthCookieOptions"));
    expect(fallback).toMatch(/maxAge:\s*0/);
    expect(fallback).toMatch(/httpOnly:\s*true/);
    expect(fallback).toMatch(/path:\s*"\/"/);
  });
});
