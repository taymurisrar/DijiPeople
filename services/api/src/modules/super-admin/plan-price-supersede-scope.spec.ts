import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-1133 — superseding a plan price must use the key the database uses.
 *
 * `createPlanPrice` and `updatePlanPrice` deactivate the sibling occupying the
 * slot a price is moving into. They matched
 * `{planId, billingCycle, currency}` while the partial unique index is
 *
 *     (planId, marketId, billingCycle, currency, billingModel)
 *     NULLS NOT DISTINCT WHERE isActive
 *
 * Deactivating on a *narrower* key than the one that defines a slot does not
 * resolve a conflict — it destroys rows that were never in conflict. Saving a
 * PER_SEAT price retired the FLAT price beside it, and with `marketId` absent
 * it reached across every market too.
 *
 * On 2026-08-24 that removed nine of Starter's twelve prices in production —
 * every annual price and every flat price — leaving one per currency. Growth
 * and Enterprise, untouched that day, kept all twelve each. Nothing failed
 * loudly: `updateMany` returns a count nobody reads.
 *
 * **Why this is asserted from source rather than through Prisma.** The defect is
 * a mismatch between two declarations — a `where` clause and a SQL index — and
 * the only way to catch it with a fake client is to assert the shape of the
 * `where`, which is what a source assertion does more directly and more
 * legibly. TASK-0018's assumption A-06 said this in advance: a fake Prisma
 * client "cannot enforce the partial unique index", and it named this exact
 * index. The proof that matters is that the two lists agree.
 */
describe('BUG-1133 — plan price supersede scope matches the unique index', () => {
  const root = join(__dirname, '../../../');
  const service = readFileSync(
    join(__dirname, 'super-admin.service.ts'),
    'utf8',
  );
  const migration = readFileSync(
    join(
      root,
      'prisma/migrations/20260820140000_planprice_billing_model_uniqueness_and_overage/migration.sql',
    ),
    'utf8',
  );

  /** The columns the database actually enforces, read from the migration. */
  function indexColumns() {
    const match = migration.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS "PlanPrice_active_plan_market_cycle_currency_model_key"\s*\nON "PlanPrice" \(([^)]+)\)/,
    );
    if (!match)
      throw new Error('the unique index was not found — has it moved?');
    return match[1]
      .split(',')
      .map((column) => column.trim().replace(/"/g, ''))
      .filter(Boolean);
  }

  /** Every `planPrice.updateMany` that deactivates, with its where clause. */
  function supersedeClauses() {
    const clauses: string[] = [];
    const pattern =
      /planPrice\.updateMany\(\{\s*where:\s*\{([\s\S]*?)\},\s*data:\s*\{\s*isActive:\s*false/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(service))) clauses.push(match[1]);
    return clauses;
  }

  it('the migration still declares the five-column index', () => {
    expect(indexColumns()).toEqual([
      'planId',
      'marketId',
      'billingCycle',
      'currency',
      'billingModel',
    ]);
  });

  it('finds both supersede sites', () => {
    // If this drops to one, a call site was removed or reshaped and the
    // assertion below silently stopped covering it.
    expect(supersedeClauses()).toHaveLength(2);
  });

  it('every supersede filters on all five index columns', () => {
    for (const clause of supersedeClauses()) {
      for (const column of indexColumns()) {
        // Either `planId,` (object shorthand) or `marketId: null` counts — the
        // question is whether the column constrains the query at all, not how
        // its value happens to be written.
        expect(clause).toMatch(new RegExp(`\\b${column}\\s*[,:]`));
      }
    }
  });

  it('every supersede is still scoped to active rows', () => {
    // Widening the key is only safe while the query stays confined to active
    // rows — the index is partial, and so must the supersede be.
    for (const clause of supersedeClauses()) {
      expect(clause).toContain('isActive: true');
    }
  });
});
