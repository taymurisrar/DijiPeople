import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryStatus, WorkflowStepStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowDeliveryReconciler } from './workflow-delivery-reconciler';

/*
 * DP-MASTER WP-03.S4. Reads provider delivery results back onto workflow steps on
 * a timer, so a message that failed after hand-off is recorded without an operator
 * calling the endpoint. Off unless WORKFLOW_RECONCILE_ENABLED=true, so a deploy
 * that omits it starts no background work. Several instances may run it: the
 * reconciler is idempotent (a step already read back is not touched again).
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;
const MAX_TENANTS_PER_TICK = 50;

const IN_FLIGHT: EmailDeliveryStatus[] = [
  EmailDeliveryStatus.REQUESTED,
  EmailDeliveryStatus.PENDING,
  EmailDeliveryStatus.PROCESSING,
  EmailDeliveryStatus.QUEUED,
  EmailDeliveryStatus.SENT,
];

@Injectable()
export class WorkflowReconciliationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkflowReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reconciler: WorkflowDeliveryReconciler,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    const interval = this.intervalMs();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    this.logger.log(`Workflow delivery reconciliation every ${interval}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isEnabled(): boolean {
    return this.config.get<string>('WORKFLOW_RECONCILE_ENABLED') === 'true';
  }

  private intervalMs(): number {
    const raw = Number(
      this.config.get<string>('WORKFLOW_RECONCILE_INTERVAL_MS'),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MS;
    return Math.max(MIN_INTERVAL_MS, Math.trunc(raw));
  }

  /** One pass over every tenant that has a step still waiting for its result. */
  async tick(): Promise<{ tenants: number; changed: number }> {
    if (this.running) return { tenants: 0, changed: 0 };
    this.running = true;
    try {
      const waiting = await this.prisma.workflowRunStep.findMany({
        where: {
          status: WorkflowStepStatus.SUCCEEDED,
          deliveryLogId: { not: null },
          OR: [{ deliveryStatus: null }, { deliveryStatus: { in: IN_FLIGHT } }],
        },
        distinct: ['tenantId'],
        select: { tenantId: true },
        take: MAX_TENANTS_PER_TICK,
      });
      let changed = 0;
      for (const { tenantId } of waiting) {
        try {
          changed += (await this.reconciler.reconcile(tenantId)).changed;
        } catch (error) {
          this.logger.warn(
            `Reconciliation failed for tenant ${tenantId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return { tenants: waiting.length, changed };
    } finally {
      this.running = false;
    }
  }
}
