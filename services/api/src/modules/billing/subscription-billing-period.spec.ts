import {
  resolveSubscriptionPeriodEnd,
  resolveSubscriptionPeriodStart,
} from './services/webhook.service';

/**
 * BUG-1744 — every production subscription carried a billing period the
 * platform could not use.
 *
 * Stripe removed `current_period_start` / `current_period_end` from the
 * Subscription object in `2025-03-31.basil` and moved them onto each
 * SubscriptionItem, because a subscription may hold items on different
 * cadences. This service read only the top-level fields, so on an endpoint
 * rendering at that version or later they are absent, `fromUnix` returns null,
 * and the period is written as nothing — leaving renewal, dunning, the Renewal
 * column and every MRR figure with nothing to read.
 *
 * The same defect as BUG-1128, one field pair over: `STRIPE_API_VERSION` pins
 * outbound calls only, and the version a webhook arrives at is set by a
 * dropdown in a dashboard nobody deployed.
 *
 * **Both shapes are asserted deliberately.** A suite pinning only the new one
 * would let the legacy path rot silently, and the whole defect is that one
 * shape was assumed.
 */

const START = 1756000000;
const END = 1758592000;

describe('BUG-1744 — subscription billing period resolution', () => {
  /** The pre-basil shape this handler was originally written against. */
  const legacy = {
    id: 'sub_legacy',
    current_period_start: START,
    current_period_end: END,
    items: { data: [{ id: 'si_1', quantity: 25 }] },
  };

  /** The basil shape: absent at the top level, present on the item. */
  const basil = {
    id: 'sub_basil',
    items: {
      data: [
        {
          id: 'si_1',
          quantity: 25,
          current_period_start: START,
          current_period_end: END,
        },
      ],
    },
  };

  it('reads the legacy top-level period', () => {
    expect(resolveSubscriptionPeriodStart(legacy)).toEqual(
      new Date(START * 1000),
    );
    expect(resolveSubscriptionPeriodEnd(legacy)).toEqual(new Date(END * 1000));
  });

  it('reads the period off the item when the top level has none', () => {
    expect(resolveSubscriptionPeriodStart(basil)).toEqual(
      new Date(START * 1000),
    );
    expect(resolveSubscriptionPeriodEnd(basil)).toEqual(new Date(END * 1000));
  });

  it('produces a period with length, which is the whole point', () => {
    // The reported state was start == end == the moment the row was created.
    const start = resolveSubscriptionPeriodStart(basil)!;
    const end = resolveSubscriptionPeriodEnd(basil)!;
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('prefers the top level when a version renders both', () => {
    const both = {
      id: 'sub_both',
      current_period_start: START,
      current_period_end: END,
      items: {
        data: [
          {
            id: 'si_1',
            current_period_start: 1,
            current_period_end: 2,
          },
        ],
      },
    };
    expect(resolveSubscriptionPeriodStart(both)).toEqual(
      new Date(START * 1000),
    );
    expect(resolveSubscriptionPeriodEnd(both)).toEqual(new Date(END * 1000));
  });

  it('spans every item rather than trusting the first', () => {
    /*
     * Right for the single-item subscriptions this platform sells today, and
     * the reason to write it now: taking `items.data[0]` would be correct
     * until the first multi-item subscription, then quietly wrong.
     */
    const staggered = {
      id: 'sub_staggered',
      items: {
        data: [
          {
            id: 'si_2',
            current_period_start: START + 100,
            current_period_end: END,
          },
          {
            id: 'si_1',
            current_period_start: START,
            current_period_end: END - 100,
          },
        ],
      },
    };
    expect(resolveSubscriptionPeriodStart(staggered)).toEqual(
      new Date(START * 1000),
    );
    expect(resolveSubscriptionPeriodEnd(staggered)).toEqual(
      new Date(END * 1000),
    );
  });

  it('reports nothing rather than a wrong instant when the period is absent', () => {
    // Null is honest. Writing `new Date()` here is how a period becomes
    // zero-length and indistinguishable from a real one.
    expect(resolveSubscriptionPeriodStart({ id: 'sub_empty' })).toBeNull();
    expect(resolveSubscriptionPeriodEnd({ id: 'sub_empty' })).toBeNull();
    expect(
      resolveSubscriptionPeriodStart({ id: 'sub_x', items: { data: [] } }),
    ).toBeNull();
    expect(
      resolveSubscriptionPeriodEnd({
        id: 'sub_x',
        items: { data: [{ id: 'si_1' }] },
      }),
    ).toBeNull();
  });
});
