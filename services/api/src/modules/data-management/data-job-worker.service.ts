import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataJobKind, DataJobStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthAccessService } from '../auth/auth-access.service';
import { DataJobLeaseLostError, type JobLease } from './data-job-lease';
import {
  DATA_JOB_LEASE_MS,
  DATA_JOB_LEASE_RENEW_MS,
  DataJobRecoveryService,
} from './data-job-recovery.service';
import { ExportExecutionService } from './export-execution.service';
import { ImportExecutionService } from './import-execution.service';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;

/**
 * Whether this process runs the data-job queue.
 *
 * ON unless explicitly set to `false`. That is the opposite default to the
 * sibling workers (outbox, sweepers), deliberately: this worker has always
 * started in every process, so switching its default to off would stop import
 * and export jobs the moment this ships to an environment that has not set a
 * new variable — a silent failure. `DATA_JOB_WORKER_ENABLED=false` is for the
 * processes that should not drain the queue: tests, CLI seeds, one-off scripts,
 * an additional instance.
 */
export function resolveDataJobWorkerSettings(env: NodeJS.ProcessEnv): {
  enabled: boolean;
  pollIntervalMs: number;
} {
  const enabled =
    (env.DATA_JOB_WORKER_ENABLED ?? '').trim().toLowerCase() !== 'false';
  const raw = Number(env.DATA_JOB_WORKER_POLL_INTERVAL_MS);
  const pollIntervalMs =
    Number.isFinite(raw) && raw > 0
      ? Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw))
      : DEFAULT_POLL_INTERVAL_MS;
  return { enabled, pollIntervalMs };
}

/**
 * Runs queued data jobs outside the request that submitted them.
 *
 * A large import cannot finish inside an HTTP request, so the endpoint queues
 * the job and this worker drains the queue. Work is claimed with a conditional
 * update, so if more than one instance is running only one picks up each job.
 *
 * Ownership is a lease renewed while the job runs. If this process dies the
 * lease lapses and `DataJobRecoveryService` — run at the start of every cycle,
 * by any instance — re-queues or finalises the job (see that class for why that
 * is safe). Every write this worker makes to a job it has claimed is conditional
 * on still being the owner, so a worker that was merely paused and was recovered
 * from cannot overwrite the new owner's state.
 */
@Injectable()
export class DataJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataJobWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private cycleRunning = false;
  /** Identifies this process as a job owner. Unique per process start. */
  readonly instanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: ImportExecutionService,
    private readonly exports: ExportExecutionService,
    private readonly authAccess: AuthAccessService,
    private readonly recovery: DataJobRecoveryService,
  ) {}

  onModuleInit() {
    const settings = resolveDataJobWorkerSettings(process.env);
    if (!settings.enabled) {
      this.logger.log(
        'Data job worker disabled (DATA_JOB_WORKER_ENABLED=false); queued jobs wait for a process that runs it.',
      );
      return;
    }
    this.timer = setInterval(
      () => void this.runCycle(),
      settings.pollIntervalMs,
    );
    this.timer.unref?.();
    this.logger.log(
      `Data job worker started as ${this.instanceId}; polling every ${settings.pollIntervalMs}ms.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass: recover anything stranded, then drain the queue. Exposed for tests. */
  async runCycle() {
    // A slow job must not have a second cycle stacked on top of it.
    if (this.cycleRunning) return;
    this.cycleRunning = true;

    try {
      try {
        await this.recovery.recoverStaleJobs(this.instanceId);
      } catch (error) {
        this.logger.error(
          `Data job recovery pass failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      for (;;) {
        const claimed = await this.claimNextJob();
        if (!claimed) break;

        await this.runClaimedJob(
          claimed.id,
          claimed.submittedByUserId,
          claimed.kind,
        );
      }
    } catch (error) {
      this.logger.error(
        `Data job cycle failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.cycleRunning = false;
    }
  }

  /**
   * Moves one QUEUED job to PROCESSING, with a lease, and returns it.
   *
   * The status is part of the update filter, so two workers racing for the same
   * job produce one winner and one no-op rather than two runs.
   */
  private async claimNextJob() {
    const candidate = await this.prisma.dataJob.findFirst({
      where: { status: DataJobStatus.QUEUED, cancelledAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, submittedByUserId: true, kind: true },
    });

    if (!candidate) return null;

    const now = new Date();
    const claim = await this.prisma.dataJob.updateMany({
      where: { id: candidate.id, status: DataJobStatus.QUEUED },
      data: {
        status: DataJobStatus.PROCESSING,
        startedAt: now,
        claimedBy: this.instanceId,
        leaseExpiresAt: new Date(now.getTime() + DATA_JOB_LEASE_MS),
      },
    });

    return claim.count === 1 ? candidate : null;
  }

  /**
   * Renews the lease on a timer independent of the work, so a long row cannot
   * let it lapse, and a dead process stops renewing because it stops running.
   * A renewal that matches no row means the job has been taken over.
   *
   * `ensureHeld` is called at every row boundary. It is an in-memory check
   * while the timer is healthy; if the last successful renewal is older than two
   * renewal periods (a paused process wakes up with the clock far ahead of its
   * last renewal) it confirms with the database first.
   */
  private startLease(jobId: string): JobLease & { stop(): void } {
    let held = true;
    let lastOkAt = Date.now();

    const renew = async (): Promise<void> => {
      const result = await this.prisma.dataJob.updateMany({
        where: {
          id: jobId,
          claimedBy: this.instanceId,
          status: DataJobStatus.PROCESSING,
        },
        data: { leaseExpiresAt: new Date(Date.now() + DATA_JOB_LEASE_MS) },
      });
      if (result.count === 1) {
        lastOkAt = Date.now();
      } else {
        held = false;
      }
    };

    const timer = setInterval(() => {
      void renew().catch((error: unknown) => {
        // A transient database error is not loss of ownership: the lease has
        // minutes of headroom, and the next tick retries.
        this.logger.warn(
          `Lease renewal for data job ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, DATA_JOB_LEASE_RENEW_MS);
    timer.unref?.();

    return {
      ensureHeld: async () => {
        if (held && Date.now() - lastOkAt > DATA_JOB_LEASE_RENEW_MS * 2) {
          await renew();
        }
        if (!held) throw new DataJobLeaseLostError(jobId);
      },
      stop: () => clearInterval(timer),
    };
  }

  private async runClaimedJob(
    jobId: string,
    submittedByUserId: string | null,
    kind: DataJobKind,
  ) {
    const lease = this.startLease(jobId);
    try {
      if (!submittedByUserId) {
        throw new Error('The job has no submitting user to run as.');
      }

      // Rows are written with the submitter's own permissions and scope, never
      // an elevated worker identity.
      const context =
        await this.authAccess.loadAccessContext(submittedByUserId);

      if (!context?.authUser) {
        throw new Error('The submitting user no longer has access.');
      }

      if (kind === 'EXPORT') {
        await this.exports.runExport(context.authUser, jobId);
      } else {
        await this.execution.executeJob(context.authUser, jobId, {
          alreadyClaimed: true,
          lease,
        });
      }
    } catch (error) {
      if (error instanceof DataJobLeaseLostError) {
        // Someone else owns the job now. Writing anything here could undo
        // their work; the recovery path has already accounted for the state.
        this.logger.warn(error.message);
        return;
      }
      const reason =
        error instanceof Error ? error.message : 'The job failed to run.';

      this.logger.error(`Data job ${jobId} failed: ${reason}`);
      // Conditional on ownership: a recovered-from worker must not stamp FAILED
      // over a job another worker is now running.
      const failed = await this.prisma.dataJob.updateMany({
        where: { id: jobId, claimedBy: this.instanceId },
        data: {
          status: DataJobStatus.FAILED,
          failureReason: reason,
          completedAt: new Date(),
        },
      });
      if (failed.count !== 1) {
        this.logger.warn(
          `Data job ${jobId} failed but is no longer owned by this worker; leaving it alone.`,
        );
      }
    } finally {
      lease.stop();
      // Release ownership. Conditional, so it cannot clear another owner's.
      await this.prisma.dataJob
        .updateMany({
          where: { id: jobId, claimedBy: this.instanceId },
          data: { claimedBy: null, leaseExpiresAt: null },
        })
        .catch(() => undefined);
    }
  }
}
