import { buildTenantLoginUrl, buildTenantPortalUrl } from "./tenant-url";

/**
 * Open Tenant, and every other link an operator follows into a customer's
 * workspace.
 *
 * These assertions exist because this file used to build the URL itself and had
 * drifted from `buildWorkspaceUrl` — the function the shared config says is the
 * only place the rule may live. The divergence was not theoretical: admin keyed
 * on `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` while the shared rule keys on
 * `TENANT_BASE_DOMAIN`, so with the repository's own development configuration
 * admin produced a query-parameter link and the API produced a subdomain link
 * for the same workspace.
 */
describe("tenant portal URLs", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  function configure(env: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it("addresses a workspace by subdomain, with the development port", () => {
    configure({
      PLATFORM_ENVIRONMENT: "development",
      TENANT_BASE_DOMAIN: "localhost",
      WEB_APP_URL: "http://localhost:3001",
      NEXT_PUBLIC_APP_BASE_URL: undefined,
    });
    // Port 80 is where nothing listens; this is the whole defect.
    expect(buildTenantLoginUrl("xoul-ltd")).toBe(
      "http://xoul-ltd.localhost:3001/login",
    );
  });

  it("normalises the slug rather than trusting its casing", () => {
    configure({
      PLATFORM_ENVIRONMENT: "development",
      TENANT_BASE_DOMAIN: "localhost",
      WEB_APP_URL: "http://localhost:3001",
    });
    expect(buildTenantLoginUrl("  Xoul-LTD  ")).toBe(
      "http://xoul-ltd.localhost:3001/login",
    );
  });

  it("uses https and no port once a tenant base domain is deployed", () => {
    configure({
      PLATFORM_ENVIRONMENT: "production",
      TENANT_BASE_DOMAIN: "dijipeople.com",
      WEB_APP_URL: "https://app.dijipeople.com",
    });
    expect(buildTenantLoginUrl("maseer")).toBe(
      "https://maseer.dijipeople.com/login",
    );
  });

  it("falls back to the slug parameter when no workspace hostname exists", () => {
    /*
     * Not a failure mode — it is how local development works before a tenant
     * base domain is configured, and the link must still reach the workspace.
     */
    configure({
      PLATFORM_ENVIRONMENT: "development",
      TENANT_BASE_DOMAIN: undefined,
      PUBLIC_BASE_DOMAIN: undefined,
      NEXT_PUBLIC_TENANT_BASE_DOMAIN: undefined,
      NEXT_PUBLIC_TENANT_ROOT_DOMAIN: undefined,
      NEXT_PUBLIC_WEB_ROOT_DOMAIN: undefined,
      WEB_APP_PROD_ROOT_DOMAIN: undefined,
      WEB_APP_URL: "http://localhost:3001",
    });
    const url = new URL(buildTenantLoginUrl("xoul-ltd"));
    expect(url.host).toBe("localhost:3001");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("workspace")).toBe("xoul-ltd");
  });

  it("carries query parameters onto the workspace URL", () => {
    configure({
      PLATFORM_ENVIRONMENT: "development",
      TENANT_BASE_DOMAIN: "localhost",
      WEB_APP_URL: "http://localhost:3001",
    });
    const url = new URL(
      buildTenantPortalUrl("xoul-ltd", "/activate", {
        token: "abc123",
        // Empty and nullish values are dropped rather than sent as "null",
        // which is what an activation link with `?token=null` would be.
        missing: null,
        blank: "",
      }),
    );
    expect(url.searchParams.get("token")).toBe("abc123");
    expect(url.searchParams.has("missing")).toBe(false);
    expect(url.searchParams.has("blank")).toBe(false);
  });
});
