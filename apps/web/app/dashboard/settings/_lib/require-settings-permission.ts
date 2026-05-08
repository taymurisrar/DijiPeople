import { redirect } from "next/navigation";
import { getSessionUser, SessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { ROLE_KEYS } from "@/lib/security-keys";

const SETTINGS_ADMIN_ROLES = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
]);

export function hasSettingsAdministratorRole(user: SessionUser | null) {
  if (!user) return false;

  return (user.roleKeys ?? []).some((roleKey) =>
    SETTINGS_ADMIN_ROLES.has(roleKey),
  );
}

export function hasSettingsPermission(
  user: SessionUser | null,
  permissionKey: string,
) {
  return (
    hasSettingsAdministratorRole(user) ||
    (user?.permissionKeys ?? []).includes(permissionKey)
  );
}

export function hasAnySettingsPermission(
  user: SessionUser | null,
  permissionKeys: readonly string[],
) {
  return (
    hasSettingsAdministratorRole(user) ||
    hasAnyPermission(user?.permissionKeys, permissionKeys)
  );
}

export async function requireSettingsPermissions(
  permissionKeys: readonly string[],
  fallbackHref = "/dashboard/settings/tenant",
) {
  const user = await getSessionUser();

  if (!user) {
    redirect(fallbackHref);
  }

  if (!hasAnySettingsPermission(user, permissionKeys)) {
    redirect(fallbackHref);
  }

  return user;
}
