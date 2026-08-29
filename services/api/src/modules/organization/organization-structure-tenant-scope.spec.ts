import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

/*
 * Tenant scoping on the organization-structure mutations.
 *
 * These endpoints were reachable by any authenticated tenant user, so it is
 * worth pinning down what tenant isolation did and did not cover. It covered
 * every identifier the caller can supply -- the target organization, the parent
 * business unit, the head employee -- and none of them could be pointed at
 * another tenant. What was missing was authorization: being in the tenant was
 * treated as sufficient authority to reshape it.
 *
 * Locking the isolation half down here means a later refactor of the
 * authorization half cannot quietly drop it.
 */

const currentUser: AuthenticatedUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'hr@example.com',
  roleIds: [],
  roleKeys: ['hr'],
  permissionKeys: ['organization.manage'],
  /*
   * The authorization half described above has since been filled in: the
   * structure mutations resolve their target through the RBAC scope filter
   * rather than a bare tenant-keyed lookup. This caller is therefore given
   * tenant-wide hierarchy management explicitly, so that the assertions below
   * keep testing *tenant isolation* — a caller who is allowed to reshape this
   * tenant still cannot reach another one — instead of silently passing
   * because authorization denied the request before isolation was exercised.
   */
  rolePrivileges: [
    {
      entityKey: ENTITY_KEYS.HIERARCHY,
      privilege: SecurityPrivilege.MANAGE,
      accessLevel: SecurityAccessLevel.TENANT,
    },
    {
      entityKey: ENTITY_KEYS.HIERARCHY,
      privilege: SecurityPrivilege.READ,
      accessLevel: SecurityAccessLevel.TENANT,
    },
  ],
};

type RepositoryStub = {
  findOrganizations: jest.Mock;
  findOrganizationById: jest.Mock;
  findBusinessUnits: jest.Mock;
  findBusinessUnitById: jest.Mock;
  createBusinessUnit: jest.Mock;
};

function createService(overrides: Partial<RepositoryStub> = {}) {
  const organizationRepository: RepositoryStub = {
    // Tenant-keyed: the repository only ever returns this tenant's rows, which
    // is what makes a foreign identifier unresolvable rather than merely denied.
    findOrganizations: jest.fn(async () => [
      { id: 'org-1', tenantId: 'tenant-1' },
    ]),
    findOrganizationById: jest.fn(async () => ({
      id: 'org-1',
      tenantId: 'tenant-1',
    })),
    findBusinessUnits: jest.fn(async () => []),
    findBusinessUnitById: jest.fn(async () => null),
    createBusinessUnit: jest.fn(async () => ({ id: 'bu-new' })),
    ...overrides,
  };

  const prisma = {
    employee: { findFirst: jest.fn(async () => ({ id: 'employee-1' })) },
    user: { findFirst: jest.fn(async () => ({ id: 'user-1' })) },
    tenant: { findUnique: jest.fn(async () => ({ ownerUserId: 'user-1' })) },
  };

  const service = new OrganizationService(
    organizationRepository as never,
    prisma as never,
    { log: jest.fn() } as never,
  );

  return { service, organizationRepository, prisma };
}

describe('OrganizationService structure mutations stay tenant scoped', () => {
  it('rejects a business unit created against another tenant organization', async () => {
    // The repository is tenant-keyed, so a foreign organization is never among
    // the rows the scope filter can select from -- it simply is not found.
    const { service, organizationRepository } = createService();

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Injected',
        organizationId: 'org-from-tenant-2',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(organizationRepository.findOrganizations).toHaveBeenCalledWith(
      'tenant-1',
    );
  });

  it('rejects a parent business unit from another tenant', async () => {
    // Tenant-keyed listing returns nothing for a foreign parent. This now
    // surfaces as NotFound rather than BadRequest, because the parent is
    // resolved through the scoped lookup before the parent-validity rules run
    // -- a strictly earlier rejection, and one that leaks less about whether
    // the identifier exists in some other tenant.
    const { service, organizationRepository } = createService();

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Child',
        organizationId: 'org-1',
        parentBusinessUnitId: 'bu-from-tenant-2',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(organizationRepository.findBusinessUnits).toHaveBeenCalledWith(
      'tenant-1',
      {},
    );
  });

  it('rejects a parent business unit from a different organization', async () => {
    const parent = {
      id: 'bu-other',
      tenantId: 'tenant-1',
      organizationId: 'org-2',
    };
    const { service } = createService({
      // In tenant and within scope, so it survives the scoped lookup and is
      // rejected by the same-organization rule instead.
      findBusinessUnits: jest.fn(async () => [parent]),
      findBusinessUnitById: jest.fn(async () => parent),
    });

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Child',
        organizationId: 'org-1',
        parentBusinessUnitId: 'bu-other',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a head employee from another tenant', async () => {
    const { service, prisma } = createService();
    prisma.employee.findFirst.mockResolvedValueOnce(null as never);

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Unit',
        organizationId: 'org-1',
        headEmployeeId: 'employee-from-tenant-2',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );
  });

  it('creates a business unit pinned to the caller tenant when everything is in tenant', async () => {
    const { service, organizationRepository } = createService();

    await service.createBusinessUnit(currentUser, {
      name: 'Engineering',
      organizationId: 'org-1',
    } as never);

    expect(organizationRepository.createBusinessUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        name: 'Engineering',
      }),
    );
  });
});
