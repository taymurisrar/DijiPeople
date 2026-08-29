import { Prisma } from '@prisma/client';
import { LeaveEntitlementService } from './leave-entitlement.service';

/**
 * BUG-1967 — entitlement becomes a balance.
 *
 * The first test is the one that matters. Everything else here guards arithmetic
 * that is easy to get right; that one guards the design decision, and the naive
 * implementation — allocate the entitlements of the assignment that triggered
 * the reconcile — passes every other test in this file while failing it.
 */

const ANNUAL = 'leave-type-annual';
const SICK = 'leave-type-sick';

type BalanceRow = {
  totalAllocated: Prisma.Decimal;
  totalUsed: Prisma.Decimal;
  totalRemaining: Prisma.Decimal;
};

function harness(options: {
  /** The policy the resolver says wins, per employee id. */
  winner: Record<string, { id: string } | null>;
  /** Rules per policy id. */
  rules: Record<
    string,
    ReadonlyArray<{ leaveTypeId: string; entitlementDays: number | null }>
  >;
  employees?: ReadonlyArray<{ id: string }>;
  existing?: Record<string, BalanceRow>;
}) {
  const store = new Map<string, BalanceRow>(
    Object.entries(options.existing ?? {}),
  );

  const prisma = {
    leaveBalance: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            tenantId_employeeId_leaveTypeId: {
              employeeId: string;
              leaveTypeId: string;
            };
          };
        }) => {
          const key = `${where.tenantId_employeeId_leaveTypeId.employeeId}:${where.tenantId_employeeId_leaveTypeId.leaveTypeId}`;
          return Promise.resolve(store.get(key) ?? null);
        },
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: {
            tenantId_employeeId_leaveTypeId: {
              employeeId: string;
              leaveTypeId: string;
            };
          };
          create: BalanceRow;
          update: Partial<BalanceRow>;
        }) => {
          const id = where.tenantId_employeeId_leaveTypeId;
          const key = `${id.employeeId}:${id.leaveTypeId}`;
          const current = store.get(key);
          store.set(key, current ? { ...current, ...update } : { ...create });
          return Promise.resolve(store.get(key));
        },
      ),
    },
  };

  const repository = {
    findEmployeesForEntitlement: jest
      .fn()
      .mockResolvedValue(options.employees ?? [{ id: 'employee-1' }]),
    listActiveLeavePolicyRules: jest.fn((_tenantId: string, policyId: string) =>
      Promise.resolve(options.rules[policyId] ?? []),
    ),
  };

  const policyResolver = {
    resolveApplicableLeavePolicy: jest.fn(
      (_tenantId: string, employee: { id: string }) =>
        Promise.resolve(options.winner[employee.id] ?? null),
    ),
  };

  const service = new LeaveEntitlementService(
    prisma as never,
    repository as never,
    policyResolver as never,
  );

  return {
    service,
    store,
    prisma,
    balance: (employeeId: string, leaveTypeId: string) =>
      store.get(`${employeeId}:${leaveTypeId}`),
  };
}

describe('LeaveEntitlementService', () => {
  it('allocates the entitlement of the policy that WINS, not the one just assigned', async () => {
    /*
     * The whole design decision in one test.
     *
     * Two employees, one tenant-wide assignment granting 20 annual days, and a
     * more specific EMPLOYEE-scoped policy on employee-2 granting 5. Whatever
     * assignment triggered this reconcile, employee-2 is governed by the
     * specific policy and must get 5.
     *
     * An implementation that allocated "the entitlements of the assignment that
     * changed" would give employee-2 twenty days — and the balance gate would
     * then enforce a number no policy applying to them justifies. That is worse
     * than the bug being fixed, because it is wrong silently.
     */
    const h = harness({
      employees: [{ id: 'employee-1' }, { id: 'employee-2' }],
      winner: {
        'employee-1': { id: 'policy-tenant' },
        'employee-2': { id: 'policy-specific' },
      },
      rules: {
        'policy-tenant': [{ leaveTypeId: ANNUAL, entitlementDays: 20 }],
        'policy-specific': [{ leaveTypeId: ANNUAL, entitlementDays: 5 }],
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());

    expect(h.balance('employee-1', ANNUAL)?.totalAllocated).toEqual(
      new Prisma.Decimal(20),
    );
    expect(h.balance('employee-2', ANNUAL)?.totalAllocated).toEqual(
      new Prisma.Decimal(5),
    );
  });

  it('derives remaining as allocated minus used, and never touches used', async () => {
    const h = harness({
      winner: { 'employee-1': { id: 'policy-1' } },
      rules: { 'policy-1': [{ leaveTypeId: ANNUAL, entitlementDays: 20 }] },
      existing: {
        [`employee-1:${ANNUAL}`]: {
          totalAllocated: new Prisma.Decimal(0),
          totalUsed: new Prisma.Decimal(3),
          totalRemaining: new Prisma.Decimal(-3),
        },
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());

    const balance = h.balance('employee-1', ANNUAL);
    expect(balance?.totalAllocated).toEqual(new Prisma.Decimal(20));
    expect(balance?.totalRemaining).toEqual(new Prisma.Decimal(17));
    // The three days were taken. Nothing about allocation may give them back.
    expect(balance?.totalUsed).toEqual(new Prisma.Decimal(3));
  });

  it('is idempotent', async () => {
    const h = harness({
      winner: { 'employee-1': { id: 'policy-1' } },
      rules: {
        'policy-1': [
          { leaveTypeId: ANNUAL, entitlementDays: 20 },
          { leaveTypeId: SICK, entitlementDays: 10 },
        ],
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());
    const afterFirst = { ...h.balance('employee-1', ANNUAL) };
    await h.service.reconcileTenant('tenant-1', new Date());

    expect(h.balance('employee-1', ANNUAL)?.totalAllocated).toEqual(
      afterFirst.totalAllocated,
    );
    expect(h.balance('employee-1', ANNUAL)?.totalRemaining).toEqual(
      afterFirst.totalRemaining,
    );
    expect(h.balance('employee-1', SICK)?.totalAllocated).toEqual(
      new Prisma.Decimal(10),
    );
  });

  it('leaves an employee covered by no policy entirely alone', async () => {
    /*
     * Not "allocates zero". An employee whose assignment lapsed still holds the
     * days they were given; writing zero would take them away silently, and the
     * gate would then refuse leave they are entitled to.
     */
    const h = harness({
      winner: { 'employee-1': null },
      rules: {},
      existing: {
        [`employee-1:${ANNUAL}`]: {
          totalAllocated: new Prisma.Decimal(20),
          totalUsed: new Prisma.Decimal(2),
          totalRemaining: new Prisma.Decimal(18),
        },
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());

    expect(h.prisma.leaveBalance.upsert).not.toHaveBeenCalled();
    expect(h.balance('employee-1', ANNUAL)?.totalAllocated).toEqual(
      new Prisma.Decimal(20),
    );
  });

  it('lets remaining go negative when entitlement is cut below days already taken', async () => {
    /*
     * A true statement about the employee's position, and it must not be
     * clamped. Whether they may take more leave from here is the negative
     * balance rule's decision, downstream — and it can only decide correctly if
     * this number is honest.
     */
    const h = harness({
      winner: { 'employee-1': { id: 'policy-1' } },
      rules: { 'policy-1': [{ leaveTypeId: ANNUAL, entitlementDays: 5 }] },
      existing: {
        [`employee-1:${ANNUAL}`]: {
          totalAllocated: new Prisma.Decimal(20),
          totalUsed: new Prisma.Decimal(8),
          totalRemaining: new Prisma.Decimal(12),
        },
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());

    expect(h.balance('employee-1', ANNUAL)?.totalRemaining).toEqual(
      new Prisma.Decimal(-3),
    );
  });

  it('skips a rule that grants no entitlement rather than writing zero', async () => {
    const h = harness({
      winner: { 'employee-1': { id: 'policy-1' } },
      rules: {
        'policy-1': [
          { leaveTypeId: ANNUAL, entitlementDays: 20 },
          { leaveTypeId: SICK, entitlementDays: null },
        ],
      },
    });

    await h.service.reconcileTenant('tenant-1', new Date());

    expect(h.balance('employee-1', ANNUAL)).toBeDefined();
    expect(h.balance('employee-1', SICK)).toBeUndefined();
  });
});
