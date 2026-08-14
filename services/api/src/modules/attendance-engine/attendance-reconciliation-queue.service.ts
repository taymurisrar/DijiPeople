import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AttendanceReconciliationJobStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateAtUtcMidnight } from '../attendance/attendance-time.util';
import { AttendanceReconciliationService } from './attendance-reconciliation.service';

/**
 * The queue between "evidence arrived" and "attendance was recalculated".
 *
 * WHY IT EXISTS. A gateway uploading 500 punches must not wait while shift,
 * leave, holiday and overtime rules are evaluated for forty employees. The
 * ingestion endpoint's job is to persist evidence and answer quickly; a slow
 * answer there does not just delay a response, it makes the gateway retry the
 * whole batch and can make a device look unreachable.
 *
 * So ingestion enqueues and returns, and this drains the queue in the
 * background.
 *
 * The pattern follows the existing timesheet job service: a database-backed
 * queue plus an interval-driven worker. That is the convention this codebase
 * already uses, and introducing a second job mechanism for one module would make
 * operating the system harder rather than easier.
 */

/** How often the worker looks for due work. */
const POLL_INTERVAL_MS = 30_000;

/** Jobs drained per cycle, so one busy tenant cannot starve the others. */
const BATCH_SIZE = 50;

/** Backoff after a failed attempt, in minutes, by attempt number. */
const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 240];

@Injectable()
export class AttendanceReconciliationQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    AttendanceReconciliationQueueService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: AttendanceReconciliationService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain(), POLL_INTERVAL_MS);
    // unref so a worker waiting on the next tick cannot hold the process open
    // during a graceful shutdown or a test run.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Queues an employee-day for recalculation.
   *
   * Deduplicated by a partial unique index over PENDING and RUNNING: a device
   * uploading a thousand punches for one person produces one job, not a
   * thousand. The conflict is caught rather than pre-checked, because a
   * read-then-write would race with the very concurrency it is meant to handle.
   */
  async enqueue(input: {
    tenantId: string;
    employeeId: string;
    attendanceDate: Date;
    reason: string;
    requestedById?: string | null;
  }): Promise<void> {
    const attendanceDate = businessDateAtUtcMidnight(
      input.attendanceDate,
      'UTC',
    );

    try {
      await this.prisma.attendanceReconciliationJob.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          attendanceDate,
          reason: input.reason.slice(0, 200),
          requestedById: input.requestedById ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A job for this employee-day is already outstanding and will pick up
        // the new evidence when it runs. Nothing to do.
        return;
      }
      throw error;
    }
  }

  /** Queues several days at once, for a mapping change or a backfill. */
  async enqueueMany(
    entries: readonly {
      tenantId: string;
      employeeId: string;
      attendanceDate: Date;
      reason: string;
    }[],
  ): Promise<number> {
    let queued = 0;

    for (const entry of entries) {
      await this.enqueue(entry);
      queued += 1;
    }

    return queued;
  }

  /**
   * Runs one drain cycle.
   *
   * Guarded against re-entry: a cycle that outlives the poll interval must not
   * be joined by the next one, or the same jobs get claimed twice.
   */
  async drain(): Promise<{ processed: number; failed: number }> {
    if (this.draining) return { processed: 0, failed: 0 };
    this.draining = true;

    try {
      return await this.drainOnce();
    } catch (error) {
      this.logger.error(
        `Attendance reconciliation cycle failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { processed: 0, failed: 0 };
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce(): Promise<{ processed: number; failed: number }> {
    const now = new Date();

    const due = await this.prisma.attendanceReconciliationJob.findMany({
      where: {
        status: AttendanceReconciliationJobStatus.PENDING,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        tenantId: true,
        employeeId: true,
        attendanceDate: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });

    let processed = 0;
    let failed = 0;

    for (const job of due) {
      // A conditional claim, so two application instances draining the same
      // queue cannot both run the same day. The loser simply sees zero rows.
      const claimed = await this.prisma.attendanceReconciliationJob.updateMany({
        where: {
          id: job.id,
          status: AttendanceReconciliationJobStatus.PENDING,
        },
        data: {
          status: AttendanceReconciliationJobStatus.RUNNING,
          startedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      if (claimed.count !== 1) continue;

      try {
        const result = await this.reconciliation.reconcile(
          job.tenantId,
          job.employeeId,
          job.attendanceDate,
        );

        await this.prisma.attendanceReconciliationJob.update({
          where: { id: job.id },
          data: {
            status:
              result.skippedBecauseLocked || result.skippedBeforeCutover
                ? AttendanceReconciliationJobStatus.SKIPPED
                : AttendanceReconciliationJobStatus.COMPLETED,
            completedAt: new Date(),
            lastError: null,
          },
        });

        processed += 1;
      } catch (error) {
        failed += 1;
        await this.recordFailure(job, error);
      }
    }

    return { processed, failed };
  }

  /**
   * Records a failed attempt and schedules a retry.
   *
   * A job that exhausts its attempts is FAILED and kept, not deleted: an
   * employee-day that could not be reconciled is a fact an operator needs to see
   * and re-run, and a silently vanished job is indistinguishable from one that
   * succeeded.
   */
  private async recordFailure(
    job: { id: string; attemptCount: number; maxAttempts: number },
    error: unknown,
  ): Promise<void> {
    const attempt = job.attemptCount + 1;
    const exhausted = attempt >= job.maxAttempts;

    const backoffMinutes =
      RETRY_BACKOFF_MINUTES[
        Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)
      ];

    await this.prisma.attendanceReconciliationJob.update({
      where: { id: job.id },
      data: {
        status: exhausted
          ? AttendanceReconciliationJobStatus.FAILED
          : AttendanceReconciliationJobStatus.PENDING,
        nextAttemptAt: exhausted
          ? null
          : new Date(Date.now() + backoffMinutes * 60_000),
        // Bounded and message-only: an error string can carry query fragments,
        // and this column is read in an operator UI.
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Unknown error',
      },
    });

    this.logger.warn(
      `Attendance reconciliation attempt ${attempt} failed for job ${job.id}${
        exhausted ? ' (no attempts remaining)' : ''
      }.`,
    );
  }

  /**
   * Requeues raw events that could not be attributed to an employee.
   *
   * An unmapped device punch is not a permanent failure — it is a punch waiting
   * for someone to say who it belongs to. When that mapping is created, the
   * events it now resolves have to be reconsidered, or the employee's attendance
   * silently stays missing.
   */
  async requeueForMapping(input: {
    tenantId: string;
    employeeId: string;
    integrationId: string;
    externalUserId: string;
    reason: string;
  }): Promise<number> {
    const events = await this.prisma.rawAttendanceEvent.findMany({
      where: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        externalUserId: input.externalUserId,
        employeeId: input.employeeId,
      },
      select: { occurredAtLocal: true },
      // A newly mapped identity can have a long tail of history behind it;
      // bounded so one mapping cannot enqueue years of days in one go.
      take: 5000,
    });

    const dates = new Set(
      events.map((event) => event.occurredAtLocal.slice(0, 10)),
    );

    return this.enqueueMany(
      [...dates].map((date) => ({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        attendanceDate: new Date(`${date}T00:00:00.000Z`),
        reason: input.reason,
      })),
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
