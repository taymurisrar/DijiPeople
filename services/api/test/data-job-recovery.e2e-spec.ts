import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  DataImportMode,
  DataJobKind,
  DataJobStatus,
  DataRowStatus,
} from '@prisma/client';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthAccessService } from '../src/modules/auth/auth-access.service';
import {
  DataJobLeaseLostError,
  type JobLease,
} from '../src/modules/data-management/data-job-lease';
import {
  DATA_JOB_MAX_RECOVERIES,
  DataJobRecoveryService,
  INTERRUPTED_ROW_MESSAGE,
} from '../src/modules/data-management/data-job-recovery.service';
import { DataJobWorkerService } from '../src/modules/data-management/data-job-worker.service';
import { ImportExecutionService } from '../src/modules/data-management/import-execution.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors } from './helpers/http-actors';

/**
 * Stranded data jobs, against real PostgreSQL (SESSION-0136, Priority 3).
 *
 * A job left PROCESSING by a dead process used to stay there forever. These
 * tests drive the lease, the recovery pass and the resumed execution for real,
 * with a controllable module executor standing in for a business module so
 * that "was this row applied twice?" is a plain count rather than an argument.
 */
const MODULE = 'fakemod';

describeWithDatabase()('Data job recovery (e2e, PostgreSQL)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let worker: DataJobWorkerService;
  let recovery: DataJobRecoveryService;
  let importExec: ImportExecutionService;
  let tenantId = '';
  let userId = '';
  const jobIds: string[] = [];
  const roleIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);

  /** What the fake business module did. A row appearing twice is the bug. */
  let applied: string[] = [];
  let store: Map<string, string>;

  beforeAll(async () => {
    // The app's own poller must not race the test; the test drives cycles.
    process.env.DATA_JOB_WORKER_ENABLED = 'false';
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    worker = app.get(DataJobWorkerService);
    recovery = app.get(DataJobRecoveryService);
    importExec = app.get(ImportExecutionService);
    fixtures = new DbFixtures(prisma, 'djrec');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('djr');
    tenantId = tenant.id;
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const actor = await actors.tenantUser(tenant.id, unit, 'djr');
    userId = actor.id;
    const role = await prisma.role.create({
      data: {
        tenantId,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin djr ${suffix}`,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    await prisma.userRole.create({
      data: { tenantId, userId, roleId: role.id },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: 'DataJob', entityId: { in: jobIds } },
    });
    await prisma.dataJob.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
    delete process.env.DATA_JOB_WORKER_ENABLED;
  });

  beforeEach(() => {
    applied = [];
    store = new Map();
    jest.spyOn(importExec as never, 'executors' as never).mockReturnValue({
      [MODULE]: {
        findExisting: async (_u: unknown, v: Record<string, string>) =>
          store.get(v.code) ?? null,
        create: async (_u: unknown, v: Record<string, string>) => {
          applied.push(v.code);
          const id = `rec-${v.code}`;
          store.set(v.code, id);
          return id;
        },
        update: async () => undefined,
      },
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const PAST = () => new Date(Date.now() - 10 * 60_000);
  const FUTURE = () => new Date(Date.now() + 10 * 60_000);

  async function importJob(opts: {
    status: DataJobStatus;
    rows: Array<{ n: number; status: DataRowStatus }>;
    lease?: Date | null;
    startedAt?: Date | null;
    retryCount?: number;
    claimedBy?: string | null;
  }) {
    const job = await prisma.dataJob.create({
      data: {
        tenantId,
        kind: DataJobKind.IMPORT,
        moduleKey: MODULE,
        status: opts.status,
        importMode: DataImportMode.CREATE_ONLY,
        idempotencyKey: randomUUID(),
        mappingJson: [
          { sourceColumn: 'code', fieldKey: 'code', matchedBy: 'manual' },
        ],
        totalRows: opts.rows.length,
        validRows: opts.rows.length,
        startedAt: opts.startedAt ?? null,
        leaseExpiresAt: opts.lease ?? null,
        claimedBy: opts.claimedBy ?? null,
        retryCount: opts.retryCount ?? 0,
        submittedByUserId: userId,
      },
      select: { id: true },
    });
    jobIds.push(job.id);
    await prisma.dataJobRow.createMany({
      data: opts.rows.map((r) => ({
        tenantId,
        jobId: job.id,
        rowNumber: r.n,
        status: r.status,
        sourceJson: { code: `c${r.n}` },
        recordId: r.status === DataRowStatus.CREATED ? `rec-c${r.n}` : null,
      })),
    });
    return job.id;
  }

  async function exportJob(opts: { lease: Date; retryCount?: number }) {
    const job = await prisma.dataJob.create({
      data: {
        tenantId,
        kind: DataJobKind.EXPORT,
        moduleKey: MODULE,
        status: DataJobStatus.PROCESSING,
        idempotencyKey: randomUUID(),
        startedAt: PAST(),
        leaseExpiresAt: opts.lease,
        claimedBy: 'dead-worker',
        retryCount: opts.retryCount ?? 0,
        submittedByUserId: userId,
      },
      select: { id: true },
    });
    jobIds.push(job.id);
    return job.id;
  }

  const rowsOf = async (jobId: string) =>
    (
      await prisma.dataJobRow.findMany({
        where: { jobId },
        orderBy: { rowNumber: 'asc' },
        select: { rowNumber: true, status: true, issuesJson: true },
      })
    ).map((r) => ({ n: r.rowNumber, s: r.status, issues: r.issuesJson }));

  const statusesOf = async (jobId: string) =>
    (await rowsOf(jobId)).map((r) => `${r.n}:${r.s}`);

  const V = DataRowStatus.VALID;
  const IP = DataRowStatus.IN_PROGRESS;
  const C = DataRowStatus.CREATED;

  it('resumes a crashed import: finished rows stay finished, the one unknown row is parked, nothing is applied twice', async () => {
    // Rows 1-3 applied. Row 4 was being applied — and its record DOES exist.
    // Rows 5-6 were checkpointed but never started. Rows 7-10 never reached.
    store.set('c4', 'rec-c4');
    const jobId = await importJob({
      status: DataJobStatus.PROCESSING,
      claimedBy: 'dead-worker',
      lease: PAST(),
      startedAt: PAST(),
      rows: [
        { n: 1, status: C },
        { n: 2, status: C },
        { n: 3, status: C },
        { n: 4, status: IP },
        { n: 5, status: IP },
        { n: 6, status: IP },
        { n: 7, status: V },
        { n: 8, status: V },
        { n: 9, status: V },
        { n: 10, status: V },
      ],
    });

    await worker.runCycle();

    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(await statusesOf(jobId)).toEqual([
      '1:CREATED',
      '2:CREATED',
      '3:CREATED',
      '4:FAILED', // the unknown row: parked, NOT replayed
      '5:CREATED',
      '6:CREATED',
      '7:CREATED',
      '8:CREATED',
      '9:CREATED',
      '10:CREATED',
    ]);
    // Exactly the six never-started rows were applied, each once. Rows 1-4 were
    // not touched again, so no duplicate record could have been written.
    expect(applied.sort()).toEqual(['c10', 'c5', 'c6', 'c7', 'c8', 'c9']);
    expect(new Set(applied).size).toBe(applied.length);

    const parked = (await rowsOf(jobId)).find((r) => r.n === 4);
    expect(JSON.stringify(parked?.issues)).toContain(INTERRUPTED_ROW_MESSAGE);

    // Counters carry the first run forward instead of restarting from zero.
    expect(job.status).toBe(DataJobStatus.PARTIALLY_COMPLETED);
    expect(job.createdRows).toBe(9);
    expect(job.failedRows).toBe(1);
    expect(job.processedRows).toBe(10);
    expect(job.retryCount).toBe(1);
    expect(job.claimedBy).toBeNull();
    expect(job.leaseExpiresAt).toBeNull();
    expect(job.failureReason).toContain('Row 4');

    const audits = await prisma.auditLog.findMany({
      where: {
        entityType: 'DataJob',
        entityId: jobId,
        action: 'DATA_JOB_RECOVERED',
      },
    });
    expect(audits).toHaveLength(1);
  });

  it('a worker that stops mid-import (lease lost) writes nothing further and the job then recovers', async () => {
    const jobId = await importJob({
      status: DataJobStatus.QUEUED,
      rows: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, status: V })),
    });

    // The lease reports loss at the 5th row boundary, as it would for a worker
    // whose process died: rows 1-4 are applied, nothing after.
    let boundaries = 0;
    const dying: JobLease = {
      ensureHeld: async () => {
        boundaries += 1;
        // boundary 1 is the chunk start; 2..5 are rows 1..4; 6 would be row 5.
        if (boundaries >= 6) throw new DataJobLeaseLostError(jobId);
      },
    };
    const context = await app.get(AuthAccessService).loadAccessContext(userId);
    await expect(
      importExec.executeJob(context.authUser, jobId, {
        alreadyClaimed: true,
        lease: dying,
      }),
    ).rejects.toBeInstanceOf(DataJobLeaseLostError);

    expect(applied).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(await statusesOf(jobId)).toEqual([
      '1:CREATED',
      '2:CREATED',
      '3:CREATED',
      '4:CREATED',
      '5:IN_PROGRESS',
      '6:IN_PROGRESS',
      '7:IN_PROGRESS',
      '8:IN_PROGRESS',
      '9:IN_PROGRESS',
      '10:IN_PROGRESS',
    ]);
    // The aborted run did not finalise or fail the job: that is recovery's call.
    expect(
      (await prisma.dataJob.findUniqueOrThrow({ where: { id: jobId } })).status,
    ).toBe(DataJobStatus.PROCESSING);

    // The process is gone; its lease lapses.
    await prisma.dataJob.update({
      where: { id: jobId },
      data: { claimedBy: 'dead-worker', leaseExpiresAt: PAST() },
    });
    applied = [];
    await worker.runCycle();

    // Row 5 is the lowest IN_PROGRESS row: conservatively parked, never replayed.
    // Rows 6-10 were never started and are applied now, once each.
    expect(await statusesOf(jobId)).toEqual([
      '1:CREATED',
      '2:CREATED',
      '3:CREATED',
      '4:CREATED',
      '5:FAILED',
      '6:CREATED',
      '7:CREATED',
      '8:CREATED',
      '9:CREATED',
      '10:CREATED',
    ]);
    expect(applied.sort()).toEqual(['c10', 'c6', 'c7', 'c8', 'c9']);
    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job.createdRows).toBe(9);
    expect(job.status).toBe(DataJobStatus.PARTIALLY_COMPLETED);
  });

  it('two recoverers racing on one stale job: exactly one wins, once', async () => {
    const jobId = await importJob({
      status: DataJobStatus.PROCESSING,
      claimedBy: 'dead-worker',
      lease: PAST(),
      startedAt: PAST(),
      rows: [
        { n: 1, status: C },
        { n: 2, status: IP },
        { n: 3, status: IP },
        { n: 4, status: V },
      ],
    });

    const [a, b] = await Promise.all([
      recovery.recoverStaleJobs('worker-a'),
      recovery.recoverStaleJobs('worker-b'),
    ]);

    const mine = [...a, ...b].filter((r) => r.jobId === jobId);
    expect(mine).toHaveLength(1);
    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job.retryCount).toBe(1);
    expect(await statusesOf(jobId)).toEqual([
      '1:CREATED',
      '2:FAILED',
      '3:VALID',
      '4:VALID',
    ]);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'DataJob',
          entityId: jobId,
          action: 'DATA_JOB_RECOVERED',
        },
      }),
    ).toBe(1);
  });

  it('never touches a job whose lease is live, however long it has run', async () => {
    const jobId = await importJob({
      status: DataJobStatus.PROCESSING,
      claimedBy: 'healthy-worker',
      lease: FUTURE(),
      startedAt: new Date(Date.now() - 6 * 60 * 60_000),
      rows: [
        { n: 1, status: C },
        { n: 2, status: IP },
      ],
    });
    const results = await recovery.recoverStaleJobs('worker-x');
    expect(results.filter((r) => r.jobId === jobId)).toEqual([]);
    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job.status).toBe(DataJobStatus.PROCESSING);
    expect(job.claimedBy).toBe('healthy-worker');
    expect(await statusesOf(jobId)).toEqual(['1:CREATED', '2:IN_PROGRESS']);
  });

  it('a pre-lease job (no lease at all) is left alone until it is very old', async () => {
    const recent = await importJob({
      status: DataJobStatus.PROCESSING,
      lease: null,
      startedAt: new Date(Date.now() - 5 * 60_000),
      rows: [{ n: 1, status: V }],
    });
    const old = await importJob({
      status: DataJobStatus.PROCESSING,
      lease: null,
      startedAt: new Date(Date.now() - 2 * 60 * 60_000),
      rows: [{ n: 1, status: V }],
    });
    const results = await recovery.recoverStaleJobs('worker-x');
    expect(results.filter((r) => r.jobId === recent)).toEqual([]);
    expect(results.filter((r) => r.jobId === old)).toHaveLength(1);
  });

  it('an interrupted export is re-queued, then failed once retries are exhausted', async () => {
    const first = await exportJob({ lease: PAST() });
    const exhausted = await exportJob({
      lease: PAST(),
      retryCount: DATA_JOB_MAX_RECOVERIES,
    });
    const results = await recovery.recoverStaleJobs('worker-x');
    expect(results.find((r) => r.jobId === first)?.outcome).toBe('REQUEUED');
    expect(results.find((r) => r.jobId === exhausted)?.outcome).toBe(
      'FAILED_RETRIES_EXHAUSTED',
    );
    const a = await prisma.dataJob.findUniqueOrThrow({ where: { id: first } });
    expect(a.status).toBe(DataJobStatus.QUEUED);
    expect(a.retryCount).toBe(1);
    expect(a.claimedBy).toBeNull();
    const b = await prisma.dataJob.findUniqueOrThrow({
      where: { id: exhausted },
    });
    expect(b.status).toBe(DataJobStatus.FAILED);
    expect(b.failureReason).toContain('not retried again');
  });

  it('an import that keeps dying is failed, not looped forever, and says how many rows were never applied', async () => {
    const jobId = await importJob({
      status: DataJobStatus.PROCESSING,
      claimedBy: 'dead-worker',
      lease: PAST(),
      startedAt: PAST(),
      retryCount: DATA_JOB_MAX_RECOVERIES,
      rows: [
        { n: 1, status: C },
        { n: 2, status: IP },
        { n: 3, status: V },
        { n: 4, status: V },
      ],
    });
    const results = await recovery.recoverStaleJobs('worker-x');
    expect(results.find((r) => r.jobId === jobId)?.outcome).toBe(
      'FAILED_RETRIES_EXHAUSTED',
    );
    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job.status).toBe(DataJobStatus.FAILED);
    expect(job.failureReason).toContain('2 row(s) were never applied');
    expect(applied).toEqual([]);
  });

  it('an import interrupted after its last row is finalised, not re-run', async () => {
    const jobId = await importJob({
      status: DataJobStatus.PROCESSING,
      claimedBy: 'dead-worker',
      lease: PAST(),
      startedAt: PAST(),
      rows: [
        { n: 1, status: C },
        { n: 2, status: C },
      ],
    });
    const results = await recovery.recoverStaleJobs('worker-x');
    expect(results.find((r) => r.jobId === jobId)?.outcome).toBe(
      'FINALISED_IMPORT',
    );
    const job = await prisma.dataJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job.status).toBe(DataJobStatus.COMPLETED);
    expect(job.createdRows).toBe(2);
    expect(applied).toEqual([]);
  });
});
