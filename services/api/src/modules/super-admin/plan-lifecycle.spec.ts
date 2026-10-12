import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { blocksDelete } from '../../common/deletion/record-dependencies';
import {
  classifyPlanDependencies,
  PlanDeletionService,
} from './plan-deletion.service';

/**
 * BUG-1749 — the console created plans that could never be sold or removed.
 *
 * `Plan.isPublic` defaults to `true` in the schema, so a plan created through
 * `/plans/new` arrived active *and* public while carrying no `PlanPrice` rows.
 * Checkout sells from `PlanPrice`, so the plan advertised itself and could not
 * be bought — and with no delete route it could not be withdrawn either. Two
 * are in production in exactly that state.
 *
 * BUG-1755 sits alongside it: the Plans list declares Publication as its
 * leading column and `mapPlan()` never serialized the field, so the screen
 * built to answer "which plans are sellable" rendered an em dash for every row.
 */

const SERVICE = join(__dirname, 'super-admin.service.ts');

describe('BUG-1749 — a plan is born unsellable, so it is born unpublished', () => {
  const source = readFileSync(SERVICE, 'utf8');

  it('does not let the schema default decide publication', () => {
    const createPlan = source.slice(
      source.indexOf('async createPlan('),
      source.indexOf('async updatePlan('),
    );
    expect(createPlan).toContain(
      'publicationStatus: CommercialPublicationStatus.DRAFT',
    );
  });

  it('sets the one gate and not the retired one', () => {
    /*
     * `Plan.isPublic` defaults to `true`, so writing `isPublic: false` here
     * looks like the obvious fix and is the wrong one: BUG-0223 retired that
     * boolean precisely because two gates can disagree, and
     * `one-self-service-gate.spec.ts` forbids writing it. DRAFT already says
     * the plan is not sellable, on the only authority there is.
     */
    const createPlan = source.slice(
      source.indexOf('async createPlan('),
      source.indexOf('async updatePlan('),
    );
    expect(createPlan).not.toMatch(/\bisPublic\s*:\s*(true|false)\b/);
  });

  it('creates no price, which is why it must not be public', () => {
    // If this ever stops being true the rule above should be revisited rather
    // than left as a default nobody remembers the reason for.
    const createPlan = source.slice(
      source.indexOf('async createPlan('),
      source.indexOf('async updatePlan('),
    );
    expect(createPlan).not.toContain('prices:');
  });
});

type PlanRow = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  publicationStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  stripeProductId: string | null;
  _count: Record<string, number>;
};

const NONE = {
  subscriptions: 0,
  subscriptionOrders: 0,
  planChangesFrom: 0,
  planChangesTo: 0,
  prices: 0,
  features: 0,
  selectedByCustomers: 0,
  selectedByOnboardings: 0,
  agreedByLeads: 0,
  promotions: 0,
};

function plan(overrides: Partial<PlanRow> & { counts?: Partial<typeof NONE> }) {
  const { counts, ...rest } = overrides;
  return {
    id: 'plan-1',
    key: 'mistake',
    name: 'Mistake',
    isActive: false,
    publicationStatus: 'ARCHIVED' as const,
    stripeProductId: null,
    ...rest,
    _count: { ...NONE, ...counts },
  };
}

function serviceWith(row: PlanRow | null) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    plan: {
      findUnique: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(row),
    },
    planPrice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    planFeature: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    plan: { findUnique: jest.fn().mockResolvedValue(row) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PlanDeletionService(
    prisma as never,
    auditService as never,
  );
  return { service, tx, auditService };
}

const ACTOR = { userId: 'platform-user-1' } as never;

describe('Plan deletion — inactive and never sold (2026-10-12)', () => {
  it('deletes an inactive, never-sold plan with its prices and features', async () => {
    const { service, tx } = serviceWith(
      plan({ counts: { prices: 3, features: 5, selectedByCustomers: 2 } }),
    );

    await expect(service.deletePlan(ACTOR, 'plan-1')).resolves.toEqual({
      success: true,
      id: 'plan-1',
    });
    expect(tx.planPrice.deleteMany).toHaveBeenCalledWith({
      where: { planId: 'plan-1' },
    });
    expect(tx.planFeature.deleteMany).toHaveBeenCalled();
    expect(tx.plan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
  });

  it.each([
    ['active', plan({ isActive: true })],
    ['published', plan({ publicationStatus: 'PUBLISHED' })],
  ])('refuses a %s plan and says to deactivate it first', async (_l, row) => {
    const { service, tx } = serviceWith(row);
    await expect(service.deletePlan(ACTOR, 'plan-1')).rejects.toThrow(
      /Deactivate or archive it first/,
    );
    expect(tx.plan.delete).not.toHaveBeenCalled();
  });

  it.each(['subscriptions', 'subscriptionOrders', 'planChangesTo'] as const)(
    'refuses a plan with %s and offers archive instead',
    async (relation) => {
      const { service, tx } = serviceWith(plan({ counts: { [relation]: 1 } }));
      await expect(service.deletePlan(ACTOR, 'plan-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deletePlan(ACTOR, 'plan-1')).rejects.toThrow(
        /Archive it instead/,
      );
      expect(tx.plan.delete).not.toHaveBeenCalled();
    },
  );

  it('reports refusals per plan in a bulk delete rather than failing the batch', async () => {
    const { service } = serviceWith(plan({ counts: { subscriptions: 2 } }));
    const result = await service.deletePlans(ACTOR, ['plan-1']);
    expect(result.deleted).toBe(0);
    expect(result.refused).toEqual([
      expect.objectContaining({ id: 'plan-1', label: 'Mistake' }),
    ]);
    expect(result.message).toMatch(/Nothing was deleted\. Kept 1: Mistake/);
  });

  it('404s on a plan that is not there', async () => {
    const { service } = serviceWith(null);
    await expect(service.deletePlan(ACTOR, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('records the deletion in the same transaction', async () => {
    const { service, auditService, tx } = serviceWith(plan({}));
    await service.deletePlan(ACTOR, 'plan-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'platform.plan_deleted',
        entityType: 'Plan',
        entityId: 'plan-1',
        afterSnapshot: null,
      }),
      tx,
    );
  });

  it('the dependency dialog and the delete read one rule', () => {
    const blocking = classifyPlanDependencies({
      id: 'p',
      isActive: false,
      publicationStatus: 'DRAFT' as never,
      counts: { ...NONE, prices: 2, promotions: 1 },
    }).filter(blocksDelete);
    expect(blocking).toEqual([]);
  });
});

describe('BUG-1755 — the Plans list can see publication state', () => {
  const source = readFileSync(SERVICE, 'utf8');
  const mapPlan = source.slice(
    source.indexOf('private mapPlan('),
    source.indexOf('private async getPlanPriceDuplicateRisks('),
  );

  it.each(['publicationStatus', 'salesModel', 'publishedAt', 'archivedAt'])(
    'serializes %s',
    (field) => {
      expect(mapPlan).toContain(`${field}: plan.${field}`);
    },
  );

  it('derives isPublic from publication rather than reading the column', () => {
    // The landing site consumes this field, so it has to keep existing — but
    // its value comes from the one gate, never from the retired boolean.
    expect(mapPlan).toMatch(
      /isPublic:\s*plan\.publicationStatus === CommercialPublicationStatus\.PUBLISHED/,
    );
    expect(mapPlan).not.toContain('isPublic: plan.isPublic');
  });
});
