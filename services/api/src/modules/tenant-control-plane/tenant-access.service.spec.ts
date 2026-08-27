import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantAccessService } from './tenant-access.service';

/**
 * The rules that keep a tenant administrable and keep Platform Admin out of
 * tenant-side user management. Each of these is a rule the UI also expresses,
 * which is exactly why it is tested here: the UI is an affordance and this is
 * the control.
 */
describe('TenantAccessService', () => {
  const platformUser = {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'ops@dijipeople.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    platform: {
      id: 'platform-user-1',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  } as unknown as AuthenticatedUser;

  const tenantUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'someone@customer.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
  } as unknown as AuthenticatedUser;

  function build(overrides: Record<string, unknown> = {}) {
    const prisma = {
      tenant: { findUnique: jest.fn(), update: jest.fn() },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      platformUser: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      emailDeliveryLog: { findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      businessUnit: { findFirst: jest.fn() },
      $transaction: jest.fn(),
      ...overrides,
    };
    const userInvitations = { issueInvitation: jest.fn() };
    const service = new TenantAccessService(
      prisma as never,
      { findByKeyAndTenant: jest.fn() } as never,
      userInvitations as never,
      { issuePasswordResetForUser: jest.fn() } as never,
      { log: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    return { service, prisma, userInvitations };
  }

  const tenant = {
    id: 'tenant-1',
    name: 'Maseer Group',
    displayName: 'Maseer Group',
    legalName: null,
    slug: 'maseer',
    tenantCode: 'MAS-000001',
    status: 'ACTIVE',
    subStatus: null,
    customerAccountId: 'customer-1',
    ownerUserId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const owner = {
    id: 'owner-1',
    tenantId: 'tenant-1',
    firstName: 'Aisha',
    lastName: 'Rahman',
    email: 'aisha@maseer.com',
    status: UserStatus.ACTIVE,
    isServiceAccount: false,
    serviceAccountPurpose: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: new Date(),
    createdById: null,
    userRoles: [
      { role: { id: 'r1', key: 'global-admin', name: 'Global Admin' } },
    ],
    invitations: [],
  };

  it('refuses a caller without a platform identity', async () => {
    const { service } = build();
    await expect(service.list(tenantUser, 'tenant-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reports Tenant Owners and Service Accounts as separate collections', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findMany.mockResolvedValue([
      owner,
      {
        ...owner,
        id: 'svc-1',
        firstName: 'Attendance',
        lastName: 'Service Account',
        email: 'attendance@maseer.com',
        isServiceAccount: true,
        serviceAccountPurpose: 'Attendance device sync',
        userRoles: [],
      },
    ]);

    const result = await service.list(platformUser, 'tenant-1');

    expect(result.owners).toHaveLength(1);
    expect(result.owners[0].identityType).toBe('TENANT_OWNER');
    expect(result.owners[0].isPrimaryOwner).toBe(true);
    expect(result.owners[0].fullName).toBe('Aisha Rahman');
    expect(result.serviceAccounts).toHaveLength(1);
    expect(result.serviceAccounts[0].purpose).toBe('Attendance device sync');
    expect(result.activeOwnerCount).toBe(1);
  });

  it('refuses to disable the last active Tenant Owner', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);
    /* No other active owner remains. */
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.update(platformUser, 'tenant-1', 'owner-1', { isEnabled: false }),
    ).rejects.toThrow(/last active Tenant Owner/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows disabling an owner while another active owner remains', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue({
      ...owner,
      status: UserStatus.DISABLED,
    });
    prisma.user.findMany.mockResolvedValue([]);

    await service.update(platformUser, 'tenant-1', 'owner-1', {
      isEnabled: false,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: UserStatus.DISABLED }),
      }),
    );
    /* Disabling has to cut live sessions, not just relabel the row. */
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'owner-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuses to delete the primary Tenant Owner before ownership is transferred', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.remove(platformUser, 'tenant-1', 'owner-1', {
        reason: 'Left the company',
      }),
    ).rejects.toThrow(/Transfer ownership/);
  });

  it('refuses to delete an account that is linked to an employee record', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue({
      ...tenant,
      ownerUserId: 'other-owner',
    });
    prisma.user.findFirst.mockResolvedValue(owner);
    prisma.user.count.mockResolvedValue(2);
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1' });

    await expect(
      service.remove(platformUser, 'tenant-1', 'owner-1', {
        reason: 'Cleanup',
      }),
    ).rejects.toThrow(/employment history/);
  });

  it('never sends a password reset for a machine identity', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue({
      ...owner,
      id: 'svc-1',
      isServiceAccount: true,
      userRoles: [],
    });

    await expect(
      service.sendPasswordReset(platformUser, 'tenant-1', 'svc-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses credential rotation on a human account', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);

    await expect(
      service.rotateServiceAccountCredential(
        platformUser,
        'tenant-1',
        'owner-1',
      ),
    ).rejects.toThrow(/service accounts only/i);
  });

  it('refuses to transfer ownership to a service account', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue({
      ...owner,
      id: 'svc-1',
      isServiceAccount: true,
      userRoles: [],
    });

    await expect(
      service.transferOwnership(platformUser, 'tenant-1', {
        toUserId: 'svc-1',
        reason: 'Reassignment',
      }),
    ).rejects.toThrow(/not a service account/i);
  });

  it('treats an ordinary tenant employee as out of scope for this surface', async () => {
    const { service, prisma } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    /*
     * A tenant user with no Global Administrator role and no service-account
     * flag is an application user. Platform Admin must not be able to reach it.
     */
    prisma.user.findFirst.mockResolvedValue({
      ...owner,
      id: 'employee-user',
      userRoles: [{ role: { id: 'r9', key: 'employee', name: 'Employee' } }],
    });

    await expect(
      service.update(platformUser, 'tenant-1', 'employee-user', {
        isEnabled: false,
      }),
    ).rejects.toThrow(/managed inside the tenant application/);
  });

  /*
   * Issuing an invitation and delivering it are separate outcomes.
   *
   * This surface used to answer `success: true` for both, so a resend whose
   * email never left produced a green toast and an owner stuck at INVITED. A
   * tenant provisioned from a paid signup sat that way in production while the
   * only record of the reason lived in an audit snapshot no screen renders.
   */
  it('reports a resent invitation that was not delivered as undelivered', async () => {
    const { service, prisma, userInvitations } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);
    userInvitations.issueInvitation.mockResolvedValue({
      invitationId: 'inv-1',
      deliveryMode: 'disabled',
      deliveryStatus: 'TENANT_EMAIL_DISABLED',
      expiresAt: new Date(),
    });

    const result = await service.resendInvitation(
      platformUser,
      'tenant-1',
      'owner-1',
    );

    expect(result.delivered).toBe(false);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not be delivered/i);
    expect(result.message).toContain('TENANT_EMAIL_DISABLED');
  });

  it('reports a resent invitation that was delivered as sent', async () => {
    const { service, prisma, userInvitations } = build();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findFirst.mockResolvedValue(owner);
    userInvitations.issueInvitation.mockResolvedValue({
      invitationId: 'inv-2',
      deliveryMode: 'sent',
      deliveryStatus: 'SENT',
      expiresAt: new Date(),
    });

    const result = await service.resendInvitation(
      platformUser,
      'tenant-1',
      'owner-1',
    );

    expect(result.delivered).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/has been sent/i);
  });
});
