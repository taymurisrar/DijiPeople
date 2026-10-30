import { Reflector } from '@nestjs/core';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
  type RequiredRbacPermission,
} from '../decorators/require-permissions.decorator';
import {
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
  matrixPrivilegeToPermissionKey,
} from '../constants/rbac-matrix';
import { satisfiesPermissionRequirement } from '../security/permission-evaluation';

/**
 * A user holding exactly what tenant provisioning grants a system role, and the
 * guard's own decision function to ask whether a route admits them.
 *
 * Specs that hand-build `permissionKeys` prove only that the test author listed
 * the right keys. These prove the *shipped role definition* reaches the route,
 * which is the question every self-service defect in the go-live QA turned on
 * (DP-QA-002, -011, -022).
 */
export type SystemRoleKey = keyof typeof SYSTEM_ROLE_PRIVILEGES;

export function provisionedUser(roleKey: SystemRoleKey) {
  const matrix = SYSTEM_ROLE_PRIVILEGES[roleKey];
  const rolePrivileges = Object.entries(matrix)
    .filter(([, level]) => level !== 'NONE')
    .map(([key, accessLevel]) => {
      const [entityKey, privilege] = key.split(':');
      return { entityKey, privilege, accessLevel, roleId: roleKey as string };
    });

  return {
    roleKeys: [roleKey as string],
    permissionKeys: [
      ...rolePrivileges.map((p) =>
        matrixPrivilegeToPermissionKey(p.entityKey, p.privilege as never),
      ),
      ...(SYSTEM_ROLE_MISC_PERMISSIONS[roleKey] ?? []),
    ],
    rolePrivileges: rolePrivileges as never,
  };
}

/** Whether `roleKey` is admitted by the permissions declared on a handler. */
export function roleCanReach(
  roleKey: SystemRoleKey,
  controller: { prototype: object },
  handler: string,
): boolean {
  const reflector = new Reflector();
  const fn = (controller.prototype as Record<string, () => void>)[handler];
  if (typeof fn !== 'function') {
    throw new Error(`No handler named ${handler}`);
  }

  return satisfiesPermissionRequirement(provisionedUser(roleKey), {
    legacyKeys: reflector.get<string[]>(REQUIRED_PERMISSIONS_KEY, fn) ?? [],
    rbac:
      reflector.get<RequiredRbacPermission[]>(
        REQUIRED_RBAC_PERMISSIONS_KEY,
        fn,
      ) ?? [],
  });
}
