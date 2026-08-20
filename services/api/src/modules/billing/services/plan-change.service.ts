import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DomainEventType,
  PlanChangeDirection,
  PlanChangeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { buildIdempotencyKey } from '../../outbox/outbox.types';

export type EntitlementImpact = {
  gained: string[];
  lost: string[];
  retained: string[];
};

export type PlanChangePreview = {
  direction: PlanChangeDirection;
  fromPlanId: string;
  toPlanId: string;
  effectiveAt: Date;
  impact: EntitlementImpact;
  /**
   * Stated explicitly because it is the question customers actually ask, and
   * because the answer must never quietly become "yes".
   */
  dataRetained: true;
};

/**
 * Moving a subscription between plans.
 *
 * Like seat changes, the direction decides the timing: an UPGRADE takes effect
 * immediately because the customer is paying more for something they want now,
 * and a DOWNGRADE takes effect at renewal because the current period is paid
 * for at the current plan.
 *
 * A DOWNGRADE NEVER DELETES MODULE DATA. It reduces which features are
 * reachable. That distinction is the single most important thing in this file:
 * a customer who downgrades and later upgrades again must find their payroll
 * history where they left it, and support must be able to say so without
 * checking. The lost feature keys are computed and frozen before the change so
 * the customer sees exactly what stops being reachable before they confirm.
 */
@Injectable()
export class PlanChangeService {
  private readonly logger = new Logger(PlanChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * What would happen, without doing it.
   *
   * The UI calls this to render the consequences screen. It is a pure read, so
   * a customer can look at a downgrade repeatedly without scheduling one.
   */
  async preview(
    tenantId: string,
    toPlanId: string,
  ): Promise<PlanChangePreview> {
    const { subscription, fromPlan, toPlan } = await this.load(
      tenantId,
      toPlanId,
    );

    const { direction } = await this.resolveDirection(
      subscription.planPriceId,
      fromPlan.id,
      toPlan.id,
    );
    const impact = await this.computeImpact(fromPlan.id, toPlan.id);

    return {
      direction,
      fromPlanId: fromPlan.id,
      toPlanId: toPlan.id,
      effectiveAt: this.resolveEffectiveAt(direction, subscription),
      impact,
      dataRetained: true,
    };
  }

  async requestChange(input: {
    tenantId: string;
    toPlanId: string;
    toPlanPriceId?: string | null;
    requestedByUserId?: string | null;
    reason?: string | null;
  }) {
    const { subscription, fromPlan, toPlan } = await this.load(
      input.tenantId,
      input.toPlanId,
    );

    const { direction, toPlanPriceId } = await this.resolveDirection(
      subscription.planPriceId,
      fromPlan.id,
      toPlan.id,
    );
    const impact = await this.computeImpact(fromPlan.id, toPlan.id);
    const effectiveAt = this.resolveEffectiveAt(direction, subscription);

    return this.prisma.$transaction(async (tx) => {
      // A second pending change would make the outcome depend on which one the
      // scheduler happened to process first.
      await tx.planChangeRequest.updateMany({
        where: {
          subscriptionId: subscription.id,
          status: PlanChangeStatus.SCHEDULED,
        },
        data: { status: PlanChangeStatus.CANCELLED },
      });

      const request = await tx.planChangeRequest.create({
        data: {
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          direction,
          fromPlanId: fromPlan.id,
          toPlanId: toPlan.id,
          toPlanPriceId: input.toPlanPriceId ?? toPlanPriceId,
          effectiveAt,
          status: PlanChangeStatus.SCHEDULED,
          // Frozen at request time. A later edit to either plan's feature set
          // must not rewrite what the customer was shown when they agreed.
          entitlementImpact: impact as unknown as Prisma.InputJsonValue,
          requestedByUserId: input.requestedByUserId ?? null,
          reason: input.reason ?? null,
        },
        select: { id: true },
      });

      let status: PlanChangeStatus = PlanChangeStatus.SCHEDULED;

      if (direction === PlanChangeDirection.UPGRADE) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: toPlan.id,
            ...((input.toPlanPriceId ?? toPlanPriceId)
              ? { planPriceId: input.toPlanPriceId ?? toPlanPriceId }
              : {}),
          },
        });
        await tx.planChangeRequest.update({
          where: { id: request.id },
          data: { status: PlanChangeStatus.APPLIED, appliedAt: new Date() },
        });
        status = PlanChangeStatus.APPLIED;
      }

      await this.outbox.emit(tx, {
        eventType: DomainEventType.PLAN_CHANGE_REQUESTED,
        idempotencyKey: buildIdempotencyKey(
          DomainEventType.PLAN_CHANGE_REQUESTED,
          request.id,
        ),
        aggregateType: 'PlanChangeRequest',
        aggregateId: request.id,
        tenantId: input.tenantId,
        payload: {
          direction,
          fromPlanId: fromPlan.id,
          toPlanId: toPlan.id,
          effectiveAt: effectiveAt.toISOString(),
          lostFeatureKeys: impact.lost,
        },
      });

      return {
        requestId: request.id,
        direction,
        status,
        effectiveAt,
        impact,
        dataRetained: true as const,
      };
    });
  }

  /** Apply downgrades whose effective date has arrived. */
  async applyDueChanges(now = new Date()): Promise<{
    applied: number;
    failed: number;
  }> {
    const due = await this.prisma.planChangeRequest.findMany({
      where: {
        status: PlanChangeStatus.SCHEDULED,
        effectiveAt: { lte: now },
      },
      select: {
        id: true,
        subscriptionId: true,
        tenantId: true,
        toPlanId: true,
        toPlanPriceId: true,
        fromPlanId: true,
        direction: true,
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
              planId: request.toPlanId,
              ...(request.toPlanPriceId
                ? { planPriceId: request.toPlanPriceId }
                : {}),
            },
          });
          await tx.planChangeRequest.update({
            where: { id: request.id },
            data: { status: PlanChangeStatus.APPLIED, appliedAt: now },
          });

          await this.outbox.emit(tx, {
            eventType: DomainEventType.PLAN_CHANGE_APPLIED,
            idempotencyKey: buildIdempotencyKey(
              DomainEventType.PLAN_CHANGE_APPLIED,
              request.id,
            ),
            aggregateType: 'PlanChangeRequest',
            aggregateId: request.id,
            tenantId: request.tenantId,
            payload: {
              direction: request.direction,
              fromPlanId: request.fromPlanId,
              toPlanId: request.toPlanId,
            },
          });
        });
        applied += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Scheduled plan change ${request.id} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { applied, failed };
  }

  /**
   * Which feature keys are gained, lost and kept.
   *
   * Read from `PlanFeature` with `isEnabled`, so a feature present but disabled
   * on the target plan counts as lost — which is what the customer experiences.
   */
  private async computeImpact(
    fromPlanId: string,
    toPlanId: string,
  ): Promise<EntitlementImpact> {
    const [fromFeatures, toFeatures] = await Promise.all([
      this.prisma.planFeature.findMany({
        where: { planId: fromPlanId, isEnabled: true, tenantId: null },
        select: { featureKey: true },
      }),
      this.prisma.planFeature.findMany({
        where: { planId: toPlanId, isEnabled: true, tenantId: null },
        select: { featureKey: true },
      }),
    ]);

    const from = new Set(fromFeatures.map((f) => f.featureKey));
    const to = new Set(toFeatures.map((f) => f.featureKey));

    return {
      gained: [...to].filter((key) => !from.has(key)).sort(),
      lost: [...from].filter((key) => !to.has(key)).sort(),
      retained: [...from].filter((key) => to.has(key)).sort(),
    };
  }

  /**
   * Upgrade or downgrade, decided from the AUTHORITATIVE price.
   *
   * Deliberately NOT `Plan.monthlyBasePrice`. That column is deprecated legacy
   * plan-level pricing and the schema says in as many words that nothing may
   * read it to decide what a customer pays — reading it here would reintroduce
   * exactly the defect BUG-0027 removed from the money path.
   *
   * The comparison is between PlanPrice unit amounts for the SAME currency and
   * billing cycle as the subscription already has, because a monthly price and
   * an annual price are not comparable numbers and neither are two currencies.
   * When no comparable price exists the direction is genuinely unknown, and
   * this refuses rather than guessing: silently classifying a move as an
   * upgrade would apply it immediately and charge for it.
   */
  private async resolveDirection(
    subscriptionPriceId: string | null,
    fromPlanId: string,
    toPlanId: string,
  ): Promise<{ direction: PlanChangeDirection; toPlanPriceId: string | null }> {
    const current = subscriptionPriceId
      ? await this.prisma.planPrice.findUnique({
          where: { id: subscriptionPriceId },
          select: {
            unitAmount: true,
            currency: true,
            billingCycle: true,
            marketId: true,
          },
        })
      : null;

    const baseline =
      current ??
      (await this.prisma.planPrice.findFirst({
        where: { planId: fromPlanId, isActive: true },
        select: {
          unitAmount: true,
          currency: true,
          billingCycle: true,
          marketId: true,
        },
        orderBy: { version: 'desc' },
      }));

    if (!baseline) {
      throw new BadRequestException(
        'This subscription has no published price, so a plan change cannot be priced.',
      );
    }

    const target = await this.prisma.planPrice.findFirst({
      where: {
        planId: toPlanId,
        isActive: true,
        currency: baseline.currency,
        billingCycle: baseline.billingCycle,
        marketId: baseline.marketId,
      },
      select: { id: true, unitAmount: true },
      orderBy: { version: 'desc' },
    });

    if (!target) {
      throw new BadRequestException(
        'That plan has no published price for this market, currency and billing cycle.',
      );
    }

    return {
      direction: target.unitAmount.greaterThanOrEqualTo(baseline.unitAmount)
        ? PlanChangeDirection.UPGRADE
        : PlanChangeDirection.DOWNGRADE,
      toPlanPriceId: target.id,
    };
  }

  private resolveEffectiveAt(
    direction: PlanChangeDirection,
    subscription: { renewalDate: Date | null; currentPeriodEnd: Date | null },
  ): Date {
    if (direction === PlanChangeDirection.UPGRADE) {
      return new Date();
    }
    return (
      subscription.renewalDate ?? subscription.currentPeriodEnd ?? new Date()
    );
  }

  private async load(tenantId: string, toPlanId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: {
        id: true,
        planId: true,
        planPriceId: true,
        renewalDate: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      throw new BadRequestException(
        'This workspace has no subscription to change.',
      );
    }

    const [fromPlan, toPlan] = await Promise.all([
      this.prisma.plan.findUniqueOrThrow({
        where: { id: subscription.planId },
        select: { id: true, name: true },
      }),
      this.prisma.plan.findUnique({
        where: { id: toPlanId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    if (!toPlan || !toPlan.isActive) {
      throw new BadRequestException('That plan is not available.');
    }

    if (toPlan.id === fromPlan.id) {
      throw new BadRequestException(
        `This workspace is already on ${fromPlan.name}.`,
      );
    }

    return { subscription, fromPlan, toPlan };
  }
}
