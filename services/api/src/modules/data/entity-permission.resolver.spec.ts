import { ForbiddenException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_REGISTRY } from './entity-registry';
import { EntityPermissionResolver } from './entity-permission.resolver';

describe('EntityPermissionResolver', () => {
  const resolver = new EntityPermissionResolver();

  it('blocks users without read permission', () => {
    expect(() =>
      resolver.assertCanRead(ENTITY_REGISTRY.employees, {
        userId: 'user-1',
        tenantId: 'tenant-1',
        email: 'user@example.com',
        roleIds: [],
        roleKeys: [],
        permissionKeys: [],
        rolePrivileges: [],
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows users with server-side read permission and RBAC read privilege', () => {
    expect(() =>
      resolver.assertCanRead(ENTITY_REGISTRY.employees, {
        userId: 'user-1',
        tenantId: 'tenant-1',
        email: 'user@example.com',
        roleIds: [],
        roleKeys: [],
        permissionKeys: ['employees.read'],
        rolePrivileges: [
          {
            entityKey: 'employees',
            privilege: SecurityPrivilege.READ,
            accessLevel: SecurityAccessLevel.TENANT,
            roleId: 'role-1',
          },
        ],
      }),
    ).not.toThrow();
  });
});
