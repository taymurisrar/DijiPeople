import { BadRequestException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  TenantControlPlaneService,
  categorize,
  humanize,
} from './tenant-control-plane.service';
import { TENANT_STATUS_TRANSITIONS } from './tenant-control-plane.constants';

const admin = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'ops@dijipeople.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'platform-user-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

function build(tenantStatus: TenantStatus = TenantStatus.ACTIVE) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        name: 'Maseer Group',
        displayName: 'Maseer Group',
        legalName: null,
        slug: 'maseer',
        tenantCode: 'MAS-000001',
        status: tenantStatus,
        subStatus: null,
        customerAccountId: 'customer-1',
        ownerUserId: 'owner-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.SUSPENDED,
        subStatus: 'Non-payment',
      }),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const access = { countActiveOwners: jest.fn().mockResolvedValue(1) };
  const service = new TenantControlPlaneService(
    prisma as never,
    access as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
    { record: jest.fn() } as never,
  );
  jest.spyOn(service, 'overview').mockResolvedValue({} as never);
  return { service, prisma, access };
}

describe('TenantControlPlaneService lifecycle', () => {
  it('refuses a transition the lifecycle does not allow', async () => {
    const { service, prisma } = build(TenantStatus.ARCHIVED);
    await expect(
      service.changeStatus(admin, 'tenant-1', {
        status: TenantStatus.ACTIVE,
        reason: 'Customer returned',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('refuses to move a tenant to the state it is already in', async () => {
    const { service } = build(TenantStatus.ACTIVE);
    await expect(
      service.changeStatus(admin, 'tenant-1', {
        status: TenantStatus.ACTIVE,
        reason: 'No change',
      }),
    ).rejects.toThrow(/already Active/);
  });

  it('refuses activation while the tenant has no active owner', async () => {
    const { service, access, prisma } = build(TenantStatus.SUSPENDED);
    access.countActiveOwners.mockResolvedValue(0);
    await expect(
      service.changeStatus(admin, 'tenant-1', {
        status: TenantStatus.ACTIVE,
        reason: 'Payment received',
      }),
    ).rejects.toThrow(/no active Tenant Owner/);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('revokes live sessions when a tenant is suspended', async () => {
    const { service, prisma } = build(TenantStatus.ACTIVE);
    await service.changeStatus(admin, 'tenant-1', {
      status: TenantStatus.SUSPENDED,
      reason: 'Non-payment',
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TenantStatus.SUSPENDED,
          subStatus: 'Non-payment',
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does not revoke sessions for a non-suspension transition', async () => {
    const { service, prisma } = build(TenantStatus.ACTIVE);
    await service.changeStatus(admin, 'tenant-1', {
      status: TenantStatus.INACTIVE,
      reason: 'Dormant pending renewal',
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('tenant lifecycle transition map', () => {
  it('offers a reversal out of every non-terminal stopped state', () => {
    expect(TENANT_STATUS_TRANSITIONS[TenantStatus.SUSPENDED]).toContain(
      TenantStatus.ACTIVE,
    );
    expect(TENANT_STATUS_TRANSITIONS[TenantStatus.DECOMMISSIONING]).toContain(
      TenantStatus.ACTIVE,
    );
  });

  it('does not offer suspension of an already suspended tenant', () => {
    expect(TENANT_STATUS_TRANSITIONS[TenantStatus.SUSPENDED]).not.toContain(
      TenantStatus.SUSPENDED,
    );
  });

  it('does not offer reactivation of an active tenant', () => {
    expect(TENANT_STATUS_TRANSITIONS[TenantStatus.ACTIVE]).not.toContain(
      TenantStatus.ACTIVE,
    );
  });

  it('treats churned as terminal', () => {
    expect(TENANT_STATUS_TRANSITIONS[TenantStatus.CHURNED]).toEqual([]);
  });

  it('covers every lifecycle state', () => {
    for (const status of Object.values(TenantStatus)) {
      expect(TENANT_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('timeline presentation', () => {
  it('formats a raw enum as a sentence, not as SCREAMING_SNAKE', () => {
    expect(humanize('PROVISIONING_FAILED')).toBe('Provisioning Failed');
    expect(humanize('TENANT_OWNER_CREATED')).toBe('Tenant Owner Created');
  });

  it('groups events by the question an operator is asking', () => {
    expect(categorize('TENANT_OWNER_CREATED', 'User')).toBe('ACCESS');
    expect(
      categorize('TENANT_SERVICE_ACCOUNT_CREDENTIAL_ROTATED', 'User'),
    ).toBe('ACCESS');
    expect(categorize('TENANT_MODULE_OVERRIDE_CHANGED', 'Tenant')).toBe(
      'MODULES',
    );
    expect(categorize('TENANT_APP_POLICY_CHANGED', 'TenantAppAssignment')).toBe(
      'APPS',
    );
    expect(categorize('TENANT_PROVISIONING_REQUESTED', 'Tenant')).toBe(
      'PROVISIONING',
    );
    expect(categorize('TENANT_SUSPENDED', 'Tenant')).toBe('OPERATIONS');
    expect(categorize('SUBSCRIPTION_UPDATED', 'Subscription')).toBe(
      'COMMERCIAL',
    );
    expect(categorize('TIMELINE_ACTIVITY_ADDED', 'Tenant')).toBe('NOTES');
  });
});
