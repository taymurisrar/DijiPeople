import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SettingsContextService } from './settings-context.service';
import { TenantSettingsService } from './tenant-settings.service';

function userWithSettingsAccess(
  accessLevel: SecurityAccessLevel | null,
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys: ['dashboard.view', 'tenant-settings.resolved.read'],
    rolePrivileges: accessLevel
      ? [
          {
            entityKey: ENTITY_KEYS.SETTINGS,
            privilege: SecurityPrivilege.READ,
            accessLevel,
          },
        ]
      : [],
    accessContext: {
      organizationId: 'org-a',
      businessUnitId: 'bu-a',
      accessibleBusinessUnitIds: ['bu-a'],
      businessUnitSubtreeIds: ['bu-a'],
      teamIds: [],
    },
  };
}

describe('resolved settings context authorization', () => {
  const ownEmployee = {
    id: 'employee-self',
    businessUnitId: 'bu-a',
    businessUnit: { organizationId: 'org-a' },
  };

  function buildContextService() {
    const configurationResolver = {
      resolveAppContext: jest.fn(async (context) => context),
    };
    const prisma = {
      employee: { findFirst: jest.fn(async () => ownEmployee) },
      organization: { findFirst: jest.fn() },
      businessUnit: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      user: { findFirst: jest.fn(), update: jest.fn() },
    };
    return {
      service: new SettingsContextService(
        configurationResolver as never,
        prisma as never,
      ),
      configurationResolver,
      prisma,
    };
  }

  it('ignores arbitrary ids from a self-service dashboard user', async () => {
    const { service, configurationResolver, prisma } = buildContextService();

    await service.resolveForUser(userWithSettingsAccess(null), {
      organizationId: 'org-other',
      businessUnitId: 'bu-other',
      employeeId: 'employee-other',
      projectId: 'project-other',
    });

    expect(configurationResolver.resolveAppContext).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        organizationId: 'org-a',
        businessUnitId: 'bu-a',
        employeeId: 'employee-self',
        projectId: undefined,
      }),
    );
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('denies an organization-scoped settings reader a sibling organization', async () => {
    const { service, prisma } = buildContextService();
    prisma.organization.findFirst.mockResolvedValue({ id: 'org-other' });

    await expect(
      service.resolveForUser(
        userWithSettingsAccess(SecurityAccessLevel.ORGANIZATION),
        { organizationId: 'org-other' },
      ),
    ).rejects.toMatchObject({ response: { code: 'ACCESS_DENIED' } });
  });

  it('denies a tenant reader an id that is outside its tenant', async () => {
    const { service, prisma } = buildContextService();
    prisma.organization.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveForUser(
        userWithSettingsAccess(SecurityAccessLevel.TENANT),
        {
          organizationId: 'foreign-org',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'ACCESS_DENIED' } });
  });
});

describe('TenantSettingsService organization preview authorization', () => {
  function buildService() {
    const activeOrganization = {
      resolveForUser: jest.fn(async () => 'org-a'),
    };
    const service = new TenantSettingsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      activeOrganization as never,
    );
    const getResolvedSettings = jest
      .spyOn(service, 'getResolvedSettings')
      .mockResolvedValue({} as never);
    const assertOrganizationInTenant = jest
      .spyOn(service, 'assertOrganizationInTenant')
      .mockImplementation(async (_tenantId, organizationId) => organizationId);
    return { service, getResolvedSettings, assertOrganizationInTenant };
  }

  it('denies a self-service caller another organization preview', async () => {
    const { service, assertOrganizationInTenant } = buildService();
    await expect(
      service.getResolvedSettingsForUser(
        userWithSettingsAccess(null),
        'org-other',
      ),
    ).rejects.toMatchObject({ response: { code: 'ACCESS_DENIED' } });
    expect(assertOrganizationInTenant).not.toHaveBeenCalled();
  });

  it('allows a tenant settings reader to preview a same-tenant organization', async () => {
    const { service, assertOrganizationInTenant, getResolvedSettings } =
      buildService();
    await service.getResolvedSettingsForUser(
      userWithSettingsAccess(SecurityAccessLevel.TENANT),
      'org-other',
    );
    expect(assertOrganizationInTenant).toHaveBeenCalledWith(
      'tenant-a',
      'org-other',
    );
    expect(getResolvedSettings).toHaveBeenCalledWith('tenant-a', 'org-other');
  });
});
