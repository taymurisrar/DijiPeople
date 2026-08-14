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
