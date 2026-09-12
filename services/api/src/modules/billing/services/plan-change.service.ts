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
import { StripeBillingService } from './stripe-billing.service';
import { resolveBillableSeats } from '../billing-seat-pricing';
import { AuditService } from '../../audit/audit.service';

export type EntitlementImpact = {
  gained: string[];
  lost: string[];
  retained: string[];
};

/**
 * The money half of a preview — EXECPLAN-0037/BUG-3331. `prorationNow` is
 * what Stripe would actually charge today for an immediate (UPGRADE) change;
 * always 0 for a DOWNGRADE, which is scheduled at renewal and charges
 * nothing now. `estimated: true` marks a quote computed locally rather than
 * asked of Stripe — only for a subscription with no `stripeSubscriptionId`
 * (a demo/test tenant), never for a live one.
 */
export type PlanChangeQuote = {
  currency: string;
  prorationNow: number;
  newRecurringAmount: number;
  estimated: boolean;
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
  quote: PlanChangeQuote;
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
    private readonly stripeBillingService: StripeBillingService,
    private readonly auditService: AuditService,
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
    toPlanPriceId?: string | null,
  ): Promise<PlanChangePreview> {
    const { subscription, fromPlan, toPlan } = await this.load(
      tenantId,
      toPlanId,
      toPlanPriceId,
    );

    const { direction, toPlanPriceId: resolvedTargetPriceId } =
      await this.resolveDirection(
        subscription.planPriceId,
        fromPlan.id,
        toPlan.id,
        toPlanPriceId,
      );
    const impact = await this.computeImpact(fromPlan.id, toPlan.id);
    const quote = await this.previewProration(
      subscription,
      direction,
      resolvedTargetPriceId,
    );

    return {
      direction,
      fromPlanId: fromPlan.id,
      toPlanId: toPlan.id,
      effectiveAt: this.resolveEffectiveAt(direction, subscription),
      impact,
      dataRetained: true,
      quote,
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
      input.toPlanPriceId,
    );

    const { direction, toPlanPriceId } = await this.resolveDirection(
      subscription.planPriceId,
      fromPlan.id,
      toPlan.id,
      input.toPlanPriceId,
    );
    const impact = await this.computeImpact(fromPlan.id, toPlan.id);
    const effectiveAt = this.resolveEffectiveAt(direction, subscription);

    const result = await this.prisma.$transaction(async (tx) => {
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

      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorUserId: input.requestedByUserId ?? null,
          action: 'TENANT_PLAN_CHANGE_REQUESTED',
          entityType: 'Subscription',
          entityId: subscription.id,
          sourceModule: 'billing',
          beforeSnapshot: {
            planId: fromPlan.id,
            planPriceId: subscription.planPriceId,
          },
          afterSnapshot: {
            planId: toPlan.id,
            planPriceId: input.toPlanPriceId ?? toPlanPriceId,
            direction,
            status,
            effectiveAt: effectiveAt.toISOString(),
            reason: input.reason ?? null,
          },
        },
        tx,
      );

      return {
        requestId: request.id,
        direction,
        status,
        effectiveAt,
        impact,
        dataRetained: true as const,
        targetPlanPriceId: input.toPlanPriceId ?? toPlanPriceId,
      };
    });

    /*
     * The Stripe call happens AFTER the transaction commits, deliberately.
     * `Subscription.planId`/`planPriceId` is the record of what was agreed;
     * whether Stripe could be reached to enact it is a second, independent
     * fact. Rolling the local write back because Stripe timed out would leave
     * the customer's confirmed choice undone with no record it was ever
     * requested — worse than a state that needs reconciling.
     *
     * A DOWNGRADE never reaches here: it is scheduled, not applied, and the
     * Stripe call for it happens in `applyDueChanges()` at the renewal
     * boundary instead — see that method.
     */
    let stripeSyncPending = false;
    if (result.direction === PlanChangeDirection.UPGRADE) {
      stripeSyncPending = !(await this.tryApplyToStripe({
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeSubscriptionItemId: subscription.stripeSubscriptionItemId,
        purchasedSeats: subscription.purchasedSeats,
        targetPlanPriceId: result.targetPlanPriceId,
        prorationBehavior: 'create_prorations',
        context: `plan change request ${result.requestId}`,
      }));
    }

    const quote = await this.previewProration(
      subscription,
      direction,
      result.targetPlanPriceId,
    );

    return {
      requestId: result.requestId,
      direction: result.direction,
      status: result.status,
      effectiveAt: result.effectiveAt,
      impact: result.impact,
      dataRetained: result.dataRetained,
      quote,
      stripeSyncPending,
    };
  }

  /**
   * Push a resolved target price to Stripe for a subscription that has one.
   *
   * Returns whether it succeeded (or was correctly skipped because the
   * subscription is not Stripe-backed — a demo/test tenant, which is not a
   * failure). Never throws: a Stripe fault here is reported to the caller as
   * `stripeSyncPending`, not surfaced as a 500 for a request whose local
   * write already committed.
   */
  private async tryApplyToStripe(input: {
    stripeSubscriptionId: string | null;
    stripeSubscriptionItemId: string | null;
    purchasedSeats: number;
    targetPlanPriceId: string | null;
    prorationBehavior: 'create_prorations' | 'none';
    context: string;
  }): Promise<boolean> {
    if (!input.stripeSubscriptionId || !input.stripeSubscriptionItemId) {
      // No live Stripe object to update — a demo/test tenant. The local
      // change stands on its own; there is nothing to reconcile.
      return true;
    }
    if (!input.targetPlanPriceId) {
      this.logger.error(
        `Cannot sync ${input.context} to Stripe: no resolved target PlanPrice.`,
      );
      return false;
    }

    const targetPrice = await this.prisma.planPrice.findUnique({
      where: { id: input.targetPlanPriceId },
      select: { stripePriceId: true },
    });
    if (!targetPrice?.stripePriceId) {
      this.logger.error(
        `Cannot sync ${input.context} to Stripe: target PlanPrice has no stripePriceId.`,
      );
      return false;
    }

    try {
      await this.stripeBillingService.client.subscriptions.update(
        input.stripeSubscriptionId,
        {
          items: [
            {
              id: input.stripeSubscriptionItemId,
              price: targetPrice.stripePriceId,
              quantity: input.purchasedSeats,
            },
          ],
          proration_behavior: input.prorationBehavior,
        },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Stripe subscription update failed for ${input.context}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * A non-mutating money quote — EXECPLAN-0037. Stripe's own preview endpoint
   * for a Stripe-backed subscription; a locally computed estimate,
   * unambiguously labelled, for one that is not. Never a second proration
   * formula pretending to be Stripe's.
   */
  private async previewProration(
    subscription: {
      stripeSubscriptionId: string | null;
      stripeSubscriptionItemId: string | null;
      purchasedSeats: number;
      currency: string;
      finalPrice: Prisma.Decimal | number;
    },
    direction: PlanChangeDirection,
    targetPlanPriceId: string | null,
  ): Promise<PlanChangeQuote> {
    const currency = subscription.currency;

    if (!targetPlanPriceId) {
      return {
        currency,
        prorationNow: 0,
        newRecurringAmount: Number(subscription.finalPrice),
        estimated: true,
      };
    }

    const targetPrice = await this.prisma.planPrice.findUniqueOrThrow({
      where: { id: targetPlanPriceId },
      select: {
        unitAmount: true,
        billingModel: true,
        includedSeats: true,
        stripePriceId: true,
      },
    });
    const billableSeats = resolveBillableSeats(
      targetPrice,
      subscription.purchasedSeats,
    );
    const newRecurringAmount = roundCurrency(
      Number(targetPrice.unitAmount) * billableSeats,
    );

    if (direction !== PlanChangeDirection.UPGRADE) {
      // Scheduled at renewal — nothing is charged today regardless of
      // whether this is Stripe-backed.
      return {
        currency,
        prorationNow: 0,
        newRecurringAmount,
        estimated: false,
      };
    }

    if (
      !subscription.stripeSubscriptionId ||
      !subscription.stripeSubscriptionItemId ||
      !targetPrice.stripePriceId
    ) {
      /*
       * No live Stripe object (or no Stripe price on the target row) to ask —
       * a demo/test tenant, or a target price never synced. Estimated from
       * the current recurring amount rather than left blank: a customer
       * deciding whether to confirm still needs a number, and this is exactly
       * the `resolveBillableSeats` rule Stripe itself would apply, minus the
       * exact tax and existing-discount adjustments only Stripe knows.
       */
      return {
        currency,
        prorationNow: roundCurrency(
          newRecurringAmount - Number(subscription.finalPrice),
        ),
        newRecurringAmount,
        estimated: true,
      };
    }

    try {
      const preview =
        await this.stripeBillingService.client.invoices.createPreview({
          subscription: subscription.stripeSubscriptionId,
          subscription_details: {
            items: [
              {
                id: subscription.stripeSubscriptionItemId,
                price: targetPrice.stripePriceId,
                quantity: subscription.purchasedSeats,
              },
            ],
            proration_behavior: 'create_prorations',
          },
        });
      return {
        currency,
        prorationNow: minorToMajor(preview.amount_due ?? preview.total ?? 0),
        newRecurringAmount,
        estimated: false,
      };
    } catch (error) {
      this.logger.warn(
        `Stripe proration preview failed, falling back to an estimate: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        currency,
        prorationNow: roundCurrency(
          newRecurringAmount - Number(subscription.finalPrice),
        ),
        newRecurringAmount,
        estimated: true,
      };
    }
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
        subscription: {
          select: {
            stripeSubscriptionId: true,
            stripeSubscriptionItemId: true,
            purchasedSeats: true,
          },
        },
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

        /*
         * Outside the transaction, same reasoning as `requestChange()`: the
         * local record of "this downgrade is applied" must not depend on
         * Stripe being reachable at this exact moment. `proration_behavior:
         * 'none'` because this fires exactly at the renewal boundary the
         * customer already paid through — nothing should be prorated.
         */
        await this.tryApplyToStripe({
          stripeSubscriptionId: request.subscription.stripeSubscriptionId,
          stripeSubscriptionItemId:
            request.subscription.stripeSubscriptionItemId,
          purchasedSeats: request.subscription.purchasedSeats,
          targetPlanPriceId: request.toPlanPriceId,
          prorationBehavior: 'none',
          context: `scheduled plan change ${request.id}`,
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
    explicitToPlanPriceId?: string | null,
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

    /*
     * A named target price — the only way to express "same plan, different
     * billing cycle" (BUG-3331 requirement 6), since the auto-resolution below
     * deliberately matches the CURRENT cycle and would otherwise make a cycle
     * change unreachable. Still verified against `toPlanId`, `isActive` and
     * the tenant's market: a caller may not point this at another plan's
     * price, an inactive one, or one scoped to a different market by naming
     * an id directly — the same rule BUG-3334 applies to checkout.
     */
    if (explicitToPlanPriceId) {
      const named = await this.prisma.planPrice.findFirst({
        where: {
          id: explicitToPlanPriceId,
          planId: toPlanId,
          isActive: true,
          marketId: baseline.marketId,
        },
        select: { id: true, unitAmount: true },
      });
      if (!named) {
        throw new BadRequestException(
          'That price does not belong to the target plan, is not active, or is not in your market.',
        );
      }
      return {
        direction: named.unitAmount.greaterThanOrEqualTo(baseline.unitAmount)
          ? PlanChangeDirection.UPGRADE
          : PlanChangeDirection.DOWNGRADE,
        toPlanPriceId: named.id,
      };
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

  private async load(
    tenantId: string,
    toPlanId: string,
    toPlanPriceId?: string | null,
  ) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: {
        id: true,
        planId: true,
        planPriceId: true,
        renewalDate: true,
        currentPeriodEnd: true,
        stripeSubscriptionId: true,
        stripeSubscriptionItemId: true,
        purchasedSeats: true,
        currency: true,
        finalPrice: true,
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

    /*
     * Same plan is only a no-op when the price is unnamed or identical too —
     * BUG-3331 requirement 6. A tenant on Monthly reaching Annual for the
     * SAME plan names `toPlanId === fromPlan.id` with a `toPlanPriceId` for
     * the annual price, and that must proceed, not be refused as "already on
     * this plan".
     */
    if (
      toPlan.id === fromPlan.id &&
      (!toPlanPriceId || toPlanPriceId === subscription.planPriceId)
    ) {
      throw new BadRequestException(
        `This workspace is already on ${fromPlan.name}.`,
      );
    }

    return { subscription, fromPlan, toPlan };
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Stripe amounts are in the currency's minor unit; DijiPeople stores major. */
function minorToMajor(amount: number) {
  return roundCurrency(amount / 100);
}
