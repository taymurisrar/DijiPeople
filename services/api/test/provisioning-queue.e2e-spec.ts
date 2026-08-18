import { PrismaClient, TenantProvisioningRunStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { ProvisioningOperationsService } from '../src/modules/tenant-control-plane/provisioning-operations.service';
import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';

/**
 * The provisioning queue, against a real PostgreSQL.
 *
 * WHY THIS CANNOT BE A MOCKED TEST. Everything worth checking here is a
 * property of the query, not of the mapping: that the relation joins reach a
 * customer and a plan through two different paths, that steps arrive in
 * sequence order, that the "recent successes only" filter actually excludes an
 * old success, and that ordering holds. A stubbed Prisma would return whatever
 * the test author imagined and prove none of it — which is precisely how
 * BUG-0070 reached a branch.
 */
function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for database-backed tests.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const platformUser = (permissionKeys: string[]): AuthenticatedUser =>
  ({
    userId: 'platform-test-user',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
    rolePrivileges: [],
    authSubjectType: 'platform-user',
    platform: { id: 'platform-test-user', role: null },
  }) as unknown as AuthenticatedUser;

/** A tenant user, holding the same permission key but no platform identity. */
const tenantUser = (permissionKeys: string[]): AuthenticatedUser =>
  ({
    userId: 'tenant-test-user',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: [],
    permissionKeys,
    rolePrivileges: [],
  }) as unknown as AuthenticatedUser;

describeWithDatabase()('Provisioning queue (DB-backed)', () => {
  jest.setTimeout(180_000);

  const prisma = createTestPrismaClient();
  const fixtures = new DbFixtures(prisma, 'provisioning-queue');
  const service = new ProvisioningOperationsService(
    prisma as unknown as PrismaService,
  );

  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  const minutesAhead = (n: number) => new Date(Date.now() + n * 60_000);

  let stuckRunId = '';
  let failedRunId = '';
  let healthyRunId = '';
  let oldSuccessRunId = '';
  let tenantId = '';

  beforeAll(async () => {
    const tenant = await fixtures.createTenant('queue');
    tenantId = tenant.id;

    // A run that breached its target and is still running: the case the screen
    // exists for — somebody paid and nothing is obviously broken.
    const stuck = await prisma.tenantProvisioningRun.create({
      data: {
        tenantId,
        trigger: 'ONBOARDING',
        attempt: 2,
        status: TenantProvisioningRunStatus.RUNNING,
        startedAt: minutesAgo(90),
        targetReadyBy: minutesAgo(30),
        escalateAt: minutesAgo(60),
        correlationId: fixtures.name('corr-stuck'),
        steps: {
          create: [
            {
              tenantId,
              key: 'create-schema',
              label: 'Create schema',
              sequence: 1,
              status: 'SUCCEEDED',
            },
            {
              tenantId,
              key: 'seed-config',
              label: 'Seed configuration',
              sequence: 2,
              status: 'RUNNING',
            },
          ],
        },
      },
    });
    stuckRunId = stuck.id;

    const failed = await prisma.tenantProvisioningRun.create({
      data: {
        tenantId,
        status: TenantProvisioningRunStatus.FAILED,
        startedAt: minutesAgo(45),
        completedAt: minutesAgo(40),
        failedStepKey: 'send-welcome',
        message: 'Run-level message that must not win over the step message',
        steps: {
          create: [
            {
              tenantId,
              key: 'create-schema',
              label: 'Create schema',
              sequence: 1,
              status: 'SUCCEEDED',
            },
            {
              tenantId,
              key: 'send-welcome',
              label: 'Send welcome email',
              sequence: 2,
              status: 'FAILED',
              message: 'SMTP relay refused the connection',
            },
          ],
        },
      },
    });
    failedRunId = failed.id;

    const healthy = await prisma.tenantProvisioningRun.create({
      data: {
        tenantId,
        status: TenantProvisioningRunStatus.RUNNING,
        startedAt: minutesAgo(2),
        targetReadyBy: minutesAhead(30),
        steps: {
          create: [
            {
              tenantId,
              key: 'create-schema',
              label: 'Create schema',
              sequence: 1,
              status: 'SUCCEEDED',
            },
            {
              tenantId,
              key: 'seed-config',
              label: 'Seed configuration',
              sequence: 2,
              status: 'SKIPPED',
            },
            {
              tenantId,
              key: 'activate',
              label: 'Activate workspace',
              sequence: 3,
              status: 'PENDING',
            },
          ],
        },
      },
    });
    healthyRunId = healthy.id;

    // Succeeded two days ago. History, not queue.
    const old = await prisma.tenantProvisioningRun.create({
      data: {
        tenantId,
        status: TenantProvisioningRunStatus.SUCCEEDED,
        startedAt: minutesAgo(60 * 48),
        completedAt: minutesAgo(60 * 48 - 5),
      },
    });
    oldSuccessRunId = old.id;
  });

  afterAll(async () => {
    await prisma.tenantProvisioningStep.deleteMany({ where: { tenantId } });
    await prisma.tenantProvisioningRun.deleteMany({ where: { tenantId } });
    await fixtures.cleanup();
    await prisma.$disconnect();
  });

  const findRow = async (runId: string) => {
    const { rows } = await service.listQueue(platformUser(['tenants.read']), {
      limit: 200,
    });
    return rows.find((row) => row.runId === runId);
  };

  it('refuses a platform user without tenants.read', async () => {
    await expect(
      service.listQueue(platformUser(['dashboard.read'])),
    ).rejects.toThrow(/tenants\.read/);
  });

  it('refuses a tenant user even when they hold a matching permission key', async () => {
    // This read crosses every tenant. Holding a key named `tenants.read` inside
    // one tenant must never buy access to all of them, so platform identity is
    // checked before the permission is.
    await expect(
      service.listQueue(tenantUser(['tenants.read'])),
    ).rejects.toThrow(/Platform access is required/);
  });

  it('derives BREACHED for a run past its target and still running', async () => {
    const row = await findRow(stuckRunId);
    expect(row?.operationalState).toBe('BREACHED');
    expect(row?.attempt).toBe(2);
    // Elapsed is measured to now while running, so it must exceed the start gap.
    expect(row?.elapsedMs).toBeGreaterThan(80 * 60_000);
  });

  it('shows the failed step as the blocker, not the run-level message', async () => {
    const row = await findRow(failedRunId);
    expect(row?.operationalState).toBe('FAILED');
    expect(row?.currentStepKey).toBe('send-welcome');
    expect(row?.blocker).toBe('SMTP relay refused the connection');
  });

  it('counts a skipped step as settled so a live run does not read as stuck', async () => {
    const row = await findRow(healthyRunId);
    expect(row?.operationalState).toBe('IN_PROGRESS');
    expect(row?.stepsTotal).toBe(3);
    // create-schema SUCCEEDED + seed-config SKIPPED = 2 settled of 3.
    expect(row?.stepsCompleted).toBe(2);
    // The pending step is what an operator is waiting on.
    expect(row?.currentStepKey).toBe('activate');
  });

  it('resolves the customer and plan through the tenant relation', async () => {
    const row = await findRow(stuckRunId);
    expect(row?.tenantName).toBeTruthy();
    expect(row?.customerName).toBeTruthy();
  });

  it('excludes a success older than a day but includes it on request', async () => {
    const defaultRows = await service.listQueue(
      platformUser(['tenants.read']),
      {
        limit: 200,
      },
    );
    expect(defaultRows.rows.map((r) => r.runId)).not.toContain(oldSuccessRunId);

    const all = await service.listQueue(platformUser(['tenants.read']), {
      limit: 200,
      includeCompleted: true,
    });
    const old = all.rows.find((r) => r.runId === oldSuccessRunId);
    expect(old?.operationalState).toBe('READY');
    // A completed run's elapsed time is fixed, not still counting.
    expect(old?.elapsedMs).toBe(5 * 60_000);
  });

  it('counts each state it returns', async () => {
    const { rows, counts } = await service.listQueue(
      platformUser(['tenants.read']),
      { limit: 200 },
    );
    const recomputed: Record<string, number> = {};
    for (const row of rows) {
      recomputed[row.operationalState] =
        (recomputed[row.operationalState] ?? 0) + 1;
    }
    expect(counts).toEqual(recomputed);
  });

  it('returns runs newest first', async () => {
    const { rows } = await service.listQueue(platformUser(['tenants.read']), {
      limit: 200,
    });
    const times = rows.map((row) => row.startedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
