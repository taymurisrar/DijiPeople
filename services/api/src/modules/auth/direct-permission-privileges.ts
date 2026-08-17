import { RoleAccessLevel, SecurityAccessLevel } from '@prisma/client';
import {
  SECURITY_ACCESS_LEVEL_WEIGHT,
  legacyPermissionToMatrixPrivileges,
  legacyRoleAccessLevelToSecurityAccessLevel,
} from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

type EffectiveRole = {
  accessLevel: RoleAccessLevel;
};

/**
 * UserPermission predates RolePrivilege and has no scope column. Preserve a
 * direct legacy grant at the user's highest assigned role scope; never invent
 * tenant-wide access for a user whose roles are narrower.
 */
export function buildDirectPermissionPrivileges(
  permissionKeys: string[],
  effectiveRoles: EffectiveRole[],
): NonNullable<AuthenticatedUser['rolePrivileges']> {
  const accessLevel = effectiveRoles.reduce<SecurityAccessLevel>(
    (best, role) => {
      const candidate = legacyRoleAccessLevelToSecurityAccessLevel(
        role.accessLevel,
      );
      return SECURITY_ACCESS_LEVEL_WEIGHT[candidate] >
        SECURITY_ACCESS_LEVEL_WEIGHT[best]
        ? candidate
        : best;
    },
    SecurityAccessLevel.SELF,
  );

  return Array.from(
    new Map(
      permissionKeys
        .flatMap((permissionKey) =>
          legacyPermissionToMatrixPrivileges(permissionKey),
        )
        .map((requirement) => [
          `${requirement.entityKey}:${requirement.privilege}`,
          {
            ...requirement,
            accessLevel,
            roleId: 'direct-user-permission',
          },
        ]),
    ).values(),
  );
}
