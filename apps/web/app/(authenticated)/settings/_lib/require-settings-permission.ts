import { redirect } from "next/navigation";
import { getSessionUser, SessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { ROLE_KEYS } from "@/lib/security-keys";

const SETTINGS_ADMIN_ROLES = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
]);

export function hasSettingsAdministratorRole(user: SessionUser | null) {
  if (!user) return false;

  return (user.roleKeys ?? []).some((roleKey) =>
    SETTINGS_ADMIN_ROLES.has(roleKey),
  );
}

export function hasCustomizationAdministratorRole(
  user: SessionUser | null,
) {
  if (!user) return false;

  return (user.roleKeys ?? []).some(
    (roleKey) =>
      roleKey === ROLE_KEYS.GLOBAL_ADMIN ||
      roleKey === ROLE_KEYS.SYSTEM_CUSTOMIZER,
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
  /*
   * `/settings`, not `/settings/tenant`.
   *
   * `/settings/tenant` was quoted out of the canonical settings document, which
   * still described the pre-runtime flat route map. It has not resolved since
   * the settings runtime landed: `[category]/page.tsx` calls
   * `getSettingsRuntimeCategory(key)` and `notFound()`s on a miss, and `tenant`
   * is an item key, not one of the eleven categories. So a permission failure
   * redirected the user to a 404 — the wrong answer twice over, since it also
   * told them nothing about why. BUG-0045.
   *
   * `/settings` is the right target for a different reason too: it renders an
   * access-denied state rather than redirecting, so there is no loop and the
   * user is told what happened.
   */
  fallbackHref = "/settings",
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

export async function requireCustomizationAccess(
  permissionKeys: readonly string[] = ["customization.read"],
  fallbackHref = "/settings/access/roles",
) {
  const user = await getSessionUser();

  if (!user) {
    redirect(fallbackHref);
  }

  if (!hasCustomizationAdministratorRole(user)) {
    redirect(fallbackHref);
  }

  const allowed =
    permissionKeys.length === 0 ||
    hasAnyPermission(user.permissionKeys, permissionKeys);

  if (!allowed) {
    redirect(fallbackHref);
  }

  return user;
}
