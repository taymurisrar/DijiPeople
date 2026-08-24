import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveForwardedHostname } from "@repo/config";
import { classifyHostname } from "./workspace-routing";

/**
 * A forged `X-Forwarded-Host` must not select a workspace.
 *
 * `proxy.ts` resolves the request hostname once, before anything else, and the
 * rest of the middleware consumes that verdict — so this pair of calls *is* the
 * workspace routing decision. Until ITEM-0044 the proxy preferred
 * `x-forwarded-host` unconditionally, on every request in every environment,
 * which handed workspace selection to anyone who could reach the Next.js server
 * without a sanitising edge in front of it.
 *
 * The test exercises the resolver and the classifier together rather than
 * importing `proxy.ts`, which is not loadable under this app's jest config
 * without the Next runtime. The logic under test is entirely in the two
 * functions below; the middleware only forwards their answer.
 *
 * The API's equivalent is `request-hostname.spec.ts`. Both must hold: the rule
 * is shared, but each surface applies it at its own boundary.
 */

describe("workspace routing and the forwarded host", () => {
  const ENV_KEYS = [
    "PLATFORM_ENVIRONMENT",
    "TENANT_BASE_DOMAIN",
    "PUBLIC_BASE_DOMAIN",
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    process.env.PLATFORM_ENVIRONMENT = "production";
    process.env.TENANT_BASE_DOMAIN = "dijipeople.com";
    process.env.PUBLIC_BASE_DOMAIN = "dijipeople.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  const headers = (map: Record<string, string>) => ({
    get: (name: string): string | null => map[name.toLowerCase()] ?? null,
  });

  const classifyFor = (
    map: Record<string, string>,
    env: Record<string, string | undefined>,
  ) => classifyHostname(resolveForwardedHostname(headers(map), env));

  describe("without a declared proxy", () => {
    const untrusted = {};

    it("ignores a forged forwarded host and uses Host", () => {
      expect(
        resolveForwardedHostname(
          headers({
            host: "app.internal",
            "x-forwarded-host": "maseer.dijipeople.com",
          }),
          untrusted,
        ),
      ).toBe("app.internal");
    });

    /*
     * The case that actually matters. An attacker does not forge a nonsense
     * host — they name a real customer's workspace, because the point is to be
     * served that workspace's branding and to have the browser scope its
     * cookies there. So the assertion is not "the header was ignored" but "a
     * valid workspace hostname in the header still selects no workspace".
     */
    it("does not classify a real workspace named only in the forwarded header", () => {
      expect(classifyHostname("maseer.dijipeople.com").kind).toBe(
        "WORKSPACE_HOST",
      );

      const spoofed = classifyFor(
        { host: "app.internal", "x-forwarded-host": "maseer.dijipeople.com" },
        untrusted,
      );

      expect(spoofed.kind).toBe("CANDIDATE");
      expect(spoofed).not.toHaveProperty("slug");
    });

    it("fails closed to INVALID when only a forwarded header is present", () => {
      expect(
        classifyFor({ "x-forwarded-host": "maseer.dijipeople.com" }, untrusted)
          .kind,
      ).toBe("INVALID");
    });

    it("still resolves the genuine workspace from Host", () => {
      expect(
        classifyFor({ host: "maseer.dijipeople.com" }, untrusted),
      ).toMatchObject({ kind: "WORKSPACE_HOST", slug: "maseer" });
    });

    it("ignores a forged RFC 7239 Forwarded header too", () => {
      expect(
        classifyFor(
          {
            host: "app.internal",
            forwarded: "host=maseer.dijipeople.com;proto=https",
          },
          untrusted,
        ).kind,
      ).toBe("CANDIDATE");
    });
  });

  describe("behind a declared proxy", () => {
    /*
     * The deployed topology must keep working: apps/web runs on Vercel, whose
     * edge overwrites X-Forwarded-Host, and Host there is the internal address.
     * A change that fixed the spoofing case by breaking this one would take
     * every tenant workspace offline.
     */
    it("prefers the forwarded host on Vercel", () => {
      expect(
        classifyFor(
          { host: "app.internal", "x-forwarded-host": "maseer.dijipeople.com" },
          { VERCEL: "1" },
        ),
      ).toMatchObject({ kind: "WORKSPACE_HOST", slug: "maseer" });
    });

    it("prefers the forwarded host when TRUST_PROXY_HEADERS says so", () => {
      expect(
        resolveForwardedHostname(
          headers({
            host: "app.internal",
            "x-forwarded-host": "maseer.dijipeople.com",
          }),
          { TRUST_PROXY_HEADERS: "true" },
        ),
      ).toBe("maseer.dijipeople.com");
    });

    it("lets TRUST_PROXY_HEADERS=false override the platform inference", () => {
      expect(
        resolveForwardedHostname(
          headers({
            host: "app.internal",
            "x-forwarded-host": "maseer.dijipeople.com",
          }),
          { VERCEL: "1", TRUST_PROXY_HEADERS: "false" },
        ),
      ).toBe("app.internal");
    });

    /*
     * Suffix matching stays exact through the resolver — a trusted proxy is not
     * a licence to skip hostname validation.
     */
    it("does not resolve a suffix-extended lookalike", () => {
      const result = classifyFor(
        { "x-forwarded-host": "maseer.dijipeople.com.attacker.com" },
        { VERCEL: "1" },
      );

      expect(result.kind).toBe("CANDIDATE");
      expect(result).not.toHaveProperty("slug");
    });
  });
  /*
   * The cases above prove the resolver is correct. They do not prove the
   * middleware uses it — and `proxy.ts` cannot be imported here without the
   * Next runtime, so nothing else in this suite would notice the call site
   * being reverted to `request.headers.get("x-forwarded-host")`.
   *
   * This app has been bitten by exactly that shape before: a comment in
   * `lib/forwarded-headers.ts` claimed a build-failing guarantee that no file
   * implemented, and the convention happened to hold. A guard that passes while
   * the behaviour is gone is worse than no guard, so the call site is asserted
   * directly.
   */
  describe("the middleware call site", () => {
    const proxySource = readFileSync(
      join(__dirname, "..", "proxy.ts"),
      "utf8",
    );

    it("resolves the request hostname through the shared rule", () => {
      expect(proxySource).toContain(
        "resolveForwardedHostname(request.headers, process.env)",
      );
    });

    it("does not read a forwarded host header directly", () => {
      expect(proxySource).not.toMatch(/get\(\s*["']x-forwarded-host["']\s*\)/i);
      expect(proxySource).not.toMatch(/get\(\s*["']forwarded["']\s*\)/i);
    });
  });
});
