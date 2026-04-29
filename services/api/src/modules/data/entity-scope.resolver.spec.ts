import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_REGISTRY } from './entity-registry';
import { EntityScopeResolver } from './entity-scope.resolver';

describe('EntityScopeResolver', () => {
  it('includes tenant and business-unit scope for employees', () => {
    const resolver = new EntityScopeResolver();
    const where = resolver.buildReadScope(ENTITY_REGISTRY.employees, {
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
          accessLevel: SecurityAccessLevel.BUSINESS_UNIT,
          roleId: 'role-1',
        },
      ],
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: false,
        businessUnitId: 'bu-1',
        organizationId: 'org-1',
        teamIds: [],
        accessibleBusinessUnitIds: ['bu-1'],
        businessUnitSubtreeIds: ['bu-1'],
        canAccessAllBusinessUnits: false,
      },
    });

    expect(where).toEqual({
      AND: [{ tenantId: 'tenant-1' }, { businessUnitId: 'bu-1' }],
    });
  });
});
