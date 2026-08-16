import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ITEM-0018 — publishing a new price must not change what an existing customer
 * is already paying.
 *
 * This is the acceptance criterion the item calls out by name, and it was the
 * only one with no test behind it. It is also the one with real money attached:
 * if a rendered subscription resolved the plan's *current* published price
 * instead of the snapshot taken at purchase, then publishing a price rise would
 * silently reprice every existing customer on that plan — on their invoices,
 * in the admin console, and in anything reading either.
 *
 * `Subscription` already snapshots `planPriceId`, `basePrice`, `discountType`,
 * `discountValue`, `finalPrice` and `currency`. The risk is not that the
 * snapshot is missing; it is that a future change makes the read path helpfully
 * "freshen" it. That is what this pins.
 *
 * Asserted against the source: executing `mapSubscription` proves it maps the
 * fields it is handed, which is exactly the thing not in doubt. What matters is
 * that it never reaches past them to a live lookup.
 */
describe('subscription terms are immutable once sold', () => {
  const source = readFileSync(
    join(__dirname, 'super-admin.service.ts'),
    'utf8',
  );

  const start = source.indexOf('private mapSubscription(');
  /*
   * Bounded by the next method rather than the next `\n  }` — the parameter type
   * is an inline object literal, so the first closing brace at that indent is
   * the end of the *signature*, not of the function. An earlier draft sliced
   * there and asserted against the type declaration, which passes and proves
   * nothing about the body.
   */
  const nextMember = source
    .slice(start + 1)
    .search(/\n {2}(private|public|async|\w+\()/);
  const renderer = source.slice(
    start,
    nextMember > 0 ? start + 1 + nextMember : undefined,
  );

  it('finds the renderer', () => {
    // Guards the assertions below against a rename making them vacuous.
    expect(start).toBeGreaterThan(-1);
    expect(renderer.length).toBeGreaterThan(200);
  });

  it('renders money from the subscription snapshot', () => {
    for (const field of [
      'basePrice',
      'finalPrice',
      'currency',
      'discountType',
      'discountValue',
    ]) {
      // e.g. `basePrice: Number(subscription.basePrice)`
      const readsSnapshot = new RegExp(
        `${field}:[^,\\n]*subscription\\.${field}`,
      );
      expect(renderer).toMatch(readsSnapshot);
    }
  });

  it('never resolves a live price while rendering', () => {
    /*
     * The specific regression: reading through the plan or re-resolving the
     * current published price. Either would make an existing customer's terms
     * follow the price list instead of their contract.
     */
    expect(renderer).not.toMatch(/subscription\.plan\.(prices|planPrices)/);
    expect(renderer).not.toMatch(
      /resolve(Commercial)?Offer|selectEffectivePrice/,
    );
    expect(renderer).not.toMatch(/planPrice\.(unitAmount|amount|currency)/);

    // The linked price is exposed by id only — a reference, not a source of
    // truth for what was charged.
    expect(renderer).toMatch(
      /planPrice[\s\S]{0,80}\{ id: subscription\.planPrice\.id \}/,
    );
  });
});
