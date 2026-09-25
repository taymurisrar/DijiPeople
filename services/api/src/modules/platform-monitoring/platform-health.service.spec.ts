import { PlatformHealthService } from './platform-health.service';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn(async () => [{ '?column?': 1 }]),
    outboxEvent: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
    },
    auditLog: {
      count: jest.fn(async () => 0),
    },
    user: {
      count: jest.fn(async () => 0),
    },
    emailDeliveryLog: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    },
    emailProviderSetting: {
      count: jest.fn(async () => 1),
    },
    ...overrides,
  };
}

function buildConfig(values: Record<string, string | undefined> = {}) {
  return { get: (key: string) => values[key] };
}

function buildStorage(readiness: {
  ready: boolean;
  provider: string;
  detail: string;
  latencyMs: number;
}) {
  return { checkReadiness: jest.fn(async () => readiness) };
}

describe('PlatformHealthService', () => {
  it('reports OK across the board when every dependency answers cleanly', async () => {
    const prisma = buildPrisma({
      emailDeliveryLog: {
        findFirst: jest.fn(async () => ({
          status: 'DELIVERED',
          requestedAt: new Date('2026-09-25T09:00:00.000Z'),
        })),
        count: jest.fn(async () => 0),
      },
    });
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'Bucket reachable.',
      latencyMs: 40,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig({ EMAIL_PROVIDER: 'SMTP' }) as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.api.status).toBe('OK');
    expect(health.components.database.status).toBe('OK');
    expect(health.components.backgroundProcessing.status).toBe('OK');
    expect(health.components.authentication.status).toBe('OK');
    expect(health.components.storage.status).toBe('OK');
    expect(health.components.email.status).toBe('OK');
    // The queue is UNKNOWN by design and must not drag the overall reading down.
    expect(health.components.notificationQueue.status).toBe('UNKNOWN');
    expect(health.status).toBe('OK');
  });

  it('never fabricates OK for the notification queue, which is not deployed', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.notificationQueue.status).toBe('UNKNOWN');
    expect(health.components.notificationQueue.reason).toMatch(
      /no async notification queue/i,
    );
  });

  it('reports the database DOWN on a real query failure, not OK', async () => {
    const prisma = buildPrisma({
      $queryRaw: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.database.status).toBe('DOWN');
    expect(health.status).toBe('DOWN');
  });

  it('reports UNKNOWN, not DOWN or a fabricated OK, when a probe times out', async () => {
    const prisma = buildPrisma({
      $queryRaw: jest.fn(
        () =>
          new Promise((resolve) => {
            const timer = setTimeout(resolve, 10_000);
            timer.unref?.();
          }),
      ),
    });
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.database.status).toBe('UNKNOWN');
    expect(health.components.database.reason).toMatch(/timed out/i);
    expect(health.status).toBe('UNKNOWN');
  }, 10_000);

  it('degrades the outbox when pending work is old, even with a low pending count', async () => {
    const prisma = buildPrisma({
      outboxEvent: {
        count: jest.fn(async () => 3),
        findFirst: jest.fn(async () => ({
          availableAt: new Date(Date.now() - 20 * 60 * 1000),
        })),
      },
    });
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.backgroundProcessing.status).toBe('DEGRADED');
  });

  it('degrades authentication on a failed-login spike over baseline', async () => {
    const prisma = buildPrisma({
      auditLog: {
        count: jest
          .fn()
          .mockResolvedValueOnce(60) // last hour
          .mockResolvedValueOnce(2), // baseline hour
      },
    });
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.authentication.status).toBe('DEGRADED');
    expect(health.components.authentication.failedLoginsLastHour).toBe(60);
  });

  it('reports storage DOWN when checkReadiness resolves not-ready, never OK', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage({
      ready: false,
      provider: 'local',
      detail: 'Local disk is not durable in production.',
      latencyMs: 5,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.storage.status).toBe('DOWN');
  });

  it('reports email UNKNOWN when nothing has ever been sent', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage({
      ready: true,
      provider: 'r2',
      detail: 'ok',
      latencyMs: 10,
    });
    const service = new PlatformHealthService(
      prisma as never,
      buildConfig() as never,
      storage as never,
    );

    const health = await service.getHealth();

    expect(health.components.email.status).toBe('UNKNOWN');
  });
});
