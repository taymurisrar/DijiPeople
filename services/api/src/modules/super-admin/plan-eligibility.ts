import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Who a plan may be offered to, and when.
 *
 * Custom plans (see `PlanKind`) can be tied to one customer and bounded by a
 * contractual validity window. Both limits are enforced where a plan is chosen for a
 * customer and where plans are listed publicly, and both are independent of what
 * the plan's features entitle a tenant to once it is on the plan.
 */
export function publiclyOfferablePlanWhere(
  now: Date = new Date(),
): Prisma.PlanWhereInput {
  return {
    eligibleCustomerAccountId: null,
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
      { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
    ],
  };
}

type PlanEligibilityFields = {
  name: string;
  eligibleCustomerAccountId: string | null;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
};

/** Throws when `plan` may not be placed on `customerAccountId` right now. */
export function assertPlanAssignable(
  plan: PlanEligibilityFields,
  customerAccountId: string,
  now: Date = new Date(),
) {
  if (
    plan.eligibleCustomerAccountId &&
    plan.eligibleCustomerAccountId !== customerAccountId
  ) {
    throw new BadRequestException(
      `"${plan.name}" is reserved for another customer and cannot be assigned here.`,
    );
  }
  if (plan.effectiveFrom && plan.effectiveFrom > now) {
    throw new BadRequestException(
      `"${plan.name}" is not valid until ${plan.effectiveFrom.toISOString().slice(0, 10)}.`,
    );
  }
  if (plan.effectiveUntil && plan.effectiveUntil <= now) {
    throw new BadRequestException(
      `"${plan.name}" expired on ${plan.effectiveUntil.toISOString().slice(0, 10)}.`,
    );
  }
}

type EligibilityDb = Pick<PrismaClient, 'tenant' | 'subscription' | 'plan'>;

/**
 * The one rule behind every way of moving a tenant onto a plan (DP-QA-043).
 *
 * Assignment was checked at tenant creation, on customer select and in the public
 * catalogue, but not by the operator subscription PATCH, which wrote straight
 * through `createOrUpdateSubscription`. The rule now lives where every assignment
 * lands, so a new caller cannot forget it.
 *
 * What it deliberately does NOT do: it never re-judges a subscription that stays on
 * its current plan. A plan reserved for another customer, expired or withdrawn is
 * still a perfectly valid thing for its existing subscriber to be on (an operator
 * changing the billing cycle or seats of a legacy-contract tenant must keep
 * working); only a MOVE onto a plan is checked.
 *
 * `opaque` is for tenant-initiated callers: they must not learn that a plan exists
 * but is reserved for somebody else.
 */
export async function assertPlanAssignableToTenant(
  db: EligibilityDb,
  tenantId: string,
  planId: string,
  options: { opaque?: boolean; now?: Date } = {},
) {
  const [tenant, current, plan] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { customerAccountId: true },
    }),
    db.subscription.findUnique({
      where: { tenantId },
      select: { planId: true },
    }),
    db.plan.findUnique({
      where: { id: planId },
      select: {
        name: true,
        kind: true,
        salesModel: true,
        eligibleCustomerAccountId: true,
        effectiveFrom: true,
        effectiveUntil: true,
      },
    }),
  ]);
  // Missing rows are reported by the caller's own not-found handling.
  if (!tenant || !plan) return;
  if (current?.planId === planId) return;

  try {
    assertPlanAssignable(plan, tenant.customerAccountId, options.now);
  } catch (error) {
    if (options.opaque) {
      throw new BadRequestException('That plan is not available.');
    }
    throw error;
  }
}
