import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkoutBlockedReason } from "./plans";

const form = readFileSync(
  join(__dirname, "..", "app", "subscribe", "subscribe-form.tsx"),
  "utf8",
);

/**
 * A locked form has to look locked, and say why where it is locked.
 *
 * The wizard disables its fields when the selected price cannot be bought, and
 * that is correct — BUG-0066 and BUG-0082 exist because it once collected five
 * steps of organization profile, owner identity and signed agreements before
 * revealing a dead submit button.
 *
 * What it did not do was *look* disabled or *say so* anywhere near the fields.
 * The fieldset carried no visual state, so every control looked ordinary and
 * silently ignored the pointer; the explanation sat in the left-hand plan card
 * while the inert fields were in the right-hand column. A screen reader was
 * told, via `aria-describedby`, what a sighted visitor was not — and the form
 * was asked about directly: "why is the form locked?"
 *
 * `apps/landing` jest runs in node over `.ts`, so this is structural. It pins
 * the three properties that were missing, each one edit from going again.
 */
describe("the subscribe form when checkout is unavailable", () => {
  it("still states a reason for both ways checkout can be impossible", () => {
    // The sentence is what the notice renders; a boolean could not be shown.
    expect(checkoutBlockedReason(null)).toContain("no published price");
    expect(
      checkoutBlockedReason({
        currency: "USD",
        billingCycle: "MONTHLY",
        unitAmount: 199,
        isCheckoutReady: false,
      } as Parameters<typeof checkoutBlockedReason>[0]),
    ).toContain("not available yet");
  });

  it("carries the notice id exactly once", () => {
    /*
     * Two elements with this id is not twice the clarity: the BUG-0066 e2e
     * locates it and asserts visibility, and a duplicate is a strict-mode
     * violation. The plan card's line is deliberately id-less.
     */
    const assignments = form.match(/id="subscribe-unavailable-notice"/g) ?? [];
    expect(assignments).toHaveLength(1);
  });

  it("puts the notice next to the fields, not only beside the price", () => {
    /*
     * The reason has to live where the consequence is. Asserted by position:
     * the notice must appear before the fieldset it explains.
     */
    const notice = form.indexOf('id="subscribe-unavailable-notice"');
    const fieldset = form.indexOf("<fieldset");
    const priceCard = form.indexOf("formatPlanPrice(selectedPrice)");
    expect(notice).toBeGreaterThan(-1);
    expect(fieldset).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(fieldset);
    expect(notice).toBeGreaterThan(priceCard);
  });

  it("draws the fieldset as inert, not merely marks it", () => {
    /*
     * `disabled` alone makes the controls ignore input while looking exactly as
     * they did — which is worse than an obviously dead form, because a visitor
     * blames themselves or the browser rather than reading the page.
     */
    const fieldsetTag = form.slice(
      form.indexOf("<fieldset"),
      form.indexOf("<fieldset") + 400,
    );
    expect(fieldsetTag).toContain("disabled={!canCheckout}");
    expect(fieldsetTag).toMatch(/opacity-\d+/);
    expect(fieldsetTag).toContain("cursor-not-allowed");
  });

  it("keeps the plan and billing selectors outside the disabled region", () => {
    /*
     * Deliberate, and the reason the fieldset wraps the steps rather than the
     * whole form: a visitor whose plan is unpurchasable must be able to try
     * another one. Disabling those would replace one dead end with a worse one.
     */
    const fieldset = form.indexOf("<fieldset");
    expect(form.indexOf("formatPlanPrice(selectedPrice)")).toBeLessThan(
      fieldset,
    );
  });

  it("offers a way out rather than only an explanation", () => {
    const notice = form.slice(
      form.indexOf('id="subscribe-unavailable-notice"'),
      form.indexOf("<fieldset"),
    );
    expect(notice).toContain('href="/contact"');
  });
});
