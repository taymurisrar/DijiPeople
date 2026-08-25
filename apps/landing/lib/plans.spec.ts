import type { PublicPlanPrice } from "./plans";
import {
  checkoutBlockedReason,
  findPlanPrice,
  formatBillingUnit,
  formatSeatTotalEstimate,
  isCheckoutReady,
} from "./plans";

function price(overrides: Partial<PublicPlanPrice> = {}): PublicPlanPrice {
  return {
    id: "growth-monthly",
    billingCycle: "MONTHLY",
    // Per-seat is the shape the public plans actually use, and the shape the
    // seat-total estimate is defined over. Defaulting to anything else would
    // make every estimate assertion below vacuously null.
    billingModel: "PER_SEAT",
    currency: "PKR",
    unitAmount: 1500,
    minimumSeats: 1,
    maximumSeats: null,
    hasStripePrice: true,
    isCheckoutReady: true,
    ...overrides,
  } as PublicPlanPrice;
}

describe("isCheckoutReady", () => {
  it("accepts either spelling the API has used", () => {
    expect(isCheckoutReady(price({ isCheckoutReady: true }))).toBe(true);
    expect(
      isCheckoutReady(price({ isCheckoutReady: false, checkoutReady: true })),
    ).toBe(true);
  });

  it("treats a missing price as not purchasable", () => {
    expect(isCheckoutReady(null)).toBe(false);
  });
});

describe("checkoutBlockedReason", () => {
  it("says nothing when the selection can be bought", () => {
    expect(checkoutBlockedReason(price())).toBeNull();
  });

  /*
   * BUG-0082, which is BUG-0066 returning in a worse shape.
   *
   * The single-page subscribe form disabled its fieldset and said why. The
   * five-step wizard that replaced it did neither: the notice lost its id and
   * the fieldset disappeared, so a visitor whose plan had no Stripe price could
   * type an organization profile, an owner identity and signed agreements
   * across every step before meeting a dead submit button on the last one.
   *
   * Asserting only that submit is disabled cannot catch that, because submit is
   * not rendered until the typing is already done. The reason has to exist
   * before the first step, which is why this returns a sentence the wizard can
   * hang a disabled fieldset and a disabled Continue on.
   */
  it("names a reason for a price that exists but cannot be charged", () => {
    const reason = checkoutBlockedReason(
      price({ isCheckoutReady: false, hasStripePrice: false }),
    );

    expect(reason).not.toBeNull();
    /*
     * "not available to buy online" rather than the previous "checkout is not
     * available yet". The wording moved when the page stopped disabling the
     * form and started hiding it: the visitor is now told what is true of the
     * *plan*, and is given a code to quote and two links to follow, rather than
     * a sentence about a mechanism they cannot see.
     *
     * Asserted loosely on purpose — this pins the *meaning*, and the code and
     * the routes out are pinned in `subscribe-lock.spec.ts` where they belong.
     */
    expect(reason).toContain("not available to buy online");
  });

  it("names a different reason when no price resolved at all", () => {
    const reason = checkoutBlockedReason(null);

    expect(reason).not.toBeNull();
    expect(reason).toContain("not published for your region");
  });

  // The two cases are genuinely different and must not collapse into one
  // message — "no price for your region" and "price exists but is not wired to
  // Stripe" send the reader to different places.
  it("keeps the two reasons distinguishable", () => {
    expect(checkoutBlockedReason(null)).not.toBe(
      checkoutBlockedReason(price({ isCheckoutReady: false })),
    );
  });

  it("agrees with isCheckoutReady in both directions", () => {
    for (const candidate of [
      price(),
      price({ isCheckoutReady: false }),
      null,
    ]) {
      expect(checkoutBlockedReason(candidate) === null).toBe(
        isCheckoutReady(candidate),
      );
    }
  });
});

describe("formatSeatTotalEstimate", () => {
  /*
   * BUG-1302. This sentence ended in a hardcoded "per month" for every per-seat
   * price, so an annual plan quoted its yearly total and called it monthly —
   * twelve times the real figure, on the screen before payment.
   *
   * The QA run that found it proved the discrepancy against Stripe: the page
   * said "$75.00 per month" and the Stripe session charged QAR 284.40 *per
   * year*. Asserting the period is therefore not a copy nitpick; it is the
   * assertion that the page and the payment processor agree.
   */
  it("names a yearly period for an annual price", () => {
    const estimate = formatSeatTotalEstimate(
      price({ billingCycle: "ANNUAL", currency: "USD", unitAmount: 3 }),
      25,
    );

    expect(estimate).toContain("per year");
    expect(estimate).not.toContain("per month");
    expect(estimate).toContain("$75.00");
  });

  it("names a monthly period for a monthly price", () => {
    const estimate = formatSeatTotalEstimate(
      price({ billingCycle: "MONTHLY", currency: "USD", unitAmount: 8 }),
      25,
    );

    expect(estimate).toContain("per month");
    expect(estimate).not.toContain("per year");
    expect(estimate).toContain("$200.00");
  });

  it("multiplies by seats, not by anything else", () => {
    expect(
      formatSeatTotalEstimate(
        price({ billingCycle: "ANNUAL", currency: "USD", unitAmount: 80 }),
        25,
      ),
    ).toContain("$2,000.00");
  });

  it("keeps the seat noun singular for one seat", () => {
    expect(formatSeatTotalEstimate(price(), 1)).toContain("1 purchased seat ·");
    expect(formatSeatTotalEstimate(price(), 2)).toContain("2 purchased seats");
  });

  // A flat price has no seat arithmetic to show; the caller renders
  // "Billed as one subscription." instead, so null is the contract.
  it("returns null for a price that is not per-seat", () => {
    expect(
      formatSeatTotalEstimate(price({ billingModel: "FLAT" }), 25),
    ).toBeNull();
    expect(formatSeatTotalEstimate(null, 25)).toBeNull();
  });

  // The unit caption and the total must never disagree about the period.
  it("agrees with formatBillingUnit about the period", () => {
    for (const cycle of ["MONTHLY", "ANNUAL"] as const) {
      const candidate = price({
        billingCycle: cycle,
        billingModel: "PER_SEAT",
      });
      const unit = formatBillingUnit(candidate);
      const total = formatSeatTotalEstimate(candidate, 10);
      const yearly = cycle === "ANNUAL";

      expect(unit?.includes("/ year")).toBe(yearly);
      expect(total?.includes("per year")).toBe(yearly);
    }
  });
});

describe("findPlanPrice — the published billing model", () => {
  /*
   * BUG-1369. A price is identified by three things: currency, billing cycle
   * and billing *model*. This matched the first two and returned whichever
   * candidate `/public/plans` happened to list first.
   *
   * It agreed with /plans only while one model per currency and cycle was
   * sellable. When the QAR prices were synced to Stripe the FLAT rows became
   * sellable too, and checkout began quoting "QAR 249, billed as one
   * subscription" against an advertised "QAR 8 per active employee" — the same
   * selection, two prices, about 25% apart at 25 seats.
   *
   * The fixture puts FLAT first deliberately: that is the order production
   * returned, and a test with the per-seat price first would pass against the
   * broken resolver.
   */
  const ambiguous = {
    id: "plan-starter",
    key: "starter",
    prices: [
      price({
        id: "qar-monthly-flat",
        billingCycle: "MONTHLY",
        billingModel: "FLAT",
        currency: "QAR",
        unitAmount: 249,
        minimumSeats: 1,
      }),
      price({
        id: "qar-monthly-seat",
        billingCycle: "MONTHLY",
        billingModel: "PER_SEAT",
        currency: "QAR",
        unitAmount: 8,
        minimumSeats: 10,
      }),
    ],
  } as unknown as Parameters<typeof findPlanPrice>[0];

  it("resolves the model the market publishes, not the first one listed", () => {
    expect(findPlanPrice(ambiguous, "QAR", "MONTHLY", "PER_SEAT")?.id).toBe(
      "qar-monthly-seat",
    );
  });

  it("resolves a published FLAT model just as faithfully", () => {
    // The fix is "honour the publisher", not "prefer per-seat" — deciding that
    // here would author a commercial policy in the frontend.
    expect(findPlanPrice(ambiguous, "QAR", "MONTHLY", "FLAT")?.id).toBe(
      "qar-monthly-flat",
    );
  });

  it("keeps the older positional behaviour when no model is known", () => {
    // The degraded path: no commercial config, so no published model. Same
    // answer as before the fix, which is no worse than before the fix.
    expect(findPlanPrice(ambiguous, "QAR", "MONTHLY")?.id).toBe(
      "qar-monthly-flat",
    );
  });

  it("returns null rather than a model the market does not publish", () => {
    const seatOnly = {
      id: "plan-starter",
      key: "starter",
      prices: [
        price({
          id: "qar-monthly-seat",
          billingCycle: "MONTHLY",
          billingModel: "PER_SEAT",
          currency: "QAR",
        }),
      ],
    } as unknown as Parameters<typeof findPlanPrice>[0];

    // Quoting a basis the market does not publish is a wrong number presented
    // as a right one — the same argument the currency dimension already makes.
    expect(findPlanPrice(seatOnly, "QAR", "MONTHLY", "FLAT")).toBeNull();
  });

  it("still refuses a currency the market does not use", () => {
    expect(findPlanPrice(ambiguous, "USD", "MONTHLY", "PER_SEAT")).toBeNull();
  });
});
