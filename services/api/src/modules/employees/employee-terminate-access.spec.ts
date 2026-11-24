import { UserStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';

/*
 * DP-MASTER/WP-08.S0 (OD-TERMINATE-ACCESS, S01, H02). Terminating an employee
 * used to set a status and a date and nothing else, so the linked user kept
 * signing in. Only the fields terminate() touches are wired; the service is built
 * without its 20-argument constructor on purpose.
 */

const TENANT = 'tenant-1';

function harness(
  options: { userId?: string | null; ownerUserId?: string | null } = {},
) {
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  const prisma = {
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerUserId: options.ownerUserId ?? null }),
    },
    user: { updateMany: jest.fn().mockReturnValue('user-op') },
    refreshToken: { updateMany: jest.fn().mockReturnValue('token-op') },
    agentRefreshToken: { updateMany: jest.fn().mockReturnValue('agent-op') },
    $transaction: jest
      .fn()
      .mockResolvedValue([{ count: 1 }, { count: 2 }, { count: 1 }]),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const employeesRepository = {
    findByIdAndTenant: jest.fn().mockResolvedValue({
      id: 'employee-1',
      userId,
      employmentStatus: 'ACTIVE',
      terminationDate: null,
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const service = Object.assign(Object.create(EmployeesService.prototype), {
    prisma,
    auditService,
    employeesRepository,
    findById: jest.fn().mockResolvedValue({ id: 'employee-1' }),
  }) as EmployeesService;
  return { service, prisma, auditService };
}

const terminate = (service: EmployeesService, terminationDate?: string) =>
  service.terminate(
    TENANT,
    'employee-1',
    { terminationDate } as never,
    'actor-1',
  );

describe('EmployeesService.terminate access revocation', () => {
  it('disables the user and revokes sessions in one transaction for an immediate exit', async () => {
    const { service, prisma, auditService } = harness();
    await terminate(service);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        tenantId: TENANT,
        status: { not: UserStatus.DISABLED },
      },
      data: { status: UserStatus.DISABLED },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, userId: 'user-1', revokedAt: null },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'user-op',
      'token-op',
      'agent-op',
    ]);
    const audit = auditService.log.mock.calls[0][0];
    expect(audit.afterSnapshot).toMatchObject({
      accessRevoked: true,
      accessRevocationNote: 'USER_DISABLED_SESSIONS_REVOKED',
    });
  });

  it('also revokes agent-desktop sessions', async () => {
    const { service, prisma } = harness();
    await terminate(service);
    expect(prisma.agentRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, userId: 'user-1', revokedAt: null },
      }),
    );
  });

  it('is idempotent: terminating again reports ALREADY_REVOKED', async () => {
    const { service, prisma, auditService } = harness();
    prisma.$transaction.mockResolvedValue([
      { count: 0 },
      { count: 0 },
      { count: 0 },
    ]);
    await terminate(service);
    expect(auditService.log.mock.calls[0][0].afterSnapshot).toMatchObject({
      accessRevoked: false,
      accessRevocationNote: 'ALREADY_REVOKED',
    });
  });

  it('treats a past termination date as immediate', async () => {
    const { service, prisma } = harness();
    await terminate(service, '2020-01-01');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('leaves access alone for a future-dated exit and records that it is pending', async () => {
    const { service, prisma, auditService } = harness();
    await terminate(service, '2999-01-01');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(auditService.log.mock.calls[0][0].afterSnapshot).toMatchObject({
      accessRevoked: false,
      accessRevocationNote: 'FUTURE_DATED_REVOCATION_SCHEDULED',
    });
  });

  it('never disables the tenant owner', async () => {
    const { service, prisma, auditService } = harness({
      ownerUserId: 'user-1',
    });
    await terminate(service);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditService.log.mock.calls[0][0].afterSnapshot).toMatchObject({
      accessRevoked: false,
      accessRevocationNote: 'TENANT_OWNER_NOT_DISABLED',
    });
  });

  it('does nothing to users when the employee has no linked user', async () => {
    const { service, prisma } = harness({ userId: null });
    await terminate(service);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
