import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The "Operations" dashboard view (TASK-0032 WP-07 / ITEM-0199).
 *
 * `SuperAdminService.getDashboardSummary()` already answers "how is the
 * commercial and support side of the platform doing" with one large
 * `Promise.all`. This service answers a different question — "what is
 * happening across tenants, users, partners, agreements and system
 * reliability right now, and what needs attention" — and is kept separate
 * rather than folded into that method for one reason: every query here must
 * be able to fail on its own without blanking the rest of the dashboard
 * (BUG-3220-adjacent gap noted in the D4 discovery), which means each of the
 * five sections below runs inside its own try/catch rather than sharing one
 * `Promise.all` the way the commercial summary does.
 *
 * This is still the same `super-admin` module extending the same dashboard —
 * not a second, competing dashboard service. `SuperAdminController` calls
 * both this and `SuperAdminService.getDashboardSummary()` and the admin
 * frontend renders them as two halves of one screen (see
 * `platform-dashboard.tsx`'s "operations" view).
 */

export type SectionResult<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

export type WeekPoint = { key: string; label: string; count: number };
export type DayCountPoint = { key: string; label: string; count: number };
export type LoginTrendPoint = {
  key: string;
  label: string;
  succeeded: number;
  failed: number;
};
export type FunnelStage = { key: string; label: string; count: number };

export type PlatformOperationsSection = {
  tenantsTotal: number;
  tenantsActive: number;
  tenantsTrial: number;
  tenantsSuspended: number;
  tenantsStuckProvisioning: number;
  tenantsNewLast30Days: number;
  growthTrend: WeekPoint[];
};

export type UsersOperationsSection = {
  activeUsers: number;
  newUsersLast30Days: number;
  pendingInvitations: number;
  loginsLast24h: number;
  failedLoginsLast24h: number;
  loginTrend: LoginTrendPoint[];
  mfa: {
    tenant: { enabledActive: number; totalActive: number; ratePercent: number };
    platform: {
      enabledActive: number;
      totalActive: number;
      ratePercent: number;
    };
  };
};

export type PartnersOperationsSection = {
  total: number;
  active: number;
  byType: Record<string, number>;
  byModel: Record<string, number>;
  funnel: FunnelStage[];
  recentlyActivated: Array<{
    id: string;
    displayName: string;
    updatedAt: Date;
  }>;
};

export type AgreementsOperationsSection = {
  byStatusGroup: Record<string, number>;
  pendingSignature: number;
  generationFailures: SectionResult<number>;
};

export type OperationalSection = {
  unresolvedErrors: number;
  errorsLast24h: number;
  errorTrend: DayCountPoint[];
  jobFailures: {
    outboxFailed: number;
    platformEventsFailedLast24h: number;
  };
  recentIncidents: Array<{
    id: string;
    errorCode: string;
    severity: string;
    module: string | null;
    occurrenceCount: number;
    lastSeenAt: Date;
    supportStatus: string;
  }>;
};

export type OperationsDashboardSummary = {
  refreshedAt: string;
  platform: SectionResult<PlatformOperationsSection>;
  users: SectionResult<UsersOperationsSection>;
  partners: SectionResult<PartnersOperationsSection>;
  agreements: SectionResult<AgreementsOperationsSection>;
  operational: SectionResult<OperationalSection>;
};

/** Statuses a support agent has already closed out — everything else is unresolved. */
const RESOLVED_SUPPORT_STATUSES = ['RESOLVED', 'NOT_AN_INCIDENT'];

/** Contract lifecycle statuses that read as "still being drafted". */
const AGREEMENT_DRAFT_STATUSES = [
  'DRAFT',
  'INTERNAL_REVIEW',
  'APPROVED_FOR_SENDING',
  'COMMERCIAL_APPROVAL',
  'LEGAL_APPROVAL',
  'COUNTERPARTY_REVIEW',
  'READY_FOR_SIGNATURE',
];
const AGREEMENT_AWAITING_SIGNATURE_STATUSES = ['SENT', 'VIEWED'];
const AGREEMENT_PARTIALLY_SIGNED_STATUSES = [
  'SIGNATURE_IN_PROGRESS',
  'PARTIALLY_SIGNED',
];
const AGREEMENT_SIGNED_EXECUTED_STATUSES = [
  'FULLY_SIGNED',
  'FULLY_EXECUTED',
  'ACTIVE',
  'EXPIRING',
];
const AGREEMENT_EXPIRED_STATUSES = ['EXPIRED', 'TERMINATED'];
const AGREEMENT_CANCELLED_VOIDED_STATUSES = [
  'DECLINED',
  'VOIDED',
  'SUPERSEDED',
  'ARCHIVED',
];

/**
 * Buckets a `Contract.groupBy(['status'])` result into the six lifecycle
 * groups the Operations view shows (draft, awaiting signature, partially
 * signed, signed/executed, expired, cancelled/voided). A status this repo
 * adds later and forgets to place here lands in `other` rather than
 * disappearing from the total, so the group sum always equals the row count.
 */
export function groupAgreementStatuses(
  rows: Array<{ status: string; count: number }>,
): Record<string, number> {
  const groups: Record<string, number> = {
    draft: 0,
    awaitingSignature: 0,
    partiallySigned: 0,
    signedExecuted: 0,
    expired: 0,
    cancelledVoided: 0,
    other: 0,
  };
  for (const row of rows) {
    if (AGREEMENT_DRAFT_STATUSES.includes(row.status))
      groups.draft += row.count;
    else if (AGREEMENT_AWAITING_SIGNATURE_STATUSES.includes(row.status))
      groups.awaitingSignature += row.count;
    else if (AGREEMENT_PARTIALLY_SIGNED_STATUSES.includes(row.status))
      groups.partiallySigned += row.count;
    else if (AGREEMENT_SIGNED_EXECUTED_STATUSES.includes(row.status))
      groups.signedExecuted += row.count;
    else if (AGREEMENT_EXPIRED_STATUSES.includes(row.status))
      groups.expired += row.count;
    else if (AGREEMENT_CANCELLED_VOIDED_STATUSES.includes(row.status))
      groups.cancelledVoided += row.count;
    else groups.other += row.count;
  }
  return groups;
}

/**
 * No `Contract`/document-generation model records a failure outcome anywhere
 * in this schema — generation either produces a document or throws, and a
 * thrown generation error is only visible as an `ErrorLog` row keyed by
 * route, not by contract. Reporting `0` here would claim generation never
 * fails, which nobody has verified; `available: false` says so instead of
 * guessing. See AGENTS.md "No fabricated numbers".
 */
export function contractGenerationFailures(): SectionResult<number> {
  return {
    available: false,
    reason:
      'No model or ErrorLog field records contract-generation outcomes by contract; a count would be fabricated.',
  };
}

/** The six stages an operator actually reads the partner pipeline as. */
const PARTNER_FUNNEL: Array<{
  key: string;
  label: string;
  statuses: string[];
}> = [
  {
    key: 'inquiry',
    label: 'Inquiry',
    statuses: ['DRAFT', 'INQUIRY', 'NEW_INQUIRY', 'MORE_INFORMATION_REQUIRED'],
  },
  {
    key: 'application',
    label: 'Application in review',
    statuses: [
      'SUBMITTED',
      'UNDER_REVIEW',
      'INFORMATION_APPROVED',
      'QUALIFIED',
    ],
  },
  {
    key: 'approved',
    label: 'Approved, awaiting agreement',
    statuses: ['APPROVED_AWAITING_AGREEMENT'],
  },
  {
    key: 'agreement',
    label: 'Agreement in progress',
    statuses: [
      'AGREEMENT_IN_PROGRESS',
      'AGREEMENT_DRAFTING',
      'INTERNAL_APPROVAL',
      'AWAITING_SIGNATURE',
    ],
  },
  {
    key: 'onboarding',
    label: 'Agreement executed, onboarding',
    statuses: [
      'AGREEMENT_EXECUTED',
      'FULLY_SIGNED',
      'APPROVED_FOR_ACTIVATION',
      'ONBOARDING_PENDING',
      'ONBOARDING_INVITED',
      'ONBOARDING_IN_PROGRESS',
    ],
  },
  { key: 'active', label: 'Active', statuses: ['ACTIVE'] },
];

/**
 * Turns a `Partner.groupBy(['status'])` map into the ordered funnel stages
 * above. `SUSPENDED`/`INACTIVE`/`TERMINATED`/`REJECTED` are deliberately
 * excluded — they are exits from the funnel, not a stage in it, and folding
 * them into "inquiry" or "active" would misstate both.
 */
export function buildPartnerFunnel(
  statusCounts: Record<string, number>,
): FunnelStage[] {
  return PARTNER_FUNNEL.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: stage.statuses.reduce(
      (total, status) => total + (statusCounts[status] ?? 0),
      0,
    ),
  }));
}

/** Percent, one decimal place, `0` (not `NaN`) when there is no active population. */
export function mfaAdoptionPercent(enabled: number, active: number): number {
  if (active <= 0) return 0;
  return Math.round((enabled / active) * 1000) / 10;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dailyBuckets(
  days: number,
  now: Date,
): Array<{ key: string; label: string }> {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return {
      key: dayKey(date),
      label: date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    };
  });
}

/**
 * Buckets raw tenant-user login audit rows (`AuditLog.action` in
 * `AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED`) into a daily trend.
 *
 * This is tenant-user sign-ins only. Platform-admin logins are not audited
 * anywhere in this codebase today (no call site passes `AUTH_LOGIN_*` into
 * `AuditService.log()` with `tenantId: 'platform'`) — see the WP-07 report
 * for the full note. Claiming this trend covers admin logins too would be a
 * fabricated number, not an incomplete one.
 */
export function bucketDailyLoginActivity(
  rows: Array<{ action: string; createdAt: Date }>,
  days: number,
  now: Date = new Date(),
): LoginTrendPoint[] {
  return dailyBuckets(days, now).map((bucket) => ({
    ...bucket,
    succeeded: rows.filter(
      (row) =>
        dayKey(row.createdAt) === bucket.key &&
        row.action === 'AUTH_LOGIN_SUCCEEDED',
    ).length,
    failed: rows.filter(
      (row) =>
        dayKey(row.createdAt) === bucket.key &&
        row.action === 'AUTH_LOGIN_FAILED',
    ).length,
  }));
}

/** Buckets raw `ErrorLogOccurrence` rows into a daily error-volume trend. */
export function bucketDailyErrorVolume(
  rows: Array<{ occurredAt: Date }>,
  days: number,
  now: Date = new Date(),
): DayCountPoint[] {
  return dailyBuckets(days, now).map((bucket) => ({
    ...bucket,
    count: rows.filter((row) => dayKey(row.occurredAt) === bucket.key).length,
  }));
}

function weekKey(date: Date): string {
  // Monday of the ISO week the date falls in, as a stable bucket key.
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return dayKey(d);
}

function weeklyBuckets(
  weeks: number,
  now: Date,
): Array<{ key: string; label: string }> {
  const currentWeekMonday = new Date(weekKey(now));
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(currentWeekMonday);
    date.setUTCDate(date.getUTCDate() - 7 * (weeks - 1 - index));
    return {
      key: dayKey(date),
      label: date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    };
  });
}

/** Buckets tenant `createdAt` rows into a weekly growth trend. */
export function bucketWeeklyTenantGrowth(
  rows: Array<{ createdAt: Date }>,
  weeks: number,
  now: Date = new Date(),
): WeekPoint[] {
  return weeklyBuckets(weeks, now).map((bucket) => ({
    ...bucket,
    count: rows.filter((row) => weekKey(row.createdAt) === bucket.key).length,
  }));
}

async function section<T>(
  logger: Logger,
  label: string,
  run: () => Promise<T>,
): Promise<SectionResult<T>> {
  try {
    return { available: true, data: await run() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
      JSON.stringify({
        event: 'operations-dashboard.section-failed',
        section: label,
        reason,
      }),
    );
    return { available: false, reason };
  }
}

@Injectable()
export class OperationsDashboardService {
  private readonly logger = new Logger(OperationsDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOperationsDashboard(): Promise<OperationsDashboardSummary> {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 86_400_000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last14Days = new Date(now.getTime() - 14 * 86_400_000);
    const last12Weeks = new Date(now.getTime() - 12 * 7 * 86_400_000);

    const [platform, users, partners, agreements, operational] =
      await Promise.all([
        section(this.logger, 'platform', () =>
          this.loadPlatform(now, last30Days, last12Weeks),
        ),
        section(this.logger, 'users', () =>
          this.loadUsers(now, last30Days, last24Hours, last14Days),
        ),
        section(this.logger, 'partners', () => this.loadPartners()),
        section(this.logger, 'agreements', () => this.loadAgreements()),
        section(this.logger, 'operational', () =>
          this.loadOperational(last24Hours, last14Days),
        ),
      ]);

    return {
      refreshedAt: now.toISOString(),
      platform,
      users,
      partners,
      agreements,
      operational,
    };
  }

  private async loadPlatform(
    now: Date,
    last30Days: Date,
    last12Weeks: Date,
  ): Promise<PlatformOperationsSection> {
    const [statusBreakdown, trialCount, newLast30Days, recentTenants] =
      await Promise.all([
        this.prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
        // A subscription, not a tenant flag — `TenantStatus` has no TRIAL
        // value. `Subscription.tenantId` is unique, so this counts tenants,
        // not subscriptions-per-tenant.
        this.prisma.subscription.count({ where: { status: 'TRIALING' } }),
        this.prisma.tenant.count({ where: { createdAt: { gte: last30Days } } }),
        this.prisma.tenant.findMany({
          where: { createdAt: { gte: last12Weeks } },
          select: { createdAt: true },
        }),
      ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusBreakdown) {
      byStatus[row.status] = row._count._all;
      total += row._count._all;
    }

    return {
      tenantsTotal: total,
      tenantsActive: byStatus.ACTIVE ?? 0,
      tenantsTrial: trialCount,
      tenantsSuspended: byStatus.SUSPENDED ?? 0,
      // The tenant's own `status` is the current truth, unlike a historical
      // `TenantProvisioningRun` row that stays FAILED even after a
      // successful retry — see the WP-07 report for why this was chosen
      // over the provisioning-run table.
      tenantsStuckProvisioning:
        (byStatus.PROVISIONING ?? 0) + (byStatus.PROVISIONING_FAILED ?? 0),
      tenantsNewLast30Days: newLast30Days,
      growthTrend: bucketWeeklyTenantGrowth(recentTenants, 12, now),
    };
  }

  private async loadUsers(
    now: Date,
    last30Days: Date,
    last24Hours: Date,
    last14Days: Date,
  ): Promise<UsersOperationsSection> {
    const [
      activeUsers,
      newUsersLast30Days,
      pendingInvitations,
      loginsLast24h,
      failedLoginsLast24h,
      loginRows,
      mfaEnabledTenantUsers,
      activePlatformUsers,
      mfaEnabledPlatformUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.userInvitation.count({ where: { status: 'PENDING' } }),
      this.prisma.auditLog.count({
        where: {
          action: 'AUTH_LOGIN_SUCCEEDED',
          createdAt: { gte: last24Hours },
        },
      }),
      this.prisma.auditLog.count({
        where: { action: 'AUTH_LOGIN_FAILED', createdAt: { gte: last24Hours } },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: { in: ['AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGIN_FAILED'] },
          createdAt: { gte: last14Days },
        },
        select: { action: true, createdAt: true },
      }),
      this.prisma.user.count({ where: { status: 'ACTIVE', mfaEnabled: true } }),
      this.prisma.platformUser.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformUser.count({
        where: { status: 'ACTIVE', mfaEnabled: true },
      }),
    ]);

    return {
      activeUsers,
      newUsersLast30Days,
      pendingInvitations,
      loginsLast24h,
      failedLoginsLast24h,
      loginTrend: bucketDailyLoginActivity(loginRows, 14, now),
      mfa: {
        tenant: {
          enabledActive: mfaEnabledTenantUsers,
          totalActive: activeUsers,
          ratePercent: mfaAdoptionPercent(mfaEnabledTenantUsers, activeUsers),
        },
        platform: {
          enabledActive: mfaEnabledPlatformUsers,
          totalActive: activePlatformUsers,
          ratePercent: mfaAdoptionPercent(
            mfaEnabledPlatformUsers,
            activePlatformUsers,
          ),
        },
      },
    };
  }

  private async loadPartners(): Promise<PartnersOperationsSection> {
    const [statusBreakdown, typeBreakdown, modelBreakdown, recentlyActivated] =
      await Promise.all([
        this.prisma.partner.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.partner.groupBy({ by: ['type'], _count: { _all: true } }),
        this.prisma.partner.groupBy({
          by: ['partnershipModel'],
          _count: { _all: true },
        }),
        this.prisma.partner.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: { id: true, displayName: true, updatedAt: true },
        }),
      ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusBreakdown) {
      byStatus[row.status] = row._count._all;
      total += row._count._all;
    }

    return {
      total,
      active: byStatus.ACTIVE ?? 0,
      byType: Object.fromEntries(
        typeBreakdown.map((row) => [row.type, row._count._all]),
      ),
      byModel: Object.fromEntries(
        modelBreakdown.map((row) => [
          row.partnershipModel ?? 'UNSPECIFIED',
          row._count._all,
        ]),
      ),
      funnel: buildPartnerFunnel(byStatus),
      recentlyActivated,
    };
  }

  private async loadAgreements(): Promise<AgreementsOperationsSection> {
    const statusBreakdown = await this.prisma.contract.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const rows = statusBreakdown.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
    const byStatusGroup = groupAgreementStatuses(rows);

    return {
      byStatusGroup,
      pendingSignature:
        byStatusGroup.awaitingSignature + byStatusGroup.partiallySigned,
      generationFailures: contractGenerationFailures(),
    };
  }

  private async loadOperational(
    last24Hours: Date,
    last14Days: Date,
  ): Promise<OperationalSection> {
    const [
      unresolvedErrors,
      errorsLast24h,
      errorOccurrenceRows,
      outboxFailed,
      platformEventsFailedLast24h,
      recentIncidents,
    ] = await Promise.all([
      this.prisma.errorLog.count({
        where: { supportStatus: { notIn: RESOLVED_SUPPORT_STATUSES } },
      }),
      this.prisma.errorLogOccurrence.count({
        where: { occurredAt: { gte: last24Hours } },
      }),
      this.prisma.errorLogOccurrence.findMany({
        where: { occurredAt: { gte: last14Days } },
        select: { occurredAt: true },
      }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.platformEvent.count({
        where: { result: 'FAILED', occurredAt: { gte: last24Hours } },
      }),
      this.prisma.errorLog.findMany({
        where: { supportStatus: { notIn: RESOLVED_SUPPORT_STATUSES } },
        orderBy: { lastSeenAt: 'desc' },
        take: 8,
        select: {
          id: true,
          errorCode: true,
          severity: true,
          module: true,
          occurrenceCount: true,
          lastSeenAt: true,
          supportStatus: true,
        },
      }),
    ]);

    return {
      unresolvedErrors,
      errorsLast24h,
      errorTrend: bucketDailyErrorVolume(errorOccurrenceRows, 14),
      jobFailures: { outboxFailed, platformEventsFailedLast24h },
      recentIncidents,
    };
  }
}
