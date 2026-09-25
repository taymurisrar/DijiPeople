import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformUserRole } from '@prisma/client';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
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

/*
 * BUG-3544 / ADR-0018. The tenant profile edit is decided by the platform
 * permission `tenants.update` and nothing else. Each actor below is built from
 * `platformAccessForRole`, the same function `loadPlatformAccessContext` uses,
 * so the role keys and permission keys are the ones a real session carries —
 * including the `system-admin` alias only SUPER_ADMIN and PLATFORM_OWNER get,
 * which is what the old check read.
 */
describe('BUG-3544 tenant profile edit is authorized by platform permission', () => {
  const tx = {
    tenant: { update: jest.fn() },
    customerAccount: { update: jest.fn() },
  };
  const prisma = {
    tenant: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const auditService = { log: jest.fn() };

  const service = new SuperAdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
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
    {} as never,
  );

  const existingTenant = {
    id: 'tenant-1',
    name: 'Acme',
    displayName: 'Acme',
    legalName: 'Acme LLC',
    status: 'ACTIVE',
    subStatus: null,
    customerAccountId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.findUnique.mockResolvedValue(existingTenant);
    tx.tenant.update.mockResolvedValue({
      name: 'Acme',
      displayName: 'Acme Workspace',
      legalName: 'Acme LLC',
    });
    jest
      .spyOn(service, 'getTenantDetail')
      .mockResolvedValue({ id: 'tenant-1' } as never);
  });

  it.each([
    PlatformUserRole.SUPER_ADMIN,
    PlatformUserRole.PLATFORM_OWNER,
    PlatformUserRole.PLATFORM_ADMIN,
    PlatformUserRole.PLATFORM_OPERATIONS,
    PlatformUserRole.MEMBER,
  ])('lets %s edit the profile fields', async (role) => {
    await expect(
      service.updateTenant(platformActor(role), 'tenant-1', {
        displayName: 'Acme Workspace',
      }),
    ).resolves.toEqual({ id: 'tenant-1' });

    expect(tx.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({
          displayName: 'Acme Workspace',
        }) as unknown,
      }),
    );
  });

  it.each([
    PlatformUserRole.PRESALES_USER,
    PlatformUserRole.SUPPORT_AGENT,
    PlatformUserRole.READ_ONLY_AUDITOR,
  ])('refuses %s, which holds no tenants.update', async (role) => {
    await expect(
      service.updateTenant(platformActor(role), 'tenant-1', {
        displayName: 'Acme Workspace',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });

  it('refuses a tenant user even when it carries the system-admin role key', async () => {
    const tenantUser = {
      userId: 'tenant-user-1',
      tenantId: 'tenant-a',
      roleIds: [],
      roleKeys: ['system-admin'],
      permissionKeys: ['tenants.update'],
      rolePrivileges: [],
    } as unknown as AuthenticatedUser;

    await expect(
      service.updateTenant(tenantUser, 'tenant-1', { displayName: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });

  it('refuses a status change through the generic edit, naming the lifecycle action', async () => {
    const attempt = service.updateTenant(
      platformActor(PlatformUserRole.SUPER_ADMIN),
      'tenant-1',
      { status: 'SUSPENDED' as never },
    );

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: {
        code: 'TENANT_STATUS_REQUIRES_LIFECYCLE_ACTION',
        message: expect.stringContaining('/api/platform/tenants/') as unknown,
      },
    });
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });

  it('refuses a subStatus change through the generic edit', async () => {
    await expect(
      service.updateTenant(
        platformActor(PlatformUserRole.PLATFORM_ADMIN),
        'tenant-1',
        { subStatus: 'Paused by finance' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores a status equal to the current one, so an echoed record still saves', async () => {
    await service.updateTenant(
      platformActor(PlatformUserRole.PLATFORM_ADMIN),
      'tenant-1',
      { status: 'ACTIVE' as never, displayName: 'Acme Workspace' },
    );

    const [{ data }] = tx.tenant.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('subStatus');
  });

  it('refuses a blank name', async () => {
    await expect(
      service.updateTenant(
        platformActor(PlatformUserRole.PLATFORM_ADMIN),
        'tenant-1',
        { name: '   ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits the three profile fields before and after, inside the transaction', async () => {
    await service.updateTenant(
      platformActor(PlatformUserRole.PLATFORM_ADMIN),
      'tenant-1',
      { displayName: 'Acme Workspace' },
    );

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        actorUserId: 'platform-user-1',
        action: 'TENANT_PROFILE_UPDATED',
        entityType: 'Tenant',
        entityId: 'tenant-1',
        sourceModule: 'super-admin',
        beforeSnapshot: {
          name: 'Acme',
          displayName: 'Acme',
          legalName: 'Acme LLC',
        },
        afterSnapshot: {
          name: 'Acme',
          displayName: 'Acme Workspace',
          legalName: 'Acme LLC',
        },
      },
      tx,
    );
  });
});

function platformActor(role: PlatformUserRole): AuthenticatedUser {
  const access = platformAccessForRole(role);
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'operator@dijipeople.local',
    roleIds: [role],
    roleKeys: access.roleKeys,
    permissionKeys: access.permissionKeys,
    authSubjectType: 'platform-user',
    platform: { id: 'platform-user-1', role, status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}
