import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformMonitoringService } from './platform-monitoring.service';

/*
 * TASK-0032 WP-06. `module`, the correlation-id exact filter, and the
 * related-data joins added to `getEvent` are new surface area on top of the
 * existing, already-DB-paginated list (BUG-3175's fix). This proves each of
 * them by inspecting the actual arguments passed to Prisma, rather than the
 * shape of the response, which is the only way to catch a filter that is
 * silently dropped or a pagination that regresses to an in-memory slice.
 */

const platformUser: AuthenticatedUser = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'admin@dijipeople.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['platform.*'],
  platform: {
    id: 'platform-user-1',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  },
} as unknown as AuthenticatedUser;

/*
 * Typing the mock's argument (rather than leaving `jest.fn`'s implicit `any`)
 * is what turns `mock.calls[0][0].where.AND` below from an unsafe `any` read
 * into an ordinary typed one — the same pattern `platform-audit-trail.spec.ts`
 * uses for the same reason.
 */
type MonitoringWhere = Record<string, unknown> & {
  AND?: Record<string, unknown>[];
};
type FindManyArgs = { where?: MonitoringWhere; skip?: number; take?: number };
type CountArgs = { where?: MonitoringWhere };

/*
 * The list filter is composed (scope, then severity/status), so its terms are
 * nested `AND`s. Flattened here so each assertion reads one term, wherever
 * the builder chose to put it.
 */
function andTerms(where: MonitoringWhere): Record<string, unknown>[] {
  return (where.AND ?? []).flatMap((term) =>
    Array.isArray(term.AND) ? andTerms(term as MonitoringWhere) : [term],
  );
}

function buildService(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn<Promise<unknown[]>, [FindManyArgs]>(async () => []);
  const count = jest.fn<Promise<number>, [CountArgs]>(async () => 0);
  const prisma = {
    errorLog: {
      findMany,
      count,
      findUnique: jest.fn(async () => null),
      groupBy: jest.fn(async () => []),
    },
    tenant: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    platformUser: { findMany: jest.fn(async () => []) },
    organization: { findFirst: jest.fn(async () => null) },
    businessUnit: { findFirst: jest.fn(async () => null) },
    errorLogOccurrence: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
    },
    auditLog: { findMany: jest.fn(async () => []) },
    platformAuditLog: { findMany: jest.fn(async () => []) },
    outboxEvent: { findMany: jest.fn(async () => []) },
    ...overrides,
  };
  const auditService = { log: jest.fn() };
  const service = new PlatformMonitoringService(
    auditService as never,
    prisma as never,
  );
  return { service, prisma, findMany, count };
}

describe('PlatformMonitoringService.listEvents filters', () => {
  it('filters by module when provided', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, { module: 'contracts' });

    const where = findMany.mock.calls[0][0].where!;
    expect(andTerms(where)).toContainEqual({ module: 'contracts' });
  });

  it('does not filter by module when absent', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, {});

    const where = findMany.mock.calls[0][0].where!;
    expect(andTerms(where)).toContainEqual({});
  });

  it('matches correlationId exactly, distinct from the substring "reference" filter', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, {
      correlationId: 'req_exact-match-1',
    });

    const where = findMany.mock.calls[0][0].where!;
    expect(andTerms(where)).toContainEqual({ traceId: 'req_exact-match-1' });
  });

  /*
   * BUG-3175 pattern. The list must page in the database — an in-memory
   * `.slice()` over a full table scan is the regression this guards against.
   */
  it('paginates in the database via skip/take, not in memory', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, { page: '3', pageSize: '10' });

    const args = findMany.mock.calls[0][0];
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
  });

  it('surfaces the module field on each returned item', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'log-1',
        traceId: 'trace-1',
        errorCode: 'VALIDATION_FAILED',
        statusCode: 400,
        severity: 'WARNING',
        message: 'Bad input',
        method: 'GET',
        path: '/api/contracts/1',
        module: 'contracts',
        tenantId: null,
        userId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await service.listEvents(platformUser, {});

    expect(result.items[0].module).toBe('contracts');
  });
});

describe('PlatformMonitoringService.getEvent related data', () => {
  it('returns related occurrences, audit events and outbox events keyed off the trace id', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.findUnique as jest.Mock).mockResolvedValue({
      id: 'incident-1',
      traceId: 'req_original',
      errorCode: 'VALIDATION_FAILED',
      statusCode: 400,
      severity: 'WARNING',
      message: 'Bad input',
      description: 'desc',
      method: 'GET',
      path: '/api/contracts/1',
      module: 'contracts',
      tenantId: null,
      userId: null,
      createdAt: new Date(),
      details: null,
    });
    (prisma.errorLogOccurrence.findMany as jest.Mock).mockResolvedValue([
      { traceId: 'req_repeat-1', occurredAt: new Date() },
    ]);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'CONTRACT_UPDATED',
        entityType: 'Contract',
        entityId: 'contract-1',
        sourceModule: 'contracts',
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        tenantId: 'tenant-1',
      },
    ]);
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'outbox-1',
        eventType: 'CONTRACT_SIGNED',
        status: 'FAILED',
        attemptCount: 3,
        lastError: 'connect ECONNREFUSED',
        createdAt: new Date(),
      },
    ]);

    const event = await service.getEvent(platformUser, 'req_original');

    expect(event.module).toBe('contracts');
    expect(event.relatedOccurrences).toEqual([
      { traceId: 'req_repeat-1', occurredAt: expect.any(Date) as unknown },
    ]);
    expect(event.relatedAuditEvents[0]).toMatchObject({
      id: 'audit-1',
      action: 'CONTRACT_UPDATED',
      scope: 'tenant',
    });
    expect(event.relatedOutboxEvents[0]).toMatchObject({
      id: 'outbox-1',
      status: 'FAILED',
    });
    expect(prisma.errorLogOccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { incidentId: 'incident-1', traceId: { not: 'req_original' } },
      }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { traceId: 'req_original' } }),
    );
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { correlationId: 'req_original' } }),
    );
  });

  it('redacts a secret embedded in a related outbox event error message', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.findUnique as jest.Mock).mockResolvedValue({
      id: 'incident-1',
      traceId: 'req_original',
      errorCode: 'VALIDATION_FAILED',
      statusCode: 400,
      severity: 'WARNING',
      message: 'Bad input',
      description: 'desc',
      method: 'GET',
      path: '/api/contracts/1',
      module: 'contracts',
      tenantId: null,
      userId: null,
      createdAt: new Date(),
      details: null,
    });
    (prisma.outboxEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'outbox-1',
        eventType: 'CONTRACT_SIGNED',
        status: 'FAILED',
        attemptCount: 1,
        lastError:
          'Could not connect using postgres://appuser:Sup3rSecret@db.internal:5432/hrm',
        createdAt: new Date(),
      },
    ]);

    const event = await service.getEvent(platformUser, 'req_original');

    expect(event.relatedOutboxEvents[0].lastError).not.toContain('Sup3rSecret');
  });

  /*
   * Rows written before BUG-3555 grew the sanitizer still hold what it used to
   * miss. The detail drawer must not show them.
   */
  it('re-sanitizes stored diagnostics on read', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.findUnique as jest.Mock).mockResolvedValue({
      id: 'incident-1',
      traceId: 'req_original',
      errorCode: 'AUTH_FAILED',
      statusCode: 500,
      severity: 'error',
      message: 'Upstream rejected Bearer abcdefghijklmnop1234',
      description: 'password=hunter2 was refused',
      stack: 'Error: token=s3cr3tvalue\n    at handler',
      method: 'POST',
      path: '/api/auth',
      module: 'auth',
      tenantId: null,
      userId: null,
      createdAt: new Date(),
      details: { headers: { authorization: 'Bearer live-token-value' } },
      cause: null,
      params: null,
      query: { apiKey: 'k-123' },
      requestBody: { password: 'hunter2', email: 'a@b.test' },
    });

    const event = await service.getEvent(platformUser, 'req_original');
    const serialized = JSON.stringify(event);

    for (const secret of [
      'abcdefghijklmnop1234',
      'hunter2',
      's3cr3tvalue',
      'live-token-value',
      'k-123',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    // Redaction removes the secret, not the diagnostic around it.
    expect(event.request.body).toMatchObject({ email: 'a@b.test' });
  });

  it('opens an incident by the reference of a later occurrence', async () => {
    const { service, prisma } = buildService();
    const incident = {
      id: 'incident-1',
      traceId: 'req_first',
      errorCode: 'X',
      statusCode: 500,
      severity: 'error',
      message: 'boom',
      description: 'boom',
      method: 'GET',
      path: '/api/x',
      module: 'x',
      tenantId: null,
      userId: null,
      createdAt: new Date(),
      details: null,
    };
    (prisma.errorLogOccurrence.findUnique as jest.Mock).mockResolvedValue({
      incident,
    });

    const event = await service.getEvent(platformUser, 'req_later');

    expect(event.referenceNumber).toBe('req_first');
    expect(event.requestedReference).toBe('req_later');
  });

  it('resolves organisation and business unit names within the incident tenant', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.findUnique as jest.Mock).mockResolvedValue({
      id: 'incident-1',
      traceId: 'req_original',
      errorCode: 'X',
      statusCode: 500,
      severity: 'error',
      message: 'boom',
      description: 'boom',
      method: 'GET',
      path: '/api/x',
      module: 'x',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      businessUnitId: 'bu-1',
      userId: null,
      createdAt: new Date(),
      details: null,
    });
    (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
      id: 'org-1',
      name: 'Acme HQ',
    });

    const event = await service.getEvent(platformUser, 'req_original');

    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1', tenantId: 'tenant-1' } }),
    );
    expect(prisma.businessUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bu-1', tenantId: 'tenant-1' } }),
    );
    expect(event.context.organizationName).toBe('Acme HQ');
  });
});

describe('PlatformMonitoringService.listEvents metrics', () => {
  it('counts the metrics over the scope, not the severity/status selection', async () => {
    const { service, count } = buildService();

    await service.listEvents(platformUser, {
      severity: 'critical',
      status: 'RESOLVED',
      module: 'payroll',
    });

    // count #0 is the filtered list total; #1 is the scope total.
    const listTerms = andTerms(count.mock.calls[0][0].where!);
    const scopeTerms = andTerms(count.mock.calls[1][0].where!);
    expect(listTerms).toContainEqual({ supportStatus: 'RESOLVED' });
    expect(scopeTerms).toContainEqual({ module: 'payroll' });
    expect(scopeTerms).not.toContainEqual({ supportStatus: 'RESOLVED' });
  });

  it('reports the list total and the metrics separately', async () => {
    const { service, count } = buildService();
    count.mockResolvedValueOnce(3).mockResolvedValueOnce(40);

    const result = await service.listEvents(platformUser, {
      status: 'RESOLVED',
    });

    expect(result.meta.total).toBe(3);
    expect(result.metrics.total).toBe(40);
    expect(result.metrics).toEqual(
      expect.objectContaining({
        critical: expect.any(Number) as unknown,
        warning: expect.any(Number) as unknown,
        open: expect.any(Number) as unknown,
        resolved: expect.any(Number) as unknown,
        criticalOpen: expect.any(Number) as unknown,
      }),
    );
  });

  it('widens a search to tenants whose name matches', async () => {
    const { service, prisma, findMany } = buildService();
    (prisma.tenant.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tenant-acme' },
    ]);

    await service.listEvents(platformUser, { search: 'acme' });

    const search = andTerms(findMany.mock.calls[0][0].where!).find(
      (term) => 'OR' in term,
    ) as { OR: unknown[] };
    expect(search.OR).toContainEqual({ tenantId: { in: ['tenant-acme'] } });
  });

  it('refuses a tenant user, whatever permission keys it carries', async () => {
    const { service } = buildService();
    // No `platform` context: a tenant session, even one holding `platform.*`
    // in its keys, never reaches cross-tenant incidents.
    const outsider = {
      ...platformUser,
      tenantId: 'tenant-1',
      platform: undefined,
    } as unknown as AuthenticatedUser;

    await expect(service.listEvents(outsider, {})).rejects.toThrow();
    await expect(service.listFacets(outsider)).rejects.toThrow();
  });
});

describe('PlatformMonitoringService.listFacets', () => {
  it('offers only values the data holds, with tenant names', async () => {
    const { service, prisma } = buildService();
    (prisma.errorLog.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ sourceApp: 'api', _count: { _all: 9 } }])
      .mockResolvedValueOnce([
        { environment: 'production', _count: { _all: 9 } },
      ])
      .mockResolvedValueOnce([{ module: 'payroll', _count: { _all: 4 } }])
      .mockResolvedValueOnce([
        { tenantId: 'tenant-1', _count: { _all: 5 } },
        { tenantId: null, _count: { _all: 4 } },
      ]);
    (prisma.tenant.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tenant-1', name: 'Acme' },
    ]);

    const facets = await service.listFacets(platformUser);

    expect(facets.sourceApps).toEqual([{ value: 'api', count: 9 }]);
    expect(facets.environments).toEqual([{ value: 'production', count: 9 }]);
    expect(facets.modules).toEqual([{ value: 'payroll', count: 4 }]);
    expect(facets.tenants).toEqual([
      { id: 'tenant-1', name: 'Acme', count: 5 },
    ]);
    expect(facets.platformCount).toBe(4);
  });
});
