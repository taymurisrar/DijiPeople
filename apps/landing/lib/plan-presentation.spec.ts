import type {
  CommercialConfigView,
  CommercialOfferView,
  CommercialPlanView,
} from "./commercial-config";
import {
  billingUnitLabel,
  buildComparisonMatrix,
  buildSubscribeHref,
  calculateAnnualSaving,
  estimateCost,
  highlightLabel,
  incrementalFeatures,
  plansAreCumulative,
  resolvePlanCta,
} from "./plan-presentation";

function offer(
  overrides: Partial<Extract<CommercialOfferView, { available: true }>> = {},
): CommercialOfferView {
  return {
    available: true,
    billingInterval: "MONTH",
    currency: "PKR",
    unitAmount: 1500,
    billingModel: "PER_SEAT",
    minimumSeats: 1,
    maximumSeats: null,
    includedSeats: 0,
    selfServiceEligible: true,
    priceVersion: 1,
    ...overrides,
  };
}

function unavailableOffer(
  interval: "MONTH" | "YEAR" = "MONTH",
  message = "Pricing for this plan is arranged with our team.",
): CommercialOfferView {
  return {
    available: false,
    billingInterval: interval,
    reason: "UNAVAILABLE",
    message,
  };
}

function plan(overrides: Partial<CommercialPlanView> = {}): CommercialPlanView {
  return {
    id: "plan-growth",
    key: "growth",
    name: "Growth",
    description: "For growing organizations.",
    sortOrder: 20,
    salesModel: "SELF_SERVICE",
    metadata: null,
    features: ["employees", "attendance"],
    offers: [offer(), offer({ billingInterval: "YEAR", unitAmount: 15000 })],
    ...overrides,
  };
}

describe("resolvePlanCta", () => {
  it("offers self-service subscription when the offer allows it", () => {
    const cta = resolvePlanCta(plan(), "MONTH", 50);

    expect(cta.kind).toBe("SELF_SERVICE");
    if (cta.kind !== "SELF_SERVICE") return;
    expect(cta.label).toBe("Start with Growth");
    expect(cta.href).toContain("plan=growth");
  });

  // REGRESSION — Enterprise must not be hardcoded to "Contact sales".
  it("keeps a standard Enterprise plan self-service", () => {
    const enterprise = plan({
      key: "enterprise",
      name: "Enterprise",
      salesModel: "SELF_SERVICE",
    });

    expect(resolvePlanCta(enterprise, "MONTH", 200).kind).toBe("SELF_SERVICE");
  });

  it("routes to sales only when configuration says so", () => {
    const salesAssisted = plan({
      salesModel: "SALES_ASSISTED",
      offers: [unavailableOffer("MONTH"), unavailableOffer("YEAR")],
    });

    const cta = resolvePlanCta(salesAssisted, "MONTH", 50);
    expect(cta.kind).toBe("SALES_ASSISTED");
    if (cta.kind !== "SALES_ASSISTED") return;
    expect(cta.href).toContain("/contact?plan=growth");
  });

  it("routes a custom-contract plan to sales", () => {
    const custom = plan({
      salesModel: "CUSTOM_ONLY",
      offers: [unavailableOffer("MONTH"), unavailableOffer("YEAR")],
    });

    expect(resolvePlanCta(custom, "MONTH", 50).kind).toBe("CUSTOM_ONLY");
  });

  // REGRESSION — a published plan with no usable price must never offer checkout.
  it("never offers a subscribe button when no price resolves", () => {
    const unpriced = plan({
      salesModel: "SELF_SERVICE",
      offers: [
        unavailableOffer("MONTH", "No published price is available."),
        unavailableOffer("YEAR"),
      ],
    });

    const cta = resolvePlanCta(unpriced, "MONTH", 50);
    expect(cta.kind).toBe("UNAVAILABLE");
    if (cta.kind !== "UNAVAILABLE") return;
    expect(cta.message).toContain("No published price");
  });

  it("does not offer checkout when the offer resolves but is not self-service eligible", () => {
    const gated = plan({
      offers: [offer({ selfServiceEligible: false })],
    });

    expect(resolvePlanCta(gated, "MONTH", 50).kind).toBe("UNAVAILABLE");
  });
});

describe("buildSubscribeHref", () => {
  // REGRESSION — picking Growth/Annual/50 used to land on Starter/Monthly.
  it("carries plan, interval and team size to subscribe", () => {
    const href = buildSubscribeHref(plan(), "YEAR", 50);
    const params = new URLSearchParams(href.split("?")[1]);

    expect(params.get("plan")).toBe("growth");
    expect(params.get("billingInterval")).toBe("YEAR");
    expect(params.get("teamSize")).toBe("50");
  });

  it("omits a team size that is not a usable number", () => {
    expect(buildSubscribeHref(plan(), "MONTH", 0)).not.toContain("teamSize");
    expect(buildSubscribeHref(plan(), "MONTH", NaN)).not.toContain("teamSize");
  });
});

describe("highlightLabel", () => {
  // REGRESSION — this used to fall back to `index === 1`, so whichever plan was
  // second became "Popular" regardless of configuration.
  it("returns nothing when configuration marks no highlight", () => {
    expect(highlightLabel(plan())).toBeNull();
    expect(highlightLabel(plan({ metadata: {} }))).toBeNull();
  });

  it("reads the flags from plan metadata", () => {
    expect(highlightLabel(plan({ metadata: { isRecommended: true } }))).toBe(
      "Recommended",
    );
    expect(highlightLabel(plan({ metadata: { isPopular: true } }))).toBe(
      "Popular",
    );
  });

  it("prefers Recommended over Popular when both are set", () => {
    expect(
      highlightLabel(plan({ metadata: { isPopular: true, isRecommended: true } })),
    ).toBe("Recommended");
  });
});

describe("calculateAnnualSaving", () => {
  it("computes the real saving from published prices", () => {
    // 1500/mo = 18000/yr against a 15000 annual price.
    const saving = calculateAnnualSaving(plan());

    expect(saving).not.toBeNull();
    expect(saving?.amount).toBe(3000);
    expect(saving?.percent).toBe(17);
    expect(saving?.currency).toBe("PKR");
  });

  // REGRESSION — a fixed discount percentage used to render regardless of price.
  it("returns null when annual is not actually cheaper", () => {
    const noSaving = plan({
      offers: [offer(), offer({ billingInterval: "YEAR", unitAmount: 18000 })],
    });
    expect(calculateAnnualSaving(noSaving)).toBeNull();

    const worse = plan({
      offers: [offer(), offer({ billingInterval: "YEAR", unitAmount: 20000 })],
    });
    expect(calculateAnnualSaving(worse)).toBeNull();
  });

  it("returns null when either offer is unavailable", () => {
    expect(
      calculateAnnualSaving(plan({ offers: [offer(), unavailableOffer("YEAR")] })),
    ).toBeNull();
  });

  it("refuses to compare across currencies", () => {
    const mixed = plan({
      offers: [
        offer(),
        offer({ billingInterval: "YEAR", unitAmount: 100, currency: "USD" }),
      ],
    });
    expect(calculateAnnualSaving(mixed)).toBeNull();
  });
});

describe("estimateCost", () => {
  it("multiplies a per-employee price by team size", () => {
    const estimate = estimateCost(offer(), 50);
    expect(estimate?.total).toBe(75000);
    expect(estimate?.billable).toBe(50);
  });

  // A FLAT price does not scale — multiplying would overstate it 50-fold.
  it("does not multiply a flat price by team size", () => {
    const estimate = estimateCost(offer({ billingModel: "FLAT", unitAmount: 199 }), 50);
    expect(estimate?.total).toBe(199);
    expect(estimate?.billable).toBe(1);
  });

  it("flags team sizes outside the configured bounds", () => {
    expect(estimateCost(offer({ minimumSeats: 10 }), 5)?.belowMinimum).toBe(true);
    expect(estimateCost(offer({ maximumSeats: 100 }), 250)?.aboveMaximum).toBe(
      true,
    );
  });

  /*
   * The page and the invoice must agree.
   *
   * `resolveCommercialOffer` bills `max(quantity, minimumSeats)`, because the
   * commitment applies even below it. If this estimate ignored the minimum, a
   * six-person company would be quoted six seats here and charged for ten —
   * which is the shape of BUG-0080, a page disagreeing with Stripe.
   */
  it("bills the minimum seats, matching what the server charges", () => {
    const estimate = estimateCost(
      offer({ minimumSeats: 10, unitAmount: 300 }),
      6,
    );

    expect(estimate?.billable).toBe(10);
    expect(estimate?.total).toBe(3000);
    // Still flagged, so the page can explain the difference rather than hide it.
    expect(estimate?.belowMinimum).toBe(true);
  });

  it("does not inflate a team that already clears the minimum", () => {
    // The pair. Without it, an estimate that always billed `minimumSeats`
    // would satisfy the test above while undercharging every larger customer.
    const estimate = estimateCost(
      offer({ minimumSeats: 10, unitAmount: 300 }),
      40,
    );

    expect(estimate?.billable).toBe(40);
    expect(estimate?.total).toBe(12000);
  });

  it("returns null rather than zero when no price is available", () => {
    expect(estimateCost(unavailableOffer(), 50)).toBeNull();
    expect(estimateCost(null, 50)).toBeNull();
  });
});

describe("billingUnitLabel", () => {
  // For a per-seat price the unit is an active employee, not a login or a
  // "seat" — a tenant admin who is not an employee does not consume one.
  it("names active employees when the price is per seat", () => {
    expect(billingUnitLabel(offer())).toBe("per active employee / month");
    expect(billingUnitLabel(offer({ billingInterval: "YEAR" }))).toBe(
      "per active employee / year",
    );
  });

  it("names only the period when the price is flat", () => {
    /*
     * This used to return null, which rendered a bare figure with no unit at
     * all. DijiPeople's public plans are flat, so that was every price on the
     * pricing page — "$199" with nothing saying per what, beside body copy
     * claiming the price was per employee. Saying nothing is not the same as
     * saying nothing misleading.
     */
    expect(billingUnitLabel(offer({ billingModel: "FLAT" }))).toBe("per month");
    expect(
      billingUnitLabel(offer({ billingModel: "FLAT", billingInterval: "YEAR" })),
    ).toBe("per year");
  });

  it("says nothing about a price that is not available", () => {
    expect(billingUnitLabel(unavailableOffer())).toBeNull();
    expect(billingUnitLabel(null)).toBeNull();
  });
});

describe("plan entitlement presentation", () => {
  const config: CommercialConfigView = {
    market: {
      code: "PK",
      name: "Pakistan",
      selfServiceEnabled: true,
      launchStatus: "LAUNCHED",
    },
    currency: "PKR",
    billingIntervals: ["MONTH", "YEAR"],
    plans: [
      plan({ key: "starter", name: "Starter", features: ["employees"] }),
      plan({
        key: "growth",
        name: "Growth",
        features: ["employees", "attendance"],
      }),
      plan({
        key: "enterprise",
        name: "Enterprise",
        features: ["employees", "attendance", "payroll"],
      }),
    ],
    featureCatalog: [
      {
        key: "employees",
        label: "Employees",
        description: "Employee directory.",
        categoryKey: "core-hr",
        categoryLabel: "Core HR",
        categoryOrder: 10,
        sortOrder: 10,
        icon: "users",
      },
      {
        key: "attendance",
        label: "Attendance",
        description: "Attendance capture.",
        categoryKey: "workforce",
        categoryLabel: "Workforce Operations",
        categoryOrder: 20,
        sortOrder: 10,
        icon: "clock-3",
      },
      {
        key: "payroll",
        label: "Payroll",
        description: "Payroll cycles.",
        categoryKey: "payroll-finance",
        categoryLabel: "Payroll & Finance",
        categoryOrder: 60,
        sortOrder: 10,
        icon: "wallet",
      },
    ],
  };

  it("builds the comparison from backend entitlements, grouped by category", () => {
    const matrix = buildComparisonMatrix(config);

    expect(matrix.map((group) => group.key)).toEqual([
      "core-hr",
      "workforce",
      "payroll-finance",
    ]);

    const payroll = matrix.find((group) => group.key === "payroll-finance");
    // Starter and Growth exclude payroll; Enterprise includes it.
    expect(payroll?.rows[0].included).toEqual([false, false, true]);
  });

  it("detects that the plans nest, so 'everything in X, plus' is honest", () => {
    expect(plansAreCumulative(config.plans)).toBe(true);
  });

  // If entitlements stop nesting, the page must not claim a hierarchy.
  it("detects when plans are not strict supersets", () => {
    const notNested = [
      plan({ key: "a", features: ["employees", "payroll"] }),
      plan({ key: "b", features: ["employees", "attendance"] }),
    ];
    expect(plansAreCumulative(notNested)).toBe(false);
  });

  it("lists only what each plan adds over the previous one", () => {
    expect(incrementalFeatures(config.plans, 0, config.featureCatalog)).toEqual([
      "Employees",
    ]);
    expect(incrementalFeatures(config.plans, 1, config.featureCatalog)).toEqual([
      "Attendance",
    ]);
    expect(incrementalFeatures(config.plans, 2, config.featureCatalog)).toEqual([
      "Payroll",
    ]);
  });

  it("falls back to the raw key if the catalogue lacks a label", () => {
    const orphan = [plan({ key: "x", features: ["unknown-feature"] })];
    expect(incrementalFeatures(orphan, 0, config.featureCatalog)).toEqual([
      "unknown-feature",
    ]);
  });
});
