---
ID: BUG-0439
aliases: [BUG-0439]
Title: The subscribe form was disabled without looking disabled or saying why beside it
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 97f2a4a
AffectedModules: [apps/landing, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-190
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0439 — The subscribe form was disabled without looking disabled or saying why beside it

## Summary

The subscribe wizard disables its fields when the selected price cannot be
bought. That is correct and deliberate — BUG-0066 and BUG-0082 exist because it
once collected five steps of data before revealing a dead submit button. What it
did not do was **look** disabled, or **say why anywhere near the fields**.

The `<fieldset disabled>` carried no visual state, so every control rendered
exactly as an enabled one and silently ignored the pointer. The explanation sat
in the left-hand plan card, under the price; the inert fields were in the
right-hand column. A screen reader was told, through `aria-describedby`, what a
sighted visitor was not.

Reported as, simply, "why is the form locked?"

## Expected Behavior

A form that cannot be submitted looks inert, states why immediately above the
fields it has disabled, and offers a way forward.

## Actual Behavior

Fields that look ordinary and do nothing, with the reason in another column in
12px amber text under a price.

## Reproduction

1. Open `/subscribe` and select a plan whose price is not checkout-ready — one
   with no Stripe price id, or with an unverified one.
2. Try to type into Company name.
3. Nothing happens, and nothing on that side of the screen says why.

## Evidence

- `apps/landing/app/subscribe/subscribe-form.tsx` (before) —
  `<fieldset className="mt-4 border-0 p-0" disabled={!canCheckout}>`, with no
  styling keyed on `canCheckout`.
- The same file — the only notice rendered inside the plan-summary card, above
  `formatPlanPrice`, in `text-xs text-warning`.
- `apps/admin/app/_components/plan-price-manager.tsx` (before) —
  `title={price.checkoutReadinessReasons?.join(" ")}`: the operator-facing half
  of the answer, in a tooltip.

## Root Cause

Two halves of one mistake: **the state was modelled but not drawn**, and **the
explanation was placed next to its cause rather than next to its effect**.

`disabled` on a fieldset is a semantic assertion. It stops interaction and
changes nothing visually unless the author says so — so the honest reading of
the old code is that the accessibility layer was finished and the visual layer
was never started. That is the reverse of the usual failure, and it hides
better, because automated accessibility checks pass.

The operator half compounds it: `deriveCheckoutReadiness` computes up to ten
specific causes, the API returns every one of them, and the console rendered
them in a `title` attribute — invisible on touch, unreachable by keyboard,
inconsistently announced. So the visitor is told to contact us and we will
arrange it, and the screen where somebody would find out what to arrange had the
answer hidden.

## Impact

Every visitor who selects a plan that is not checkout-ready — which, in any
environment where Stripe is not fully configured, is every plan. The wizard is
the only self-service purchase path the product has.

## Affected Areas

`apps/landing` — the subscribe wizard. `apps/admin` — the plan price manager.

## Proposed Resolution

Move the identified notice to sit immediately above the fieldset, as a panel
that states what is locked, why, that the plan selectors above are still live,
and a link to contact. Leave a short id-less line in the plan card, since the
price is what cannot be bought. Style the disabled fieldset as inert. Render the
readiness reasons as a visible list in the console.

Exactly one element keeps `id="subscribe-unavailable-notice"`: the BUG-0066 e2e
locates it and asserts visibility, and a duplicate id is a strict-mode violation
rather than twice the clarity.

## Acceptance Criteria

- The reason appears above the fields it explains, not only beside the price.
- The disabled fieldset is visibly inert.
- Plan, billing cycle and currency stay live so another plan can be tried.
- Exactly one element carries the notice id.
- The notice offers a route to contact.
- An operator can read every readiness reason without hovering.

## Regression Coverage

REG-190 — `apps/landing/lib/subscribe-lock.spec.ts`.

## Dependencies

None. The underlying condition — a price that is not checkout-ready — is
configuration, not a defect: `deriveCheckoutReadiness` lists what is missing.

## Related Items

[[BUG-0066]], [[BUG-0082]] — why the form is disabled at all.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Not opened in a browser. Suite F of the execution guide covers the visible half.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-190 names `apps/landing/lib/subscribe-lock.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, apps/landing   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — reported as "why th form is locked?", with a screenshot of the
  Starter plan and an apparently ordinary form.
