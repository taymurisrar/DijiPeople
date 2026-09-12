import {
  computeAnnualSavingsPercent,
  hasPurchasablePrice,
  rankPlanFeatures,
  resolveDefaultCurrency,
} from "./plan-presentation";

describe("resolveDefaultCurrency", () => {
  const plans = [
    {
      prices: [
        { billingCycle: "MONTHLY" as const, currency: "PKR", unitAmount: 300, isCheckoutReady: false },
        { billingCycle: "MONTHLY" as const, currency: "QAR", unitAmount: 8, isCheckoutReady: true },
      ],
    },
  ];

  it("BUG-3333 — never defaults to a currency in which nothing is purchasable when a purchasable one exists", () => {
    expect(
      resolveDefaultCurrency({
        currencies: ["PKR", "QAR"],
        subscriptionCurrency: null,
        plans,
        billingCycle: "MONTHLY",
      }),
    ).toBe("QAR");
  });

  it("prefers the tenant's own subscription currency even if it is also purchasable", () => {
    expect(
      resolveDefaultCurrency({
        currencies: ["PKR", "QAR"],
        subscriptionCurrency: "PKR",
        plans,
        billingCycle: "MONTHLY",
      }),
    ).toBe("PKR");
  });

  it("falls back to the first currency when nothing is purchasable in any of them", () => {
    expect(
      resolveDefaultCurrency({
        currencies: ["PKR"],
        subscriptionCurrency: null,
        plans: [
          {
            prices: [
              { billingCycle: "MONTHLY" as const, currency: "PKR", unitAmount: 300, isCheckoutReady: false },
            ],
          },
        ],
        billingCycle: "MONTHLY",
      }),
    ).toBe("PKR");
  });

  it("returns null when there is no currency at all", () => {
    expect(
      resolveDefaultCurrency({
        currencies: [],
        subscriptionCurrency: null,
        plans: [],
        billingCycle: "MONTHLY",
      }),
    ).toBeNull();
  });
});

describe("hasPurchasablePrice", () => {
  it("is true only for a currency/cycle combination with a checkout-ready price", () => {
    const plans = [
      {
        prices: [
          { billingCycle: "MONTHLY" as const, currency: "QAR", unitAmount: 8, isCheckoutReady: true },
        ],
      },
    ];

    expect(hasPurchasablePrice(plans, "QAR", "MONTHLY")).toBe(true);
    expect(hasPurchasablePrice(plans, "QAR", "ANNUAL")).toBe(false);
    expect(hasPurchasablePrice(plans, "PKR", "MONTHLY")).toBe(false);
  });
});

describe("computeAnnualSavingsPercent", () => {
  it("labels the saving as a percentage when a plan carries both cycles", () => {
    const plans = [
      {
        prices: [
          { billingCycle: "MONTHLY" as const, currency: "QAR", unitAmount: 8, isCheckoutReady: true },
          { billingCycle: "ANNUAL" as const, currency: "QAR", unitAmount: 80, isCheckoutReady: true },
        ],
      },
    ];

    // 8 * 12 = 96 at the monthly rate; 80 actually charged -> ~16.7% saved.
    expect(computeAnnualSavingsPercent(plans, "QAR")).toBe(17);
  });

  it("returns null rather than inventing a figure when no plan has both cycles", () => {
    const plans = [
      {
        prices: [
          { billingCycle: "MONTHLY" as const, currency: "QAR", unitAmount: 8, isCheckoutReady: true },
        ],
      },
    ];

    expect(computeAnnualSavingsPercent(plans, "QAR")).toBeNull();
  });
});

describe("rankPlanFeatures", () => {
  it("BUG-3332 — puts features the previous plan lacks ahead of shared ones", () => {
    const starter = {
      features: [
        { key: "employees", categoryOrder: 1, sortOrder: 1 },
        { key: "leave", categoryOrder: 1, sortOrder: 2 },
      ],
    };
    const enterprise = {
      features: [
        { key: "employees", categoryOrder: 1, sortOrder: 1 },
        { key: "leave", categoryOrder: 1, sortOrder: 2 },
        { key: "payroll", categoryOrder: 6, sortOrder: 1 },
        { key: "compliance", categoryOrder: 6, sortOrder: 2 },
      ],
    };

    const ranked = rankPlanFeatures(enterprise, starter);

    expect(ranked.slice(0, 2).map((feature) => feature.key).sort()).toEqual([
      "compliance",
      "payroll",
    ]);
  });

  it("two plans whose feature sets differ never rank to the same truncated list", () => {
    const starter = { features: [{ key: "employees" }, { key: "leave" }] };
    const growth = {
      features: [
        { key: "employees" },
        { key: "leave" },
        { key: "attendance" },
        { key: "timesheets" },
      ],
    };
    const enterprise = {
      features: [
        { key: "employees" },
        { key: "leave" },
        { key: "attendance" },
        { key: "timesheets" },
        { key: "payroll" },
        { key: "compliance" },
      ],
    };

    const growthTop = rankPlanFeatures(growth, starter).slice(0, 2).map((f) => f.key);
    const enterpriseTop = rankPlanFeatures(enterprise, growth).slice(0, 2).map((f) => f.key);

    expect(growthTop).not.toEqual(enterpriseTop);
  });

  it("returns every enabled feature, in catalog order, for the first plan", () => {
    const plan = {
      features: [
        { key: "b", categoryOrder: 1, sortOrder: 2 },
        { key: "a", categoryOrder: 1, sortOrder: 1 },
        { key: "disabled", isEnabled: false },
      ],
    };

    expect(rankPlanFeatures(plan, undefined).map((f) => f.key)).toEqual([
      "a",
      "b",
    ]);
  });
});
