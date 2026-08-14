import { Injectable, Logger, Module } from '@nestjs/common';
import {
  TenantProvisioningRunStatus,
  TenantProvisioningStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TENANT_PROVISIONING_STEPS } from './tenant-control-plane.constants';

/**
 * Records what a provisioning attempt did, step by step.
 *
 * Kept deliberately dependency-free (Prisma only) because both the provisioning
 * path in `super-admin` and the retry path in `tenant-control-plane` need it,
 * and giving it any richer dependency would put those two modules in a cycle.
 *
 * Telemetry must never fail the operation it is describing, so every method
 * swallows its own errors and logs instead. A provisioning run that succeeded
 * but whose step row could not be written is still a provisioning run that
 * succeeded.
 */
@Injectable()
export class TenantProvisioningRunService {
  private readonly logger = new Logger(TenantProvisioningRunService.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(input: {
    tenantId: string;
    trigger: 'ONBOARDING' | 'RETRY';
    requestedById?: string | null;
    correlationId?: string | null;
    /** Steps to skip on a retry, recorded as SKIPPED rather than omitted. */
    skipStepKeys?: string[];
  }) {
    try {
      const previous = await this.prisma.tenantProvisioningRun.count({
        where: { tenantId: input.tenantId },
      });
      const skip = new Set(input.skipStepKeys ?? []);
      return await this.prisma.tenantProvisioningRun.create({
        data: {
          tenantId: input.tenantId,
          trigger: input.trigger,
          attempt: previous + 1,
          status: TenantProvisioningRunStatus.RUNNING,
          requestedById: input.requestedById ?? null,
          correlationId: input.correlationId ?? null,
          steps: {
            create: TENANT_PROVISIONING_STEPS.map((step) => ({
              tenantId: input.tenantId,
              key: step.key,
              label: step.label,
              sequence: step.sequence,
              isRetryable: step.isRetryable,
              status: skip.has(step.key)
                ? TenantProvisioningStepStatus.SKIPPED
                : TenantProvisioningStepStatus.PENDING,
              message: skip.has(step.key)
                ? 'Already completed by an earlier run.'
                : null,
            })),
          },
        },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to open a provisioning run for ${input.tenantId}: ${message(error)}`,
      );
      return null;
    }
  }

  async stepStarted(runId: string | null | undefined, key: string) {
    if (!runId) return;
    await this.write(runId, key, {
      status: TenantProvisioningStepStatus.RUNNING,
      startedAt: new Date(),
    });
  }

  async stepSucceeded(
    runId: string | null | undefined,
    key: string,
    detail?: string,
  ) {
    if (!runId) return;
    await this.complete(
      runId,
      key,
      TenantProvisioningStepStatus.SUCCEEDED,
      detail,
    );
  }

  async stepFailed(
    runId: string | null | undefined,
    key: string,
    detail: string,
  ) {
    if (!runId) return;
    await this.complete(
      runId,
      key,
      TenantProvisioningStepStatus.FAILED,
      detail,
    );
  }

  async finish(
    runId: string | null | undefined,
    outcome:
      | { status: 'SUCCEEDED' }
      | { status: 'FAILED'; failedStepKey: string; message: string },
  ) {
    if (!runId) return;
    try {
      const run = await this.prisma.tenantProvisioningRun.findUnique({
        where: { id: runId },
        select: { startedAt: true },
      });
      const completedAt = new Date();
      await this.prisma.tenantProvisioningRun.update({
        where: { id: runId },
        data: {
          status:
            outcome.status === 'SUCCEEDED'
              ? TenantProvisioningRunStatus.SUCCEEDED
              : TenantProvisioningRunStatus.FAILED,
          completedAt,
          durationMs: run
            ? completedAt.getTime() - run.startedAt.getTime()
            : null,
          failedStepKey:
            outcome.status === 'FAILED' ? outcome.failedStepKey : null,
          message: outcome.status === 'FAILED' ? outcome.message : null,
        },
      });
    } catch (error) {
      this.logger.warn(`Unable to close run ${runId}: ${message(error)}`);
    }
  }

  private async complete(
    runId: string,
    key: string,
    status: TenantProvisioningStepStatus,
    detail?: string,
  ) {
    try {
      const step = await this.prisma.tenantProvisioningStep.findUnique({
        where: { runId_key: { runId, key } },
        select: { startedAt: true },
      });
      const completedAt = new Date();
      await this.prisma.tenantProvisioningStep.update({
        where: { runId_key: { runId, key } },
        data: {
          status,
          completedAt,
          durationMs: step?.startedAt
            ? completedAt.getTime() - step.startedAt.getTime()
            : null,
          message: detail?.slice(0, 1000) ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to record step ${key} on run ${runId}: ${message(error)}`,
      );
    }
  }

  private async write(
    runId: string,
    key: string,
    data: Record<string, unknown>,
  ) {
    try {
      await this.prisma.tenantProvisioningStep.update({
        where: { runId_key: { runId, key } },
        data,
      });
    } catch (error) {
      this.logger.warn(
        `Unable to update step ${key} on run ${runId}: ${message(error)}`,
      );
    }
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Its own module so both the provisioning path and the retry path can import it
 * without importing each other.
 */
@Module({
  providers: [TenantProvisioningRunService],
  exports: [TenantProvisioningRunService],
})
export class TenantProvisioningRunModule {}
