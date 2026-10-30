import { Reflector } from '@nestjs/core';
import { LeaveRequestsController } from './leave-requests.controller';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
  RequiredRbacPermission,
} from '../../common/decorators/require-permissions.decorator';
import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from '../../common/constants/rbac-matrix';
import { satisfiesPermissionRequirement } from '../../common/security/permission-evaluation';

/**
 * DP-QA-011. A provisioned employee must be able to see the leave types they may
 * request and to withdraw their own request. Evaluated against what provisioning
 * really grants (`SYSTEM_ROLE_PRIVILEGES` + `SYSTEM_ROLE_MISC_PERMISSIONS`)
 * through the same function the guard uses, so a missing grant fails here.
 */
function provisionedUser(roleKey: keyof typeof SYSTEM_ROLE_PRIVILEGES) {
  const matrix = SYSTEM_ROLE_PRIVILEGES[roleKey];
  const rolePrivileges = Object.entries(matrix)
    .filter(([, level]) => level !== 'NONE')
    .map(([key, accessLevel]) => {
      const [entityKey, privilege] = key.split(':');
      return { entityKey, privilege, accessLevel, roleId: roleKey };
    });
  const permissionKeys = [
    ...rolePrivileges.map((p) =>
      matrixPrivilegeToPermissionKey(p.entityKey, p.privilege as never),
    ),
    ...(SYSTEM_ROLE_MISC_PERMISSIONS[roleKey] ?? []),
  ];
  return {
    roleKeys: [roleKey as string],
    permissionKeys,
    rolePrivileges: rolePrivileges as never,
  };
}

function requirementOf(handler: string) {
  const reflector = new Reflector();
  const fn = (
    LeaveRequestsController.prototype as unknown as Record<string, () => void>
  )[handler];
  return {
    legacyKeys: reflector.get<string[]>(REQUIRED_PERMISSIONS_KEY, fn) ?? [],
    rbac:
      reflector.get<RequiredRbacPermission[]>(
        REQUIRED_RBAC_PERMISSIONS_KEY,
        fn,
      ) ?? [],
  };
}

describe('leave self-service permissions for provisioned roles', () => {
  it.each([ROLE_KEYS.EMPLOYEE, ROLE_KEYS.MANAGER, ROLE_KEYS.HR])(
    '%s can list requestable leave types',
    (role) => {
      expect(
        satisfiesPermissionRequirement(
          provisionedUser(role),
          requirementOf('availableTypes'),
        ),
      ).toBe(true);
    },
  );

  it.each([ROLE_KEYS.EMPLOYEE, ROLE_KEYS.MANAGER, ROLE_KEYS.HR])(
    '%s can reach the cancel handler',
    (role) => {
      expect(
        satisfiesPermissionRequirement(
          provisionedUser(role),
          requirementOf('cancel'),
        ),
      ).toBe(true);
    },
  );

  it('a role holding neither CREATE nor DELETE on leave requests is still refused', () => {
    const user = provisionedUser(ROLE_KEYS.EMPLOYEE);
    const stripped = {
      ...user,
      rolePrivileges: (
        user.rolePrivileges as unknown as Array<{
          entityKey: string;
          privilege: string;
        }>
      ).filter(
        (p) =>
          !(
            p.entityKey === 'leave-requests' &&
            (p.privilege === 'CREATE' || p.privilege === 'DELETE')
          ),
      ) as never,
    };
    expect(
      satisfiesPermissionRequirement(stripped, requirementOf('cancel')),
    ).toBe(false);
  });

  it('the cancel legacy key is still required', () => {
    const user = provisionedUser(ROLE_KEYS.EMPLOYEE);
    const stripped = {
      ...user,
      permissionKeys: user.permissionKeys.filter(
        (k) => k !== 'leave-requests.cancel',
      ),
    };
    expect(
      satisfiesPermissionRequirement(stripped, requirementOf('cancel')),
    ).toBe(false);
  });

  it('employees do not receive the leave-type configuration list', () => {
    expect(provisionedUser(ROLE_KEYS.EMPLOYEE).permissionKeys).not.toContain(
      'leave-types.read',
    );
  });
});
