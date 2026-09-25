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

function buildService(overrides: Record<string, unknown> = {}) {
  const findMany = jest.fn<Promise<unknown[]>, [FindManyArgs]>(async () => []);
  const count = jest.fn<Promise<number>, [CountArgs]>(async () => 0);
  const prisma = {
    errorLog: {
      findMany,
      count,
      findUnique: jest.fn(async () => null),
    },
    tenant: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    platformUser: { findMany: jest.fn(async () => []) },
    errorLogOccurrence: { findMany: jest.fn(async () => []) },
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
    expect(where.AND).toContainEqual({ module: 'contracts' });
  });

  it('does not filter by module when absent', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, {});

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({});
  });

  it('matches correlationId exactly, distinct from the substring "reference" filter', async () => {
    const { service, findMany } = buildService();

    await service.listEvents(platformUser, {
      correlationId: 'req_exact-match-1',
    });

    const where = findMany.mock.calls[0][0].where!;
    expect(where.AND).toContainEqual({ traceId: 'req_exact-match-1' });
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
});
