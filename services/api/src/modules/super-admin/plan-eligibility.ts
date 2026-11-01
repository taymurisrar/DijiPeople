import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

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
