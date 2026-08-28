import { getTenantHintFromHost } from "./tenant-resolution";
import { buildTenantLoginUrl } from "./tenant-url";

/*
 * BUG-1644. Workspaces are served from `ws.dijipeople.com`, a two-label root
 * under the apex. Production was serving a bundle built with
 * `NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com` — the value the documentation
 * prescribed at the time — and a single wrong value broke the login in two
 * independent directions at once.
 *
 * Outbound, `buildTenantPortalUrl` composed `<slug>.dijipeople.com`, which does
 * not resolve in DNS, so pressing Continue on the company-code step navigated
 * to a dead host. Inbound, host resolution strips the root domain and requires
 * what remains to contain no dot; `<slug>.ws.dijipeople.com` minus
 * `dijipeople.com` leaves `<slug>.ws`, which does, so a request that arrived at
 * the right workspace was treated as belonging to no tenant.
 *
 * Both halves are asserted here because they fail together and are fixed
 * together, and because the inbound half is the quiet one: it degrades to
 * "which company are you?" rather than to an error, which is why the defect
 * reached a paying customer.
 *
 * The value itself lives in deployment configuration and cannot be tested from
 * here. What these tests hold is the code's behaviour *given* the value — that
 * a multi-label root domain is composed and parsed correctly, rather than
 * something that only ever worked for a single-label one.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_WEB_ROOT_DOMAIN",
  "WEB_APP_PROD_ROOT_DOMAIN",
  "NEXT_PUBLIC_APP_BASE_URL",
] as const;

describe("a multi-label tenant root domain", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    process.env.NEXT_PUBLIC_APP_BASE_URL = "https://app.dijipeople.com";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  describe("outbound — the URL the browser is sent to", () => {
    it("composes the slug under the full workspace root", () => {
      process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN = "ws.dijipeople.com";

      expect(buildTenantLoginUrl("qa-e2e-signup-b-20260826")).toBe(
        "https://qa-e2e-signup-b-20260826.ws.dijipeople.com/login",
      );
    });

    it("falls back to the apex host rather than inventing a subdomain", () => {
      // With no root domain configured the app must not guess. Sending the
      // user to the app's own login is recoverable; sending them to a host
      // that does not exist is not.
      delete process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN;
      delete process.env.WEB_APP_PROD_ROOT_DOMAIN;

      expect(buildTenantLoginUrl("qa-e2e-signup-b-20260826")).toBe(
        "https://app.dijipeople.com/login",
      );
    });
  });

  describe("inbound — the slug read back off the host", () => {
    it("extracts the slug from a workspace host", () => {
      process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN = "ws.dijipeople.com";

      expect(
        getTenantHintFromHost("qa-e2e-signup-b-20260826.ws.dijipeople.com"),
      ).toMatchObject({ type: "slug", value: "qa-e2e-signup-b-20260826" });
    });

    it("does not treat the bare workspace root as a tenant", () => {
      process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN = "ws.dijipeople.com";

      expect(getTenantHintFromHost("ws.dijipeople.com")).not.toMatchObject({
        type: "slug",
      });
    });
  });

  /*
   * The regression itself, stated as the behaviour that must NOT come back.
   * This is the pairing that shipped: workspaces addressed under `ws.` while
   * the app believed the root was the apex.
   */
  describe("the BUG-1644 pairing", () => {
    it("round-trips a slug when the root domain matches how workspaces are served", () => {
      process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN = "ws.dijipeople.com";

      const url = new URL(buildTenantLoginUrl("acme"));

      expect(getTenantHintFromHost(url.hostname)).toMatchObject({
        type: "slug",
        value: "acme",
      });
    });

    it("loses the slug when the root domain is the apex instead", () => {
      // Documents the production failure rather than asserting it is desirable:
      // the composed host is undeliverable, and the host a customer actually
      // reaches resolves to no tenant. Both follow from the one value.
      process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN = "dijipeople.com";

      expect(buildTenantLoginUrl("acme")).toBe(
        "https://acme.dijipeople.com/login",
      );
      expect(
        getTenantHintFromHost("acme.ws.dijipeople.com"),
      ).not.toMatchObject({ type: "slug" });
    });
  });
});
