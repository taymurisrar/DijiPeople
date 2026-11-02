import { UnauthorizedException } from '@nestjs/common';
import { UserInvitationStatus } from '@prisma/client';
import { UserInvitationsService } from './user-invitations.service';

/**
 * DP-QA-027. A revoked or expired invitation token must never activate an
 * account, and two requests presenting the same live token must not both win.
 *
 * The fake models one invitation row and implements `updateMany` the way the
 * database does - evaluating its `where` against the row's CURRENT state in one
 * step - so the race below is real: both requests pass the advisory pre-check
 * (both read PENDING) and only the conditional claim can separate them.
 */
type Row = {
  id: string;
  tenantId: string;
  userId: string;
  employeeId: string | null;
  email: string;
  status: UserInvitationStatus;
  consumedAt: Date | null;
  expiresAt: Date;
};

function build(initial: Partial<Row> = {}) {
  const row: Row = {
    id: 'inv-1',
    tenantId: 't1',
    userId: 'u1',
    employeeId: null,
    email: 'a@example.test',
    status: UserInvitationStatus.PENDING,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    ...initial,
  };
  const userUpdates: unknown[] = [];

  const matches = (where: Record<string, unknown>) =>
    (where.id === undefined || where.id === row.id) &&
    (where.status === undefined || where.status === row.status) &&
    (where.consumedAt === undefined || where.consumedAt === row.consumedAt) &&
    (where.expiresAt === undefined ||
      row.expiresAt.getTime() > (where.expiresAt as { gt: Date }).gt.getTime());

  const invitationApi = {
    findUnique: jest.fn(async () => ({ ...row, tenant: null, user: null })),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Row>;
      }) => {
        // Other pending invitations of the same user: none in this fixture.
        if (where.userId !== undefined) return { count: 0 };
        if (!matches(where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    ),
    update: jest.fn(),
  };
  const tx = { userInvitation: invitationApi };
  const prisma = {
    userInvitation: invitationApi,
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
  };
  const usersRepository = {
    update: jest.fn(async (...args: unknown[]) => {
      userUpdates.push(args);
    }),
  };
  const passwordPolicy = {
    assertPasswordMeetsPolicy: jest.fn(),
    assertPasswordNotReused: jest.fn(),
    resolvePolicy: jest.fn(),
  };

  const service = new UserInvitationsService(
    prisma as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
    usersRepository as never,
    { log: jest.fn() } as never,
    passwordPolicy as never,
    {} as never,
  );

  return { service, row, userUpdates, invitationApi };
}

describe('invitation activation token lifecycle (DP-QA-027)', () => {
  it('activates once with a live pending invitation', async () => {
    const { service, row, userUpdates } = build();
    await expect(
      service.activateAccount('tok', 'Str0ng!Passw0rd'),
    ).resolves.toMatchObject({ activated: true });
    expect(row.status).toBe(UserInvitationStatus.CONSUMED);
    expect(userUpdates).toHaveLength(1);
  });

  it('refuses a revoked invitation and changes nothing', async () => {
    const { service, row, userUpdates } = build({
      status: UserInvitationStatus.REVOKED,
    });
    await expect(
      service.activateAccount('tok', 'Str0ng!Passw0rd'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(row.status).toBe(UserInvitationStatus.REVOKED);
    expect(userUpdates).toHaveLength(0);
  });

  it('refuses an expired invitation by date even while still marked PENDING', async () => {
    const { service, userUpdates } = build({
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      service.activateAccount('tok', 'Str0ng!Passw0rd'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userUpdates).toHaveLength(0);
  });

  it('refuses an invitation already marked EXPIRED or CONSUMED', async () => {
    for (const status of [
      UserInvitationStatus.EXPIRED,
      UserInvitationStatus.CONSUMED,
    ]) {
      const { service, userUpdates } = build({ status });
      await expect(
        service.activateAccount('tok', 'Str0ng!Passw0rd'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userUpdates).toHaveLength(0);
    }
  });

  it('lets exactly one of two concurrent requests win', async () => {
    const { service, userUpdates } = build();
    const results = await Promise.allSettled([
      service.activateAccount('tok', 'Str0ng!Passw0rd-one'),
      service.activateAccount('tok', 'Str0ng!Passw0rd-two'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // The loser must not have written a password.
    expect(userUpdates).toHaveLength(1);
  });

  it('RUN-007 SEC-003/004: eight simultaneous requests yield exactly one winner, one password write, and a refused replay', async () => {
    const { service, userUpdates, row } = build();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        service.activateAccount('tok', `Str0ng!Passw0rd-${i}`),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(userUpdates).toHaveLength(1);
    expect(row.status).toBe(UserInvitationStatus.CONSUMED);
    // ...and the same token cannot be used again to change the password.
    await expect(
      service.activateAccount('tok', 'Hijack!Passw0rd-9'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userUpdates).toHaveLength(1);
  }, 30_000); // 8 bcrypt(12) hashes share a 4-thread pool

  it('closes the check-then-write gap: revoked after the pre-check, before the claim', async () => {
    const { service, row, userUpdates } = build();
    const original = row.status;
    // Revoke between the advisory read and the claim (the bcrypt window).
    // The service's `import * as bcrypt` reads through to the real module object.
    const bcrypt = jest.requireActual<typeof import('bcryptjs')>('bcryptjs');
    jest.spyOn(bcrypt, 'hash').mockImplementationOnce((() => {
      row.status = UserInvitationStatus.REVOKED;
      return Promise.resolve('hash');
    }) as never);
    await expect(
      service.activateAccount('tok', 'Str0ng!Passw0rd'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(original).toBe(UserInvitationStatus.PENDING);
    expect(userUpdates).toHaveLength(0);
  });

  it('the status lookup also refuses revoked and expired invitations', async () => {
    for (const patch of [
      { status: UserInvitationStatus.REVOKED },
      { expiresAt: new Date(Date.now() - 1000) },
    ]) {
      const { service } = build(patch);
      await expect(service.getInvitationStatus('tok')).rejects.toThrow();
    }
  });
});
