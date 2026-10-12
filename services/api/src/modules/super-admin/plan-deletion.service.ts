import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommercialPublicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  blocksDelete,
  buildDependencyReport,
  describeDeleteOutcome,
  isForeignKeyViolation,
  NO_LONGER_EXISTS,
  pluralCount,
  type DeleteRefusal,
  type RecordDependency,
  type RecordDependencyProvider,
  type RecordDependencyReport,
} from '../../common/deletion/record-dependencies';
import { AuditService } from '../audit/audit.service';

export const PLAN_DEPENDENCY_COUNT_SELECT = {
  subscriptions: true,
  subscriptionOrders: true,
  planChangesFrom: true,
  planChangesTo: true,
  prices: true,
  features: true,
  selectedByCustomers: true,
  selectedByOnboardings: true,
  agreedByLeads: true,
  promotions: true,
} satisfies Prisma.PlanCountOutputTypeSelect;

export type PlanFacts = {
  id: string;
  isActive: boolean;
  publicationStatus: CommercialPublicationStatus;
  counts: Record<keyof typeof PLAN_DEPENDENCY_COUNT_SELECT, number>;
};

/**
 * When a plan may be permanently deleted (owner decision, 2026-10-12).
 *
 * - **Live** — active or published. Deactivate or archive it first, so a plan
 *   never vanishes from the pricing page and the checkout in one click.
 * - **Sold** (`RETAIN`) — a subscription, a subscription order or a plan
 *   change ever referenced it. That is billing history; invoices and payments
 *   hang off those subscriptions. Archive instead.
 * - **Configuration** (`CASCADE`) — its prices and feature entitlements belong
 *   to it and go with it. This replaces BUG-1749's "refuse once priced": the
 *   dialog now names the prices before anybody confirms, so nothing is silent.
 * - **Preferences** (`DETACH`) — customers, onboardings and leads that merely
 *   prefer the plan, and promotions scoped to it, have the link cleared
 *   (`SetNull` in the schema). A PLAN-scoped promotion with no plan matches
 *   nothing, so clearing it narrows the promotion rather than widening it.
 */
export function classifyPlanDependencies(facts: PlanFacts): RecordDependency[] {
  const { counts } = facts;
  const href = `/plans/${facts.id}`;
  const dep = (
    key: string,
    label: string,
    count: number,
    noun: string | [singular: string, plural: string],
    policy: RecordDependency['policy'],
    reason: string,
    link: string | null = href,
  ): RecordDependency => ({
    key,
    label,
    count,
    countLabel: Array.isArray(noun)
      ? pluralCount(count, noun[0], noun[1])
      : pluralCount(count, noun),
    policy,
    reason,
    href: link,
  });
  const live =
    facts.isActive ||
    facts.publicationStatus === CommercialPublicationStatus.PUBLISHED;
  return [
    dep(
      'live',
      'Live plan',
      live ? 1 : 0,
      ['active or published plan', 'active or published plans'],
      'BLOCKS',
      'Only an inactive plan can be deleted. Deactivate or archive it first.',
    ),
    dep(
      'subscriptions',
      'Subscriptions',
      counts.subscriptions,
      'subscription',
      'RETAIN',
      'Subscriptions — and the invoices and payments behind them — were sold on this plan. Archive it instead.',
      `/subscriptions?filters=${encodeURIComponent(
        JSON.stringify([{ field: 'planId', operator: 'eq', value: facts.id }]),
      )}`,
    ),
    dep(
      'subscriptionOrders',
      'Subscription orders',
      counts.subscriptionOrders,
      'subscription order',
      'RETAIN',
      'Checkout orders were placed for this plan. Archive it instead.',
    ),
    dep(
      'planChanges',
      'Plan changes',
      counts.planChangesFrom + counts.planChangesTo,
      'plan change request',
      'RETAIN',
      'Customers have moved to or from this plan. Archive it instead.',
    ),
    dep(
      'prices',
      'Prices',
      counts.prices,
      'price',
      'CASCADE',
      'Prices belong to the plan and are deleted with it.',
    ),
    dep(
      'features',
      'Feature entitlements',
      counts.features,
      'feature entitlement',
      'CASCADE',
      'Entitlements belong to the plan and are deleted with it.',
    ),
    dep(
      'preferences',
      'Preferred by',
      counts.selectedByCustomers +
        counts.selectedByOnboardings +
        counts.agreedByLeads,
      [
        'customer, onboarding or lead preferring it',
        'customers, onboardings or leads preferring it',
      ],
      'DETACH',
      'Their preferred-plan field is cleared.',
    ),
    dep(
      'promotions',
      'Promotions',
      counts.promotions,
      'promotion',
      'DETACH',
      'Promotions keep existing but no longer apply to any plan.',
      '/promotions',
    ),
  ];
}

type PlanDeleteOutcome =
  | { kind: 'deleted' }
  | { kind: 'refused'; label: string; reason: string };

/**
 * Permanent deletion of inactive, never-sold plans.
 *
 * The console's plan delete went through the runtime, which refused every
 * plan outright (`DELETE_REFUSALS.plans`), while a REST route with its own,
 * stricter rule sat unused. Both now read `classifyPlanDependencies`, so the
 * list's Delete, the record's Delete and `DELETE /super-admin/plans/:id`
 * cannot disagree.
 */
@Injectable()
export class PlanDeletionService implements RecordDependencyProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async describeDependencies(id: string): Promise<RecordDependencyReport> {
    const row = await this.prisma.plan.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        publicationStatus: true,
        _count: { select: PLAN_DEPENDENCY_COUNT_SELECT },
      },
    });
    if (!row) throw new NotFoundException('Plan not found.');
    return buildDependencyReport(
      classifyPlanDependencies({ ...row, counts: row._count }),
    );
  }

  async deletePlans(user: AuthenticatedUser, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
      throw new BadRequestException('Select at least one record to delete.');
    const refused: DeleteRefusal[] = [];
    let deleted = 0;
    for (const id of unique) {
      const outcome = await this.deleteOne(user, id);
      if (outcome.kind === 'deleted') deleted += 1;
      else refused.push({ id, label: outcome.label, reason: outcome.reason });
    }
    return {
      deleted,
      refused,
      message: describeDeleteOutcome(deleted, refused),
    };
  }

  /** The REST route's contract: `{ success, id }`, 404 or a named 400. */
  async deletePlan(user: AuthenticatedUser, id: string) {
    const outcome = await this.deleteOne(user, id);
    if (outcome.kind === 'deleted') return { success: true, id };
    if (outcome.reason === NO_LONGER_EXISTS)
      throw new NotFoundException('Plan not found.');
    throw new BadRequestException(
      `"${outcome.label}" cannot be deleted: ${outcome.reason}`,
    );
  }

  private async deleteOne(
    user: AuthenticatedUser,
    id: string,
  ): Promise<PlanDeleteOutcome> {
    let label = id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // A checkout creating a subscription on this plan waits for the lock
        // and then fails its own foreign key, rather than racing the check.
        await tx.$queryRaw`SELECT "id" FROM "Plan" WHERE "id" = ${id} FOR UPDATE`;
        const row = await tx.plan.findUnique({
          where: { id },
          select: {
            id: true,
            key: true,
            name: true,
            isActive: true,
            publicationStatus: true,
            stripeProductId: true,
            _count: { select: PLAN_DEPENDENCY_COUNT_SELECT },
          },
        });
        if (!row)
          return {
            kind: 'refused' as const,
            label: id,
            reason: NO_LONGER_EXISTS,
          };
        label = row.name;
        const dependencies = classifyPlanDependencies({
          ...row,
          counts: row._count,
        });
        const blocking = dependencies.filter(blocksDelete);
        if (blocking.length)
          return {
            kind: 'refused' as const,
            label,
            reason: blocking.map((item) => item.reason).join(' '),
          };

        // Preferences and promotions are cleared by the schema (`SetNull`).
        await tx.planPrice.deleteMany({ where: { planId: id } });
        await tx.planFeature.deleteMany({ where: { planId: id } });
        await tx.plan.delete({ where: { id } });
        await this.auditService.log(
          {
            tenantId: 'platform',
            actorUserId: user.userId,
            action: 'platform.plan_deleted',
            entityType: 'Plan',
            entityId: id,
            sourceModule: 'super-admin',
            beforeSnapshot: {
              id: row.id,
              key: row.key,
              name: row.name,
              publicationStatus: row.publicationStatus,
              stripeProductId: row.stripeProductId,
              counts: row._count,
            },
            afterSnapshot: null,
          },
          tx,
        );
        return { kind: 'deleted' as const };
      });
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
      return {
        kind: 'refused',
        label,
        reason:
          'it is still referenced by other records (the database refused the delete); nothing was deleted',
      };
    }
  }
}
