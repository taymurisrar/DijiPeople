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
