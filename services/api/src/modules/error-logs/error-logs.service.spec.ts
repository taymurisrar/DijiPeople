import { ErrorLogsService } from './error-logs.service';

describe('ErrorLogsService', () => {
  it('returns the exact occurrence diagnostics for a deduplicated trace ID', async () => {
    const occurredAt = new Date('2026-08-11T10:10:52.720Z');
    const incident = {
      id: 'incident-1',
      traceId: 'admin_original',
      userId: 'original-user',
      tenantId: 'platform',
      details: { marker: 'latest-incident-details' },
      errorCode: 'VALIDATION_FAILED',
      statusCode: 400,
      severity: 'WARNING',
      message: 'Validation failed',
      description: 'Review the fields.',
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
      updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    };
    const prisma = {
      errorLog: {
        count: jest.fn(async () => 1),
        findUnique: jest.fn(),
      },
      errorLogOccurrence: {
        findUnique: jest.fn(async () => ({
          id: 'occurrence-2',
          incidentId: incident.id,
          traceId: 'admin_requested',
          occurredAt,
          diagnosticJson: {
            traceId: 'admin_requested',
            userId: 'requesting-user',
            tenantId: 'platform',
            details: {
              platformActor: {
                sessionId: 'f39aaed3-289d-4fca-9c02-123456789abc',
              },
            },
          },
          incident,
        })),
      },
    };
    const service = new ErrorLogsService(
      prisma as never,
      { get: jest.fn() } as never,
    );

    const log = await service.findForUser('admin_requested', {
      userId: 'requesting-user',
      tenantId: 'platform',
    });

    expect(log).toMatchObject({
      traceId: 'admin_requested',
      createdAt: occurredAt,
      userId: 'requesting-user',
      details: {
        platformActor: {
          sessionId: 'f39aaed3-289d-4fca-9c02-123456789abc',
        },
      },
    });
    expect(prisma.errorLog.findUnique).not.toHaveBeenCalled();
  });
});

/*
 * A support role here is a tenant role. Holding system-admin in tenant A must
 * not read tenant B's log, which it did until the tenant comparison was added
 * to the support branch of findForUser.
 */
describe('ErrorLogsService.findForUser tenant isolation', () => {
  function buildService(log: {
    tenantId: string | null;
    userId: string | null;
  }) {
    const prisma = {
      errorLog: {
        count: jest.fn(async () => 1),
        findUnique: jest.fn(async () => ({
          id: 'log-1',
          traceId: 'trace-1',
          message: 'Boom',
          path: '/api/payroll/runs',
          ...log,
        })),
      },
      errorLogOccurrence: {
        findUnique: jest.fn(async () => null),
      },
    };

    return new ErrorLogsService(prisma as never, { get: jest.fn() } as never);
  }

  const supportRoles = ['system-admin'];

  it('lets a tenant support user read a log from their own tenant', async () => {
    const service = buildService({ tenantId: 'tenant-a', userId: 'someone' });

    const log = await service.findForUser('trace-1', {
      userId: 'support-user',
      tenantId: 'tenant-a',
      roleKeys: supportRoles,
    });

    expect(log).toMatchObject({ traceId: 'trace-1' });
  });

  it('denies a tenant support user a log belonging to another tenant', async () => {
    const service = buildService({ tenantId: 'tenant-b', userId: 'someone' });

    const log = await service.findForUser('trace-1', {
      userId: 'support-user',
      tenantId: 'tenant-a',
      roleKeys: supportRoles,
    });

    expect(log).toBeNull();
  });

  it.each([null, 'platform'])(
    'denies a tenant support user a platform-scope log (%s)',
    async (tenantId) => {
      const service = buildService({ tenantId, userId: 'platform-user' });

      const log = await service.findForUser('trace-1', {
        userId: 'support-user',
        tenantId: 'tenant-a',
        roleKeys: supportRoles,
      });

      expect(log).toBeNull();
    },
  );

  it('reports a foreign trace exactly as it reports a missing one', async () => {
    const foreign = await buildService({
      tenantId: 'tenant-b',
      userId: 'someone',
    }).findForUser('trace-1', {
      userId: 'support-user',
      tenantId: 'tenant-a',
      roleKeys: supportRoles,
    });

    const missingPrisma = {
      errorLog: {
        count: jest.fn(async () => 1),
        findUnique: jest.fn(async () => null),
      },
      errorLogOccurrence: { findUnique: jest.fn(async () => null) },
    };
    const missing = await new ErrorLogsService(
      missingPrisma as never,
      { get: jest.fn() } as never,
    ).findForUser('trace-1', {
      userId: 'support-user',
      tenantId: 'tenant-a',
      roleKeys: supportRoles,
    });

    // Same value for both, so existence of a foreign trace stays unobservable.
    expect(foreign).toBeNull();
    expect(missing).toBeNull();
  });

  it('still lets an ordinary user read their own log in their own tenant', async () => {
    const service = buildService({ tenantId: 'tenant-a', userId: 'user-1' });

    const log = await service.findForUser('trace-1', {
      userId: 'user-1',
      tenantId: 'tenant-a',
      roleKeys: ['employee'],
    });

    expect(log).toMatchObject({ traceId: 'trace-1' });
  });

  it('denies an ordinary user another user log in their own tenant', async () => {
    const service = buildService({ tenantId: 'tenant-a', userId: 'user-2' });

    const log = await service.findForUser('trace-1', {
      userId: 'user-1',
      tenantId: 'tenant-a',
      roleKeys: ['employee'],
    });

    expect(log).toBeNull();
  });
});

/*
 * TASK-0032 WP-06 / REG-577. `module` is derived once in the exception filter
 * and must reach the ErrorLog row on both the first occurrence (create) and a
 * repeat (update) — a repeat is the far more common case in production, and
 * before this fix the update branch dropped the field on the floor even
 * though `create` carried it.
 */
describe('ErrorLogsService.persist module field', () => {
  function buildPersistPrisma(existing: { module: string | null } | null) {
    const tx = {
      errorLog: {
        findUnique: jest.fn(async () => existing),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'incident-new',
          ...args.data,
        })),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'incident-existing',
          ...args.data,
        })),
      },
      errorLogOccurrence: {
        upsert: jest.fn(async () => ({})),
      },
    };
    const prisma = {
      errorLog: { count: jest.fn(async () => 1) },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    return { prisma, tx };
  }

  const baseInput = {
    traceId: 'req_new-trace',
    errorCode: 'VALIDATION_FAILED',
    statusCode: 400,
    severity: 'WARNING',
    message: 'Validation failed',
    description: 'Review the fields.',
    method: 'GET',
    path: '/api/contracts/123',
    module: 'contracts',
  };

  it('writes module on first occurrence (create)', async () => {
    const { prisma, tx } = buildPersistPrisma(null);
    const service = new ErrorLogsService(
      prisma as never,
      { get: jest.fn() } as never,
    );

    await service.persist(baseInput);

    expect(tx.errorLog.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.errorLog.create.mock.calls[0][0];
    expect(createArgs.data.module).toBe('contracts');
  });

  it('writes module on a repeat occurrence (update)', async () => {
    const { prisma, tx } = buildPersistPrisma({ module: null });
    const service = new ErrorLogsService(
      prisma as never,
      { get: jest.fn() } as never,
    );

    await service.persist(baseInput);

    expect(tx.errorLog.update).toHaveBeenCalledTimes(1);
    const updateArgs = tx.errorLog.update.mock.calls[0][0];
    expect(updateArgs.data.module).toBe('contracts');
  });

  it('backfills module from the existing row when a repeat carries none', async () => {
    const { prisma, tx } = buildPersistPrisma({ module: 'contracts' });
    const service = new ErrorLogsService(
      prisma as never,
      { get: jest.fn() } as never,
    );

    await service.persist({ ...baseInput, module: null });

    const updateArgs = tx.errorLog.update.mock.calls[0][0];
    expect(updateArgs.data.module).toBe('contracts');
  });
});
