import { Injectable, Logger } from '@nestjs/common';
import {
  DataJobKind,
  DataJobStatus,
  DataRowStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** How long a worker owns a job without renewing. Renewed every LEASE_RENEW_MS. */
export const DATA_JOB_LEASE_MS = 120_000;
export const DATA_JOB_LEASE_RENEW_MS = 30_000;

/**
 * A job that has been recovered this many times is failed rather than retried
 * again: a job that keeps killing its worker must not loop forever.
 */
export const DATA_JOB_MAX_RECOVERIES = 3;

/**
 * Jobs that were PROCESSING before leases existed carry no lease. During a
 * rolling deploy an OLD instance may still be running one, so such a job is
 * only treated as stale after this long WITHOUT ANY UPDATE. It keys on
 * `updatedAt`, not `startedAt`: the old executor writes the job after every
 * chunk, so a live old-version import keeps refreshing it however long it runs,
 * while a dead one goes quiet (independent review, SESSION-0136).
 */
export const DATA_JOB_LEGACY_STALE_AFTER_MS = 60 * 60_000;

export const INTERRUPTED_ROW_MESSAGE =
  'This row was being applied when the worker stopped. The record may or may not have been written, so it was NOT retried automatically. Check whether it exists before importing this row again.';

export type RecoveryOutcome =
  | 'REQUEUED'
  | 'RESUMED_IMPORT'
  | 'FINALISED_IMPORT'
  | 'FAILED_RETRIES_EXHAUSTED'
  | 'CANCELLED'
  | 'LOST_RACE';

export type RecoveryResult = {
  jobId: string;
  outcome: RecoveryOutcome;
  parkedRowNumber?: number;
};

/**
 * Recovers data jobs stranded in PROCESSING by a process that died.
 *
 * WHY THIS IS SAFE, rather than merely hopeful:
 *
 * - Ownership is a lease the owner renews while it works. Only a job whose
 *   lease has LAPSED is touched, and the claim is a conditional update on the
 *   exact lease value that was read, so of any number of racing recoverers
 *   exactly one wins.
 * - EXPORT is a read plus a new output file; running it again produces an
 *   equivalent file and changes nothing else, so it is re-queued.
 * - IMPORT rows are applied strictly in `rowNumber` order and each is fully
 *   awaited. The executor marks a whole chunk IN_PROGRESS before applying any
 *   of it, and every row leaves IN_PROGRESS the moment it is applied. After a
 *   crash, therefore, every row below the lowest IN_PROGRESS row is finished,
 *   every row above it was never started, and ONLY the lowest one is unknown.
 *   That single row is parked as FAILED with an explicit message and is never
 *   replayed automatically; the never-started rows go back to VALID. No row is
 *   ever applied twice, and no module's create/update has to be proven atomic.
 */
@Injectable()
export class DataJobRecoveryService {
  private readonly logger = new Logger(DataJobRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recoverStaleJobs(
    instanceId: string,
    now: Date = new Date(),
  ): Promise<RecoveryResult[]> {
    await this.settleCancelledQueuedJobs();

    const legacyCutoff = new Date(
      now.getTime() - DATA_JOB_LEGACY_STALE_AFTER_MS,
    );
    const stale = await this.prisma.dataJob.findMany({
      where: {
        status: DataJobStatus.PROCESSING,
        OR: [
          { leaseExpiresAt: { lt: now } },
          { leaseExpiresAt: null, updatedAt: { lt: legacyCutoff } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        kind: true,
        retryCount: true,
        leaseExpiresAt: true,
        claimedBy: true,
        importMode: true,
        cancelledAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    const results: RecoveryResult[] = [];
    for (const job of stale) {
      try {
        const result = await this.recoverOne(job, instanceId, now);
        if (result) results.push(result);
      } catch (error) {
        this.logger.error(
          `Recovery of data job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return results;
  }

  private async recoverOne(
    job: {
      id: string;
      tenantId: string;
      kind: DataJobKind;
      retryCount: number;
      leaseExpiresAt: Date | null;
      claimedBy: string | null;
      cancelledAt: Date | null;
    },
    instanceId: string,
    now: Date,
  ): Promise<RecoveryResult | null> {
    // Single-winner claim: conditional on the exact lease value just read.
    const claim = await this.prisma.dataJob.updateMany({
      where: {
        id: job.id,
        status: DataJobStatus.PROCESSING,
        leaseExpiresAt: job.leaseExpiresAt,
      },
      data: {
        claimedBy: instanceId,
        leaseExpiresAt: new Date(now.getTime() + DATA_JOB_LEASE_MS),
      },
    });
    if (claim.count !== 1) return null;

    const exhausted = job.retryCount >= DATA_JOB_MAX_RECOVERIES;
    const before = {
      status: 'PROCESSING',
      claimedBy: job.claimedBy,
      leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      retryCount: job.retryCount,
    };

    let result: RecoveryResult;
    if (job.cancelledAt) {
      // The submitter cancelled while the job was stranded. Re-queueing it would
      // leave it QUEUED forever (the worker never claims a cancelled job), so it
      // is settled as CANCELLED here, with any in-flight row parked as usual.
      result = await this.recoverCancelled(job.id, job.kind);
    } else if (job.kind === DataJobKind.EXPORT) {
      result = await this.recoverExport(job.id, exhausted);
    } else {
      result = await this.recoverImport(job.id, exhausted);
    }

    await this.audit.log({
      tenantId: job.tenantId,
      actorUserId: null,
      action: 'DATA_JOB_RECOVERED',
      entityType: 'DataJob',
      entityId: job.id,
      beforeSnapshot: before,
      afterSnapshot: {
        outcome: result.outcome,
        parkedRowNumber: result.parkedRowNumber ?? null,
        recoveredBy: instanceId,
      },
      sourceModule: 'data-management',
    });
    this.logger.warn(
      `Recovered stranded ${job.kind} job ${job.id}: ${result.outcome}` +
        (result.parkedRowNumber
          ? ` (row ${result.parkedRowNumber} parked)`
          : ''),
    );
    return result;
  }

  /**
   * Settles the rows a dead or failed run left IN_PROGRESS.
   *
   * Rows are applied strictly in rowNumber order, so the LOWEST IN_PROGRESS row
   * is the only one whose outcome is unknown: it is parked as FAILED with an
   * explicit message and never replayed automatically. Every higher one was
   * never started and returns to VALID. Returns the parked row number, or null
   * when nothing was in flight. Also used by the worker when an executor throws
   * a non-lease error after checkpointing a chunk, so a FAILED job never keeps
   * rows that are neither applied nor retriable.
   */
  async parkInFlightRows(jobId: string): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      const inFlight = await tx.dataJobRow.findMany({
        where: { jobId, status: DataRowStatus.IN_PROGRESS },
        orderBy: { rowNumber: 'asc' },
        select: { id: true, rowNumber: true },
      });
      if (inFlight.length === 0) return null;

      const [unknown, ...neverStarted] = inFlight;
      await tx.dataJobRow.update({
        where: { id: unknown.id },
        data: {
          status: DataRowStatus.FAILED,
          issuesJson: [
            {
              field: null,
              value: null,
              message: INTERRUPTED_ROW_MESSAGE,
              severity: 'ERROR',
            },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
      if (neverStarted.length > 0) {
        await tx.dataJobRow.updateMany({
          where: {
            id: { in: neverStarted.map((row) => row.id) },
            status: DataRowStatus.IN_PROGRESS,
          },
          data: { status: DataRowStatus.VALID },
        });
      }
      return unknown.rowNumber;
    });
  }

  /**
   * A QUEUED job that was cancelled before it started is never claimed (the
   * worker skips cancelled jobs), so it would sit QUEUED forever. Nothing was
   * applied, so settling it as CANCELLED is always safe.
   */
  async settleCancelledQueuedJobs(): Promise<number> {
    const stuck = await this.prisma.dataJob.findMany({
      where: { status: DataJobStatus.QUEUED, cancelledAt: { not: null } },
      select: { id: true, tenantId: true },
      take: 50,
    });
    let settled = 0;
    for (const job of stuck) {
      const result = await this.prisma.dataJob.updateMany({
        where: {
          id: job.id,
          status: DataJobStatus.QUEUED,
          cancelledAt: { not: null },
        },
        data: {
          status: DataJobStatus.CANCELLED,
          completedAt: new Date(),
          failureReason: 'Cancelled before it started.',
        },
      });
      if (result.count !== 1) continue;
      settled += 1;
      await this.audit.log({
        tenantId: job.tenantId,
        actorUserId: null,
        action: 'DATA_JOB_CANCELLED_BEFORE_START',
        entityType: 'DataJob',
        entityId: job.id,
        beforeSnapshot: { status: 'QUEUED' },
        afterSnapshot: { status: 'CANCELLED' },
        sourceModule: 'data-management',
      });
    }
    return settled;
  }

  private async recoverCancelled(
    jobId: string,
    kind: DataJobKind,
  ): Promise<RecoveryResult> {
    const parked =
      kind === DataJobKind.IMPORT ? await this.parkInFlightRows(jobId) : null;
    const counts =
      kind === DataJobKind.IMPORT ? await this.rowCounts(jobId) : null;
    await this.prisma.dataJob.update({
      where: { id: jobId },
      data: {
        status: DataJobStatus.CANCELLED,
        completedAt: new Date(),
        failureReason:
          'Cancelled while interrupted.' +
          (parked !== null
            ? ` Row ${parked} was being applied at the time and needs a manual check.`
            : ''),
        claimedBy: null,
        leaseExpiresAt: null,
        ...(counts ? counts.jobFields : {}),
      },
    });
    return {
      jobId,
      outcome: 'CANCELLED',
      ...(parked !== null ? { parkedRowNumber: parked } : {}),
    };
  }

  private async recoverExport(
    jobId: string,
    exhausted: boolean,
  ): Promise<RecoveryResult> {
    if (exhausted) {
      await this.prisma.dataJob.update({
        where: { id: jobId },
        data: {
          status: DataJobStatus.FAILED,
          failureReason: `The export was interrupted ${DATA_JOB_MAX_RECOVERIES} times and was not retried again.`,
          completedAt: new Date(),
          claimedBy: null,
          leaseExpiresAt: null,
        },
      });
      return { jobId, outcome: 'FAILED_RETRIES_EXHAUSTED' };
    }
    // A fresh run overwrites nothing and has no side effect beyond a new file.
    await this.prisma.dataJob.update({
      where: { id: jobId },
      data: {
        status: DataJobStatus.QUEUED,
        retryCount: { increment: 1 },
        failureReason: 'Re-queued after the worker running it stopped.',
        claimedBy: null,
        leaseExpiresAt: null,
      },
    });
    return { jobId, outcome: 'REQUEUED' };
  }

  private async recoverImport(
    jobId: string,
    exhausted: boolean,
  ): Promise<RecoveryResult> {
    const parked = await this.parkInFlightRows(jobId);

    const remaining = await this.prisma.dataJobRow.count({
      where: { jobId, status: DataRowStatus.VALID },
    });
    const parkedNote =
      parked !== null
        ? ` Row ${parked} was being applied at the time and needs a manual check.`
        : '';

    if (remaining > 0 && !exhausted) {
      await this.prisma.dataJob.update({
        where: { id: jobId },
        data: {
          status: DataJobStatus.QUEUED,
          retryCount: { increment: 1 },
          failureReason: `Resumed after the worker running it stopped.${parkedNote}`,
          claimedBy: null,
          leaseExpiresAt: null,
        },
      });
      return {
        jobId,
        outcome: 'RESUMED_IMPORT',
        ...(parked !== null ? { parkedRowNumber: parked } : {}),
      };
    }

    const counts = await this.rowCounts(jobId);
    if (remaining > 0) {
      await this.prisma.dataJob.update({
        where: { id: jobId },
        data: {
          status: DataJobStatus.FAILED,
          failureReason: `The import was interrupted ${DATA_JOB_MAX_RECOVERIES} times; ${remaining} row(s) were never applied.${parkedNote}`,
          completedAt: new Date(),
          claimedBy: null,
          leaseExpiresAt: null,
          ...counts.jobFields,
        },
      });
      return {
        jobId,
        outcome: 'FAILED_RETRIES_EXHAUSTED',
        ...(parked !== null ? { parkedRowNumber: parked } : {}),
      };
    }

    // Nothing left to apply: the interruption came after the last row.
    await this.prisma.dataJob.update({
      where: { id: jobId },
      data: {
        status:
          counts.failedExecuted > 0
            ? DataJobStatus.PARTIALLY_COMPLETED
            : DataJobStatus.COMPLETED,
        completedAt: new Date(),
        failureReason: parkedNote.trim() || null,
        claimedBy: null,
        leaseExpiresAt: null,
        ...counts.jobFields,
      },
    });
    return {
      jobId,
      outcome: 'FINALISED_IMPORT',
      ...(parked !== null ? { parkedRowNumber: parked } : {}),
    };
  }

  private async rowCounts(jobId: string) {
    const grouped = await this.prisma.dataJobRow.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const n = (status: DataRowStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const created = n(DataRowStatus.CREATED);
    const updated = n(DataRowStatus.UPDATED);
    const skipped = n(DataRowStatus.SKIPPED);
    const failedExecuted = n(DataRowStatus.FAILED);
    const invalid = n(DataRowStatus.INVALID);
    const processed = created + updated + skipped + failedExecuted;
    return {
      failedExecuted,
      jobFields: {
        processedRows: processed,
        createdRows: created,
        updatedRows: updated,
        skippedRows: skipped,
        failedRows: invalid + failedExecuted,
      },
    };
  }
}
