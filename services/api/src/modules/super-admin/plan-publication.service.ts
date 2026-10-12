import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialPublicationStatus,
  CommercialSalesModel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';

export type PlanPublicationAction = 'publish' | 'unpublish' | 'archive';

export const PLAN_PUBLICATION_ACTIONS: readonly PlanPublicationAction[] = [
  'publish',
  'unpublish',
  'archive',
];

export function isPlanPublicationAction(
  action: string,
): action is PlanPublicationAction {
  return (PLAN_PUBLICATION_ACTIONS as readonly string[]).includes(action);
}

const { DRAFT, PUBLISHED, ARCHIVED } = CommercialPublicationStatus;

/**
 * Which transition each action makes, and from where (ITEM-0022, EXECPLAN-0034
 * for plans; prices are not covered here).
 *
 * - **Publish** `DRAFT → PUBLISHED`: the plan appears on the pricing page and
 *   can be bought.
 * - **Unpublish** `PUBLISHED → DRAFT`: withdrawn from the pricing page and from
 *   new checkouts, and may be published again. Added on 2026-10-12 at the
 *   owner's request: a published plan could not be taken down at all, so the
 *   delete rule's "unpublish or archive it first" pointed at nothing.
 * - **Archive** `DRAFT | PUBLISHED → ARCHIVED`: retired for good.
 *   `ARCHIVED → PUBLISHED` is refused, as the ExecPlan decides — create a new
 *   plan instead.
 *
 * Publication gates only new purchases (public onboarding and both checkout
 * paths). Existing subscriptions keep their plan, price and renewals whatever
 * the plan's publication becomes.
 */
const TRANSITIONS: Record<
  PlanPublicationAction,
  { from: CommercialPublicationStatus[]; to: CommercialPublicationStatus }
> = {
  publish: { from: [DRAFT], to: PUBLISHED },
  unpublish: { from: [PUBLISHED], to: DRAFT },
  archive: { from: [DRAFT, PUBLISHED], to: ARCHIVED },
};

const AUDIT_ACTION: Record<PlanPublicationAction, string> = {
  publish: 'PLAN_PUBLISHED',
  unpublish: 'PLAN_UNPUBLISHED',
  archive: 'PLAN_ARCHIVED',
};

type PlanState = {
  name: string;
  isActive: boolean;
  publicationStatus: CommercialPublicationStatus;
  salesModel: CommercialSalesModel;
  publishedPrices: number;
};

/** Pure: why `action` may not be applied to `plan`, or null when it may. */
export function planPublicationRefusal(
  action: PlanPublicationAction,
  plan: PlanState,
): string | null {
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(plan.publicationStatus)) {
    if (action === 'publish' && plan.publicationStatus === ARCHIVED)
      return 'An archived plan cannot be published again. Create a new plan instead.';
    return `The plan is ${plan.publicationStatus.toLowerCase()}, so it cannot be ${
      action === 'publish'
        ? 'published'
        : action === 'unpublish'
          ? 'unpublished'
          : 'archived'
    }.`;
  }
  if (action === 'publish') {
    if (!plan.isActive)
      return 'Activate the plan before publishing it; an inactive plan cannot be sold.';
    /*
     * A custom-quote plan is listed without a price ("contact sales"). Any
     * other sales model is bought at a price, and publishing one with no
     * published price advertises a plan nobody can buy (BUG-1749).
     */
    if (
      plan.salesModel !== CommercialSalesModel.CUSTOM_ONLY &&
      plan.publishedPrices === 0
    )
      return 'Publish at least one price first; customers could not buy this plan.';
  }
  return null;
}

@Injectable()
export class PlanPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async transition(
    actor: AuthenticatedUser,
    planId: string,
    action: PlanPublicationAction,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Locked so two operators cannot publish and archive at once.
      await tx.$queryRaw`SELECT "id" FROM "Plan" WHERE "id" = ${planId} FOR UPDATE`;
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          key: true,
          name: true,
          isActive: true,
          publicationStatus: true,
          salesModel: true,
          publishedAt: true,
          archivedAt: true,
          _count: {
            select: { prices: { where: { publicationStatus: PUBLISHED } } },
          },
        },
      });
      if (!plan) throw new NotFoundException('Plan not found.');

      const refusal = planPublicationRefusal(action, {
        ...plan,
        publishedPrices: plan._count.prices,
      });
      if (refusal) throw new BadRequestException(`"${plan.name}": ${refusal}`);

      const now = new Date();
      const to = TRANSITIONS[action].to;
      const updated = await tx.plan.update({
        where: { id: planId },
        data: {
          publicationStatus: to,
          // First publication is stamped once; later re-publishes keep it.
          ...(to === PUBLISHED && !plan.publishedAt
            ? { publishedAt: now, publishedById: actor.userId }
            : {}),
          ...(to === ARCHIVED ? { archivedAt: now } : {}),
          updatedById: actor.userId,
        },
        select: {
          id: true,
          publicationStatus: true,
          publishedAt: true,
          archivedAt: true,
        },
      });

      await this.auditService.log(
        {
          tenantId: 'platform',
          actorUserId: actor.userId,
          action: AUDIT_ACTION[action],
          entityType: 'Plan',
          entityId: planId,
          sourceModule: 'super-admin',
          beforeSnapshot: {
            key: plan.key,
            publicationStatus: plan.publicationStatus,
          },
          afterSnapshot: { publicationStatus: updated.publicationStatus },
        },
        tx,
      );

      return {
        success: true,
        message:
          action === 'publish'
            ? `${plan.name} is published and can be bought.`
            : action === 'unpublish'
              ? `${plan.name} is unpublished. It is off the pricing page; existing subscriptions are unaffected.`
              : `${plan.name} is archived. Existing subscriptions are unaffected.`,
        data: updated,
      };
    });
  }
}
