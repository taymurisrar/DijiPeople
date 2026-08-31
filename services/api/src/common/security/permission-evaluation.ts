import { SecurityAccessLevel } from '@prisma/client';
import { SECURITY_ACCESS_LEVEL_WEIGHT } from '../constants/rbac-matrix';
import type { RequiredRbacPermission } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { hasElevatedTenantRole } from './elevated-tenant-roles';

/**
 * What a route would demand of a caller: the legacy permission keys it declares
 * with `@Permissions()` and the RBAC matrix privileges it declares with
 * `@RequirePermission()`.
 */
export type PermissionRequirement = {
  readonly legacyKeys: readonly string[];
  readonly rbac: readonly RequiredRbacPermission[];
};

/**
 * The decision `PermissionsGuard` makes, as a plain function.
 *
 * It exists because `/approvals/:id/approve` dispatches into another module's
 * decision method without passing through that module's controller, so the
 * guard that normally protects it never runs. Re-implementing the check at the
 * call site would have made two sources of truth for what "may approve a leave
 * request" means, and the two would have drifted the first time either changed
 * — which is exactly the shape of BUG-2015, where approving was gated on
 * *read* because the approve keys were consulted only for display.
 *
 * `PermissionsGuard` calls this, and so does `ApprovalsService.decide`. There is
 * one implementation, and delegating through the generic inbox is therefore
 * neither more nor less permissive than posting to the owning module's route.
 */
export function satisfiesPermissionRequirement(
  user: Pick<
    AuthenticatedUser,
    'permissionKeys' | 'rolePrivileges' | 'roleKeys'
  > | null,
  requirement: PermissionRequirement,
): boolean {
  if (requirement.legacyKeys.length === 0 && requirement.rbac.length === 0) {
    return true;
  }

  if (!user) return false;

  // Deliberately identical to the guard, including the bypass. `hasElevatedTenantRole`
  // skips the check entirely; AGENTS.md flags that as a decision, not an oversight.
  if (hasElevatedTenantRole(user)) return true;

  const held = new Set(user.permissionKeys ?? []);
  const hasAllLegacyKeys = requirement.legacyKeys.every((key) => held.has(key));

  const hasRbacPrivilege =
    requirement.rbac.length === 0 ||
    requirement.rbac.some(
      (required) =>
        highestAccessLevel(user.rolePrivileges, required) !==
        SecurityAccessLevel.NONE,
    );

  return hasAllLegacyKeys && hasRbacPrivilege;
}

function highestAccessLevel(
  rolePrivileges: AuthenticatedUser['rolePrivileges'] | undefined,
  required: RequiredRbacPermission,
): SecurityAccessLevel {
  return (
    rolePrivileges
      ?.filter(
        (privilege) =>
          privilege.entityKey === required.entityKey &&
          privilege.privilege === required.privilege,
      )
      .reduce(
        (best, privilege) =>
          SECURITY_ACCESS_LEVEL_WEIGHT[privilege.accessLevel] >
          SECURITY_ACCESS_LEVEL_WEIGHT[best]
            ? privilege.accessLevel
            : best,
        SecurityAccessLevel.NONE,
      ) ?? SecurityAccessLevel.NONE
  );
}
