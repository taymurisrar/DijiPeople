import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LeaveService } from './leave.service';

/**
 * DP-QA-029. Approval must deduct the balance atomically and refuse an overdraw.
 * The fake implements `updateMany` the way the database does: the `where`
 * (including the `totalRemaining >= days` guard) is evaluated against the row's
 * current value in one step, so concurrent approvals genuinely contend.
 */
type Balance = { totalUsed: number; totalRemaining: number } | null;

function build(initial: Balance, opts: { consumesBalance?: boolean } = {}) {
  let balance = initial ? { ...initial } : null;
  const consumption = new Set<string>();

  const db = {
    leaveConsumptionRecord: {
      findFirst: jest.fn(
        async ({ where }: { where: { leaveRequestId: string } }) =>
          consumption.has(where.leaveRequestId) ? { id: 'c' } : null,
      ),
      create: jest.fn(
        async ({ data }: { data: { leaveRequestId: string } }) => {
          consumption.add(data.leaveRequestId);
        },
      ),
    },
    leaveBalance: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { totalRemaining?: { gte: Prisma.Decimal } };
          data: {
            totalUsed: { increment: Prisma.Decimal };
            totalRemaining: { decrement: Prisma.Decimal };
          };
        }) => {
          if (!balance) return { count: 0 };
          const days = Number(data.totalUsed.increment);
          if (
            where.totalRemaining &&
            balance.totalRemaining < Number(where.totalRemaining.gte)
          ) {
            return { count: 0 };
          }
          balance = {
            totalUsed: balance.totalUsed + days,
            totalRemaining: balance.totalRemaining - days,
          };
          return { count: 1 };
        },
      ),
      count: jest.fn(async () => (balance ? 1 : 0)),
      upsert: jest.fn(
        async ({
          create,
        }: {
          create: { totalUsed: Prisma.Decimal; totalRemaining: Prisma.Decimal };
        }) => {
          balance = balance
            ? {
                totalUsed: balance.totalUsed + Number(create.totalUsed),
                totalRemaining:
                  balance.totalRemaining + Number(create.totalRemaining),
              }
            : {
                totalUsed: Number(create.totalUsed),
                totalRemaining: Number(create.totalRemaining),
              };
        },
      ),
    },
  };

  const request = (id: string) => ({
    id,
    tenantId: 't1',
    employeeId: 'e1',
    leaveTypeId: 'lt1',
    status: 'APPROVED',
    totalDays: new Prisma.Decimal(1),
    leaveType: { isPaid: true, consumesBalance: opts.consumesBalance ?? true },
  });

  const service = Object.create(LeaveService.prototype) as Record<
    string,
    unknown
  >;
  /** maxNegative is the overdraft ceiling in days, or null when not allowed. */
  const approve = (id: string, maxNegative: number | null = null) =>
    (
      service as unknown as {
        recordApprovedLeaveConsumption: (
          r: unknown,
          d: unknown,
          n: Prisma.Decimal | null,
        ) => Promise<void>;
      }
    ).recordApprovedLeaveConsumption(
      request(id),
      db,
      maxNegative === null ? null : new Prisma.Decimal(maxNegative),
    );

  return { approve, db, get: () => balance };
}

describe('approving leave deducts the balance atomically (DP-QA-029)', () => {
  it('deducts on the first approval, immediately', async () => {
    const h = build({ totalUsed: 0, totalRemaining: 2 });
    await h.approve('r1');
    expect(h.get()).toEqual({ totalUsed: 1, totalRemaining: 1 });
  });

  it('refuses the approval that would overdraw, and leaves the balance alone', async () => {
    const h = build({ totalUsed: 0, totalRemaining: 2 });
    await h.approve('r1');
    await h.approve('r2');
    await expect(h.approve('r3')).rejects.toBeInstanceOf(ConflictException);
    expect(h.get()).toEqual({ totalUsed: 2, totalRemaining: 0 });
  });

  it('lets exactly one of two concurrent approvals take the last day', async () => {
    const h = build({ totalUsed: 1, totalRemaining: 1 });
    const results = await Promise.allSettled([
      h.approve('r1'),
      h.approve('r2'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(h.get()?.totalRemaining).toBe(0);
  });

  it('refuses when there is no balance row and overdraft is not allowed', async () => {
    const h = build(null);
    await expect(h.approve('r1')).rejects.toBeInstanceOf(ConflictException);
    expect(h.get()).toBeNull();
  });

  it('allows an overdraft only when the policy rule says so, up to its ceiling', async () => {
    const h = build({ totalUsed: 2, totalRemaining: 0 });
    await h.approve('r1', 2);
    expect(h.get()).toEqual({ totalUsed: 3, totalRemaining: -1 });
  });

  it('stops at the overdraft ceiling instead of going arbitrarily negative (BUG-3197)', async () => {
    const h = build({ totalUsed: 2, totalRemaining: 0 });
    await h.approve('r1', 2);
    await h.approve('r2', 2);
    await expect(h.approve('r3', 2)).rejects.toBeInstanceOf(ConflictException);
    expect(h.get()).toEqual({ totalUsed: 4, totalRemaining: -2 });
  });

  it('lets exactly the ceiling worth of concurrent approvals through', async () => {
    const h = build({ totalUsed: 2, totalRemaining: 0 });
    const results = await Promise.allSettled([
      h.approve('r1', 2),
      h.approve('r2', 2),
      h.approve('r3', 2),
      h.approve('r4', 2),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(h.get()?.totalRemaining).toBe(-2);
  });

  it('an allowed overdraft with a ceiling of zero behaves like no overdraft', async () => {
    const h = build({ totalUsed: 2, totalRemaining: 0 });
    await expect(h.approve('r1', 0)).rejects.toBeInstanceOf(ConflictException);
    expect(h.get()).toEqual({ totalUsed: 2, totalRemaining: 0 });
  });

  it('creates an overdrawn balance when overdraft is allowed, none exists, and the days fit the ceiling', async () => {
    const h = build(null);
    await h.approve('r1', 2);
    expect(h.get()).toEqual({ totalUsed: 1, totalRemaining: -1 });
  });

  it('refuses to create an overdrawn balance that already exceeds the ceiling', async () => {
    const h = build(null);
    await expect(h.approve('r1', 0)).rejects.toBeInstanceOf(ConflictException);
    expect(h.get()).toBeNull();
  });

  it('does not touch the balance for a leave type that does not consume it', async () => {
    const h = build(
      { totalUsed: 0, totalRemaining: 0 },
      { consumesBalance: false },
    );
    await h.approve('r1');
    expect(h.db.leaveBalance.updateMany).not.toHaveBeenCalled();
    expect(h.get()).toEqual({ totalUsed: 0, totalRemaining: 0 });
  });

  it('is idempotent: approving the same request twice deducts once', async () => {
    const h = build({ totalUsed: 0, totalRemaining: 2 });
    await h.approve('r1');
    await h.approve('r1');
    expect(h.get()).toEqual({ totalUsed: 1, totalRemaining: 1 });
  });
});
