import type { PublicPlan } from "./plans";
import {
  normalizeBillingCycle,
  parseTeamSize,
  resolveSubscribeSelection,
} from "./subscribe-selection";

function plan(overrides: Partial<PublicPlan> = {}): PublicPlan {
  return {
    id: "plan-starter",
    key: "starter",
    name: "Starter",
    description: null,
    currency: "PKR",
    monthlyBasePrice: 0,
    annualBasePrice: 0,
    prices: [],
    features: [],
    metadata: null,
    ...overrides,
  } as PublicPlan;
}

const starter = plan({
  id: "plan-starter",
  key: "starter",
  prices: [
    {
      id: "starter-monthly",
      billingCycle: "MONTHLY",
      currency: "PKR",
      unitAmount: 1000,
      minimumSeats: 1,
      maximumSeats: null,
      hasStripePrice: true,
      isCheckoutReady: true,
    },
  ],
} as Partial<PublicPlan>);

const growth = plan({
  id: "plan-growth",
  key: "growth",
  name: "Growth",
  prices: [
    {
      id: "growth-monthly",
      billingCycle: "MONTHLY",
      currency: "PKR",
      unitAmount: 1500,
      minimumSeats: 5,
      maximumSeats: 200,
      hasStripePrice: true,
      isCheckoutReady: true,
    },
    {
      id: "growth-annual",
      billingCycle: "ANNUAL",
      currency: "PKR",
      unitAmount: 15000,
      minimumSeats: 5,
      maximumSeats: 200,
      hasStripePrice: true,
      isCheckoutReady: true,
    },
  ],
} as Partial<PublicPlan>);

const plans = [starter, growth];

describe("resolveSubscribeSelection", () => {
  // REGRESSION — the whole point. Picking Growth/Annual/50 on /plans used to
  // land on Starter/Monthly, because subscribe only understood planPriceId.
  it("carries plan, billing interval and team size from /plans", () => {
    const selection = resolveSubscribeSelection(plans, {
      plan: "growth",
      billingInterval: "YEAR",
      teamSize: "50",
    });

    expect(selection.planId).toBe("plan-growth");
    expect(selection.billingCycle).toBe("ANNUAL");
    expect(selection.seatQuantity).toBe(50);
    expect(selection.currency).toBe("PKR");
  });

  it("still honours an exact planPriceId above everything else", () => {
    const selection = resolveSubscribeSelection(plans, {
      planPriceId: "growth-annual",
      // Deliberately contradictory — the price id is more specific and wins.
      plan: "starter",
      billingInterval: "MONTH",
    });

    expect(selection.planId).toBe("plan-growth");
    expect(selection.billingCycle).toBe("ANNUAL");
  });

  it("keeps the chosen plan even when the requested interval has no price", () => {
    // Starter has no annual price. Abandoning Starter would be worse than
    // opening it on the cycle it does have.
    const selection = resolveSubscribeSelection(plans, {
      plan: "starter",
      billingInterval: "YEAR",
    });

    expect(selection.planId).toBe("plan-starter");
    expect(selection.billingCycle).toBe("MONTHLY");
  });

  it("raises a team size below the plan minimum", () => {
    const selection = resolveSubscribeSelection(plans, {
      plan: "growth",
      teamSize: "2",
    });
    expect(selection.seatQuantity).toBe(5);
  });

  it("caps a team size above the plan maximum", () => {
    const selection = resolveSubscribeSelection(plans, {
      plan: "growth",
      teamSize: "9999",
    });
    expect(selection.seatQuantity).toBe(200);
  });

  it("matches the plan key case-insensitively", () => {
    expect(resolveSubscribeSelection(plans, { plan: "GROWTH" }).planId).toBe(
      "plan-growth",
    );
  });

  it("falls back to the first plan when nothing usable is named", () => {
    const selection = resolveSubscribeSelection(plans, {});
    expect(selection.planId).toBe("plan-starter");
    expect(selection.billingCycle).toBe("MONTHLY");
    expect(selection.seatQuantity).toBe(1);
  });

  it("ignores an unknown plan key rather than failing", () => {
    expect(resolveSubscribeSelection(plans, { plan: "nope" }).planId).toBe(
      "plan-starter",
    );
  });

  it("handles an empty plan list without throwing", () => {
    const selection = resolveSubscribeSelection([], { plan: "growth" });
    expect(selection.planId).toBe("");
    expect(selection.seatQuantity).toBe(1);
  });
});

/**
 * BUG-0793 — the checkout page quoted a different currency from the rest of the
 * site.
 *
 * `/public/plans` is not market-scoped: it returns every active price in every
 * currency any market publishes, ordered by `currency` ascending. Every
 * `prices[0]` in this resolver therefore meant "whichever currency sorts first"
 * — QAR ahead of USD — while `/` and `/plans` read the market currency from
 * published configuration. A visitor was shown one currency on the plans page
 * and another at checkout, and neither page was obviously the wrong one.
 *
 * The market currency is authoritative. These cases are written against a plan
 * carrying prices in two currencies, because a single-currency fixture cannot
 * fail the way production did.
 */
describe("resolveSubscribeSelection — market currency", () => {
  const multiCurrency = plan({
    id: "plan-growth",
    key: "growth",
    name: "Growth",
    prices: [
      // Deliberately in the order the API returns them: currency ascending.
      {
        id: "growth-monthly-qar",
        billingCycle: "MONTHLY",
        currency: "QAR",
        unitAmount: 25,
        minimumSeats: 1,
        maximumSeats: null,
        hasStripePrice: true,
        isCheckoutReady: true,
      },
      {
        id: "growth-monthly-usd",
        billingCycle: "MONTHLY",
        currency: "USD",
        unitAmount: 5.5,
        minimumSeats: 1,
        maximumSeats: null,
        hasStripePrice: true,
        isCheckoutReady: true,
      },
      {
        id: "growth-annual-usd",
        billingCycle: "ANNUAL",
        currency: "USD",
        unitAmount: 55,
        minimumSeats: 1,
        maximumSeats: null,
        hasStripePrice: true,
        isCheckoutReady: true,
      },
    ],
  } as Partial<PublicPlan>);

  const catalogue = [multiCurrency];

  it("quotes the market currency, not the first one the API listed", () => {
    // The regression itself: with no market currency this returns QAR, because
    // QAR sorts before USD. With one, it must return the market's.
    expect(resolveSubscribeSelection(catalogue, {}, "USD").currency).toBe(
      "USD",
    );
    expect(resolveSubscribeSelection(catalogue, {}, "QAR").currency).toBe(
      "QAR",
    );
  });

  it("picks the price in the market currency, not merely reports it", () => {
    // A currency label that does not match the price actually selected is the
    // same defect wearing a correct-looking string.
    const usd = resolveSubscribeSelection(
      catalogue,
      { billingInterval: "MONTH" },
      "USD",
    );
    expect(usd.currency).toBe("USD");
    expect(usd.billingCycle).toBe("MONTHLY");
  });

  it("normalizes the market currency it is given", () => {
    expect(resolveSubscribeSelection(catalogue, {}, " usd ").currency).toBe(
      "USD",
    );
  });

  it("refuses a price id belonging to another market, keeping the plan", () => {
    /*
     * A link built for a QAR market and opened from a USD one. Honouring the
     * id would quote a price this visitor cannot be sold; dropping the whole
     * parameter would send a buyer who picked Growth to the first plan in the
     * list. Neither is acceptable, so the plan survives and the price is
     * re-resolved.
     */
    const selection = resolveSubscribeSelection(
      catalogue,
      { planPriceId: "growth-monthly-qar" },
      "USD",
    );
    expect(selection.planId).toBe("plan-growth");
    expect(selection.currency).toBe("USD");
  });

  it("still honours a price id that the market can sell", () => {
    const selection = resolveSubscribeSelection(
      catalogue,
      { planPriceId: "growth-annual-usd" },
      "USD",
    );
    expect(selection.planId).toBe("plan-growth");
    expect(selection.billingCycle).toBe("ANNUAL");
    expect(selection.currency).toBe("USD");
  });

  it("reports the market currency even where the plan has no price in it", () => {
    /*
     * The form renders a blocked state from this, and the message names the
     * visitor's region. An empty currency beside "not published for your
     * region" reads as a broken page rather than an answer.
     */
    const selection = resolveSubscribeSelection(catalogue, {}, "PKR");
    expect(selection.currency).toBe("PKR");
    expect(selection.planId).toBe("plan-growth");
  });

  it("leaves every price eligible when the market currency is unknown", () => {
    // commercial-config failed. Quoting from stale plan data beats a checkout
    // with no price at all — but this is the only path that may do it.
    expect(resolveSubscribeSelection(catalogue, {}, null).currency).toBe("QAR");
    expect(resolveSubscribeSelection(catalogue, {}, "").currency).toBe("QAR");
  });
});

describe("normalizeBillingCycle", () => {
  it("accepts both the commercial-config and plan-price vocabularies", () => {
    // The URL is written using one and read using the other.
    expect(normalizeBillingCycle("YEAR")).toBe("ANNUAL");
    expect(normalizeBillingCycle("ANNUAL")).toBe("ANNUAL");
    expect(normalizeBillingCycle("MONTH")).toBe("MONTHLY");
    expect(normalizeBillingCycle("MONTHLY")).toBe("MONTHLY");
    expect(normalizeBillingCycle("month")).toBe("MONTHLY");
  });

  it("returns null for anything it does not recognise", () => {
    expect(normalizeBillingCycle("weekly")).toBeNull();
    expect(normalizeBillingCycle("")).toBeNull();
    expect(normalizeBillingCycle(undefined)).toBeNull();
  });
});

describe("parseTeamSize", () => {
  it("accepts positive integers only", () => {
    expect(parseTeamSize("50")).toBe(50);
    expect(parseTeamSize("0")).toBeNull();
    expect(parseTeamSize("-5")).toBeNull();
    expect(parseTeamSize("abc")).toBeNull();
    expect(parseTeamSize("")).toBeNull();
    expect(parseTeamSize(undefined)).toBeNull();
  });
});

describe("resolveSubscribeSelection — the published billing model", () => {
  /*
   * BUG-1369, in the half that decides seat counts rather than the headline
   * price. `minimumSeats` differs by billing model — QAR Starter is 1 as a flat
   * price and 10 per seat — so resolving the wrong one opens the wizard on a
   * seat count the real price will not accept.
   *
   * FLAT is listed first because that is the order production returned.
   */
  const ambiguous = plan({
    id: "plan-starter",
    key: "starter",
    prices: [
      {
        id: "qar-monthly-flat",
        billingCycle: "MONTHLY",
        billingModel: "FLAT",
        currency: "QAR",
        unitAmount: 249,
        minimumSeats: 1,
        maximumSeats: null,
        hasStripePrice: true,
        isCheckoutReady: true,
      },
      {
        id: "qar-monthly-seat",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        currency: "QAR",
        unitAmount: 8,
        minimumSeats: 10,
        maximumSeats: null,
        hasStripePrice: true,
        isCheckoutReady: true,
      },
    ],
  } as Partial<PublicPlan>);

  const published = { "starter:MONTH": "PER_SEAT" as const };

  it("opens on the published model's seat minimum, not the first price's", () => {
    const selection = resolveSubscribeSelection(
      [ambiguous],
      { billingInterval: "MONTH" },
      "QAR",
      published,
    );

    expect(selection.minimumSeats).toBe(10);
    expect(selection.seatQuantity).toBeGreaterThanOrEqual(10);
  });

  it("keeps the older behaviour when the configuration names no model", () => {
    const selection = resolveSubscribeSelection(
      [ambiguous],
      { billingInterval: "MONTH" },
      "QAR",
    );

    expect(selection.minimumSeats).toBe(1);
  });

  /*
   * A plan the configuration says nothing about must still open. Narrowing to
   * an empty list would turn a presentational defect into a dead wizard, so the
   * filter falls back to the unfiltered candidates.
   */
  it("still resolves a price when the published model has no matching price", () => {
    const selection = resolveSubscribeSelection(
      [ambiguous],
      { billingInterval: "MONTH" },
      "QAR",
      { "starter:MONTH": "FLAT" },
    );

    expect(selection.minimumSeats).toBe(1);
    expect(selection.currency).toBe("QAR");
  });

  it("leaves the market currency authoritative", () => {
    const selection = resolveSubscribeSelection(
      [ambiguous],
      { billingInterval: "MONTH" },
      "USD",
      published,
    );

    // No USD price exists, so the wizard opens blocked — in the market's own
    // currency, which is what the blocked state has to name.
    expect(selection.currency).toBe("USD");
  });
});
