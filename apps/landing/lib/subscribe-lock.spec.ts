import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkoutBlock, CHECKOUT_BLOCK_CODES } from "./plans";

const form = readFileSync(
  join(__dirname, "..", "app", "subscribe", "subscribe-form.tsx"),
  "utf8",
);

/**
 * What a visitor sees when the selected plan cannot be bought online.
 *
 * The wizard has to refuse — BUG-0066 and BUG-0082 exist because it once
 * collected five steps of organization profile, owner identity and signed
 * agreements before revealing a dead submit button. How it refuses has now
 * been through three shapes, and the reasons are worth keeping:
 *
 *   1. Fields left interactive. Typing was discarded.
 *   2. Fields disabled but visually unchanged, with the explanation in another
 *      column. Reported as "why is the form locked?" — `aria-describedby` told
 *      a screen reader what a sighted visitor was not, which is the reverse of
 *      the usual failure and hides better, because accessibility checks pass.
 *   3. No form at all, plus a quotable support code. A page of dead inputs
 *      invites a visitor to read them and guess which one is the problem.
 *
 * `apps/landing` jest runs in node over `.ts`, so the markup assertions are
 * structural. They pin the properties that were missing, each one edit away.
 */
describe("the subscribe form when checkout is unavailable", () => {
  it("gives each way checkout can be impossible its own quotable code", () => {
    /*
     * A visitor cannot act on "the Stripe price is unverified" and should not
     * be shown it — it exposes our billing plumbing and leaves them no better
     * off. A code they can quote turns a dead end into the start of a support
     * conversation, and it resolves for us to the plan price whose full
     * readiness list is already on the console.
     */
    expect(checkoutBlock(null)?.code).toBe(
      CHECKOUT_BLOCK_CODES.NO_REGIONAL_PRICE,
    );
    expect(
      checkoutBlock({
        currency: "USD",
        billingCycle: "MONTHLY",
        unitAmount: 199,
        isCheckoutReady: false,
      } as Parameters<typeof checkoutBlock>[0])?.code,
    ).toBe(CHECKOUT_BLOCK_CODES.NOT_SELLABLE);
  });

  it("keeps the codes coarse, so a code cannot leak the misconfiguration", () => {
    /*
     * `deriveCheckoutReadiness` distinguishes ten causes. A code per cause
     * would be a public map of how our billing is wired and of which part of it
     * is currently broken. Two is the most this may carry.
     */
    expect(Object.keys(CHECKOUT_BLOCK_CODES)).toHaveLength(2);
    for (const code of Object.values(CHECKOUT_BLOCK_CODES))
      expect(code).toMatch(/^DP-CHK-\d\d$/);
  });

  it("says nothing about billing internals in the visitor-facing message", () => {
    for (const candidate of [
      null,
      { isCheckoutReady: false } as Parameters<typeof checkoutBlock>[0],
    ]) {
      const message = checkoutBlock(candidate)?.message ?? "";
      for (const leak of [
        "Stripe",
        "price id",
        "sync",
        "environment",
        "verified",
      ])
        expect(message.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("carries the notice id exactly once", () => {
    /*
     * Two elements with this id is not twice the clarity: the BUG-0066 e2e
     * locates it and asserts visibility, and a duplicate is a strict-mode
     * violation. The plan card line is deliberately id-less.
     */
    const assignments = form.match(/id="subscribe-unavailable-notice"/g) ?? [];
    expect(assignments).toHaveLength(1);
  });

  it("renders no step fields at all while checkout is blocked", () => {
    /*
     * The load-bearing assertion, and the change from the previous version: the
     * form was disabled and left on screen, which invited a visitor to read
     * dead inputs and guess which one was the problem. The notice and the
     * fieldset are now branches of one ternary, so there is no arrangement of
     * state that shows both.
     */
    expect(form).toMatch(/\{block \? \(/);
    // The fieldset no longer needs a disabled state, because it is not rendered
    // at all while blocked. Continue and Submit keep theirs — BUG-0082.
    const fieldsetTag = form.slice(
      form.indexOf("<fieldset"),
      form.indexOf("<fieldset") + 120,
    );
    expect(fieldsetTag).not.toContain("disabled");
    expect(form).toMatch(/disabled=\{isSubmitting \|\| !canCheckout\}/);
  });

  it("shows the code where the visitor will read it", () => {
    const notice = form.slice(
      form.indexOf('id="subscribe-unavailable-notice"'),
      form.indexOf("The honeypot"),
    );
    expect(notice).toContain("({block.code})");
    expect(notice).toContain("block.message");
  });

  it("offers a way out, and carries the code into it", () => {
    const notice = form.slice(
      form.indexOf('id="subscribe-unavailable-notice"'),
      form.indexOf("The honeypot"),
    );
    // So a support conversation starts already knowing which plan and region.
    expect(notice).toContain("/contact?checkout=");
    expect(notice).toContain('href="/plans"');
  });

  /*
   * BUG-1303. This link carried the diagnostic through the partner referral
   * parameter, so clicking it stored DP-CHK-01 as the visitor's referral code
   * for thirty days and — because attribution is first-touch — every genuine
   * partner code arriving afterwards was discarded.
   *
   * Asserted here as well as in referral.spec.ts on purpose: that suite proves
   * the capture layer now refuses diagnostics, this one proves the link stopped
   * emitting one. Either alone would let the defect return through the other
   * half.
   */
  it("never routes the diagnostic code through the partner referral parameter", () => {
    const notice = form.slice(
      form.indexOf('id="subscribe-unavailable-notice"'),
      form.indexOf("The honeypot"),
    );

    /*
     * Comments are stripped before the assertion. This suite reads raw source,
     * and the code above deliberately *names* the referral parameter while
     * explaining why it must not be used — so scanning the text as-is would
     * fail on the very comment that documents the fix, and the obvious way to
     * "pass" would be to delete the explanation. Assert on what ships, not on
     * what is written about it.
     */
    const code = notice
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    expect(code).not.toContain("?ref=");
    expect(code).toContain("?checkout=");
  });

  it("keeps the plan and billing selectors outside the blocked region", () => {
    /*
     * Deliberate: a visitor whose plan is unpurchasable must be able to try
     * another one. Removing those would replace one dead end with a worse one.
     */
    expect(form.indexOf("formatPlanPrice(selectedPrice)")).toBeLessThan(
      form.indexOf('id="subscribe-unavailable-notice"'),
    );
  });
});
