import {
  OperationsDashboardService,
  bucketDailyErrorVolume,
  bucketDailyLoginActivity,
  bucketWeeklyTenantGrowth,
  buildPartnerFunnel,
  contractGenerationFailures,
  groupAgreementStatuses,
  mfaAdoptionPercent,
} from './operations-dashboard.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * TASK-0032 WP-07 / ITEM-0199 — the platform Operations dashboard.
 *
 * Two things this suite exists to pin down:
 *
 *  - a failure computing one section (partners, say) must not take down the
 *    other four — the whole point of running each section through its own
 *    try/catch instead of one shared `Promise.all` the way the commercial
 *    `getDashboardSummary()` does;
 *  - a metric with no reliable source reports itself unavailable rather than
 *    a fabricated zero (AGENTS.md "No fabricated numbers" / test-resource and
 *    completion-contract rules on this task).
 */

describe('pure helpers', () => {
  describe('groupAgreementStatuses', () => {
    it('buckets every known ContractStatus into one of the six lifecycle groups', () => {
      const groups = groupAgreementStatuses([
        { status: 'DRAFT', count: 3 },
        { status: 'SENT', count: 2 },
        { status: 'PARTIALLY_SIGNED', count: 1 },
        { status: 'FULLY_EXECUTED', count: 5 },
        { status: 'EXPIRED', count: 4 },
        { status: 'VOIDED', count: 1 },
      ]);
      expect(groups).toEqual({
        draft: 3,
        awaitingSignature: 2,
        partiallySigned: 1,
        signedExecuted: 5,
        expired: 4,
        cancelledVoided: 1,
        other: 0,
      });
    });

    it('keeps an unrecognised status counted, in `other`, rather than dropping it', () => {
      const groups = groupAgreementStatuses([
        { status: 'SOME_FUTURE_STATUS', count: 7 },
      ]);
      expect(groups.other).toBe(7);
      const total = Object.values(groups).reduce(
        (sum, value) => sum + value,
        0,
      );
      expect(total).toBe(7);
    });
  });

  describe('contractGenerationFailures', () => {
    it('reports unavailable rather than a fabricated zero', () => {
      const result = contractGenerationFailures();
      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toMatch(/no model|no.*field/i);
      }
    });
  });

  describe('buildPartnerFunnel', () => {
    it('sums each stage from the underlying PartnerStatus values', () => {
      const funnel = buildPartnerFunnel({
        NEW_INQUIRY: 4,
        UNDER_REVIEW: 2,
        APPROVED_AWAITING_AGREEMENT: 1,
        AGREEMENT_IN_PROGRESS: 3,
        ONBOARDING_PENDING: 2,
        ACTIVE: 10,
        SUSPENDED: 99,
      });
      expect(funnel.map((stage) => [stage.key, stage.count])).toEqual([
        ['inquiry', 4],
        ['application', 2],
        ['approved', 1],
        ['agreement', 3],
        ['onboarding', 2],
        ['active', 10],
      ]);
    });

    it('excludes exit statuses like SUSPENDED from every stage', () => {
      const funnel = buildPartnerFunnel({
        SUSPENDED: 5,
        TERMINATED: 2,
        REJECTED: 1,
      });
      const total = funnel.reduce((sum, stage) => sum + stage.count, 0);
      expect(total).toBe(0);
    });
  });

  describe('mfaAdoptionPercent', () => {
    it('is zero, not NaN, when there is no active population', () => {
      expect(mfaAdoptionPercent(0, 0)).toBe(0);
    });

    it('rounds to one decimal place', () => {
      expect(mfaAdoptionPercent(1, 3)).toBe(33.3);
    });

    it('is correct data even before rollout — WP-03 has not shipped MFA UI yet', () => {
      // AGENTS.md task brief: the columns exist since WP-01 and will read 0
      // until WP-03 ships. That is a true zero, not a bug.
      expect(mfaAdoptionPercent(0, 500)).toBe(0);
    });
  });

  describe('bucketDailyLoginActivity', () => {
    const now = new Date('2026-09-25T12:00:00Z');

    it('separates succeeded and failed logins per day', () => {
      const trend = bucketDailyLoginActivity(
        [
          {
            action: 'AUTH_LOGIN_SUCCEEDED',
            createdAt: new Date('2026-09-25T01:00:00Z'),
          },
          {
            action: 'AUTH_LOGIN_SUCCEEDED',
            createdAt: new Date('2026-09-25T02:00:00Z'),
          },
          {
            action: 'AUTH_LOGIN_FAILED',
            createdAt: new Date('2026-09-25T03:00:00Z'),
          },
          {
            action: 'AUTH_LOGIN_FAILED',
            createdAt: new Date('2026-09-24T03:00:00Z'),
          },
        ],
        14,
        now,
      );
      const today = trend[trend.length - 1];
      expect(today.key).toBe('2026-09-25');
      expect(today.succeeded).toBe(2);
      expect(today.failed).toBe(1);
      const yesterday = trend[trend.length - 2];
      expect(yesterday.failed).toBe(1);
      expect(yesterday.succeeded).toBe(0);
    });

    it('returns exactly `days` buckets, zero-filled, when there are no rows', () => {
      const trend = bucketDailyLoginActivity([], 14, now);
      expect(trend).toHaveLength(14);
      expect(
        trend.every((point) => point.succeeded === 0 && point.failed === 0),
      ).toBe(true);
    });
  });

  describe('bucketDailyErrorVolume', () => {
    it('counts occurrences per day', () => {
      const now = new Date('2026-09-25T12:00:00Z');
      const trend = bucketDailyErrorVolume(
        [
          { occurredAt: new Date('2026-09-25T00:30:00Z') },
          { occurredAt: new Date('2026-09-25T23:30:00Z') },
          { occurredAt: new Date('2026-09-20T00:00:00Z') },
        ],
        14,
        now,
      );
      expect(trend[trend.length - 1].count).toBe(2);
    });
  });

  describe('bucketWeeklyTenantGrowth', () => {
    it('returns exactly 12 weekly buckets and counts each tenant once', () => {
      const now = new Date('2026-09-25T12:00:00Z');
      const trend = bucketWeeklyTenantGrowth(
        [{ createdAt: new Date('2026-09-24T00:00:00Z') }],
        12,
        now,
      );
      expect(trend).toHaveLength(12);
      const total = trend.reduce((sum, week) => sum + week.count, 0);
      expect(total).toBe(1);
    });
  });
});

/**
 * A minimal stand-in for the handful of Prisma delegates this service reads,
 * every call recorded so the "exact where/groupBy, no unbounded findMany"
 * requirement can be asserted against real call arguments rather than trusted
 * by inspection.
 */
function fakePrisma() {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string) =>
    jest.fn((...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return Promise.resolve(defaults[name]);
    });
  const defaults: Record<string, unknown> = {
    'tenant.groupBy': [{ status: 'ACTIVE', _count: { _all: 10 } }],
    'tenant.count': 2,
    'tenant.findMany': [],
    'subscription.count': 1,
    'user.count': 5,
    'userInvitation.count': 3,
    'auditLog.count': 4,
    'auditLog.findMany': [],
    'platformUser.count': 6,
    'partner.groupBy': [{ status: 'ACTIVE', _count: { _all: 1 } }],
    'partner.findMany': [],
    'contract.groupBy': [{ status: 'DRAFT', _count: { _all: 1 } }],
    'errorLog.count': 7,
    'errorLog.findMany': [],
    'errorLogOccurrence.count': 8,
    'errorLogOccurrence.findMany': [],
    'outboxEvent.count': 9,
    'platformEvent.count': 10,
  };
  const prisma = {
    tenant: {
      groupBy: record('tenant.groupBy'),
      count: record('tenant.count'),
      findMany: record('tenant.findMany'),
    },
    subscription: { count: record('subscription.count') },
    user: { count: record('user.count') },
    userInvitation: { count: record('userInvitation.count') },
    auditLog: {
      count: record('auditLog.count'),
      findMany: record('auditLog.findMany'),
    },
    platformUser: { count: record('platformUser.count') },
    partner: {
      groupBy: record('partner.groupBy'),
      findMany: record('partner.findMany'),
    },
    contract: { groupBy: record('contract.groupBy') },
    errorLog: {
      count: record('errorLog.count'),
      findMany: record('errorLog.findMany'),
    },
    errorLogOccurrence: {
      count: record('errorLogOccurrence.count'),
      findMany: record('errorLogOccurrence.findMany'),
    },
    outboxEvent: { count: record('outboxEvent.count') },
    platformEvent: { count: record('platformEvent.count') },
  };
  return { prisma, calls };
}

describe('OperationsDashboardService', () => {
  it('scopes every login query to the two AUTH_LOGIN_* actions, never a bare AuditLog scan', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    await service.getOperationsDashboard();

    const countCalls = calls['auditLog.count'] as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(countCalls).toHaveLength(2);
    const actions = countCalls.map((call) => call[0].where.action).sort();
    expect(actions).toEqual(['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_SUCCEEDED']);
    for (const call of countCalls) {
      expect(call[0].where.createdAt).toBeDefined();
    }

    const findManyCall = (
      calls['auditLog.findMany'] as Array<[{ where: Record<string, unknown> }]>
    )[0];
    expect(findManyCall[0].where.action).toEqual({
      in: ['AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGIN_FAILED'],
    });
    // Bounded by a date range — never the whole table.
    expect(findManyCall[0].where.createdAt).toBeDefined();
  });

  it('counts pending invitations by UserInvitationStatus.PENDING, not every invitation', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    await service.getOperationsDashboard();

    const call = (
      calls['userInvitation.count'] as Array<
        [{ where: Record<string, unknown> }]
      >
    )[0];
    expect(call[0].where).toEqual({ status: 'PENDING' });
  });

  it('excludes RESOLVED and NOT_AN_INCIDENT from the unresolved-errors count', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    await service.getOperationsDashboard();

    const call = (
      calls['errorLog.count'] as Array<[{ where: Record<string, unknown> }]>
    )[0];
    expect(call[0].where).toEqual({
      supportStatus: { notIn: ['RESOLVED', 'NOT_AN_INCIDENT'] },
    });
  });

  it('bounds trend findMany calls to a date range and a narrow select, never the whole table', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    await service.getOperationsDashboard();

    for (const name of [
      'tenant.findMany',
      'auditLog.findMany',
      'errorLogOccurrence.findMany',
    ]) {
      const call = (
        calls[name] as Array<
          [{ where?: Record<string, unknown>; select?: unknown }]
        >
      )[0];
      expect(call[0].where).toBeDefined();
      expect(call[0].select).toBeDefined();
    }
  });

  it('isolates a failing section: partners failing does not blank platform, users, agreements or operational', async () => {
    const { prisma } = fakePrisma();
    (prisma.partner.groupBy as jest.Mock).mockRejectedValueOnce(
      new Error('connection reset'),
    );
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    const result = await service.getOperationsDashboard();

    expect(result.partners.available).toBe(false);
    if (!result.partners.available) {
      expect(result.partners.reason).toContain('connection reset');
    }
    expect(result.platform.available).toBe(true);
    expect(result.users.available).toBe(true);
    expect(result.agreements.available).toBe(true);
    expect(result.operational.available).toBe(true);
  });

  it('reports agreement generation failures as unavailable, never a zero', async () => {
    const { prisma } = fakePrisma();
    const service = new OperationsDashboardService(
      prisma as unknown as PrismaService,
    );
    const result = await service.getOperationsDashboard();

    expect(result.agreements.available).toBe(true);
    if (result.agreements.available) {
      expect(result.agreements.data.generationFailures.available).toBe(false);
    }
  });
});
