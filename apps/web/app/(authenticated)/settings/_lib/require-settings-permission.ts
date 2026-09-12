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
 * BUG-3374 — this used to gate on role membership only
 * (`GLOBAL_ADMIN`/`SYSTEM_CUSTOMIZER`) and redirect to a hardcoded legacy
 * Roles URL on denial, while the settings navigation catalog and every page
 * under `/settings/customization/*` gate on the `customization.read`
 * permission through `hasAnySettingsPermission` (see
 * `requireSettingsPermissions` above). When the two disagreed — as for the
 * workspace owner, who holds the permission but not either role — the layout
 * won and silently threw the user onto Roles before its own page-level check
 * ever ran.
 *
 * This now shares the exact model `requireSettingsPermissions` uses, so
 * there is one authorization decision for this section, not two. It also no
 * longer redirects: the caller (the customization layout) renders
 * `AccessDeniedState` in place when `allowed` is false, so a denial lands on
 * the route the user asked for with the URL unchanged, instead of teleporting
 * them to an unrelated screen.
 */
export async function requireCustomizationAccess(
  permissionKeys: readonly string[] = ["customization.read"],
): Promise<CustomizationAccessCheck> {
  const user = await getSessionUser();

  return {
    user,
    allowed: !!user && hasAnySettingsPermission(user, permissionKeys),
  };
}
