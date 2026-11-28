import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DailyUpdatesService } from './daily-updates.service';

/*
 * DP-MASTER WP-27.S3. Escalates missed daily updates on a timer, so a manager is
 * told without anyone pressing "run escalation". Off unless
 * WORK_DAILY_UPDATE_ESCALATION_ENABLED=true, so a deploy that omits it starts no
 * background work.
 *
 * Safe to run on several instances and to run twice:
 *  - the escalation itself is idempotent in the database: DailyUpdateEscalation is
 *    unique per (tenant, employee, day) and is claimed insert-first, so a second
 *    pass notifies nobody twice;
 *  - each tenant's pass additionally takes a transaction-scoped Postgres advisory
 *    lock, so two instances do not both scan the tenant - the second skips it for
 *    this tick;
 *  - there is no request, so the tenant id is passed explicitly and the actor is the
 *    system (no user id).
 *
 * One tenant failing never stops the rest: the failure is logged and counted.
 *
 * "Today" is each person's own: escalateMissed judges every employee by the
 * policy that governs them - its time zone, working days and deadline - over the
 * UTC days around now (yesterday, today, tomorrow), which is wide enough to hold the
 * local "today" of every zone on earth. Only tenants with at least one enabled
 * scoped policy that escalates are visited; the tenant-wide policy never escalates.
 */
const TICK_INTERVAL_MS = 15 * 60 * 1000;
const TENANT_BATCH = 100;
const LOCK_TX_TIMEOUT_MS = 5 * 60 * 1000;

export type EscalationTick = {
  tenants: number;
  escalated: number;
  alreadyEscalated: number;
  noManager: number;
  failedNotifications: number;
  failed: number;
  lockedOut: number;
};

@Injectable()
export class DailyUpdateEscalationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DailyUpdateEscalationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly updates: DailyUpdatesService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(`Daily-update escalation every ${TICK_INTERVAL_MS}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isEnabled(): boolean {
    return (
      this.config.get<string>('WORK_DAILY_UPDATE_ESCALATION_ENABLED') === 'true'
    );
  }

  /** One pass over every tenant that has an escalating scoped policy. */
  async tick(
    options: { now?: Date; tenantIds?: string[] } = {},
  ): Promise<EscalationTick> {
    const result: EscalationTick = {
      tenants: 0,
      escalated: 0,
      alreadyEscalated: 0,
      noManager: 0,
      failedNotifications: 0,
      failed: 0,
      lockedOut: 0,
    };
    if (this.running) return result;
    this.running = true;
    try {
      const now = options.now ?? new Date();
      let after: string | undefined;
      for (;;) {
        const batch = await this.prisma.dailyUpdateScopePolicy.findMany({
          where: {
            enabled: true,
            escalateAfterMinutes: { not: null },
            AND: [
              options.tenantIds ? { tenantId: { in: options.tenantIds } } : {},
              after ? { tenantId: { gt: after } } : {},
            ],
          },
          distinct: ['tenantId'],
          orderBy: { tenantId: 'asc' },
          select: { tenantId: true },
          take: TENANT_BATCH,
        });
        if (batch.length === 0) break;
        for (const { tenantId } of batch) {
          result.tenants += 1;
          await this.runTenant(tenantId, now, result);
        }
        after = batch[batch.length - 1].tenantId;
        if (batch.length < TENANT_BATCH) break;
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async runTenant(tenantId: string, now: Date, result: EscalationTick) {
    try {
      // The lock lives as long as this transaction. The work runs on its own
      // connections, so a lost lock race is a skip, never a deadlock.
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(
              hashtext(${`work-daily-update-escalation:${tenantId}`})
            ) AS locked`;
          if (!rows[0]?.locked) {
            result.lockedOut += 1;
            return;
          }
          const outcome = await this.updates.escalateMissed({
            tenantId,
            actorUserId: null,
            now,
          });
          result.escalated += outcome.escalated;
          result.alreadyEscalated += outcome.alreadyEscalated;
          result.noManager += outcome.noManager;
          result.failedNotifications += outcome.failed;
        },
        { timeout: LOCK_TX_TIMEOUT_MS, maxWait: 10_000 },
      );
    } catch (error) {
      result.failed += 1;
      this.logger.warn(
        `Daily-update escalation failed for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
