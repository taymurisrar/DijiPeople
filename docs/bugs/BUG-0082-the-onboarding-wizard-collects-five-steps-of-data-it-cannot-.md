---
ID: BUG-0082
aliases: [BUG-0082]
Title: The onboarding wizard collects five steps of data it cannot submit
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-20
DetectedInSha: 71f1795
AffectedModules: [landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-077
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0008 WP-08
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
ResolvedAt: 2026-08-20
---

# BUG-0082 — The onboarding wizard collects five steps of data it cannot submit

## Summary

[[BUG-0066]] returning in a worse shape, reintroduced by WP-11's wizard.

When the selected plan has no purchasable price — no published price for the
visitor's region, or a price configured for display that is not wired to Stripe
— the wizard let the visitor walk all five steps. Organization profile,
workspace address, owner identity, agreements, review. The submit button on the
final step was correctly disabled, and that was the first time anybody was told.

The single-page form this replaced got it right: a disabled `<fieldset>` and a
notice saying why, both added when BUG-0066 was fixed. The wizard dropped both.

## Expected Behavior

A visitor is never shown an editable form that cannot be submitted. When the
selection cannot be bought, the step inputs are inert and the reason is stated
next to the price — while the plan and billing selectors stay live, so the
visitor can try a plan that *is* purchasable.

## Actual Behavior

Every step's inputs were fully editable. The two explanatory sentences survived
the rewrite but lost their `id`, so nothing could point at them and the
regression test could not find them. `Continue` advanced normally through all
four steps. Only the review step's submit button was disabled.

## Reproduction

1. Select a plan whose resolved `PublicPlanPrice` has `isCheckoutReady: false`,
   or a plan/currency/interval combination that resolves no price at all.
2. Open `/subscribe` with that selection.
3. Fill in the organization step. Press **Continue**.
4. Repeat for workspace, owner and agreements.
5. Arrive at review to find the submit button disabled.

Before the fix, steps 3–5 succeed. After it, step 3's inputs are inert and
**Continue** is disabled, with the reason rendered beside the price.

## Evidence

- `apps/landing/app/subscribe/subscribe-form.tsx` at `71f1795` — the step
  components rendered inside a plain `<div>`; `disabled={isSubmitting ||
  !canCheckout}` on the submit button only; the `Continue` button carrying no
  `disabled` at all.
- The same file's two notice paragraphs, neither carrying
  `id="subscribe-unavailable-notice"`.
- `e2e/tests/flow-c-landing-public-surface.spec.ts` — "subscribe never offers an
  editable form it cannot submit" looks for exactly that id and for a disabled
  `form fieldset`. Both were gone, so the BUG-0066 regression test would have
  gone red in the `browser-e2e` gate.

That last point is worth stating plainly: **the regression test caught this**.
It was found by reading the browser suite against the rewritten component during
the WP-08 QA campaign, not by clicking through the wizard.

## Root Cause

WP-11 replaced a single-page form with a five-step wizard and rebuilt the layout
around the new step components. The guard from BUG-0066 was structural — a
wrapper element and an id on a paragraph — so it did not survive a rewrite that
kept the fields and replaced everything around them.

Underneath that: the "can this be bought" question was answered by three
separate inline conditions in one file — one for each notice, one for submit,
none for Continue. Three copies of a rule drift, and the one nobody wrote is the
one that broke.

## Impact

Every visitor who reaches `/subscribe` with an unpurchasable selection. They
spend several minutes typing a company's legal identity, a workspace address, an
owner's name and job title, and accept two legal agreements, before learning the
plan cannot be bought — with no path forward and no record of the attempt they
can return to.

Reachable today: the seeded PKR schedule is a placeholder and QAR prices do not
exist, so a visitor in Qatar hits exactly this.

Rated HIGH rather than MEDIUM because it is a **repeat**. The defect was found,
recorded, fixed and regression-tested once already, and reintroduced by the next
change to the same screen.

## Affected Areas

`apps/landing/app/subscribe/subscribe-form.tsx`, `apps/landing/lib/plans.ts`,
`e2e/tests/flow-c-landing-public-surface.spec.ts`.

## Proposed Resolution

Make the rule one function rather than three conditions, so it cannot be half
applied by the next rewrite.

## Acceptance Criteria

- With an unpurchasable selection, every step input is inert.
- `Continue` is disabled, not only submit.
- A notice carrying `id="subscribe-unavailable-notice"` states which of the two
  reasons applies, and the inert region is `aria-describedby` it.
- The plan and billing selectors remain interactive.
- One function decides all of the above; there is no second place to change.

## Regression Coverage

- `apps/landing/lib/plans.spec.ts` — REG-077. Covers
  `checkoutBlockedReason` directly: a purchasable price yields null, each
  unpurchasable case yields its own distinct sentence, and the function agrees
  with `isCheckoutReady` in both directions. Mutation-verified: making it return
  null for a null price fails two tests.
- `e2e/tests/flow-c-landing-public-surface.spec.ts` — extended to assert that
  `Continue` is disabled, not just submit. The old assertion could not see this
  bug, because submit is not rendered until the typing is already done.

## Dependencies

None.

## Related Items

- [[BUG-0066]] — the first occurrence, on the single-page form.
- [[TASK-0008]] — WP-11 introduced the wizard; WP-08 found this.

## Resolution

`checkoutBlockedReason(price)` in `apps/landing/lib/plans.ts` returns the
visitor-facing sentence or null, and is the only place the question is answered.
It returns a sentence rather than a boolean on purpose: a caller cannot disable
an input without also having the reason to hand.

The wizard derives `canCheckout` from it and feeds three consumers — the
identified notice, a `<fieldset disabled>` wrapping the step components, and the
`Continue` button. The plan and billing selectors sit outside the fieldset and
stay live.

The browser scenario was corrected in the same change. Its old shape treated
"no submit button on the page" as "checkout unavailable", which is now simply
"the visitor is on step one" — so it keyed off the notice instead.

## QA Retest

WP-08 QA campaign under TASK-0008. Landing 109 tests pass, including five new
ones for `checkoutBlockedReason`, plus the mutation check above. The browser
assertion runs in the `browser-e2e` gate.

## History

- 2026-08-20 — found during the WP-08 QA campaign, by reading the existing
  BUG-0066 browser regression against the rewritten component.
- 2026-08-20 — disposition `FIX_NOW`; fixed in the same work package.
