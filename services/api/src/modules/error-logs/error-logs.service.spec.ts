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
