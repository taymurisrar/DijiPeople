import {
  classifyHostname,
  getDevelopmentFallbackWorkspaceSlug,
  getLocalWorkspaceSlug,
  isDevelopmentWorkspaceFallbackAllowed,
} from "./workspace-routing";

/**
 * The edge classification that decides, before any database work, whether a
 * hostname could be a workspace at all. The tests that matter are the ones where
 * a wrong answer serves one customer's workspace to a request for another.
 */
describe("workspace routing", () => {
  /*
   * NODE_ENV is deliberately not touched. It is typed read-only, and every case
   * here sets PLATFORM_ENVIRONMENT, which takes precedence over it.
   */
  const ENV_KEYS = [
    "PLATFORM_ENVIRONMENT",
    "TENANT_BASE_DOMAIN",
    "PUBLIC_BASE_DOMAIN",
    "DEFAULT_TENANT_SLUG",
    "NEXT_PUBLIC_DEFAULT_TENANT_SLUG",
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  const production = () => {
    process.env.PLATFORM_ENVIRONMENT = "production";
    process.env.TENANT_BASE_DOMAIN = "dijipeople.com";
    process.env.PUBLIC_BASE_DOMAIN = "dijipeople.com";
  };

  describe("classifyHostname", () => {
    it("recognises a workspace subdomain and extracts the slug", () => {
      production();
      expect(classifyHostname("maseer.dijipeople.com")).toEqual({
        kind: "WORKSPACE_HOST",
        hostname: "maseer.dijipeople.com",
        slug: "maseer",
      });
    });

    it("recognises the discovery host as belonging to no workspace", () => {
      production();
      expect(classifyHostname("app.dijipeople.com").kind).toBe("DISCOVERY");
    });

    it("does not treat a suffix-confusion hostname as a workspace", () => {
      /*
       * `maseer.dijipeople.com.attacker.com` is an attacker-controlled origin.
       * Classifying it as WORKSPACE_HOST with slug "maseer" would hand that
       * origin the Maseer workspace.
       */
      production();
      const result = classifyHostname("maseer.dijipeople.com.attacker.com");
      expect(result.kind).toBe("CANDIDATE");
      expect(result).not.toHaveProperty("slug");
    });

    it("classifies an unrelated hostname as a candidate for a custom-domain lookup", () => {
      production();
      expect(classifyHostname("hr.maseergroup.com").kind).toBe("CANDIDATE");
    });

    it("treats an empty or missing host as invalid rather than as a default", () => {
      production();
      expect(classifyHostname(null).kind).toBe("INVALID");
      expect(classifyHostname("").kind).toBe("INVALID");
      expect(classifyHostname(undefined).kind).toBe("INVALID");
    });

    it("normalizes case and port before deciding", () => {
      production();
      expect(classifyHostname("MASEER.DijiPeople.com:443")).toMatchObject({
        kind: "WORKSPACE_HOST",
        slug: "maseer",
      });
    });

    it("recognises local origins", () => {
      process.env.PLATFORM_ENVIRONMENT = "development";
      for (const host of ["localhost", "127.0.0.1", "maseer.localhost"]) {
        expect(classifyHostname(host).kind).toBe("LOCAL");
      }
    });
  });

  describe("getLocalWorkspaceSlug", () => {
    it("extracts a single label from a .localhost origin", () => {
      expect(getLocalWorkspaceSlug("maseer.localhost")).toBe("maseer");
    });

    it("returns nothing for plain localhost or a nested label", () => {
      expect(getLocalWorkspaceSlug("localhost")).toBe("");
      expect(getLocalWorkspaceSlug("a.b.localhost")).toBe("");
    });
  });

  describe("development fallback", () => {
    it("is refused in production even when a default slug is configured", () => {
      /*
       * The single most dangerous configuration in this system: a production
       * deployment that answers an unknown hostname with somebody's workspace.
       */
      production();
      process.env.DEFAULT_TENANT_SLUG = "maseer";
      process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG = "maseer";
      expect(isDevelopmentWorkspaceFallbackAllowed()).toBe(false);
      expect(getDevelopmentFallbackWorkspaceSlug()).toBe("");
    });

    it("is refused in staging", () => {
      process.env.PLATFORM_ENVIRONMENT = "staging";
      process.env.DEFAULT_TENANT_SLUG = "maseer";
      expect(isDevelopmentWorkspaceFallbackAllowed()).toBe(false);
      expect(getDevelopmentFallbackWorkspaceSlug()).toBe("");
    });

    it("is allowed only in development, and only when configured", () => {
      process.env.PLATFORM_ENVIRONMENT = "development";
      delete process.env.DEFAULT_TENANT_SLUG;
      delete process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG;
      expect(isDevelopmentWorkspaceFallbackAllowed()).toBe(true);
      expect(getDevelopmentFallbackWorkspaceSlug()).toBe("");

      process.env.DEFAULT_TENANT_SLUG = " Maseer ";
      expect(getDevelopmentFallbackWorkspaceSlug()).toBe("maseer");
    });
  });
});
