export type PlatformRole = "SUPER_ADMIN" | "MEMBER";

export function resolvePlatformRole(
  roleKeys: string[] = [],
): PlatformRole | null {
  if (roleKeys.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  if (roleKeys.includes("MEMBER")) return "MEMBER";
  if (roleKeys.includes("system-admin")) return "SUPER_ADMIN";
  if (roleKeys.includes("system-customizer")) return "MEMBER";
  return null;
}

export function isPlatformSuperAdmin(roleKeys: string[] = []) {
  return resolvePlatformRole(roleKeys) === "SUPER_ADMIN";
}
