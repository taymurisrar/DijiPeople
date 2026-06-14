export type PlatformRole = "SUPER_ADMIN" | "MEMBER";

export function isPlatformSuperAdmin(role?: PlatformRole | null) {
  return role === "SUPER_ADMIN";
}
