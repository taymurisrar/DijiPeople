import { planSubscriptionCount } from "./plan-subscription-count";

/**
 * BUG-1953 — the Plans list said Starter had 2 subscriptions, the plan record
 * page said 0 and offered "No tenant is billed on this plan yet."
 *
 * `mapPlan` sends the count under both `subscriptionCount` and `subscriptions`,
 * both numbers. The record page tested `Array.isArray(values.subscriptions)`,
 * which a number never satisfies.
 */
describe("planSubscriptionCount", () => {
  it("reads the count mapPlan actually sends", () => {
    expect(
      planSubscriptionCount({ subscriptionCount: 2, subscriptions: 2 }),
    ).toBe(2);
  });

  it("does not fall through to zero when subscriptions is a number", () => {
    // The exact payload shape the production plan record page received.
    expect(planSubscriptionCount({ subscriptions: 2 })).toBe(2);
  });

  it("still counts the relation shape findGeneric returns", () => {
    expect(
      planSubscriptionCount({
        subscriptions: [{ id: "sub-1" }, { id: "sub-2" }],
      }),
    ).toBe(2);
  });

  it("prefers subscriptionCount over an ambiguous relation payload", () => {
    expect(
      planSubscriptionCount({ subscriptionCount: 7, subscriptions: [] }),
    ).toBe(7);
  });

  it("reports zero for a plan nothing is billed on", () => {
    expect(planSubscriptionCount({ subscriptionCount: 0 })).toBe(0);
    expect(planSubscriptionCount({ subscriptions: [] })).toBe(0);
  });

  it("is defensive about anything else", () => {
    expect(planSubscriptionCount(undefined)).toBe(0);
    expect(planSubscriptionCount(null)).toBe(0);
    expect(planSubscriptionCount({})).toBe(0);
    expect(planSubscriptionCount({ subscriptions: "2" })).toBe(0);
    expect(planSubscriptionCount({ subscriptionCount: Number.NaN })).toBe(0);
    expect(planSubscriptionCount({ subscriptionCount: -3 })).toBe(0);
  });
});
