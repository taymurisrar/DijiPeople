import { backfillCapabilitiesOnCustomPlans } from './commercial-bootstrap';

/*
 * The grandfathering rule for capabilities carved out of what used to be free
 * (BUG-2958). The catalog plans are converged by `reconcilePlanFeatures` and
 * must NOT be touched here — Starter losing a key it was never meant to sell is
 * the point of the change. Plans an operator created are the ones that would
 * otherwise lose a screen their tenants use, with nothing to trace it to.
 */
type PlanRow = { id: string; key: string; name: string };
type FeatureRow = { planId: string; featureKey: string; isEnabled: boolean };

function fakePrisma(plans: PlanRow[], features: FeatureRow[]) {
  const created: FeatureRow[] = [];
  return {
    created,
    client: {
      plan: { findMany: jest.fn().mockResolvedValue(plans) },
      planFeature: {
        findMany: jest.fn(
          ({
            where,
          }: {
            where: { planId: string; featureKey: { in: string[] } };
          }) =>
            Promise.resolve(
              features.filter(
                (row) =>
                  row.planId === where.planId &&
                  where.featureKey.in.includes(row.featureKey),
              ),
            ),
        ),
        create: jest.fn(({ data }: { data: FeatureRow }) => {
          created.push(data);
          return Promise.resolve(data);
        }),
      },
    },
  };
}

const KEYS = ['attendance-integrations', 'compliance'] as const;

describe('backfillCapabilitiesOnCustomPlans', () => {
  it('grants missing keys on a plan the catalog does not own', async () => {
    const { client, created } = fakePrisma(
      [{ id: 'p1', key: 'acme-bespoke', name: 'Acme Bespoke' }],
      [],
    );

    const result = await backfillCapabilitiesOnCustomPlans(
      client as never,
      KEYS,
    );

    expect(created.map((row) => row.featureKey).sort()).toEqual([
      'attendance-integrations',
      'compliance',
    ]);
    expect(created.every((row) => row.isEnabled)).toBe(true);
    expect(result.granted).toHaveLength(2);
  });

  /*
   * The assertion that makes this safe to wire into a release. Touching a
   * catalog plan here would re-enable on Starter exactly what the carve-out was
   * for, and the two mechanisms would fight each other on every deploy.
   */
  it('never touches a catalog plan', async () => {
    const { client, created } = fakePrisma(
      [
        { id: 'p1', key: 'starter', name: 'Starter' },
        { id: 'p2', key: 'growth', name: 'Growth' },
        { id: 'p3', key: 'enterprise', name: 'Enterprise' },
        { id: 'p4', key: 'enterprise-plus', name: 'Enterprise+' },
      ],
      [],
    );

    const result = await backfillCapabilitiesOnCustomPlans(
      client as never,
      KEYS,
    );

    expect(created).toEqual([]);
    expect(result.granted).toEqual([]);
    expect(result.plansExamined).toBe(4);
  });

  /*
   * An operator who switched a capability off on a bespoke plan meant it. A
   * backfill that "corrected" that would be a seed overriding a human decision.
   */
  it('leaves an existing row alone, enabled or not', async () => {
    const { client, created } = fakePrisma(
      [{ id: 'p1', key: 'acme-bespoke', name: 'Acme Bespoke' }],
      [{ planId: 'p1', featureKey: 'compliance', isEnabled: false }],
    );

    await backfillCapabilitiesOnCustomPlans(client as never, KEYS);

    expect(created.map((row) => row.featureKey)).toEqual([
      'attendance-integrations',
    ]);
  });

  it('writes nothing on a second run', async () => {
    const { client, created } = fakePrisma(
      [{ id: 'p1', key: 'acme-bespoke', name: 'Acme Bespoke' }],
      KEYS.map((featureKey) => ({
        planId: 'p1',
        featureKey,
        isEnabled: true,
      })),
    );

    const result = await backfillCapabilitiesOnCustomPlans(
      client as never,
      KEYS,
    );

    expect(created).toEqual([]);
    expect(result.granted).toEqual([]);
  });
});
