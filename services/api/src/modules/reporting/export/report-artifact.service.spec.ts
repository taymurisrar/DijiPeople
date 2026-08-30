/*
 * `ReportArtifactService` imports `parseTargetKey` from the execution service —
 * deliberately, because the `std:`/`def:` vocabulary must have exactly one
 * home. That file in turn imports two modules that are landing in a concurrent
 * work package and do not exist on this branch yet, so requiring it here fails
 * resolution before a single assertion runs.
 *
 * These two virtual mocks stand in for the absent modules only. Nothing in this
 * file exercises them — `parseTargetKey` is a pure function defined in the
 * execution service itself — so they throw loudly rather than returning a shape
 * a future test could mistake for the real registry.
 *
 * DELETE BOTH once `standard-report.registry.ts` and
 * `report-definition.service.ts` are on the branch.
 */
jest.mock(
  '../execution/standard-report.registry',
  () => ({
    getStandardReport: () => {
      throw new Error('standard-report.registry is stubbed in this spec');
    },
    listStandardReports: () => {
      throw new Error('standard-report.registry is stubbed in this spec');
    },
  }),
  { virtual: true },
);
jest.mock(
  '../execution/report-definition.service',
  () => ({
    ReportDefinitionService: class {},
  }),
  { virtual: true },
);

import { ReportRunStatus, ReportRunTrigger } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { StorageService } from '../../../common/storage/storage.service';
import {
  DEFAULT_ARTIFACT_RETENTION_DAYS,
  ReportArtifactService,
} from './report-artifact.service';
import type { ReportExportFile } from './report-export.service';

type Run = {
  id: string;
  tenantId: string;
  status: ReportRunStatus;
  resultFileKey: string | null;
  fileName?: string | null;
  contentType?: string | null;
  failureReason?: string | null;
  expiresAt?: Date | null;
};

/**
 * A Prisma double that actually applies the `where` clause.
 *
 * Stubbing `findFirst` to return a fixed row would let a service that forgot
 * `tenantId` pass every isolation test in this file, which is the one thing
 * these tests exist to catch.
 */
function prismaDouble(rows: Run[] = []) {
  const table = rows.map((run) => ({ ...run }));

  const findFirst = jest.fn(
    ({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(
        table.find(
          (run) => run.id === where.id && run.tenantId === where.tenantId,
        ) ?? null,
      ),
  );

  const findMany = jest.fn(
    ({
      where,
      take,
    }: {
      where: {
        expiresAt?: { lte: Date };
        status?: { notIn?: ReportRunStatus[] };
      };
      take?: number;
    }) =>
      Promise.resolve(
        table
          .filter((run) => {
            if (
              where.expiresAt?.lte &&
              !(run.expiresAt && run.expiresAt <= where.expiresAt.lte)
            ) {
              return false;
            }
            if (where.status?.notIn?.includes(run.status)) return false;
            return true;
          })
          .slice(0, take ?? table.length)
          .map((run) => ({
            id: run.id,
            tenantId: run.tenantId,
            resultFileKey: run.resultFileKey,
          })),
      ),
  );

  const update = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const run = table.find((candidate) => candidate.id === where.id);
      if (!run) throw new Error(`No run ${where.id}`);
      Object.assign(run, data);
      return Promise.resolve(run);
    },
  );

  const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'run-new', ...data }),
  );

  return {
    table,
    prisma: { reportRun: { findFirst, findMany, update, create } },
    findFirst,
    findMany,
    update,
    create,
  };
}

function storageDouble() {
  return {
    saveFile: jest.fn().mockResolvedValue({
      storageKey: 'report-exports/tenant-a/2026-08-24-abc.csv',
      absolutePath: '/data/report-exports/tenant-a/2026-08-24-abc.csv',
      size: 4096,
    }),
    openFile: jest.fn().mockResolvedValue({
      absolutePath: '/data/report-exports/tenant-a/2026-08-24-abc.csv',
      size: 4096,
      stream: { pipe: jest.fn() },
    }),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
}

function configDouble(retentionDays?: string | number) {
  return { get: jest.fn().mockReturnValue(retentionDays) };
}

function makeService(
  options: {
    rows?: Run[];
    storage?: ReturnType<typeof storageDouble>;
    retentionDays?: string | number;
  } = {},
) {
  const prisma = prismaDouble(options.rows ?? []);
  const storage = options.storage ?? storageDouble();
  const config = configDouble(options.retentionDays);
  const service = new ReportArtifactService(
    prisma.prisma as never,
    storage as unknown as StorageService,
    config as unknown as ConfigService,
  );

  return { service, prisma, storage, config };
}

const COMPLETED_RUN: Run = {
  id: 'run-1',
  tenantId: 'tenant-a',
  status: ReportRunStatus.COMPLETED,
  resultFileKey: 'report-exports/tenant-a/2026-08-24-abc.csv',
  fileName: 'headcount-2026-08-24.csv',
  contentType: 'text/csv; charset=utf-8',
};

describe('ReportArtifactService — retention', () => {
  it('defaults to seven days when the env var is unset', () => {
    const { service, config } = makeService();

    expect(service.retentionDays()).toBe(DEFAULT_ARTIFACT_RETENTION_DAYS);
    expect(config.get).toHaveBeenCalledWith('REPORTS_ARTIFACT_RETENTION_DAYS');
  });

  it('reads REPORTS_ARTIFACT_RETENTION_DAYS when it is set', () => {
    const { service } = makeService({ retentionDays: '30' });

    expect(service.retentionDays()).toBe(30);
  });

  it('ignores a nonsensical value rather than producing an instant expiry', () => {
    expect(makeService({ retentionDays: 'soon' }).service.retentionDays()).toBe(
      DEFAULT_ARTIFACT_RETENTION_DAYS,
    );
    expect(makeService({ retentionDays: '0' }).service.retentionDays()).toBe(
      DEFAULT_ARTIFACT_RETENTION_DAYS,
    );
    expect(makeService({ retentionDays: '-5' }).service.retentionDays()).toBe(
      DEFAULT_ARTIFACT_RETENTION_DAYS,
    );
  });

  it('sets an expiry when the run is created, not only when it completes', async () => {
    const { service, prisma } = makeService();
    const before = Date.now();

    await service.createQueuedRun({
      tenantId: 'tenant-a',
      targetKey: 'std:headcount',
      format: 'CSV',
    });

    const { data } = prisma.create.mock.calls[0][0];
    const expiresAt = data.expiresAt as Date;
    // A run abandoned while QUEUED must still be swept; DataJob's rows are not.
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000 - 1_000,
    );
    expect(data.status).toBe(ReportRunStatus.QUEUED);
  });
});

describe('ReportArtifactService — creating a run', () => {
  it('stores the caller tenant, target and trigger', async () => {
    const { service, prisma } = makeService();

    await service.createQueuedRun({
      tenantId: 'tenant-a',
      targetKey: 'std:headcount',
      format: 'XLSX',
      trigger: ReportRunTrigger.SCHEDULED,
      requestedByUserId: 'user-1',
      scheduleId: 'schedule-1',
      params: { preset: 'last_30_days' },
    });

    const { data } = prisma.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 'tenant-a',
      targetKey: 'std:headcount',
      format: 'XLSX',
      trigger: ReportRunTrigger.SCHEDULED,
      requestedByUserId: 'user-1',
      executedAsUserId: 'user-1',
      scheduleId: 'schedule-1',
      reportDefinitionId: null,
    });
  });

  it('derives the definition FK from a def: target rather than trusting one', async () => {
    const { service, prisma } = makeService();

    await service.createQueuedRun({
      tenantId: 'tenant-a',
      targetKey: 'def:11111111-2222-3333-4444-555555555555',
      format: 'CSV',
    });

    expect(prisma.create.mock.calls[0][0].data.reportDefinitionId).toBe(
      '11111111-2222-3333-4444-555555555555',
    );
  });

  it('rejects an unrecognised target reference', async () => {
    const { service } = makeService();

    await expect(
      service.createQueuedRun({
        tenantId: 'tenant-a',
        targetKey: 'employees',
        format: 'CSV',
      }),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
  });
});

describe('ReportArtifactService — tenant isolation', () => {
  it('will not open a run belonging to another tenant', async () => {
    const { service, storage } = makeService({ rows: [COMPLETED_RUN] });

    await expect(
      service.openArtifact('tenant-b', 'run-1'),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
    // The file must never be touched on a cross-tenant attempt.
    expect(storage.openFile).not.toHaveBeenCalled();
  });

  it('gives a cross-tenant caller the same answer as a missing run', async () => {
    const { service } = makeService({ rows: [COMPLETED_RUN] });

    const foreign = await service
      .openArtifact('tenant-b', 'run-1')
      .catch((error: Error & { errorCode: string }) => error);
    const missing = await service
      .openArtifact('tenant-a', 'run-absent')
      .catch((error: Error & { errorCode: string }) => error);

    // Distinguishing them would confirm another tenant's run exists.
    expect(foreign.errorCode).toBe(missing.errorCode);
    expect(foreign.message).toBe(missing.message);
  });

  it('filters every read on both id and tenantId', async () => {
    const { service, prisma } = makeService({ rows: [COMPLETED_RUN] });

    await service.getRun('tenant-a', 'run-1');

    expect(prisma.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', tenantId: 'tenant-a' },
    });
  });

  it('will not change the status of another tenant’s run', async () => {
    const { service, prisma } = makeService({ rows: [COMPLETED_RUN] });

    await expect(
      service.markRunning('tenant-b', 'run-1'),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
    await expect(
      service.failRun('tenant-b', 'run-1', 'nope'),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
    expect(prisma.update).not.toHaveBeenCalled();
  });

  it('will not complete another tenant’s run, and stores nothing while failing', async () => {
    const { service, storage } = makeService({ rows: [COMPLETED_RUN] });

    await expect(
      service.completeRun('tenant-b', 'run-1', exportFile()),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('scopes a listing to the caller tenant', async () => {
    const { service, prisma } = makeService();

    await service.listRuns('tenant-a', { targetKey: 'std:headcount' });

    expect(prisma.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 'tenant-a',
      targetKey: 'std:headcount',
    });
  });
});

describe('ReportArtifactService — download preconditions', () => {
  it('opens a completed artifact', async () => {
    const { service, storage } = makeService({ rows: [COMPLETED_RUN] });

    const download = await service.openArtifact('tenant-a', 'run-1');

    expect(storage.openFile).toHaveBeenCalledWith(
      'report-exports/tenant-a/2026-08-24-abc.csv',
    );
    expect(download).toMatchObject({
      runId: 'run-1',
      fileName: 'headcount-2026-08-24.csv',
      contentType: 'text/csv; charset=utf-8',
      size: 4096,
    });
  });

  it.each([ReportRunStatus.QUEUED, ReportRunStatus.RUNNING])(
    'refuses a %s run as not ready',
    async (status) => {
      const { service } = makeService({
        rows: [{ ...COMPLETED_RUN, status }],
      });

      await expect(
        service.openArtifact('tenant-a', 'run-1'),
      ).rejects.toMatchObject({ errorCode: 'REPORT_EXPORT_NOT_READY' });
    },
  );

  it('surfaces the recorded reason for a failed run', async () => {
    const { service } = makeService({
      rows: [
        {
          ...COMPLETED_RUN,
          status: ReportRunStatus.FAILED,
          failureReason: 'The period contained no data source.',
        },
      ],
    });

    await expect(
      service.openArtifact('tenant-a', 'run-1'),
    ).rejects.toMatchObject({
      errorCode: 'REPORT_EXPORT_FAILED',
      message: 'The period contained no data source.',
    });
  });

  it('reports an expired run as gone, not as a failure', async () => {
    const { service } = makeService({
      rows: [
        {
          ...COMPLETED_RUN,
          status: ReportRunStatus.EXPIRED,
          resultFileKey: null,
        },
      ],
    });

    await expect(
      service.openArtifact('tenant-a', 'run-1'),
    ).rejects.toMatchObject({ errorCode: 'REPORT_NOT_FOUND' });
  });

  it('refuses a completed run whose file key is missing', async () => {
    const { service, storage } = makeService({
      rows: [{ ...COMPLETED_RUN, resultFileKey: null }],
    });

    await expect(
      service.openArtifact('tenant-a', 'run-1'),
    ).rejects.toMatchObject({ errorCode: 'REPORT_EXPORT_FAILED' });
    expect(storage.openFile).not.toHaveBeenCalled();
  });
});

describe('ReportArtifactService — completing and failing', () => {
  it('stores the file under the tenant subdirectory and records its metadata', async () => {
    const queued: Run = {
      ...COMPLETED_RUN,
      status: ReportRunStatus.RUNNING,
      resultFileKey: null,
    };
    const { service, storage, prisma } = makeService({ rows: [queued] });

    await service.completeRun('tenant-a', 'run-1', exportFile(), {
      durationMs: 812,
    });

    expect(storage.saveFile).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      originalFileName: 'headcount-2026-08-24.csv',
      subdirectory: 'report-exports/tenant-a',
    });
    expect(prisma.update.mock.calls[0][0].data).toMatchObject({
      status: ReportRunStatus.COMPLETED,
      resultFileKey: 'report-exports/tenant-a/2026-08-24-abc.csv',
      fileName: 'headcount-2026-08-24.csv',
      contentType: 'text/csv; charset=utf-8',
      fileSizeBytes: 4096,
      rowCount: 120,
      durationMs: 812,
    });
  });

  it('removes the stored file when the run cannot be marked complete', async () => {
    const { service, storage, prisma } = makeService({
      rows: [{ ...COMPLETED_RUN, status: ReportRunStatus.RUNNING }],
    });
    prisma.update.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      service.completeRun('tenant-a', 'run-1', exportFile()),
    ).rejects.toThrow('connection lost');

    // Otherwise the disk keeps a file nothing points at.
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'report-exports/tenant-a/2026-08-24-abc.csv',
    );
  });

  it('marks a run running and counts the attempt', async () => {
    const { service, prisma } = makeService({
      rows: [{ ...COMPLETED_RUN, status: ReportRunStatus.QUEUED }],
    });

    await service.markRunning('tenant-a', 'run-1', 'worker-1');

    expect(prisma.update.mock.calls[0][0].data).toMatchObject({
      status: ReportRunStatus.RUNNING,
      claimedBy: 'worker-1',
      attemptCount: { increment: 1 },
    });
  });

  it('truncates a failure reason so a stack trace is not stored', async () => {
    const { service, prisma } = makeService({
      rows: [{ ...COMPLETED_RUN, status: ReportRunStatus.RUNNING }],
    });

    await service.failRun('tenant-a', 'run-1', 'x'.repeat(5_000));

    const reason = prisma.update.mock.calls[0][0].data.failureReason as string;
    expect(reason).toHaveLength(500);
  });
});

describe('ReportArtifactService — sweepExpired', () => {
  const now = new Date('2026-08-24T00:00:00.000Z');
  const past = new Date('2026-08-20T00:00:00.000Z');
  const future = new Date('2026-09-20T00:00:00.000Z');

  function fixture(): Run[] {
    return [
      {
        id: 'expired-1',
        tenantId: 'tenant-a',
        status: ReportRunStatus.COMPLETED,
        resultFileKey: 'report-exports/tenant-a/old.csv',
        expiresAt: past,
      },
      {
        id: 'live-1',
        tenantId: 'tenant-a',
        status: ReportRunStatus.COMPLETED,
        resultFileKey: 'report-exports/tenant-a/new.csv',
        expiresAt: future,
      },
      {
        id: 'already-swept',
        tenantId: 'tenant-b',
        status: ReportRunStatus.EXPIRED,
        resultFileKey: null,
        expiresAt: past,
      },
      {
        id: 'cancelled',
        tenantId: 'tenant-b',
        status: ReportRunStatus.CANCELLED,
        resultFileKey: null,
        expiresAt: past,
      },
    ];
  }

  it('deletes only the artifacts that are past their expiry', async () => {
    const { service, storage } = makeService({ rows: fixture() });

    const result = await service.sweepExpired({ now });

    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'report-exports/tenant-a/old.csv',
    );
    expect(result).toEqual({ swept: 1, filesDeleted: 1, failures: 0 });
  });

  it('marks the swept run EXPIRED and forgets its file key', async () => {
    const { service, prisma } = makeService({ rows: fixture() });

    await service.sweepExpired({ now });

    expect(prisma.update).toHaveBeenCalledTimes(1);
    expect(prisma.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'expired-1' },
      data: {
        status: ReportRunStatus.EXPIRED,
        resultFileKey: null,
        fileSizeBytes: null,
      },
    });
    expect(
      prisma.table.find((run) => run.id === 'live-1')?.status,
    ).toBe(ReportRunStatus.COMPLETED);
  });

  it('is a no-op on a second pass', async () => {
    const { service, storage } = makeService({ rows: fixture() });

    await service.sweepExpired({ now });
    const second = await service.sweepExpired({ now });

    expect(second).toEqual({ swept: 0, filesDeleted: 0, failures: 0 });
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
  });

  it('leaves a run due for retry when its file cannot be deleted', async () => {
    const storage = storageDouble();
    storage.deleteFile.mockRejectedValueOnce(new Error('EBUSY'));
    const { service, prisma } = makeService({ rows: fixture(), storage });

    const result = await service.sweepExpired({ now });

    expect(result).toEqual({ swept: 0, filesDeleted: 0, failures: 1 });
    // Not marked EXPIRED, so the next pass tries again rather than orphaning it.
    expect(prisma.update).not.toHaveBeenCalled();
  });

  it('selects strictly on expiry and never on tenant', async () => {
    const { service, prisma } = makeService({ rows: fixture() });

    await service.sweepExpired({ now });

    const where = prisma.findMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(where).toEqual({
      expiresAt: { lte: now },
      status: {
        notIn: [ReportRunStatus.EXPIRED, ReportRunStatus.CANCELLED],
      },
    });
    expect(where.tenantId).toBeUndefined();
  });
});

function exportFile(): ReportExportFile {
  return {
    buffer: Buffer.from('id,name\r\n1,Jane\r\n', 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    extension: 'csv',
    fileName: 'headcount-2026-08-24.csv',
    rowCount: 120,
    truncated: false,
  };
}
