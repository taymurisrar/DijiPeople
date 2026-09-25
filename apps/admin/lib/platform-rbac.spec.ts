import {
  DEFAULT_NEW_PLATFORM_ROLE,
  PLATFORM_ROLES,
  formatPlatformRole,
  isAssignablePlatformRole,
  isPlatformSuperAdmin,
  platformRoleOptions,
  type PlatformRole,
} from "./platform-rbac";

/*
 * Role handling in this app is enforced by string comparison, which the
 * compiler cannot check. `role !== "SUPER_ADMIN"` is valid TypeScript and
 * silently excludes PLATFORM_OWNER — the current name for the same access
 * level. That shipped across five call sites and locked the platform owner out
 * of three settings pages, tenant slug editing, and part of the sidebar.
 *
 * These pin the rules those call sites depend on.
 */

const OWNER_LEVEL: PlatformRole[] = ["SUPER_ADMIN", "PLATFORM_OWNER"];

describe("isPlatformSuperAdmin", () => {
  it.each(OWNER_LEVEL)("grants owner-level access to %s", (role) => {
    expect(isPlatformSuperAdmin(role)).toBe(true);
  });

  it("denies every other role", () => {
    const others = PLATFORM_ROLES.filter(
      (role) => !OWNER_LEVEL.includes(role as PlatformRole),
    );
    /* Guards against a future role accidentally inheriting owner access. */
    for (const role of others) {
      expect(isPlatformSuperAdmin(role)).toBe(false);
    }
    expect(others.length).toBeGreaterThan(0);
  });

  it("denies a missing role rather than defaulting open", () => {
    expect(isPlatformSuperAdmin(undefined)).toBe(false);
    expect(isPlatformSuperAdmin(null)).toBe(false);
  });
});

describe("PLATFORM_ROLES", () => {
  it("matches the roles the API and Prisma define", () => {
    /*
     * Kept in step by hand across three files. A role added to the Prisma enum
     * but not here cannot be displayed or assigned in this app.
     */
    expect(PLATFORM_ROLES).toHaveLength(16);
    expect(PLATFORM_ROLES).toEqual(
      expect.arrayContaining([
        "SUPER_ADMIN",
        "PLATFORM_OWNER",
        "PLATFORM_ADMIN",
        "PLATFORM_OPERATIONS",
        "PRESALES_MANAGER",
        "PRESALES_USER",
        "PARTNER_MANAGER",
        "CONTRACT_MANAGER",
        "LEGAL_REVIEWER",
        "FINANCE_MANAGER",
        "BILLING_USER",
        "SUPPORT_MANAGER",
        "SUPPORT_AGENT",
        "MONITORING_OPERATOR",
        "READ_ONLY_AUDITOR",
        "MEMBER",
      ]),
    );
  });

  it("has no duplicates", () => {
    expect(new Set(PLATFORM_ROLES).size).toBe(PLATFORM_ROLES.length);
  });
});

describe("formatPlatformRole", () => {
  /*
   * BUG-3547. SUPER_ADMIN was labelled "Platform Owner (legacy Super Admin)"
   * beside PLATFORM_OWNER, so the picker offered two "Platform Owner" roles
   * with identical permissions. ADR-0018 names SUPER_ADMIN the single top role.
   */
  it("labels the top role Platform Super Admin, and no two roles alike", () => {
    expect(formatPlatformRole("SUPER_ADMIN")).toBe("Platform Super Admin");
    expect(formatPlatformRole("MEMBER")).toBe("Legacy Member (deprecated)");
    const labels = PLATFORM_ROLES.map(formatPlatformRole);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("renders every role as readable text, never a raw enum", () => {
    for (const role of PLATFORM_ROLES) {
      const label = formatPlatformRole(role);
      expect(label.trim()).not.toBe("");
      expect(label).not.toMatch(/_/);
    }
  });
});

describe("BUG-3547 the role picker offers each role once", () => {
  const values = (options: Array<{ value: PlatformRole }>) =>
    options.map((option) => option.value);

  it("does not offer PLATFORM_OWNER or MEMBER for a new user", () => {
    const offered = values(platformRoleOptions());
    expect(offered).not.toContain("PLATFORM_OWNER");
    expect(offered).not.toContain("MEMBER");
    expect(offered).toContain("SUPER_ADMIN");
    expect(offered).toHaveLength(PLATFORM_ROLES.length - 2);
    // Exactly one option reads as the top role.
    expect(
      platformRoleOptions().filter((option) =>
        /Owner|Super Admin/.test(option.label),
      ),
    ).toEqual([{ label: "Platform Super Admin", value: "SUPER_ADMIN" }]);
  });

  it("keeps an existing legacy member's own role selectable, and only theirs", () => {
    const offered = values(platformRoleOptions("MEMBER"));
    expect(offered).toContain("MEMBER");
    expect(offered).not.toContain("PLATFORM_OWNER");
  });

  it("defaults a new user to an assignable, least-privileged role", () => {
    expect(isAssignablePlatformRole(DEFAULT_NEW_PLATFORM_ROLE)).toBe(true);
    expect(isPlatformSuperAdmin(DEFAULT_NEW_PLATFORM_ROLE)).toBe(false);
  });
});
