import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DomainEventType,
  Prisma,
  SeatOverageStatus,
  SeatUsagePeriodStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';
import { ActiveEmployeeCountService } from './active-employee-count.service';

/**
 * Overage classification thresholds.
 *
 * Defaults chosen so ordinary hiring is invisible and an import accident is
 * not. 20 → 22 is a 10% overage: recorded, warned about, billed normally.
 * 20 → 900 is 4400%: recorded and stopped for a human, because silently
 * generating an invoice for 880 phantom employees off a bad CSV is not a
 * billing policy anyone would defend afterwards.
 */
const DEFAULT_WARN_PERCENT = 10;
const DEFAULT_REVIEW_PERCENT = 100;
const DEFAULT_REVIEW_ABSOLUTE = 100;

export type SeatUsageSnapshot = {
  subscriptionId: string;
  tenantId: string;
  activeEmployeeCount: number;
  purchasedCapacity: number;
  overage: number;
  scheduledCapacity: number | null;
  scheduledCapacityEffectiveAt: Date | null;
};

@Injectable()
export class SeatUsageService {
  private readonly logger = new Logger(SeatUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly activeEmployees: ActiveEmployeeCountService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * What a tenant is using and what it bought, right now.
   *
   * Reads live rather than from the last sample: an admin screen asking "am I
   * over capacity" must not answer with yesterday's number.
   */
  async snapshot(tenantId: string): Promise<SeatUsageSnapshot | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        purchasedSeats: true,
        scheduledSeats: true,
        scheduledSeatsEffectiveAt: true,
      },
    });

    if (!subscription) {
      return null;
    }

    const activeEmployeeCount =
      await this.activeEmployees.countForTenant(tenantId);

    return {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      activeEmployeeCount,
      purchasedCapacity: subscription.purchasedSeats,
      overage: Math.max(0, activeEmployeeCount - subscription.purchasedSeats),
      scheduledCapacity: subscription.scheduledSeats,
      scheduledCapacityEffectiveAt: subscription.scheduledSeatsEffectiveAt,
    };
  }

  /**
   * Take today's measurement for every billable subscription.
   *
   * Returns per-subscription outcomes rather than throwing on the first
   * failure: one tenant's bad state must not stop the platform from measuring
   * every other tenant that day, because a missing sample is a permanent hole
   * in a billing series that cannot be reconstructed later.
   */
  async sampleAll(now = new Date()): Promise<{
    sampled: number;
    failed: number;
    overagesDetected: number;
  }> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      select: {
        id: true,
        tenantId: true,
        purchasedSeats: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    const counts = await this.activeEmployees.countForTenants(
      subscriptions.map((s) => s.tenantId),
    );

    let sampled = 0;
    let failed = 0;
    let overagesDetected = 0;

    for (const subscription of subscriptions) {
      const activeEmployeeCount = counts.get(subscription.tenantId) ?? 0;

      try {
        const result = await this.recordSample({
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          purchasedCapacity: subscription.purchasedSeats,
          activeEmployeeCount,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          now,
        });
        sampled += 1;
        if (result.overageOpened) {
          overagesDetected += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Seat sample failed for subscription ${subscription.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { sampled, failed, overagesDetected };
  }

  /**
   * Record one subscription's measurement and advance its period and overage
   * state, all in one transaction.
   *
   * One transaction because the three writes are one fact. A sample that lands
   * without its period update leaves a peak that disagrees with the samples it
   * was derived from, and that discrepancy is exactly what makes a billed
   * quantity unexplainable later.
   */
  async recordSample(input: {
    subscriptionId: string;
    tenantId: string;
    purchasedCapacity: number;
    activeEmployeeCount: number;
    periodStart: Date | null;
    periodEnd: Date | null;
    now?: Date;
  }): Promise<{ overage: number; overageOpened: boolean }> {
    const now = input.now ?? new Date();
    const sampledOn = startOfUtcDay(now);
    const overage = Math.max(
      0,
      input.activeEmployeeCount - input.purchasedCapacity,
    );

    return this.prisma.$transaction(async (tx) => {
      // Upsert, not create: a retried sampler must correct the day's row rather
      // than append a second one that would double the period's average.
      await tx.seatUsageSample.upsert({
        where: {
          subscriptionId_sampledOn: {
            subscriptionId: input.subscriptionId,
            sampledOn,
          },
        },
        create: {
          subscriptionId: input.subscriptionId,
          tenantId: input.tenantId,
          sampledOn,
          activeEmployeeCount: input.activeEmployeeCount,
          purchasedCapacity: input.purchasedCapacity,
          overage,
        },
        update: {
          activeEmployeeCount: input.activeEmployeeCount,
          purchasedCapacity: input.purchasedCapacity,
          overage,
        },
      });

      await this.advancePeriod(tx, { ...input, now });
      const overageOpened = await this.evaluateOverage(tx, {
        ...input,
        now,
        overage,
      });

      return { overage, overageOpened };
    });
  }

  /**
   * Keep the open usage period's peak and ending count current.
   *
   * The peak only ever moves up within a period. A tenant that hit 214 and fell
   * back to 180 was still a 214-employee tenant that month, and a peak that
   * tracked the latest value would quietly under-bill it.
   */
  private async advancePeriod(
    tx: Prisma.TransactionClient,
    input: {
      subscriptionId: string;
      tenantId: string;
      purchasedCapacity: number;
      activeEmployeeCount: number;
      periodStart: Date | null;
      periodEnd: Date | null;
      now: Date;
    },
  ): Promise<void> {
    // A subscription with no provider period yet still needs a usage home, or
    // its early days are unmeasured. Fall back to a month anchored on today.
    const periodStart = input.periodStart ?? startOfUtcMonth(input.now);
    const periodEnd = input.periodEnd ?? endOfUtcMonth(input.now);

    const existing = await tx.seatUsagePeriod.findUnique({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: input.subscriptionId,
          periodStart,
        },
      },
      select: { id: true, peakActiveEmployees: true, status: true },
    });

    if (!existing) {
      await tx.seatUsagePeriod.create({
        data: {
          subscriptionId: input.subscriptionId,
          tenantId: input.tenantId,
          periodStart,
          periodEnd,
          purchasedCapacity: input.purchasedCapacity,
          peakActiveEmployees: input.activeEmployeeCount,
          peakObservedOn: input.now,
          endingActiveEmployees: input.activeEmployeeCount,
          peakOverage: Math.max(
            0,
            input.activeEmployeeCount - input.purchasedCapacity,
          ),
        },
      });
      return;
    }

    // A closed period is frozen. Late samples must not rewrite figures an
    // invoice was already produced from.
    if (existing.status !== SeatUsagePeriodStatus.OPEN) {
      return;
    }

    const isNewPeak = input.activeEmployeeCount > existing.peakActiveEmployees;
    const peak = isNewPeak
      ? input.activeEmployeeCount
      : existing.peakActiveEmployees;

    await tx.seatUsagePeriod.update({
      where: { id: existing.id },
      data: {
        purchasedCapacity: input.purchasedCapacity,
        peakActiveEmployees: peak,
        ...(isNewPeak ? { peakObservedOn: input.now } : {}),
        endingActiveEmployees: input.activeEmployeeCount,
        peakOverage: Math.max(0, peak - input.purchasedCapacity),
      },
    });
  }

  /**
   * Open, update or resolve the overage episode for this subscription.
   *
   * An episode rather than a per-day flag: a tenant three over capacity for a
   * fortnight is one conversation, and fourteen rows would make it look like
   * fourteen incidents.
   *
   * Returns whether a new episode was opened, so the caller can report how many
   * genuinely new overages a sampling run found.
   */
  private async evaluateOverage(
    tx: Prisma.TransactionClient,
    input: {
      subscriptionId: string;
      tenantId: string;
      purchasedCapacity: number;
      activeEmployeeCount: number;
      overage: number;
      now: Date;
    },
  ): Promise<boolean> {
    const open = await tx.seatOverageEvent.findFirst({
      where: { subscriptionId: input.subscriptionId, resolvedAt: null },
      select: {
        id: true,
        peakActiveEmployees: true,
        status: true,
      },
    });

    if (input.overage === 0) {
      if (open) {
        await tx.seatOverageEvent.update({
          where: { id: open.id },
          data: {
            resolvedAt: input.now,
            // A REVIEW_REQUIRED episode that resolves itself still needs a
            // human verdict on what was billed, so its status is preserved.
            status:
              open.status === SeatOverageStatus.REVIEW_REQUIRED
                ? open.status
                : SeatOverageStatus.RESOLVED,
          },
        });
      }
      return false;
    }

    const overagePercent = percentOver(input.overage, input.purchasedCapacity);
    const status = this.classify(input.overage, overagePercent);

    if (open) {
      const peak = Math.max(
        open.peakActiveEmployees,
        input.activeEmployeeCount,
      );
      await tx.seatOverageEvent.update({
        where: { id: open.id },
        data: {
          peakActiveEmployees: peak,
          peakOverage: Math.max(0, peak - input.purchasedCapacity),
          peakOveragePercent: percentOver(
            Math.max(0, peak - input.purchasedCapacity),
            input.purchasedCapacity,
          ),
          // Severity only escalates within an episode. Dropping from
          // REVIEW_REQUIRED back to WARNED because today's count dipped would
          // discard the reason a human was asked to look.
          status: escalate(open.status, status),
        },
      });
      return false;
    }

    const created = await tx.seatOverageEvent.create({
      data: {
        subscriptionId: input.subscriptionId,
        tenantId: input.tenantId,
        purchasedCapacity: input.purchasedCapacity,
        activeEmployeeCount: input.activeEmployeeCount,
        peakActiveEmployees: input.activeEmployeeCount,
        peakOverage: input.overage,
        peakOveragePercent: overagePercent,
        status,
        detectedAt: input.now,
      },
      select: { id: true },
    });

    // Announced in the same transaction that recorded it, so a notification or
    // a billing consumer cannot be scheduled for an overage that rolled back.
    await this.outbox.emit(tx, {
      eventType: DomainEventType.SEAT_OVERAGE_DETECTED,
      idempotencyKey: buildIdempotencyKey(
        DomainEventType.SEAT_OVERAGE_DETECTED,
        created.id,
      ),
      aggregateType: 'SeatOverageEvent',
      aggregateId: created.id,
      tenantId: input.tenantId,
      payload: {
        subscriptionId: input.subscriptionId,
        purchasedCapacity: input.purchasedCapacity,
        activeEmployeeCount: input.activeEmployeeCount,
        overage: input.overage,
        overagePercent,
        status,
      },
    });

    return true;
  }

  /**
   * Decide how serious an overage is.
   *
   * Both an absolute and a proportional threshold, because neither alone is
   * right: 5 over on a capacity of 5 is a doubling and worth a look, while 5
   * over on a capacity of 2,000 is noise. The absolute threshold catches a
   * large jump on a large tenant that a percentage would wave through.
   */
  private classify(overage: number, overagePercent: number): SeatOverageStatus {
    if (
      overagePercent >=
        this.threshold('SEAT_OVERAGE_REVIEW_PERCENT', DEFAULT_REVIEW_PERCENT) ||
      overage >=
        this.threshold('SEAT_OVERAGE_REVIEW_ABSOLUTE', DEFAULT_REVIEW_ABSOLUTE)
    ) {
      return SeatOverageStatus.REVIEW_REQUIRED;
    }

    if (
      overagePercent >=
      this.threshold('SEAT_OVERAGE_WARN_PERCENT', DEFAULT_WARN_PERCENT)
    ) {
      return SeatOverageStatus.WARNED;
    }

    return SeatOverageStatus.OBSERVED;
  }

  private threshold(key: string, fallback: number): number {
    const raw = Number(this.configService.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }
}

function percentOver(overage: number, capacity: number): number {
  if (capacity <= 0) {
    // Capacity of zero with anyone active is unbounded overage, not a division
    // by zero. Reported as 100% rather than Infinity so the column stays an Int.
    return overage > 0 ? 100 : 0;
  }
  return Math.round((overage / capacity) * 100);
}

const SEVERITY: Record<SeatOverageStatus, number> = {
  [SeatOverageStatus.OBSERVED]: 0,
  [SeatOverageStatus.RESOLVED]: 0,
  [SeatOverageStatus.WARNED]: 1,
  [SeatOverageStatus.ACCEPTED]: 1,
  [SeatOverageStatus.REVIEW_REQUIRED]: 2,
};

function escalate(
  current: SeatOverageStatus,
  candidate: SeatOverageStatus,
): SeatOverageStatus {
  // ACCEPTED is a human verdict and is never overwritten by the sampler.
  if (current === SeatOverageStatus.ACCEPTED) {
    return current;
  }
  return SEVERITY[candidate] > SEVERITY[current] ? candidate : current;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
