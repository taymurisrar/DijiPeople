import { Prisma } from '@prisma/client';
import { NOT_AN_INCIDENT } from '../error-logs/expected-protocol-outcome';

/*
 * The error-log console's query language, as pure functions.
 *
 * Kept out of `PlatformMonitoringService` so the one thing that decides which
 * rows a filter selects — and which rows each summary metric counts — can be
 * tested by inspecting the `where` it builds, without a database. The screen
 * has a history of a tile and the list it opens answering two different
 * questions (BUG-1420, BUG-1750, BUG-2495, ITEM-0206); every one of those was
 * two call sites spelling one idea differently, so there is exactly one
 * spelling here and the service only composes it.
 */

/** The raw query the list endpoint accepts. Every value arrives as a string. */
export type ErrorLogListQuery = {
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDirection?: string;
  search?: string;
  reference?: string;
  correlationId?: string;
  severity?: string;
  status?: string;
  viewKey?: string;
  sourceApp?: string;
  environment?: string;
  module?: string;
  tenantId?: string;
  userId?: string;
  category?: string;
  route?: string;
  method?: string;
  period?: string;
  from?: string;
  to?: string;
};

/**
 * What "critical" means, in the one place that decides it.
 *
 * `severity` is unconstrained free text, so this is a list rather than a
 * comparison. Prisma's `in` is case-sensitive and has no insensitive mode, so
 * the spellings are enumerated rather than folded — a census on 2026-08-27
 * found 1,466 rows lowercase against 5 uppercase, which is why an exact match
 * on `'ERROR'` returned almost nothing.
 *
 * `critical` is a level the error catalog itself assigns (`ErrorSeverity` in
 * `error-catalog.ts` — eleven entries use it, database and provisioning
 * failures among them). It was missing from this list, so the most severe
 * failures the API can record were the ones the Critical metric did not count.
 *
 * Promoting `severity` to an enum with a normalising migration is the deeper
 * fix and needs an ExecPlan; until then this is the definition, and the metric,
 * the filter and every tile's link all read it.
 */
export const CRITICAL_INCIDENT_SEVERITIES = [
  'ERROR',
  'FATAL',
  'CRITICAL',
  'error',
  'fatal',
  'critical',
] as const;

/** Same reasoning as above. `warn` is what a few client loggers write. */
export const WARNING_INCIDENT_SEVERITIES = [
  'WARNING',
  'WARN',
  'warning',
  'warn',
] as const;

export const INFO_INCIDENT_SEVERITIES = ['INFO', 'info'] as const;

/** The severity groups the console filters and counts by. */
export const SEVERITY_GROUPS = ['critical', 'warning', 'info'] as const;
export type SeverityGroup = (typeof SEVERITY_GROUPS)[number];

export function criticalIncidentWhere(): Prisma.ErrorLogWhereInput {
  return { severity: { in: [...CRITICAL_INCIDENT_SEVERITIES] } };
}

export function warningIncidentWhere(): Prisma.ErrorLogWhereInput {
  return { severity: { in: [...WARNING_INCIDENT_SEVERITIES] } };
}

/**
 * The group a stored severity belongs to, for display. Mirrors the lists
 * above so a row rendered "Critical" is a row the Critical filter returns.
 */
export function severityGroupOf(severity: string | null | undefined) {
  const value = severity ?? '';
  if ((CRITICAL_INCIDENT_SEVERITIES as readonly string[]).includes(value))
    return 'critical' as const;
  if ((WARNING_INCIDENT_SEVERITIES as readonly string[]).includes(value))
    return 'warning' as const;
  if ((INFO_INCIDENT_SEVERITIES as readonly string[]).includes(value))
    return 'info' as const;
  return 'other' as const;
}

/**
 * A severity filter. A group name selects the whole group; anything else is
 * matched case-insensitively against the stored text, which is what the
 * endpoint did before groups existed (BUG-1420) and what an old bookmark with
 * `severity=ERROR` still expects.
 */
export function severityWhere(
  severity: string | undefined,
): Prisma.ErrorLogWhereInput {
  const value = severity?.trim();
  if (!value) return {};
  const group = value.toLowerCase();
  if (group === 'critical') return criticalIncidentWhere();
  if (group === 'warning') return warningIncidentWhere();
  if (group === 'info')
    return { severity: { in: [...INFO_INCIDENT_SEVERITIES] } };
  return { severity: { equals: value, mode: 'insensitive' } };
}

/**
 * What "under investigation" means, in one place.
 *
 * The overview tile used to infer this by subtraction —
 * `total - open - resolved` — which was true while there were three states and
 * silently became false when `NOT_AN_INCIDENT` was added as a fourth
 * (BUG-1754). Every set-aside row then landed in a tile labelled "Assigned and
 * in progress", whose link filtered on `INVESTIGATING` and returned none of
 * them. Production read 27 there, and all 27 were `NOT_AN_INCIDENT`
 * (BUG-2495).
 */
export const INVESTIGATING_SUPPORT_STATUSES = [
  'INVESTIGATING',
  'FIX_IN_PROGRESS',
] as const;

export function investigatingIncidentWhere(): Prisma.ErrorLogWhereInput {
  return { supportStatus: { in: [...INVESTIGATING_SUPPORT_STATUSES] } };
}

/**
 * ITEM-0206. Open work: every incident not resolved and not set aside as
 * NOT_AN_INCIDENT. The console's "Unresolved" metric and filter, the
 * operations dashboard's "Errors needing attention" and the `open` view all
 * read this, so the count a tile shows is the list its link opens.
 */
export function openIncidentWhere(): Prisma.ErrorLogWhereInput {
  return { supportStatus: { notIn: ['RESOLVED', NOT_AN_INCIDENT] } };
}

export function incidentViewWhere(viewKey?: string): Prisma.ErrorLogWhereInput {
  if (viewKey === 'critical') return criticalIncidentWhere();
  if (viewKey === 'open') return openIncidentWhere();
  /* supportStatus is non-nullable and defaults to NEW, so untriaged rows match. */
  if (viewKey === 'new') return { supportStatus: 'NEW' };
  if (viewKey === 'investigating') return investigatingIncidentWhere();
  if (viewKey === 'resolved') return { supportStatus: 'RESOLVED' };
  return {};
}

/**
 * `status=UNRESOLVED` is the open predicate rather than a stored value: an
 * operator asking "what is unresolved" means every working state at once, and
 * the console's filter offers it beside the individual support statuses.
 */
export const UNRESOLVED_STATUS = 'UNRESOLVED';

export const SUPPORT_STATUS_VALUES = [
  'NEW',
  'INVESTIGATING',
  'WAITING_ON_CUSTOMER',
  'FIX_IN_PROGRESS',
  'RESOLVED',
  NOT_AN_INCIDENT,
] as const;

export function statusWhere(status: string | undefined) {
  if (!status) return {};
  if (status === UNRESOLVED_STATUS) return openIncidentWhere();
  return { supportStatus: status };
}

/** Rolling windows, in hours. Kept as a name in the URL so a link never ages. */
export const ERROR_LOG_PERIODS = {
  '1h': 1,
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
} as const;
export type ErrorLogPeriod = keyof typeof ERROR_LOG_PERIODS;

export function periodStart(period: string | undefined, now: Date) {
  if (!period || !(period in ERROR_LOG_PERIODS)) return null;
  const hours = ERROR_LOG_PERIODS[period as ErrorLogPeriod];
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/**
 * The time window, on `lastSeenAt` rather than `createdAt`.
 *
 * An `ErrorLog` row is an incident, deduplicated by fingerprint: `createdAt` is
 * when it first happened and `lastSeenAt` moves every time it recurs. Filtering
 * "last 24 hours" on `createdAt` hid an incident that has been failing every
 * minute since last week — exactly the one an operator is looking for. The
 * question the window answers is "what was failing in this period".
 *
 * A named `period` wins over explicit dates, because the console sends one or
 * the other and a stale `from` left in a URL should not narrow a preset.
 */
export function timeWindowWhere(
  query: Pick<ErrorLogListQuery, 'period' | 'from' | 'to'>,
  now: Date,
): Prisma.ErrorLogWhereInput {
  const start = periodStart(query.period, now);
  if (start) return { lastSeenAt: { gte: start } };
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (!from && !to) return {};
  return {
    lastSeenAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
  };
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Free-text search. Two additions over a plain column scan, both because of
 * what an operator actually pastes into the box:
 *
 * - a reference a customer was shown is usually a *later occurrence* of an
 *   incident, not the trace id the incident row was first written with, so the
 *   occurrence table is searched by exact trace id as well;
 * - a customer is known by name, and `ErrorLog` stores only `tenantId`, so the
 *   caller resolves matching tenant names first and passes their ids in.
 */
export function searchWhere(
  search: string | undefined,
  tenantIdsMatchingSearch: string[] = [],
): Prisma.ErrorLogWhereInput {
  const value = search?.trim();
  if (!value) return {};
  return {
    OR: [
      { traceId: { contains: value, mode: 'insensitive' } },
      { occurrences: { some: { traceId: value } } },
      { errorCode: { contains: value, mode: 'insensitive' } },
      { message: { contains: value, mode: 'insensitive' } },
      { description: { contains: value, mode: 'insensitive' } },
      { path: { contains: value, mode: 'insensitive' } },
      { userId: value },
      { tenantId: value },
      ...(tenantIdsMatchingSearch.length
        ? [{ tenantId: { in: tenantIdsMatchingSearch } }]
        : []),
    ],
  };
}

/** Filters that narrow *which* incidents are in scope. */
export function scopeWhere(
  query: ErrorLogListQuery,
  options: { now: Date; tenantIdsMatchingSearch?: string[] },
): Prisma.ErrorLogWhereInput {
  return {
    AND: [
      query.reference
        ? {
            OR: [
              {
                traceId: { contains: query.reference, mode: 'insensitive' },
              },
              { occurrences: { some: { traceId: query.reference } } },
            ],
          }
        : {},
      /*
       * Exact match, distinct from `reference` above. An operator who has
       * been handed a full trace id — from a "Reference: req_…" toast, a log
       * line, or another incident's "related" list — wants exactly that
       * request, not every id containing it as a substring.
       */
      query.correlationId ? { traceId: query.correlationId } : {},
      query.sourceApp ? { sourceApp: query.sourceApp } : {},
      query.environment ? { environment: query.environment } : {},
      query.tenantId && query.tenantId !== 'platform'
        ? { tenantId: query.tenantId }
        : {},
      /*
       * "Platform (no tenant)" covers both shapes a tenantless failure is
       * stored in: no tenant at all, and the `'platform'` audit sentinel that
       * platform-path failures carry.
       */
      query.tenantId === 'platform'
        ? { OR: [{ tenantId: null }, { tenantId: 'platform' }] }
        : {},
      query.userId ? { userId: query.userId } : {},
      query.category
        ? { errorCode: { contains: query.category, mode: 'insensitive' } }
        : {},
      query.module ? { module: query.module } : {},
      query.route
        ? { path: { contains: query.route, mode: 'insensitive' } }
        : {},
      query.method ? { method: query.method.toUpperCase() } : {},
      timeWindowWhere(query, options.now),
      searchWhere(query.search, options.tenantIdsMatchingSearch),
    ],
  };
}

/**
 * The full list filter: scope plus the severity/status selection.
 *
 * The two are separate because the summary metrics are counted over the scope
 * alone. A metric row that went to zero everywhere except the card just
 * clicked would stop reading as a breakdown the moment it was used as a filter.
 */
export function buildErrorLogWhere(
  query: ErrorLogListQuery,
  options: { now: Date; tenantIdsMatchingSearch?: string[] },
): Prisma.ErrorLogWhereInput {
  return {
    AND: [
      scopeWhere(query, options),
      severityWhere(query.severity),
      statusWhere(query.status),
      incidentViewWhere(query.viewKey),
    ],
  };
}

const SORT_FIELDS = {
  lastSeen: 'lastSeenAt',
  timestamp: 'createdAt',
  firstSeen: 'firstSeenAt',
  occurrences: 'occurrenceCount',
  severity: 'severity',
  route: 'path',
  category: 'errorCode',
  statusCode: 'statusCode',
  sourceApp: 'sourceApp',
  module: 'module',
} as const;
export type ErrorLogSortKey = keyof typeof SORT_FIELDS;

/**
 * Most recent activity first by default. An unknown key falls back rather than
 * failing, because the runtime and older links still send `createdAt`.
 */
export function normalizeSortBy(value: string | undefined): ErrorLogSortKey {
  return value && value in SORT_FIELDS
    ? (value as ErrorLogSortKey)
    : 'lastSeen';
}

export function normalizeSortDirection(value: string | undefined) {
  return value === 'asc' ? ('asc' as const) : ('desc' as const);
}

export function getErrorLogOrderBy(
  sortBy: string | undefined,
  sortDirection: string | undefined,
): Prisma.ErrorLogOrderByWithRelationInput[] {
  const direction = normalizeSortDirection(sortDirection);
  const field = SORT_FIELDS[normalizeSortBy(sortBy)];
  // A stable tiebreak, so a page boundary never repeats or skips a row when
  // many incidents share a timestamp.
  return field === 'lastSeenAt'
    ? [{ lastSeenAt: direction }, { id: direction }]
    : [{ [field]: direction }, { lastSeenAt: 'desc' }, { id: 'desc' }];
}

export function normalizePositiveInt(
  value: string | undefined,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
