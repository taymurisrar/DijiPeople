import type { PublicPlanPrice } from "./plans";
import { checkoutBlockedReason, isCheckoutReady } from "./plans";

function price(overrides: Partial<PublicPlanPrice> = {}): PublicPlanPrice {
  return {
    id: "growth-monthly",
    billingCycle: "MONTHLY",
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
