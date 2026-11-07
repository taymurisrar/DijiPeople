/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- in-memory repository fake */
import { BadRequestException } from '@nestjs/common';
import { PlanKind } from '@prisma/client';
import { SuperAdminService } from './super-admin.service';
import {
  assertPlanAssignable,
  publiclyOfferablePlanWhere,
} from './plan-eligibility';

/*
 * Custom plans: created for a customer, agreement, promotion or pilot, with their
 * own identity and an explicit feature list. Only Starter, Growth and Enterprise
 * are predefined (`PlanKind.CATALOGUE`).
 */
const ACTOR = { userId: 'platform-user-1' } as never;

function build(existing?: Record<string, unknown>) {
  const created: Array<Record<string, any>> = [];
  const updated: Array<Record<string, any>> = [];
  const plansRepository = {
    findByKey: jest.fn(async () => null),
    findById: jest.fn(async () => existing ?? null),
    create: jest.fn(async (data: Record<string, any>) => {
      created.push(data);
      const { features: _features, ...rest } = data;
      return planRow({ ...rest, id: 'plan-new' });
    }),
    update: jest.fn(async (_id: string, data: Record<string, any>) => {
      updated.push(data);
      const { features: _features, ...rest } = data;
      return planRow({ ...(existing ?? {}), ...rest, id: 'plan-1' });
    }),
  };
  const prisma = {
    customerAccount: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === 'cust-1' ? { id: 'cust-1' } : null,
      ),
    },
  };
  const audit = { log: jest.fn() };
  const entitlements = { invalidateAll: jest.fn() };
  const args: unknown[] = new Array(21).fill({});
  args[0] = prisma;
  args[2] = plansRepository;
  args[14] = audit;
  args[20] = entitlements;
  const service = new (SuperAdminService as unknown as new (
    ...a: unknown[]
  ) => SuperAdminService)(...args);
  return { service, created, updated, audit, entitlements, plansRepository };
}

function planRow(overrides: Record<string, any>) {
  return {
    id: 'plan-1',
    key: 'acme-pilot',
    name: 'Acme Pilot',
    description: null,
    kind: PlanKind.CUSTOM,
    salesModel: 'SALES_ASSISTED',
    eligibleCustomerAccountId: null,
    effectiveFrom: null,
    effectiveUntil: null,
    isActive: true,
    monthlyBasePrice: 0,
    annualBasePrice: 0,
    currency: 'USD',
    sortOrder: 0,
    publicationStatus: 'DRAFT',
    _count: { subscriptions: 0 },
    prices: [],
    features: [],
    ...overrides,
  } as never;
}

const dto = (extra: Record<string, unknown> = {}) =>
  ({
    key: 'Acme Pilot',
    name: 'Acme Pilot',
    monthlyBasePrice: 0,
    annualBasePrice: 0,
    featureKeys: ['leave'],
    ...extra,
  }) as never;

describe('creating a custom plan', () => {
  it('is CUSTOM, sales-assisted, draft, with exactly the chosen features plus the baseline', async () => {
    const { service, created } = build();

    await service.createPlan(ACTOR, dto());

    const data = created[0];
    expect(data.kind).toBe(PlanKind.CUSTOM);
    expect(data.salesModel).toBe('SALES_ASSISTED');
    expect(data.publicationStatus).toBe('DRAFT');
    const features = (data.features.create as Array<{ featureKey: string }>)
      .map((f) => f.featureKey)
      .sort();
    // No Enterprise inheritance: just what was selected, and basic import/export.
    expect(features).toEqual(['data-import-export', 'leave']);
  });

  it('records an audit entry for the creation', async () => {
    const { service, audit } = build();

    await service.createPlan(ACTOR, dto({ featureKeys: ['desktop-agent'] }));

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PLAN_CREATED',
        entityType: 'Plan',
      }),
    );
  });

  it('stores customer eligibility and the validity window', async () => {
    const { service, created } = build();

    await service.createPlan(
      ACTOR,
      dto({
        eligibleCustomerAccountId: 'cust-1',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveUntil: '2026-12-31T00:00:00.000Z',
      }),
    );

    expect(created[0].eligibleCustomerAccountId).toBe('cust-1');
    expect(created[0].effectiveUntil).toEqual(
      new Date('2026-12-31T00:00:00.000Z'),
    );
  });

  it('rejects an unknown eligible customer and an inverted window', async () => {
    const { service } = build();

    await expect(
      service.createPlan(ACTOR, dto({ eligibleCustomerAccountId: 'nope' })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createPlan(
        ACTOR,
        dto({
          effectiveFrom: '2026-06-01T00:00:00.000Z',
          effectiveUntil: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toThrow(/expiry must be after/);
  });

  it('a reserved or time-boxed plan is never self-service', async () => {
    const { service, created } = build();
    await service.createPlan(
      ACTOR,
      dto({ eligibleCustomerAccountId: 'cust-1' }),
    );
    expect(created[0].salesModel).toBe('SALES_ASSISTED');

    await expect(
      service.createPlan(
        ACTOR,
        dto({
          eligibleCustomerAccountId: 'cust-1',
          salesModel: 'SELF_SERVICE',
        }),
      ),
    ).rejects.toThrow(/cannot be self-service/);
  });

  it('a reusable custom plan may be self-service when asked', async () => {
    const { service, created } = build();
    await service.createPlan(ACTOR, dto({ salesModel: 'SELF_SERVICE' }));
    expect(created[0].salesModel).toBe('SELF_SERVICE');
  });
});

describe('updating plans', () => {
  it("changing a custom plan's features is audited and drops the entitlement caches", async () => {
    const { service, audit, entitlements } = build(
      planRow({ features: [{ featureKey: 'desktop-agent', isEnabled: true }] }),
    );

    await service.updatePlan(ACTOR, 'plan-1', {
      featureKeys: ['leave'],
    } as never);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLAN_UPDATED',
        beforeSnapshot: expect.objectContaining({
          features: ['desktop-agent'],
        }),
        afterSnapshot: expect.objectContaining({
          features: ['data-import-export', 'leave'],
        }),
      }),
    );
    expect(entitlements.invalidateAll).toHaveBeenCalled();
  });

  it('an update that leaves the features alone does not flush the caches', async () => {
    const { service, entitlements } = build(
      planRow({
        features: [{ featureKey: 'data-import-export', isEnabled: true }],
      }),
    );

    await service.updatePlan(ACTOR, 'plan-1', { name: 'Renamed' } as never);

    expect(entitlements.invalidateAll).not.toHaveBeenCalled();
  });

  it('refuses to edit the key or features of a predefined plan', async () => {
    const { service } = build(
      planRow({ key: 'growth', kind: PlanKind.CATALOGUE }),
    );

    await expect(
      service.updatePlan(ACTOR, 'plan-1', { featureKeys: ['leave'] } as never),
    ).rejects.toThrow(/predefined/);
    await expect(
      service.updatePlan(ACTOR, 'plan-1', { key: 'growth-2' } as never),
    ).rejects.toThrow(/predefined/);
  });

  it('still lets a predefined plan be renamed or deactivated', async () => {
    const { service } = build(
      planRow({ key: 'growth', kind: PlanKind.CATALOGUE }),
    );

    await expect(
      service.updatePlan(ACTOR, 'plan-1', { name: 'Growth' } as never),
    ).resolves.toBeDefined();
  });
});

describe('assigning a custom plan to a customer', () => {
  const plan = (extra: Record<string, unknown> = {}) => ({
    name: 'Acme Pilot',
    eligibleCustomerAccountId: null as string | null,
    effectiveFrom: null as Date | null,
    effectiveUntil: null as Date | null,
    ...extra,
  });

  it('allows a reusable open-ended plan for anyone', () => {
    expect(() => assertPlanAssignable(plan(), 'cust-1')).not.toThrow();
  });

  it('allows the reserved customer and refuses everyone else', () => {
    const reserved = plan({ eligibleCustomerAccountId: 'cust-1' });
    expect(() => assertPlanAssignable(reserved, 'cust-1')).not.toThrow();
    expect(() => assertPlanAssignable(reserved, 'cust-2')).toThrow(
      /reserved for another customer/,
    );
  });

  it('honours the validity window at both ends', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(() =>
      assertPlanAssignable(
        plan({ effectiveFrom: new Date('2026-07-01T00:00:00Z') }),
        'c',
        now,
      ),
    ).toThrow(/not valid until/);
    expect(() =>
      assertPlanAssignable(
        plan({ effectiveUntil: new Date('2026-05-01T00:00:00Z') }),
        'c',
        now,
      ),
    ).toThrow(/expired/);
    expect(() =>
      assertPlanAssignable(
        plan({
          effectiveFrom: new Date('2026-05-01T00:00:00Z'),
          effectiveUntil: new Date('2026-07-01T00:00:00Z'),
        }),
        'c',
        now,
      ),
    ).not.toThrow();
  });

  it('public listings exclude reserved and out-of-window plans', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const where = publiclyOfferablePlanWhere(now);
    expect(where.eligibleCustomerAccountId).toBeNull();
    expect(JSON.stringify(where.AND)).toContain('effectiveUntil');
    expect(JSON.stringify(where.AND)).toContain('effectiveFrom');
  });
});
