import type { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ReportRunStatus,
  ReportRunTrigger,
  type ReportExportFormat,
  type ReportRun,
} from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { parseTargetKey } from '../execution/report-execution.service';
import type { ReportExportFile } from './report-export.service';

/** Days a generated artifact is downloadable before the sweep removes it. */
export const DEFAULT_ARTIFACT_RETENTION_DAYS = 7;
export const ARTIFACT_RETENTION_ENV = 'REPORTS_ARTIFACT_RETENTION_DAYS';

/** Rows one `sweepExpired()` pass will handle, so a backlog cannot stall it. */
const SWEEP_BATCH_SIZE = 500;

/** Failure text is stored and shown; a stack trace is neither useful nor safe. */
const MAX_FAILURE_REASON = 500;

const STORAGE_ROOT_SUBDIRECTORY = 'report-exports';

export interface CreateReportRunInput {
  /** Always `request.user.tenantId` — never a body, query or header value. */
  tenantId: string;
  targetKey: string;
  format: ReportExportFormat;
  trigger?: ReportRunTrigger;
  requestedByUserId?: string | null;
  /**
   * Whose access the rows were read with. For a scheduled run this is the
   * subscriber, not the person who created the schedule.
   */
  executedAsUserId?: string | null;
  reportDefinitionId?: string | null;
  scheduleId?: string | null;
  params?: Record<string, unknown> | null;
}

export interface ReportArtifactDownload {
  runId: string;
  fileName: string;
  contentType: string;
  size: number;
  stream: Readable;
}

export interface SweepResult {
  /** Runs marked `EXPIRED`. */
  swept: number;
  /** Stored files actually removed from disk. */
  filesDeleted: number;
  /** Runs whose cleanup threw; they stay due and are retried next pass. */
  failures: number;
}

/**
 * The lifecycle of a report export: a `ReportRun` row, a stored file, and the
 * expiry that stops the two from accumulating.
 *
 * **Retention is the point of this class, not a detail of it.** `DataJob`
 * carries a `resultFileKey` with no expiry column and no sweeper, so every
 * import and export file that service has ever produced is still on the disk;
 * on a single-instance deployment with a fixed persistent disk that is a slow
 * outage with no alert in front of it. `ReportRun.expiresAt` is set when the
 * row is created — not only when it completes, so a run that is abandoned while
 * `QUEUED` is still swept — and `sweepExpired()` deletes the bytes before it
 * marks the row.
 *
 * **Tenant isolation is enforced on every path.** `ReportRun.id` is a uuid a
 * caller could hold from another tenant's session, so nothing here loads a run
 * by id alone: `requireRun` is the single read, it always filters
 * `{ id, tenantId }`, and every status change and download goes through it.
 * `sweepExpired()` is the one deliberate exception and takes no tenant at all,
 * because it is a system job with no request context; it never returns content.
 */
@Injectable()
export class ReportArtifactService {
  private readonly logger = new Logger(ReportArtifactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /** How long a completed artifact stays downloadable. */
  retentionDays(): number {
    const raw = this.config.get<string | number>(ARTIFACT_RETENTION_ENV);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : DEFAULT_ARTIFACT_RETENTION_DAYS;
  }

  expiresAtFrom(reference: Date = new Date()): Date {
    return new Date(
      reference.getTime() + this.retentionDays() * 24 * 60 * 60 * 1000,
    );
  }

  /**
   * Records the intent to produce an export.
   *
   * The row exists before the work starts so a failure has somewhere to be
   * reported: an export that dies mid-render must leave a `FAILED` run the user
   * can see, not silence.
   */
  async createQueuedRun(input: CreateReportRunInput): Promise<ReportRun> {
    const target = parseTargetKey(input.targetKey);

    return this.prisma.reportRun.create({
      data: {
        tenantId: input.tenantId,
        targetKey: input.targetKey,
        // Derived rather than trusted, so the FK and the target key cannot
        // disagree about which definition a run belongs to.
        reportDefinitionId:
          input.reportDefinitionId ??
          (target.kind === 'definition' ? target.id : null),
        scheduleId: input.scheduleId ?? null,
        trigger: input.trigger ?? ReportRunTrigger.MANUAL,
        format: input.format,
        status: ReportRunStatus.QUEUED,
        requestedByUserId: input.requestedByUserId ?? null,
        executedAsUserId:
          input.executedAsUserId ?? input.requestedByUserId ?? null,
        paramsJson: (input.params ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        expiresAt: this.expiresAtFrom(),
      },
    });
  }

  async markRunning(
    tenantId: string,
    runId: string,
    claimedBy?: string,
  ): Promise<ReportRun> {
    const run = await this.requireRun(tenantId, runId);

    return this.prisma.reportRun.update({
      where: { id: run.id },
      data: {
        status: ReportRunStatus.RUNNING,
        startedAt: new Date(),
        claimedAt: new Date(),
        claimedBy: claimedBy ?? null,
        attemptCount: { increment: 1 },
        failureReason: null,
      },
    });
  }

  /**
   * Stores the rendered file and completes the run.
   *
   * The file is written first and removed again if the row cannot be updated,
   * because the alternative — row first — produces a `COMPLETED` run pointing
   * at a key that was never written, and the download then fails with a 404
   * that looks like data loss.
   */
  async completeRun(
    tenantId: string,
    runId: string,
    file: ReportExportFile,
    options: { durationMs?: number; rowCount?: number } = {},
  ): Promise<ReportRun> {
    const run = await this.requireRun(tenantId, runId);

    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.fileName,
      subdirectory: `${STORAGE_ROOT_SUBDIRECTORY}/${tenantId}`,
    });

    try {
      return await this.prisma.reportRun.update({
        where: { id: run.id },
        data: {
          status: ReportRunStatus.COMPLETED,
          completedAt: new Date(),
          resultFileKey: saved.storageKey,
          fileName: file.fileName,
          contentType: file.contentType,
          fileSizeBytes: saved.size,
          rowCount: options.rowCount ?? file.rowCount,
          durationMs: options.durationMs ?? null,
          expiresAt: this.expiresAtFrom(),
          failureReason: null,
        },
      });
    } catch (error) {
      await this.storage.deleteFile(saved.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async failRun(
    tenantId: string,
    runId: string,
    reason: string,
  ): Promise<ReportRun> {
    const run = await this.requireRun(tenantId, runId);

    return this.prisma.reportRun.update({
      where: { id: run.id },
      data: {
        status: ReportRunStatus.FAILED,
        completedAt: new Date(),
        failureReason: reason.slice(0, MAX_FAILURE_REASON),
      },
    });
  }

  /** One run, or `REPORT_NOT_FOUND`. Tenant-scoped. */
  async getRun(tenantId: string, runId: string): Promise<ReportRun> {
    return this.requireRun(tenantId, runId);
  }

  async listRuns(
    tenantId: string,
    options: {
      targetKey?: string;
      requestedByUserId?: string;
      status?: ReportRunStatus;
      limit?: number;
    } = {},
  ): Promise<ReportRun[]> {
    return this.prisma.reportRun.findMany({
      where: {
        tenantId,
        ...(options.targetKey ? { targetKey: options.targetKey } : {}),
        ...(options.requestedByUserId
          ? { requestedByUserId: options.requestedByUserId }
          : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 25, 1), 100),
    });
  }

  /**
   * Opens a completed artifact for download.
   *
   * Three independent conditions, and all three are checked here rather than in
   * a controller: the run belongs to the caller's tenant, it actually finished,
   * and its bytes are still on the disk. A permission to export reports is not
   * a permission to read *this* export.
   */
  async openArtifact(
    tenantId: string,
    runId: string,
  ): Promise<ReportArtifactDownload> {
    const run = await this.requireRun(tenantId, runId);

    if (
      run.status === ReportRunStatus.QUEUED ||
      run.status === ReportRunStatus.RUNNING
    ) {
      throw new AppError('REPORT_EXPORT_NOT_READY', {
        message: 'This export is still being generated.',
        details: { runId: run.id, status: run.status },
      });
    }

    if (run.status === ReportRunStatus.FAILED) {
      throw new AppError('REPORT_EXPORT_FAILED', {
        message:
          run.failureReason ?? 'This export failed and produced no file.',
        details: { runId: run.id },
      });
    }

    if (
      run.status === ReportRunStatus.EXPIRED ||
      run.status === ReportRunStatus.CANCELLED
    ) {
      /*
       * Deliberately the not-found code rather than a failure: the artifact is
       * gone by design after `expiresAt`, and telling the user their export
       * "failed" would send them chasing a defect that is retention working.
       */
      throw new AppError('REPORT_NOT_FOUND', {
        message:
          run.status === ReportRunStatus.EXPIRED
            ? `This export has expired. Exports are kept for ${this.retentionDays()} days — run the report again.`
            : 'This export was cancelled.',
        details: { runId: run.id, status: run.status },
      });
    }

    if (!run.resultFileKey) {
      throw new AppError('REPORT_EXPORT_FAILED', {
        message: 'This export completed without a stored file.',
        details: { runId: run.id },
      });
    }

    const opened = await this.storage.openFile(run.resultFileKey);

    return {
      runId: run.id,
      fileName: run.fileName ?? `report-${run.id}`,
      contentType: run.contentType ?? 'application/octet-stream',
      size: opened.size,
      stream: opened.stream,
    };
  }

  /**
   * Deletes artifacts past their expiry and marks their runs `EXPIRED`.
   *
   * Cross-tenant on purpose — it is a maintenance job with no request context,
   * it returns counts rather than content, and it selects strictly on
   * `expiresAt <= now`. Rows already `EXPIRED` or `CANCELLED` are excluded so a
   * repeat pass is a no-op rather than a rewrite of history.
   *
   * The file is removed before the row is marked, so a crash between the two
   * leaves a row that is still due and gets swept again. The reverse order
   * would leave the bytes on disk with nothing left pointing at them.
   */
  async sweepExpired(
    options: { now?: Date; batchSize?: number } = {},
  ): Promise<SweepResult> {
    const now = options.now ?? new Date();
    const due = await this.prisma.reportRun.findMany({
      where: {
        expiresAt: { lte: now },
        status: {
          notIn: [ReportRunStatus.EXPIRED, ReportRunStatus.CANCELLED],
        },
      },
      select: { id: true, tenantId: true, resultFileKey: true },
      orderBy: { expiresAt: 'asc' },
      take: Math.min(Math.max(options.batchSize ?? SWEEP_BATCH_SIZE, 1), 5_000),
    });

    const result: SweepResult = { swept: 0, filesDeleted: 0, failures: 0 };

    for (const run of due) {
      try {
        if (run.resultFileKey) {
          await this.storage.deleteFile(run.resultFileKey);
          result.filesDeleted += 1;
        }

        await this.prisma.reportRun.update({
          where: { id: run.id },
          data: {
            status: ReportRunStatus.EXPIRED,
            // Nulled so nothing can later believe the bytes are still there.
            resultFileKey: null,
            fileSizeBytes: null,
          },
        });
        result.swept += 1;
      } catch (error) {
        result.failures += 1;
        this.logger.warn(
          `Failed to sweep report run ${run.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (result.swept > 0 || result.failures > 0) {
      this.logger.log(
        `Report artifact sweep: ${result.swept} expired, ${result.filesDeleted} files deleted, ${result.failures} failed.`,
      );
    }

    return result;
  }

  /**
   * The only read of a `ReportRun` in this service.
   *
   * `findFirst` with `{ id, tenantId }` rather than `findUnique` by id: this
   * model is tenant-owned, ids are guessable across tenants once one leaks into
   * a URL, and a `findUnique` followed by a forgotten check is how cross-tenant
   * reads get written.
   */
  private async requireRun(
    tenantId: string,
    runId: string,
  ): Promise<ReportRun> {
    const run = await this.prisma.reportRun.findFirst({
      where: { id: runId, tenantId },
    });

    if (!run) {
      /*
       * The same error whether the run is absent or belongs to another tenant.
       * Distinguishing them would confirm the existence of another tenant's
       * run to anyone willing to guess ids.
       */
      throw new AppError('REPORT_NOT_FOUND', {
        message: 'The requested export could not be found.',
        details: { runId },
      });
    }

    return run;
  }
}
