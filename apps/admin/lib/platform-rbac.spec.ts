import {
  PLATFORM_ROLES,
  formatPlatformRole,
  isPlatformSuperAdmin,
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
  it("labels the legacy role so its equivalence is visible in the UI", () => {
    expect(formatPlatformRole("SUPER_ADMIN")).toContain("Platform Owner");
  });

  it("renders every role as readable text, never a raw enum", () => {
    for (const role of PLATFORM_ROLES) {
      const label = formatPlatformRole(role);
      expect(label.trim()).not.toBe("");
      expect(label).not.toMatch(/_/);
    }
  });
});
