import { BadRequestException, NotFoundException } from '@nestjs/common';
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
};

type RepositoryStub = {
  findOrganizationById: jest.Mock;
  findBusinessUnitById: jest.Mock;
  createBusinessUnit: jest.Mock;
};

function createService(overrides: Partial<RepositoryStub> = {}) {
  const organizationRepository: RepositoryStub = {
    findOrganizationById: jest.fn(async () => ({
      id: 'org-1',
      tenantId: 'tenant-1',
    })),
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
  );

  return { service, organizationRepository, prisma };
}

describe('OrganizationService structure mutations stay tenant scoped', () => {
  it('rejects a business unit created against another tenant organization', async () => {
    // The repository is tenant-keyed, so a foreign organization simply is not found.
    const { service, organizationRepository } = createService({
      findOrganizationById: jest.fn(async () => null),
    });

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Injected',
        organizationId: 'org-from-tenant-2',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(organizationRepository.findOrganizationById).toHaveBeenCalledWith(
      'tenant-1',
      'org-from-tenant-2',
    );
  });

  it('rejects a parent business unit from another tenant', async () => {
    const { service, organizationRepository } = createService({
      // Tenant-keyed lookup returns nothing for a foreign parent.
      findBusinessUnitById: jest.fn(async () => null),
    });

    await expect(
      service.createBusinessUnit(currentUser, {
        name: 'Child',
        organizationId: 'org-1',
        parentBusinessUnitId: 'bu-from-tenant-2',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(organizationRepository.findBusinessUnitById).toHaveBeenCalledWith(
      'tenant-1',
      'bu-from-tenant-2',
    );
  });

  it('rejects a parent business unit from a different organization', async () => {
    const { service } = createService({
      findBusinessUnitById: jest.fn(async () => ({
        id: 'bu-other',
        tenantId: 'tenant-1',
        organizationId: 'org-2',
      })),
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
