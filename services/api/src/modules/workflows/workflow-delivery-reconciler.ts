import { Injectable, Logger } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { summarizeRun } from './workflow-steps';

/*
 * DP-MASTER WP-03.S4. A step is SUCCEEDED when the e-mail service accepted the
 * message. Whether the provider later delivered it is a separate fact that arrives
 * on the delivery log. This reads the log back, records it on the step, and when
 * the provider reports a failure after hand-off, says so: the step becomes FAILED
 * and its run is re-summarised, so a run is never left reading "succeeded" over a
 * message that never arrived.
 */
const IN_FLIGHT: EmailDeliveryStatus[] = [
  EmailDeliveryStatus.REQUESTED,
  EmailDeliveryStatus.PENDING,
  EmailDeliveryStatus.PROCESSING,
  EmailDeliveryStatus.QUEUED,
  EmailDeliveryStatus.SENT,
];

@Injectable()
export class WorkflowDeliveryReconciler {
  private readonly logger = new Logger(WorkflowDeliveryReconciler.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcile(tenantId: string, limit = 200) {
    const steps = await this.prisma.workflowRunStep.findMany({
      where: {
        tenantId,
        status: WorkflowStepStatus.SUCCEEDED,
        deliveryLogId: { not: null },
        OR: [{ deliveryStatus: null }, { deliveryStatus: { in: IN_FLIGHT } }],
      },
      select: {
        id: true,
        runId: true,
        deliveryLogId: true,
        deliveryStatus: true,
      },
      orderBy: { startedAt: 'asc' },
      take: limit,
    });
    if (!steps.length) return { checked: 0, changed: 0, failed: 0 };

    const logs = await this.prisma.emailDeliveryLog.findMany({
      where: {
        tenantId,
        id: { in: steps.map((step) => step.deliveryLogId as string) },
      },
      select: { id: true, status: true },
    });
    const byId = new Map(logs.map((log) => [log.id, log.status]));

    let changed = 0;
    const failedRuns = new Set<string>();
    for (const step of steps) {
      const latest = byId.get(step.deliveryLogId as string);
      if (!latest || latest === step.deliveryStatus) continue;
      changed += 1;
      const failed = latest === EmailDeliveryStatus.FAILED;
      await this.prisma.workflowRunStep.update({
        where: { id: step.id },
        data: {
          deliveryStatus: latest,
          reconciledAt: new Date(),
          ...(failed
            ? {
                status: WorkflowStepStatus.FAILED,
                permanent: false,
                lastError:
                  'The provider reported the delivery failed after it was accepted.',
              }
            : {}),
        },
      });
      if (failed) failedRuns.add(step.runId);
    }

    for (const runId of failedRuns) await this.resummarise(tenantId, runId);
    if (failedRuns.size) {
      this.logger.warn(
        `Delivery reconciliation marked steps failed in ${failedRuns.size} run(s) for tenant ${tenantId}`,
      );
    }
    return { checked: steps.length, changed, failed: failedRuns.size };
  }

  private async resummarise(tenantId: string, runId: string) {
    const steps = await this.prisma.workflowRunStep.findMany({
      where: { tenantId, runId },
      select: { status: true, permanent: true, lastError: true },
    });
    const count = (predicate: (s: (typeof steps)[number]) => boolean) =>
      steps.filter(predicate).length;
    const summary = summarizeRun({
      succeeded: count((s) => s.status === WorkflowStepStatus.SUCCEEDED),
      skipped: count((s) => s.status === WorkflowStepStatus.SKIPPED),
      failedPermanent: count(
        (s) => s.status === WorkflowStepStatus.FAILED && s.permanent,
      ),
      retryable: count(
        (s) => s.status === WorkflowStepStatus.FAILED && !s.permanent,
      ),
      errors: steps
        .filter((s) => s.status === WorkflowStepStatus.FAILED && s.lastError)
        .map((s) => s.lastError as string),
      finalAttempt: true,
    });
    await this.prisma.workflowRun.updateMany({
      where: { id: runId, tenantId },
      data: {
        status:
          summary.status === WorkflowRunStatus.RUNNING
            ? WorkflowRunStatus.FAILED
            : summary.status,
        actionsRun: summary.actionsRun,
        error: summary.error,
        finishedAt: new Date(),
      },
    });
  }
}
