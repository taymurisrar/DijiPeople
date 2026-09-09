import { backfillPlanCapabilities } from './commercial-bootstrap';
import { DEFAULT_PLAN_DEFINITIONS } from './plans.catalog';

/*
 * The rows a newly-carved capability key needs, written without going through
 * `seed:config` — which would have repriced the product as a side effect
 * (BUG-2958).
 *
 * Two properties matter more than the happy path. A catalog plan must be granted
 * a key only where the catalog sells it, so Starter is correctly left without
 * what it never bought; and nothing already in the database may be changed, so an
 * operator's deliberate toggle is not overwritten by a repair.
 */
type PlanRow = { id: string; key: string; name: string };
type FeatureRow = { planId: string; featureKey: string; isEnabled: boolean };

function fakePrisma(plans: PlanRow[], features: FeatureRow[]) {
  const created: FeatureRow[] = [];
  const updated: unknown[] = [];
  const deleted: unknown[] = [];
  return {
    created,
    updated,
    deleted,
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
        update: jest.fn((args: unknown) => {
          updated.push(args);
          return Promise.resolve({});
        }),
        delete: jest.fn((args: unknown) => {
          deleted.push(args);
          return Promise.resolve({});
        }),
      },
    },
  };
}

/* Two of the four carved out on 2026-09-09: one Growth sells, one it does not. */
const KEYS = ['attendance-integrations', 'compliance'] as const;

const BESPOKE: PlanRow = {
  id: 'p9',
  key: 'acme-bespoke',
  name: 'Acme Bespoke',
};
const CATALOG: PlanRow[] = [
  { id: 'p1', key: 'starter', name: 'Starter' },
  { id: 'p2', key: 'growth', name: 'Growth' },
  { id: 'p3', key: 'enterprise', name: 'Enterprise' },
  { id: 'p4', key: 'enterprise-plus', name: 'Enterprise+' },
];

describe('backfillPlanCapabilities', () => {
  it('grants a catalog plan only the keys the catalog sells it', async () => {
    const { client, created } = fakePrisma(CATALOG, []);

    await backfillPlanCapabilities(client as never, KEYS);

    const byPlan = (id: string) =>
      created
        .filter((row) => row.planId === id)
        .map((row) => row.featureKey)
        .sort();

    /* Starter sells neither — the carve-out working, not a failure. */
    expect(byPlan('p1')).toEqual([]);
    /* Growth sells the hardware and not compliance. */
    expect(byPlan('p2')).toEqual(['attendance-integrations']);
    /* Enterprise and Enterprise+ take every key in the catalog. */
    expect(byPlan('p3')).toEqual(['attendance-integrations', 'compliance']);
    expect(byPlan('p4')).toEqual(['attendance-integrations', 'compliance']);
  });

  it('reports what a catalog plan is withheld rather than skipping it silently', async () => {
    const { client } = fakePrisma(CATALOG, []);

    const result = await backfillPlanCapabilities(client as never, KEYS);

    /*
     * Starter withholds both; Growth withholds compliance. A capability a
     * customer loses is the half an operator most needs to read.
     */
    expect(result.withheld).toEqual(
      expect.arrayContaining([
        'Starter (starter) withholds attendance-integrations',
        'Starter (starter) withholds compliance',
        'Growth (growth) withholds compliance',
      ]),
    );
  });

  /*
   * The catalog is not authoritative for a plan an operator created, so a key
   * carved out of what used to be free would vanish from it with no seed, no
   * migration and no error to trace it to. "We started selling this" and "we
   * took this away" look identical in a database; only the second is a defect.
   */
  it('grants every key on a plan the catalog does not own', async () => {
    const { client, created } = fakePrisma([BESPOKE], []);

    await backfillPlanCapabilities(client as never, KEYS);

    expect(created.map((row) => row.featureKey).sort()).toEqual([
      'attendance-integrations',
      'compliance',
    ]);
    expect(created.every((row) => row.isEnabled)).toBe(true);
  });

  it('never disables, deletes or updates an existing row', async () => {
    const { client, created, updated, deleted } = fakePrisma(
      [BESPOKE],
      [{ planId: 'p9', featureKey: 'compliance', isEnabled: false }],
    );

    await backfillPlanCapabilities(client as never, KEYS);

    /* The operator switched compliance off. That decision survives a repair. */
    expect(created.map((row) => row.featureKey)).toEqual([
      'attendance-integrations',
    ]);
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('writes nothing on a second run', async () => {
    const { client, created } = fakePrisma(
      [BESPOKE],
      KEYS.map((featureKey) => ({
        planId: 'p9',
        featureKey,
        isEnabled: true,
      })),
    );

    const result = await backfillPlanCapabilities(client as never, KEYS);

    expect(created).toEqual([]);
    expect(result.granted).toEqual([]);
  });

  it('writes nothing at all in dry-run, while still reporting the plan', async () => {
    const { client, created } = fakePrisma([BESPOKE], []);

    const result = await backfillPlanCapabilities(client as never, KEYS, {
      dryRun: true,
    });

    expect(created).toEqual([]);
    expect(result.granted).toHaveLength(2);
    expect(result.granted.every((line) => line.includes('[DRY RUN]'))).toBe(
      true,
    );
  });

  /*
   * Guards the fixture rather than the code. If the catalog ever stops
   * differentiating on these two keys, the assertions above would pass for the
   * wrong reason.
   */
  it('is written against a catalog where the two keys actually differ', () => {
    const growth = DEFAULT_PLAN_DEFINITIONS.find(
      (definition) => definition.key === 'growth',
    )!;
    const starter = DEFAULT_PLAN_DEFINITIONS.find(
      (definition) => definition.key === 'starter',
    )!;

    expect(growth.enabledFeatureKeys).toContain('attendance-integrations');
    expect(growth.enabledFeatureKeys).not.toContain('compliance');
    expect(starter.enabledFeatureKeys).not.toContain('attendance-integrations');
  });
});
