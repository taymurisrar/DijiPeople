import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

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
      source.indexOf('async deletePlan('),
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
      source.indexOf('async deletePlan('),
    );
    expect(createPlan).not.toMatch(/\bisPublic\s*:\s*(true|false)\b/);
  });

  it('creates no price, which is why it must not be public', () => {
    // If this ever stops being true the rule above should be revisited rather
    // than left as a default nobody remembers the reason for.
    const createPlan = source.slice(
      source.indexOf('async createPlan('),
      source.indexOf('async deletePlan('),
    );
    expect(createPlan).not.toContain('prices:');
  });
});

type PlanRow = {
  id: string;
  key: string;
  name: string;
  _count: { subscriptions: number; prices: number };
};

function serviceWith(plan: PlanRow | null) {
  const prisma = {
    plan: {
      findUnique: jest.fn().mockResolvedValue(plan),
      delete: jest.fn().mockResolvedValue(plan),
    },
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const service = Object.create(
    SuperAdminService.prototype,
  ) as SuperAdminService;
  Object.assign(service, { prisma, auditService });
  return { service, prisma, auditService };
}

const ACTOR = { userId: 'platform-user-1' } as never;

describe('BUG-1749 — deleting a plan', () => {
  it('removes one that was never priced and never sold', async () => {
    const { service, prisma } = serviceWith({
      id: 'plan-1',
      key: 'mistake',
      name: 'Mistake',
      _count: { subscriptions: 0, prices: 0 },
    });

    await expect(service.deletePlan(ACTOR, 'plan-1')).resolves.toEqual({
      success: true,
      id: 'plan-1',
    });
    expect(prisma.plan.delete).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
    });
  });

  it('refuses one somebody is billed on', async () => {
    const { service, prisma } = serviceWith({
      id: 'plan-2',
      key: 'starter',
      name: 'Starter',
      _count: { subscriptions: 2, prices: 4 },
    });

    await expect(service.deletePlan(ACTOR, 'plan-2')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  it('refuses one that has been priced, even with no subscribers', async () => {
    const { service } = serviceWith({
      id: 'plan-3',
      key: 'growth',
      name: 'Growth',
      _count: { subscriptions: 0, prices: 2 },
    });

    await expect(service.deletePlan(ACTOR, 'plan-3')).rejects.toThrow(
      /2 price\(s\) are configured on it/,
    );
  });

  it('says which reasons apply and what to do instead', async () => {
    const { service } = serviceWith({
      id: 'plan-2',
      key: 'starter',
      name: 'Starter',
      _count: { subscriptions: 2, prices: 4 },
    });

    await expect(service.deletePlan(ACTOR, 'plan-2')).rejects.toThrow(
      /"Starter"[\s\S]*2 subscription\(s\)[\s\S]*and[\s\S]*4 price\(s\)[\s\S]*Deactivate it instead/,
    );
  });

  it('404s on a plan that is not there', async () => {
    const { service } = serviceWith(null);
    await expect(service.deletePlan(ACTOR, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('records the deletion', async () => {
    const { service, auditService } = serviceWith({
      id: 'plan-1',
      key: 'mistake',
      name: 'Mistake',
      _count: { subscriptions: 0, prices: 0 },
    });

    await service.deletePlan(ACTOR, 'plan-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'platform.plan_deleted',
        entityType: 'Plan',
        entityId: 'plan-1',
        afterSnapshot: null,
      }),
    );
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
