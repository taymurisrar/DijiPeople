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

export function isPlatformSuperAdmin(role?: PlatformRole | null) {
  return role === "SUPER_ADMIN" || role === "PLATFORM_OWNER";
}

export function formatPlatformRole(role: PlatformRole) {
  if (role === "SUPER_ADMIN") return "Platform Owner (legacy Super Admin)";
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
