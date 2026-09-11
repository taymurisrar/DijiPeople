import { ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';

/**
 * AUTHZ-02 (HIGH, confirmed). `PUT /roles/:roleId/permissions`
 * (`updatePermissions`) let an actor grant any editable role any legacy
 * permission key that exists in the tenant, regardless of whether the actor
 * held that key themselves — its sibling `PUT /roles/:roleId/matrix`
 * (`updateMatrix`), gated by the identical permission pair
 * (`roles.assign-permissions` + `SETTINGS:configure`), already enforced
 * "cannot exceed your own effective access" for RBAC matrix privileges.
 * `create()` had a correct inline copy of the same rule; all three now call
 * one shared method, `assertPermissionKeysWithinActorAccess`.
 */
describe('RolesService permission-grant escalation guard (AUTHZ-02)', () => {
  const TENANT_ID = 'tenant-1';
  const ROLE_ID = 'role-1';

  function buildUser(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'actor-1',
      tenantId: TENANT_ID,
      email: 'actor@example.com',
      roleIds: [],
      roleKeys: [],
      permissionKeys: ['employees.read'],
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: false,
        businessUnitId: 'bu-1',
        organizationId: 'org-1',
        teamIds: [],
        accessibleBusinessUnitIds: [],
        businessUnitSubtreeIds: [],
        canAccessAllBusinessUnits: false,
      },
      ...overrides,
    } as never;
  }

  function buildService(options: {
    role?: Record<string, unknown>;
    permissionRows: Array<{ id: string; key: string }>;
  }) {
    const role = {
      id: ROLE_ID,
      tenantId: TENANT_ID,
      isSystem: false,
      isEditable: true,
      rolePermissions: [],
      ...options.role,
    };

    const rolesRepository = {
      findByIdAndTenant: jest.fn().mockResolvedValue(role),
      replacePermissions: jest.fn().mockResolvedValue(role),
    };
    const permissionsService = {
      findByIds: jest.fn().mockResolvedValue(options.permissionRows),
    };

    const service = new RolesService(
      rolesRepository as never,
      permissionsService as never,
      { log: jest.fn() } as never,
    );

    return { service, rolesRepository, permissionsService };
  }

  it('rejects granting a legacy permission key the actor does not hold themselves', async () => {
    const { service } = buildService({
      permissionRows: [{ id: 'perm-1', key: 'payslips.read-all' }],
    });
    const actor = buildUser({ permissionKeys: ['employees.read'] });

    await expect(
      service.updatePermissions(actor, ROLE_ID, ['perm-1']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows granting a legacy permission key the actor already holds', async () => {
    const { service, rolesRepository } = buildService({
      permissionRows: [{ id: 'perm-1', key: 'employees.read' }],
    });
    const actor = buildUser({ permissionKeys: ['employees.read'] });

    await expect(
      service.updatePermissions(actor, ROLE_ID, ['perm-1']),
    ).resolves.toBeDefined();
    expect(rolesRepository.replacePermissions).toHaveBeenCalled();
  });

  it('allows a tenant owner to grant a key beyond their own permissionKeys', async () => {
    const { service, rolesRepository } = buildService({
      permissionRows: [{ id: 'perm-1', key: 'payslips.read-all' }],
    });
    const owner = buildUser({
      permissionKeys: [],
      accessContext: {
        isSystemAdministrator: false,
        isSystemCustomizer: false,
        isTenantOwner: true,
        businessUnitId: 'bu-1',
        organizationId: 'org-1',
        teamIds: [],
        accessibleBusinessUnitIds: [],
        businessUnitSubtreeIds: [],
        canAccessAllBusinessUnits: false,
      },
    });

    await expect(
      service.updatePermissions(owner, ROLE_ID, ['perm-1']),
    ).resolves.toBeDefined();
    expect(rolesRepository.replacePermissions).toHaveBeenCalled();
  });
});
