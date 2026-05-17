export type PlatformRole = "SUPER_ADMIN" | "PLATFORM_MEMBER";

export function resolvePlatformRole(roleKeys: string[] = []): PlatformRole | null {
  if (roleKeys.includes("system-admin")) return "SUPER_ADMIN";
  if (roleKeys.includes("system-customizer")) return "PLATFORM_MEMBER";
  return null;
}

export function isPlatformSuperAdmin(roleKeys: string[] = []) {
  return resolvePlatformRole(roleKeys) === "SUPER_ADMIN";
}
