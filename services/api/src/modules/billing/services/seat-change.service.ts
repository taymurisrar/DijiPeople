import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DomainEventType,
  SeatChangeDirection,
  SeatChangeStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';
import { ActiveEmployeeCountService } from './active-employee-count.service';

export type RequestSeatChangeInput = {
  tenantId: string;
  toSeats: number;
  requestedByUserId?: string | null;
  reason?: string | null;
};

export type SeatChangeResult = {
  requestId: string;
  direction: SeatChangeDirection;
  fromSeats: number;
  toSeats: number;
  status: SeatChangeStatus;
  effectiveAt: Date;
  /** True when capacity moved now; false when it is scheduled for renewal. */
  appliedImmediately: boolean;
};

/**
 * Seat capacity changes.
 *
 * THE ASYMMETRY IS THE POINT. An increase is immediate — somebody hired people
 * and needs them working today. A decrease takes effect at the renewal date,
 * because the customer already paid for this period's capacity and reducing it
 * mid-period would either give away a refund nobody approved or silently take
 * away capacity that was paid for.
 *
 * Nothing here writes `purchasedSeats` without a `SeatChangeRequest` beside it.
 * A bare column write cannot answer "who reduced our capacity and when", which
 * is the first question asked when somebody cannot log in.
 */
@Injectable()
export class SeatChangeService {
  private readonly logger = new Logger(SeatChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly activeEmployees: ActiveEmployeeCountService,
  ) {}

  async requestChange(
    input: RequestSeatChangeInput,
  ): Promise<SeatChangeResult> {
    if (!Number.isInteger(input.toSeats) || input.toSeats < 1) {
      throw new BadRequestException('Seat count must be a positive integer.');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: input.tenantId },
      select: {
        id: true,
        tenantId: true,
        purchasedSeats: true,
        scheduledSeats: true,
        renewalDate: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      throw new BadRequestException(
        'This workspace has no subscription to change.',
      );
    }

    const fromSeats = subscription.purchasedSeats;
    if (input.toSeats === fromSeats) {
      throw new BadRequestException(`Capacity is already ${fromSeats} seats.`);
    }

    const direction =
      input.toSeats > fromSeats
        ? SeatChangeDirection.INCREASE
        : SeatChangeDirection.DECREASE;

    if (direction === SeatChangeDirection.DECREASE) {
      // Refusing to schedule a decrease below the people already working is
      // kinder than accepting it and locking them out at renewal, when nobody
      // will remember this request.
      const activeEmployees = await this.activeEmployees.countForTenant(
        input.tenantId,
      );
      if (input.toSeats < activeEmployees) {
        throw new BadRequestException(
          `Cannot reduce capacity to ${input.toSeats}: ${activeEmployees} employees are currently active. Deactivate employees first, or the reduction would lock them out at renewal.`,
        );
      }
    }

    const effectiveAt =
      direction === SeatChangeDirection.INCREASE
        ? new Date()
        : (subscription.renewalDate ??
          subscription.currentPeriodEnd ??
          new Date());

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.seatChangeRequest.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          direction,
          fromSeats,
          toSeats: input.toSeats,
          effectiveAt,
          status: SeatChangeStatus.SCHEDULED,
          requestedByUserId: input.requestedByUserId ?? null,
          reason: input.reason ?? null,
        },
        select: { id: true },
      });

      let status: SeatChangeStatus = SeatChangeStatus.SCHEDULED;
      let appliedImmediately = false;

      if (direction === SeatChangeDirection.INCREASE) {
        // Capacity moves now, and any pending decrease is withdrawn — a
        // customer who scheduled a reduction and then grew has changed their
        // mind, and leaving the old decrease to fire at renewal would undo the
        // increase they just paid for.
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            purchasedSeats: input.toSeats,
            scheduledSeats: null,
            scheduledSeatsEffectiveAt: null,
          },
        });
        await tx.seatChangeRequest.updateMany({
          where: {
            subscriptionId: subscription.id,
            status: SeatChangeStatus.SCHEDULED,
            direction: SeatChangeDirection.DECREASE,
          },
          data: { status: SeatChangeStatus.CANCELLED },
        });
        await tx.seatChangeRequest.update({
          where: { id: request.id },
          data: { status: SeatChangeStatus.APPLIED, appliedAt: new Date() },
        });
        status = SeatChangeStatus.APPLIED;
        appliedImmediately = true;
      } else {
        // Recorded as the future capacity. `purchasedSeats` is untouched, so
        // entitlement for the rest of the paid period is exactly what was paid
        // for.
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            scheduledSeats: input.toSeats,
            scheduledSeatsEffectiveAt: effectiveAt,
          },
        });
      }

      await this.outbox.emit(tx, {
        eventType: DomainEventType.SEAT_CHANGE_REQUESTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.SEAT_CHANGE_REQUESTED,
          request.id,
        ),
        aggregateType: 'SeatChangeRequest',
        aggregateId: request.id,
        tenantId: subscription.tenantId,
        payload: {
          direction,
          fromSeats,
          toSeats: input.toSeats,
          effectiveAt: effectiveAt.toISOString(),
          appliedImmediately,
        },
      });

      return {
        requestId: request.id,
        direction,
        fromSeats,
        toSeats: input.toSeats,
        status,
        effectiveAt,
        appliedImmediately,
      };
    });
  }

  /**
   * Apply decreases whose effective date has arrived.
   *
   * Runs from a scheduler. Each request is applied in its own transaction so
   * one tenant's failure does not strand every later tenant's renewal.
   */
  async applyDueChanges(now = new Date()): Promise<{
    applied: number;
    failed: number;
  }> {
    const due = await this.prisma.seatChangeRequest.findMany({
      where: {
        status: SeatChangeStatus.SCHEDULED,
        direction: SeatChangeDirection.DECREASE,
        effectiveAt: { lte: now },
      },
      select: {
        id: true,
        subscriptionId: true,
        tenantId: true,
        toSeats: true,
        fromSeats: true,
      },
    });

    let applied = 0;
    let failed = 0;

    for (const request of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: request.subscriptionId },
            data: {
              purchasedSeats: request.toSeats,
              scheduledSeats: null,
              scheduledSeatsEffectiveAt: null,
            },
          });
          await tx.seatChangeRequest.update({
            where: { id: request.id },
            data: { status: SeatChangeStatus.APPLIED, appliedAt: now },
          });

          await this.outbox.emit(tx, {
            eventType: DomainEventType.SEAT_CHANGE_APPLIED,
            idempotencyKey: buildIdempotencyKey(
              DomainEventType.SEAT_CHANGE_APPLIED,
              request.id,
            ),
            aggregateType: 'SeatChangeRequest',
            aggregateId: request.id,
            tenantId: request.tenantId,
            payload: {
              fromSeats: request.fromSeats,
              toSeats: request.toSeats,
              direction: SeatChangeDirection.DECREASE,
            },
          });
        });
        applied += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Scheduled seat change ${request.id} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { applied, failed };
  }

  /** What the tenant should be shown: current capacity and any pending change. */
  async describeCapacity(tenantId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: {
        purchasedSeats: true,
        scheduledSeats: true,
        scheduledSeatsEffectiveAt: true,
      },
    });

    if (!subscription) {
      return null;
    }

    const activeEmployees = await this.activeEmployees.countForTenant(tenantId);

    return {
      currentCapacity: subscription.purchasedSeats,
      activeEmployees,
      // Named "scheduled", not "pending": the customer agreed to it, and it
      // will happen unless they change it again.
      scheduledCapacity: subscription.scheduledSeats,
      scheduledEffectiveAt: subscription.scheduledSeatsEffectiveAt,
    };
  }
}
