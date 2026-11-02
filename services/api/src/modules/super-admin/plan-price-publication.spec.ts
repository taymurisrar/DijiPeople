import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommercialPublicationStatus, PlanKind } from '@prisma/client';
import { SuperAdminService } from './super-admin.service';

/*
 * DP-QA-044: a custom plan's price can be published and withdrawn, and only that.
 * No amount, cycle, seat rule or Stripe state is touched.
 */
const ACTOR = { userId: 'platform-user-1' } as never;

function build(opts: {
  plan?: Record<string, unknown> | null;
  price?: Record<string, unknown>;
}) {
  const plan =
    opts.plan === undefined
      ? { id: 'plan-1', key: 'acme', kind: PlanKind.CUSTOM }
      : opts.plan;
  const price = {
    id: 'price-1',
    planId: 'plan-1',
    isActive: true,
    publicationStatus: CommercialPublicationStatus.DRAFT,
    ...opts.price,
  };
  const update = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...price,
      ...data,
    }),
  );
  const audit = { log: jest.fn() };
  const args: unknown[] = new Array(21).fill({});
  args[0] = {
    plan: { findUnique: jest.fn().mockResolvedValue(plan) },
    planPrice: { update },
  };
  args[14] = audit;
  const svc = new (SuperAdminService as unknown as new (
    ...a: unknown[]
  ) => SuperAdminService)(...args);
  const internals = svc as unknown as Record<string, unknown>;
  internals.findPlanPriceOrThrow = jest.fn().mockResolvedValue(price);
  internals.mapPlanPrice = jest.fn((row: Record<string, unknown>) => row);
  return { svc, update, audit };
}

describe('publishing a custom plan price', () => {
  it('moves a DRAFT price to PUBLISHED, stamps who and when, and audits it', async () => {
    const { svc, update, audit } = build({});

    await svc.setPlanPricePublication(ACTOR, 'plan-1', 'price-1', 'publish');

    expect(update.mock.calls[0][0].data).toMatchObject({
      publicationStatus: CommercialPublicationStatus.PUBLISHED,
      publishedById: 'platform-user-1',
    });
    expect(update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);
    // Nothing about the money is part of the write.
    expect(Object.keys(update.mock.calls[0][0].data).sort()).toEqual([
      'publicationStatus',
      'publishedAt',
      'publishedById',
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'PLAN_PRICE_PUBLISHED',
        entityType: 'PlanPrice',
      }),
    );
  });

  it('refuses an inactive, an already-published and an archived price', async () => {
    await expect(
      build({ price: { isActive: false } }).svc.setPlanPricePublication(
        ACTOR,
        'plan-1',
        'price-1',
        'publish',
      ),
    ).rejects.toThrow(/Activate the price/);
    await expect(
      build({
        price: { publicationStatus: CommercialPublicationStatus.PUBLISHED },
      }).svc.setPlanPricePublication(ACTOR, 'plan-1', 'price-1', 'publish'),
    ).rejects.toThrow(/already published/);
    await expect(
      build({
        price: { publicationStatus: CommercialPublicationStatus.ARCHIVED },
      }).svc.setPlanPricePublication(ACTOR, 'plan-1', 'price-1', 'publish'),
    ).rejects.toThrow(/archived price cannot be published/);
  });

  it('never publishes the price of a predefined plan from this action', async () => {
    const { svc, update } = build({
      plan: { id: 'plan-1', key: 'growth', kind: PlanKind.CATALOGUE },
    });
    await expect(
      svc.setPlanPricePublication(ACTOR, 'plan-1', 'price-1', 'publish'),
    ).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s an unknown plan', async () => {
    await expect(
      build({ plan: null }).svc.setPlanPricePublication(
        ACTOR,
        'plan-1',
        'price-1',
        'publish',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('withdrawing a custom plan price', () => {
  it('returns a PUBLISHED price to DRAFT without touching existing subscriptions', async () => {
    const { svc, update, audit } = build({
      price: { publicationStatus: CommercialPublicationStatus.PUBLISHED },
    });

    await svc.setPlanPricePublication(ACTOR, 'plan-1', 'price-1', 'unpublish');

    expect(update.mock.calls[0][0].data).toEqual({
      publicationStatus: CommercialPublicationStatus.DRAFT,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_PRICE_UNPUBLISHED' }),
    );
  });

  it('refuses to withdraw a price that is not published', async () => {
    await expect(
      build({}).svc.setPlanPricePublication(
        ACTOR,
        'plan-1',
        'price-1',
        'unpublish',
      ),
    ).rejects.toThrow(/not published/);
  });
});
