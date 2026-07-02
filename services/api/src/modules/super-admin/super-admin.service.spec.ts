import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SuperAdminService } from './super-admin.service';

describe('SuperAdminService tenant slug authorization', () => {
  const prisma = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const tenantsRepository = {
    findBySlugExcludingId: jest.fn(),
  };
  const tenantSettingsResolverService = {
    invalidateTenantCache: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };

  const service = new SuperAdminService(
    prisma as never,
    tenantsRepository as never,
    {} as never,
    {} as never,
    tenantSettingsResolverService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    auditService as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a platform super admin to update a tenant slug', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      slug: 'old-slug',
    });
    tenantsRepository.findBySlugExcludingId.mockResolvedValue(null);
    prisma.tenant.update.mockResolvedValue({
      slug: 'new-slug',
      updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    });
    jest
      .spyOn(service, 'getTenantDetail')
      .mockResolvedValue({ id: 'tenant-1', slug: 'new-slug' } as never);

    await expect(
      service.updateTenantSlug(platformUser('SUPER_ADMIN'), 'tenant-1', {
        slug: 'new-slug',
      }),
    ).resolves.toEqual({ id: 'tenant-1', slug: 'new-slug' });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: {
        slug: 'new-slug',
        updatedById: 'platform-user-1',
      },
      select: {
        slug: true,
        updatedAt: true,
      },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TENANT_SLUG_UPDATED',
        tenantId: 'platform',
      }),
    );
  });

  it('rejects a platform member even with a tenant system-customizer alias', async () => {
    const actor = platformUser('MEMBER');
    actor.roleKeys.push('system-customizer');

    await expect(
      service.updateTenantSlug(actor, 'tenant-1', { slug: 'new-slug' }),
    ).rejects.toEqual(
      new ForbiddenException(
        'Only Platform Super Admin can update tenant slug.',
      ),
    );

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});

function platformUser(role: 'SUPER_ADMIN' | 'MEMBER'): AuthenticatedUser {
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'admin@dijipeople.local',
    roleIds: [role],
    roleKeys: [role],
    permissionKeys:
      role === 'SUPER_ADMIN' ? ['platform.*'] : ['tenants.update'],
    platform: {
      id: 'platform-user-1',
      role,
      status: 'ACTIVE',
    },
  };
}
