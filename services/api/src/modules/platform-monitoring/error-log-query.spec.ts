import {
  buildErrorLogWhere,
  criticalIncidentWhere,
  getErrorLogOrderBy,
  normalizeSortBy,
  openIncidentWhere,
  periodStart,
  scopeWhere,
  searchWhere,
  severityGroupOf,
  severityWhere,
  statusWhere,
  timeWindowWhere,
  warningIncidentWhere,
} from './error-log-query';

/*
 * The error-log console's filters, asserted on the `where` they build. A filter
 * that is silently dropped, or a metric counted under a different predicate
 * than the filter its card applies, is invisible in a response shape and only
 * visible here.
 */

type Where = Record<string, unknown> & { AND?: Where[] };

function terms(where: Where): Where[] {
  return (where.AND ?? []).flatMap((term) =>
    Array.isArray(term.AND) ? terms(term) : [term],
  );
}

const NOW = new Date('2026-10-09T12:00:00.000Z');

describe('severity', () => {
  it('maps the critical group to the shared critical definition', () => {
    expect(severityWhere('critical')).toEqual(criticalIncidentWhere());
    expect(severityWhere('CRITICAL')).toEqual(criticalIncidentWhere());
  });

  it('counts the catalog level `critical` as critical', () => {
    // error-catalog.ts assigns `critical` to its most severe entries; the old
    // list (ERROR/FATAL only) left exactly those out of the Critical metric.
    const levels = (criticalIncidentWhere().severity as { in: string[] }).in;
    expect(levels).toEqual(expect.arrayContaining(['critical', 'CRITICAL']));
  });

  it('maps the warning group to every stored spelling', () => {
    expect(severityWhere('warning')).toEqual(warningIncidentWhere());
    const levels = (warningIncidentWhere().severity as { in: string[] }).in;
    expect(levels).toEqual(
      expect.arrayContaining(['WARNING', 'warning', 'WARN', 'warn']),
    );
  });

  it('still matches a raw stored level case-insensitively (old bookmarks)', () => {
    expect(severityWhere('Fatal')).toEqual({
      severity: { equals: 'Fatal', mode: 'insensitive' },
    });
  });

  it('adds no term when absent', () => {
    expect(severityWhere(undefined)).toEqual({});
    expect(severityWhere('  ')).toEqual({});
  });

  it('labels a row with the group its filter would return it under', () => {
    expect(severityGroupOf('error')).toBe('critical');
    expect(severityGroupOf('critical')).toBe('critical');
    expect(severityGroupOf('WARNING')).toBe('warning');
    expect(severityGroupOf('info')).toBe('info');
    expect(severityGroupOf('debug')).toBe('other');
    expect(severityGroupOf(null)).toBe('other');
  });
});

describe('status', () => {
  it('treats UNRESOLVED as the open predicate, not a stored value', () => {
    expect(statusWhere('UNRESOLVED')).toEqual(openIncidentWhere());
  });

  it('matches a support status exactly', () => {
    expect(statusWhere('RESOLVED')).toEqual({ supportStatus: 'RESOLVED' });
  });
});

describe('time window', () => {
  it('turns a named period into a rolling start on lastSeenAt', () => {
    expect(timeWindowWhere({ period: '24h' }, NOW)).toEqual({
      lastSeenAt: { gte: new Date('2026-10-08T12:00:00.000Z') },
    });
  });

  it('filters on lastSeenAt so a recurring incident stays in the window', () => {
    const where = timeWindowWhere({ period: '7d' }, NOW);
    expect(where).toHaveProperty('lastSeenAt');
    expect(where).not.toHaveProperty('createdAt');
  });

  it('lets a named period win over explicit dates', () => {
    expect(
      timeWindowWhere({ period: '1h', from: '2020-01-01T00:00:00.000Z' }, NOW),
    ).toEqual({ lastSeenAt: { gte: new Date('2026-10-09T11:00:00.000Z') } });
  });

  it('uses explicit dates when no period is named', () => {
    expect(
      timeWindowWhere(
        { from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' },
        NOW,
      ),
    ).toEqual({
      lastSeenAt: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-10-02T00:00:00.000Z'),
      },
    });
  });

  it('ignores `all`, an unknown period and an unparseable date', () => {
    expect(periodStart('all', NOW)).toBeNull();
    expect(periodStart('5y', NOW)).toBeNull();
    expect(timeWindowWhere({ from: 'not-a-date' }, NOW)).toEqual({});
  });
});

describe('search', () => {
  it('finds an incident by the reference of a later occurrence', () => {
    const where = searchWhere('req_abc');
    expect(where.OR).toContainEqual({
      occurrences: { some: { traceId: 'req_abc' } },
    });
  });

  it('finds an incident by the tenant names the caller resolved', () => {
    const where = searchWhere('acme', ['tenant-1', 'tenant-2']);
    expect(where.OR).toContainEqual({
      tenantId: { in: ['tenant-1', 'tenant-2'] },
    });
  });

  it('adds no tenant term when no tenant name matched', () => {
    const where = searchWhere('acme', []);
    expect(where.OR).not.toContainEqual({ tenantId: { in: [] } });
  });
});

describe('the list filter and the metric scope', () => {
  const query = {
    severity: 'critical',
    status: 'UNRESOLVED',
    sourceApp: 'api',
    environment: 'production',
    module: 'payroll',
    tenantId: 'tenant-1',
    period: '24h',
  };

  it('applies every scope filter', () => {
    const scope = terms(scopeWhere(query, { now: NOW }) as Where);
    expect(scope).toContainEqual({ sourceApp: 'api' });
    expect(scope).toContainEqual({ environment: 'production' });
    expect(scope).toContainEqual({ module: 'payroll' });
    expect(scope).toContainEqual({ tenantId: 'tenant-1' });
    expect(scope).toContainEqual({
      lastSeenAt: { gte: new Date('2026-10-08T12:00:00.000Z') },
    });
  });

  it('keeps severity and status out of the metric scope', () => {
    // The cards are a breakdown of the scope. Counting them under the
    // selection would zero every card but the one just pressed.
    const scope = terms(scopeWhere(query, { now: NOW }) as Where);
    expect(scope).not.toContainEqual(criticalIncidentWhere());
    expect(scope).not.toContainEqual(openIncidentWhere());
  });

  it('applies severity and status to the list itself', () => {
    const list = terms(buildErrorLogWhere(query, { now: NOW }) as Where);
    expect(list).toContainEqual(criticalIncidentWhere());
    expect(list).toContainEqual(openIncidentWhere());
    expect(list).toContainEqual({ module: 'payroll' });
  });

  it('maps tenantId=platform to incidents with no tenant or the platform sentinel', () => {
    const scope = terms(
      scopeWhere({ tenantId: 'platform' }, { now: NOW }) as Where,
    );
    // Both stored shapes of a tenantless failure — and never the sentinel on
    // its own, which listed "platform" twice in the tenant filter.
    expect(scope).toContainEqual({
      OR: [{ tenantId: null }, { tenantId: 'platform' }],
    });
    expect(scope).not.toContainEqual({ tenantId: 'platform' });
  });
});

describe('sorting', () => {
  it('defaults to most recent activity, with a stable tiebreak', () => {
    expect(normalizeSortBy(undefined)).toBe('lastSeen');
    expect(getErrorLogOrderBy(undefined, undefined)).toEqual([
      { lastSeenAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('falls back rather than failing on a key it does not know', () => {
    // The platform runtime and older links still send `createdAt`.
    expect(normalizeSortBy('createdAt')).toBe('lastSeen');
  });

  it('sorts by occurrence count when asked', () => {
    expect(getErrorLogOrderBy('occurrences', 'asc')[0]).toEqual({
      occurrenceCount: 'asc',
    });
  });
});
