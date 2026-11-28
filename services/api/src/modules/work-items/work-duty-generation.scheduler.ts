import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkDutiesService } from './work-duties.service';

/*
 * DP-MASTER WP-36.S2. Generates duty occurrences on a timer, so a duty exists on
 * the day it is due without anyone pressing "generate". Off unless
 * WORK_DUTY_GENERATION_ENABLED=true, so a deploy that omits it starts no
 * background work.
 *
 * Safe to run on several instances and to run twice:
 *  - generation is idempotent in the database (unique tenant + template + date);
 *  - each tenant's pass additionally takes a transaction-scoped Postgres advisory
 *    lock, so two instances do not both do the work - the second skips that tenant
 *    for this tick instead of racing it;
 *  - there is no request, so the tenant id is passed explicitly and the audit
 *    actor is the system (null user, sourceModule 'work-duties.scheduler').
 *
 * One tenant failing never stops the rest: the failure is logged and counted.
 *
 * "Today" is the UTC calendar date; a duty's own timezone only decides its due
 * time. The tick covers today and the following (daysAhead - 1) days, default 1,
 * bounded to MAX_DAYS_AHEAD.
 */
const TICK_INTERVAL_MS = 15 * 60 * 1000;
const TENANT_BATCH = 100;
const DEFAULT_DAYS_AHEAD = 1;
const MAX_DAYS_AHEAD = 14;
const LOCK_TX_TIMEOUT_MS = 5 * 60 * 1000;

export type DutyGenerationTick = {
  tenants: number;
  created: number;
  existing: number;
  failed: number;
  lockedOut: number;
};

function utcDate(base: Date, offsetDays: number): string {
  const t = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate() + offsetDays,
  );
  return new Date(t).toISOString().slice(0, 10);
}

@Injectable()
export class WorkDutyGenerationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkDutyGenerationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly duties: WorkDutiesService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(`Duty generation every ${TICK_INTERVAL_MS}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isEnabled(): boolean {
    return this.config.get<string>('WORK_DUTY_GENERATION_ENABLED') === 'true';
  }

  /** One pass over every tenant that has an active duty template. */
  async tick(
    options: { daysAhead?: number; now?: Date; tenantIds?: string[] } = {},
  ): Promise<DutyGenerationTick> {
    const result: DutyGenerationTick = {
      tenants: 0,
      created: 0,
      existing: 0,
      failed: 0,
      lockedOut: 0,
    };
    if (this.running) return result;
    this.running = true;
    try {
      const requested = Math.trunc(options.daysAhead ?? DEFAULT_DAYS_AHEAD);
      const days = Math.min(
        MAX_DAYS_AHEAD,
        Math.max(1, Number.isFinite(requested) ? requested : 1),
      );
      const now = options.now ?? new Date();
      const dates = Array.from({ length: days }, (_, i) => utcDate(now, i));

      let after: string | undefined;
      for (;;) {
        const batch = await this.prisma.dutyTemplate.findMany({
          where: {
            isActive: true,
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
          await this.runTenant(tenantId, dates, result);
        }
        after = batch[batch.length - 1].tenantId;
        if (batch.length < TENANT_BATCH) break;
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async runTenant(
    tenantId: string,
    dates: string[],
    result: DutyGenerationTick,
  ) {
    try {
      // The lock lives as long as this transaction. The work itself runs on its
      // own connections (and its own transactions), so a lost lock race is a skip,
      // never a deadlock.
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(
              hashtext(${`work-duty-generation:${tenantId}`})
            ) AS locked`;
          if (!rows[0]?.locked) {
            result.lockedOut += 1;
            return;
          }
          for (const date of dates) {
            const outcome = await this.duties.generateForTenantAsSystem(
              tenantId,
              date,
            );
            result.created += outcome.created.length;
            result.existing += outcome.existing.length;
          }
        },
        { timeout: LOCK_TX_TIMEOUT_MS, maxWait: 10_000 },
      );
    } catch (error) {
      result.failed += 1;
      this.logger.warn(
        `Duty generation failed for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
