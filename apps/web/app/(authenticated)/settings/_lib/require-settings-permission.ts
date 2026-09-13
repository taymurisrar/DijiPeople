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

export type CustomizationAccessCheck = {
  user: SessionUser | null;
  allowed: boolean;
};

/*
 * ADR-0013 / BUG-3491 — Customization is authorized by the `customization.*`
 * permission keys alone. No role is consulted.
 *
 * BUG-3374 first moved this off a role-only check onto
 * `hasAnySettingsPermission`, which admits three administrator roles *or* any
 * one key. The API kept its own role-only rule, so the owner — System
 * Administrator, every customization key — passed here and then met a 403 from
 * every page's first API call. The API now checks the same keys, and so does
 * this: every key the page's API calls need, held outright.
 *
 * Elevated roles and the tenant owner lose nothing: the API gives them every
 * foundation key at sign-in, and the session carries those keys.
 *
 * No redirect: the caller renders `AccessDeniedState` in place, so a denial
 * lands on the URL the user asked for.
 */
export function hasCustomizationPermissions(
  user: SessionUser | null,
  permissionKeys: readonly string[],
) {
  if (!user || permissionKeys.length === 0) return false;
  const held = new Set(user.permissionKeys ?? []);
  return permissionKeys.every((key) => held.has(key));
}

export async function requireCustomizationAccess(
  permissionKeys: readonly string[] = ["customization.read"],
): Promise<CustomizationAccessCheck> {
  const user = await getSessionUser();

  return {
    user,
    allowed: hasCustomizationPermissions(user, permissionKeys),
  };
}
