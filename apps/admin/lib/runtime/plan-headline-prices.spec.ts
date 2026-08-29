import {
  describePlanSchedule,
  selectPlanHeadlinePrices,
  type PlanPriceLike,
} from "./plan-headline-prices";

/**
 * BUG-1954 — the Starter plan detail rendered PKR 300.00 monthly beside
 * PKR 120,000.00 annually, and captioned it "No annual discount against
 * monthly billing".
 *
 * The fixture below is Starter's real production schedule from
 * `pricing.catalog.ts`, in the order the API sends it: the repository orders
 * plan prices by `currency asc, billingCycle asc`, so the first ANNUAL row is
 * PKR and the per-seat/flat rows tie within it. Picking each cycle
 * independently is what crossed the two schedules.
 */
function starterPrices(): PlanPriceLike[] {
  // currency asc, then billingCycle asc ("ANNUAL" < "MONTHLY").
  const rows: Array<[string, string, string, number]> = [
    ["PKR", "ANNUAL", "FLAT", 120_000],
    ["PKR", "ANNUAL", "PER_SEAT", 3_000],
    ["PKR", "MONTHLY", "FLAT", 12_000],
    ["PKR", "MONTHLY", "PER_SEAT", 300],
    ["QAR", "ANNUAL", "FLAT", 2_490],
    ["QAR", "ANNUAL", "PER_SEAT", 80],
    ["QAR", "MONTHLY", "FLAT", 249],
    ["QAR", "MONTHLY", "PER_SEAT", 8],
    ["USD", "ANNUAL", "FLAT", 690],
    ["USD", "ANNUAL", "PER_SEAT", 22],
    ["USD", "MONTHLY", "FLAT", 69],
    ["USD", "MONTHLY", "PER_SEAT", 2.2],
  ];
  return rows.map(([currency, billingCycle, billingModel, unitAmount]) => ({
    currency,
    billingCycle,
    billingModel,
    unitAmount,
    isActive: true,
  }));
}

describe("selectPlanHeadlinePrices", () => {
  it("pairs the annual price with the monthly price of the same schedule", () => {
    const headline = selectPlanHeadlinePrices(starterPrices());

    expect(headline.currency).toBe("PKR");
    expect(headline.billingModel).toBe("PER_SEAT");
    expect(headline.monthly).toBe(300);
    expect(headline.annual).toBe(3_000);
  });

  it("never shows the flat annual price beside the per-seat monthly one", () => {
    // The literal regression: 120,000 is the PKR flat annual price, and it was
    // rendered against the PKR per-seat monthly price of 300.
    const headline = selectPlanHeadlinePrices(starterPrices());

    expect(headline.annual).not.toBe(120_000);
  });

  it("reports the discount the paired schedule actually encodes", () => {
    // Annual is ten months of monthly: 3,000 against 3,600 is two months free.
    const headline = selectPlanHeadlinePrices(starterPrices());

    expect(headline.annualSaving).toBe(600);
    expect(headline.annualSavingPercent).toBe(17);
  });

  it("says how many other schedules the plan carries", () => {
    // Three currencies x two billing models; one is shown, five are not.
    expect(selectPlanHeadlinePrices(starterPrices()).otherScheduleCount).toBe(5);
  });

  it("holds for a fractional currency without rescaling the stored amount", () => {
    const usdOnly = starterPrices().filter(
      (price) => price.currency === "USD" && price.billingModel === "PER_SEAT",
    );
    const headline = selectPlanHeadlinePrices(usdOnly);

    // `unitAmount` is Decimal(12,2) in major units end to end. Nothing here
    // multiplies or divides by 100, in either direction.
    expect(headline.currency).toBe("USD");
    expect(headline.monthly).toBe(2.2);
    expect(headline.annual).toBe(22);
    expect(headline.annualSavingPercent).toBe(17);
  });

  it("holds for a currency whose amounts are whole units", () => {
    const qarOnly = starterPrices().filter((price) => price.currency === "QAR");
    const headline = selectPlanHeadlinePrices(qarOnly);

    expect(headline.currency).toBe("QAR");
    expect(headline.billingModel).toBe("PER_SEAT");
    expect(headline.monthly).toBe(8);
    expect(headline.annual).toBe(80);
  });

  it("falls back to flat when a plan is sold no other way", () => {
    const flatOnly = starterPrices().filter(
      (price) => price.billingModel === "FLAT" && price.currency === "PKR",
    );
    const headline = selectPlanHeadlinePrices(flatOnly);

    expect(headline.billingModel).toBe("FLAT");
    expect(headline.monthly).toBe(12_000);
    expect(headline.annual).toBe(120_000);
    expect(headline.annualSavingPercent).toBe(17);
  });

  it("prefers a schedule carrying both cycles over a per-seat half-schedule", () => {
    const headline = selectPlanHeadlinePrices([
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        unitAmount: 9,
        isActive: true,
      },
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "FLAT",
        unitAmount: 99,
        isActive: true,
      },
      {
        currency: "USD",
        billingCycle: "ANNUAL",
        billingModel: "FLAT",
        unitAmount: 990,
        isActive: true,
      },
    ]);

    expect(headline.billingModel).toBe("FLAT");
    expect(headline.monthly).toBe(99);
    expect(headline.annual).toBe(990);
  });

  it("ignores deactivated prices", () => {
    const headline = selectPlanHeadlinePrices([
      ...starterPrices().map((price) => ({ ...price, isActive: false })),
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        unitAmount: 5,
        isActive: true,
      },
    ]);

    expect(headline.currency).toBe("USD");
    expect(headline.monthly).toBe(5);
    expect(headline.annual).toBeNull();
    expect(headline.annualSaving).toBe(0);
  });

  it("clamps a dearer annual price rather than reporting a negative saving", () => {
    const headline = selectPlanHeadlinePrices([
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        unitAmount: 10,
        isActive: true,
      },
      {
        currency: "USD",
        billingCycle: "ANNUAL",
        billingModel: "PER_SEAT",
        unitAmount: 200,
        isActive: true,
      },
    ]);

    expect(headline.annualSaving).toBe(0);
    expect(headline.annualSavingPercent).toBe(0);
  });

  it("takes the lowest row when a schedule carries duplicates", () => {
    const headline = selectPlanHeadlinePrices([
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        unitAmount: 12,
        isActive: true,
      },
      {
        currency: "USD",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        unitAmount: 10,
        isActive: true,
      },
    ]);

    expect(headline.monthly).toBe(10);
  });

  it("answers empty for a plan with no priced rows", () => {
    for (const input of [undefined, null, [], "prices", [null, 42, {}]]) {
      const headline = selectPlanHeadlinePrices(input);
      expect(headline.currency).toBeNull();
      expect(headline.monthly).toBeNull();
      expect(headline.annual).toBeNull();
      expect(headline.otherScheduleCount).toBe(0);
    }
  });
});

describe("describePlanSchedule", () => {
  it("names the schedule the tiles are showing", () => {
    expect(describePlanSchedule(selectPlanHeadlinePrices(starterPrices()))).toBe(
      "Per seat, PKR",
    );
  });

  it("is empty when nothing is priced", () => {
    expect(describePlanSchedule(selectPlanHeadlinePrices([]))).toBe("");
  });
});
