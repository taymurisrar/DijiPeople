import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-1378 — both public write paths must apply the channel rule.
 *
 * `getPublicPlans` was fixed to stop *listing* `SALES_ASSISTED` prices, and on
 * its own that fixes nothing an attacker cares about: `planPriceId` comes from
 * the client on both public write paths, and those ids were published by that
 * very endpoint until the fix, so they are known. A read filter with no
 * matching write check is a listing preference, not an access control.
 *
 * This asserts the wiring rather than the predicate — the predicate is covered
 * in `flat-pricing-is-internal.spec.ts`. Reading the source is crude, and it is
 * the only way to pin "this guard is still called from these two methods"
 * without a database: both take a `planPriceId`, look it up, and must refuse a
 * price this caller is not entitled to *before* anything is created.
 *
 * If this breaks because the methods were renamed or restructured, do not delete
 * it — re-point it. The check it encodes is the one that stops an internal,
 * hand-negotiated rate being bought by anyone who knows a uuid.
 */
const SOURCE = readFileSync(
  join(__dirname, 'services', 'billing.service.ts'),
  'utf8',
);

/** The body of a method, from its signature to the next one at the same depth. */
function methodBody(name: string): string {
  const start = SOURCE.indexOf(`async ${name}(`);
  if (start === -1) {
    throw new Error(
      `${name} not found in billing.service.ts — re-point this test rather than deleting it.`,
    );
  }
  const rest = SOURCE.slice(start + 1);
  const next = rest.search(/\n {2}(private |async |[a-zA-Z]+\()/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the public write paths check the channel', () => {
  const GUARD = 'assertSellableToAnonymousVisitor';

  it('the guard exists', () => {
    expect(SOURCE).toContain(`private ${GUARD}(`);
  });

  for (const method of [
    'startPublicOnboarding',
    'createPublicSubscriptionCheckout',
  ]) {
    it(`${method} refuses a price the visitor may not buy`, () => {
      expect(methodBody(method)).toContain(`this.${GUARD}(`);
    });
  }

  /*
   * The guard must run before anything is created. Calling it after an order
   * has been opened would leave a row behind for a purchase that was refused —
   * and on the checkout path, after a Stripe session existed.
   */
  /*
   * Both positions are asserted present before they are compared. `indexOf`
   * returns `-1` for an absent string, and `-1` is less than every real index —
   * so a naive ordering assertion *passes* when the guard has been deleted,
   * which is the one failure it exists to catch.
   *
   * Found by mutation rather than by reasoning: removing both guard calls left
   * these two green until the positions were pinned first.
   */
  function orderedWithin(method: string, laterNeedle: string) {
    const body = methodBody(method);
    const guardAt = body.indexOf(`this.${GUARD}(`);
    const laterAt = body.indexOf(laterNeedle);

    expect(guardAt).toBeGreaterThan(-1);
    expect(laterAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(laterAt);
  }

  it('startPublicOnboarding checks before opening the order', () => {
    orderedWithin('startPublicOnboarding', 'openOrder(');
  });

  it('createPublicSubscriptionCheckout checks before verifying the price', () => {
    orderedWithin(
      'createPublicSubscriptionCheckout',
      'verifyAndPersistPlanPrice(',
    );
  });
});
