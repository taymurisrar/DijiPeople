export const PLATFORM_ROLES = [
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
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/*
 * PLATFORM_OWNER stays owner-level here although it is no longer assignable
 * (ADR-0018): existing holders were migrated to SUPER_ADMIN, but the enum value
 * remains until a contract step, and an account still holding it must not lose
 * access in the console before the API stops honouring it.
 */
export function isPlatformSuperAdmin(role?: PlatformRole | null) {
  return role === "SUPER_ADMIN" || role === "PLATFORM_OWNER";
}

/**
 * Roles that may not be given to anyone new (ADR-0018, BUG-3547).
 *
 * PLATFORM_OWNER duplicated SUPER_ADMIN exactly (`platform.*` both) and the
 * picker showed both as "Platform Owner". MEMBER is the pre-role-expansion
 * catch-all. Existing MEMBER accounts keep working; the API refuses a new
 * assignment of either with a 400, and the picker does not offer them.
 */
export const NON_ASSIGNABLE_PLATFORM_ROLES: readonly PlatformRole[] = [
  "PLATFORM_OWNER",
  "MEMBER",
];

export function isAssignablePlatformRole(role: PlatformRole) {
  return !NON_ASSIGNABLE_PLATFORM_ROLES.includes(role);
}

/**
 * The role picker's options. The user's current role is kept even when it is
 * no longer assignable, so editing a legacy MEMBER shows what they hold and
 * saving their name does not silently change their access.
 */
export function platformRoleOptions(currentRole?: PlatformRole | null) {
  return PLATFORM_ROLES.filter(
    (role) => isAssignablePlatformRole(role) || role === currentRole,
  ).map((role) => ({ label: formatPlatformRole(role), value: role }));
}

/** The least-privileged role, used as the new-user default. */
export const DEFAULT_NEW_PLATFORM_ROLE: PlatformRole = "READ_ONLY_AUDITOR";

const ROLE_LABELS: Partial<Record<PlatformRole, string>> = {
  SUPER_ADMIN: "Platform Super Admin",
  PLATFORM_OWNER: "Platform Owner (legacy)",
  MEMBER: "Legacy Member (deprecated)",
};

export function formatPlatformRole(role: PlatformRole) {
  const label = ROLE_LABELS[role];
  if (label) return label;
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
