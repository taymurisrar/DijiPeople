import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataJobKind, DataJobStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthAccessService } from '../auth/auth-access.service';
import { ExportExecutionService } from './export-execution.service';
import { ImportExecutionService } from './import-execution.service';

const POLL_INTERVAL_MS = 5_000;

/**
 * Runs queued data jobs outside the request that submitted them.
 *
 * A large import cannot finish inside an HTTP request, so the endpoint queues
 * the job and this worker drains the queue. Work is claimed with a conditional
 * update, so if more than one instance is running only one picks up each job.
 */
@Injectable()
export class DataJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataJobWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private cycleRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: ImportExecutionService,
    private readonly exports: ExportExecutionService,
    private readonly authAccess: AuthAccessService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runCycle() {
    // A slow job must not have a second cycle stacked on top of it.
    if (this.cycleRunning) return;
    this.cycleRunning = true;

    try {
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
   * Moves one QUEUED job to PROCESSING and returns it.
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

    const claim = await this.prisma.dataJob.updateMany({
      where: { id: candidate.id, status: DataJobStatus.QUEUED },
      data: { status: DataJobStatus.PROCESSING, startedAt: new Date() },
    });

    return claim.count === 1 ? candidate : null;
  }

  private async runClaimedJob(
    jobId: string,
    submittedByUserId: string | null,
    kind: DataJobKind,
  ) {
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
        });
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'The job failed to run.';

      this.logger.error(`Data job ${jobId} failed: ${reason}`);
      await this.prisma.dataJob.update({
        where: { id: jobId },
        data: {
          status: DataJobStatus.FAILED,
          failureReason: reason,
          completedAt: new Date(),
        },
      });
    }
  }
}
