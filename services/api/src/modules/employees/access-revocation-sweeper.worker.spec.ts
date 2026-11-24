import { ConfigService } from '@nestjs/config';
import { AccessRevocationSweeperWorker } from './access-revocation-sweeper.worker';

/*
 * DP-MASTER/WP-08.S0b (BUG-4774). A future-dated termination must lose access on
 * its date. The worker is a security control, so it is on unless explicitly off.
 */

function harness(
  options: {
    due?: Array<{ id: string; tenantId: string; userId: string }>;
    ownerUserId?: string | null;
    failFor?: string;
    env?: Record<string, string>;
  } = {},
) {
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue(options.due ?? []) },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerUserId: options.ownerUserId ?? null }),
    },
    user: { updateMany: jest.fn().mockReturnValue('u') },
    refreshToken: { updateMany: jest.fn().mockReturnValue('r') },
    agentRefreshToken: { updateMany: jest.fn().mockReturnValue('a') },
    $transaction: jest.fn().mockImplementation(() => {
      const calls = prisma.user.updateMany.mock.calls;
      const last = calls[calls.length - 1][0].where.id;
      if (last === options.failFor) return Promise.reject(new Error('db down'));
      return Promise.resolve([{ count: 1 }, { count: 1 }, { count: 0 }]);
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService(options.env ?? {});
  const worker = new AccessRevocationSweeperWorker(
    config,
    prisma as never,
    audit as never,
  );
  return { worker, prisma, audit };
}

describe('AccessRevocationSweeperWorker', () => {
  it('is enabled by default and only an explicit "false" disables it', () => {
    expect(harness().worker.isEnabled()).toBe(true);
    expect(
      harness({
        env: { ACCESS_REVOCATION_SWEEPER_ENABLED: 'true' },
      }).worker.isEnabled(),
    ).toBe(true);
    expect(
      harness({
        env: { ACCESS_REVOCATION_SWEEPER_ENABLED: 'false' },
      }).worker.isEnabled(),
    ).toBe(false);
  });

  it('selects only TERMINATED, due, still-enabled employees with a linked user', async () => {
    const { worker, prisma } = harness();
    await worker.tick();
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      employmentStatus: 'TERMINATED',
      isDeleted: false,
      userId: { not: null },
      user: { status: { not: 'DISABLED' } },
    });
    expect(where.terminationDate.lte).toBeInstanceOf(Date);
  });

  it('revokes each due employee and audits it with no human actor', async () => {
    const { worker, audit } = harness({
      due: [{ id: 'e1', tenantId: 't1', userId: 'u1' }],
    });
    await expect(worker.tick()).resolves.toEqual({ revoked: 1, failed: 0 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        actorUserId: null,
        entityId: 'e1',
        action: 'EMPLOYEE_ACCESS_REVOKED',
      }),
    );
  });

  it('never disables the tenant owner', async () => {
    const { worker, prisma, audit } = harness({
      due: [{ id: 'e1', tenantId: 't1', userId: 'owner' }],
      ownerUserId: 'owner',
    });
    await expect(worker.tick()).resolves.toEqual({ revoked: 0, failed: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('keeps going after one employee fails, and the next tick retries it', async () => {
    const { worker, audit } = harness({
      due: [
        { id: 'e1', tenantId: 't1', userId: 'bad' },
        { id: 'e2', tenantId: 't1', userId: 'good' },
      ],
      failFor: 'bad',
    });
    await expect(worker.tick()).resolves.toEqual({ revoked: 1, failed: 1 });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('never throws when the query itself fails', async () => {
    const { worker, prisma } = harness();
    prisma.employee.findMany.mockRejectedValue(new Error('down'));
    await expect(worker.tick()).resolves.toEqual({ revoked: 0, failed: 0 });
  });
});
