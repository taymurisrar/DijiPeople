---
ID: BUG-0066
aliases: [BUG-0066]
Title: Subscribe page renders an editable form with no way to submit when checkout is unavailable
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0066 — Subscribe page renders an editable form with no way to submit when checkout is unavailable

## Summary

When self-service checkout is not available for the visitor's region,
`/subscribe` replaces its submit button with a "Contact sales" link but leaves
all eight form fields enabled. The visitor can fill in company name, contact
name, email, phone, country and a message, then find there is nothing to press —
and following "Contact sales" discards everything they typed.

The same condition is handled well one route away: `/plans` renders a designed
empty state ("Pricing isn't available for your region yet") with no dead form.

## Expected Behavior

If the form cannot be submitted, it is not presented as fillable. Either the
fields are disabled with a stated reason and the alternative path is offered
alongside, or the form is replaced by the same empty state `/plans` already
uses — and anything already typed is carried into the contact route rather than
dropped.

## Actual Behavior

Eight enabled inputs and no submit control anywhere inside the `<form>`.

To be precise about what the page *does* get right: the left-hand plan card
states the condition plainly — "Contact sales / Billed as one subscription /
This plan has no published price for your region yet. Contact us and we will
arrange it." So unavailability is disclosed.

The defect is what sits **beside** that disclosure. The right-hand "Company
details" card renders six editable fields under a page heading that reads
"Create your workspace and continue to secure checkout", and its only action is
a "Contact sales" link. A visitor who reads the heading, starts filling the form
on the right, and only then looks left has already done work that will be thrown
away. The disclosure and the form disagree, and the form is the part that
invites action.

## Reproduction

1. Run the API in a state where no plan is purchasable for the resolved region
   (no published market, or `canCheckout` false).
2. Open `http://localhost:3010/subscribe`.
3. Fill in the company and contact fields.
4. Observe there is no submit control; pressing Enter in a text field does
   nothing because the form contains no submit button.
5. Click "Contact sales" — the entered data is not carried over.

## Evidence

Chromium probe:

```
PROBE subscribe-form-has-submit-control :: FAIL ::
  {"form":true,"controls":8,"submitInside":0,"buttonsInside":0,"buttonTypes":[]}
```

Eight editable controls, zero buttons of any type inside the form element.

`screens/subscribe--desktop.png` shows the split: the plan card on the left
carries the unavailable-region notice, while the company-details card on the
right renders six editable fields ending in a "Contact sales" link, under a page
heading promising "continue to secure checkout".

The contrasting good state on `/plans`, captured in
`screens/plans--mobile.png`: "Pricing isn't available for your region yet. Get
in touch and we'll set your organization up directly." with a single **Contact
us** action and no form at all — the same message, without an invitation to
type into something that cannot be submitted.

Separately and **not** part of this bug: the plan select displayed
`Plan msueyrb6`, a generated seed name. That is local demo-data quality, not a
product defect, and is noted here only so a future reader of the screenshot does
not mistake it for one.

## Root Cause

`apps/landing/app/subscribe/subscribe-form.tsx:269-283`:

```tsx
{canCheckout ? (
  <button type="submit">Continue to Stripe Checkout</button>
) : (
  <a href={contactHref}>Contact sales</a>
)}
```

Only the action is switched. The fields above it are rendered unconditionally,
so the unavailable state inherits a fully interactive form. Because the
substituted element is an anchor rather than a submit control, implicit form
submission (Enter within a field) is also lost.

## Impact

Any visitor in a region without self-service pricing — which is every visitor in
an environment where markets are not yet published. It wastes the effort of the
highest-intent visitors on the site and loses the data they entered. It also
contradicts the repository's own UI/UX rule that unavailability should be stated
rather than silently absent.

## Affected Areas

`apps/landing/app/subscribe/subscribe-form.tsx`, `apps/landing/app/subscribe/page.tsx`.

## Proposed Resolution

Reuse the `/plans` unavailable-region treatment on `/subscribe` rather than
inventing a second one. If the form is kept visible, disable the fields, state
why, and pass the collected details through to the contact route as query
parameters so nothing is retyped.

## Acceptance Criteria

1. With checkout unavailable, `/subscribe` states that purchase is unavailable
   for the region before the visitor invests effort in the form.
2. No editable field is presented that cannot be submitted.
3. Any details already entered survive the transition to the contact route, or
   the fields are never editable in the first place.
4. With checkout available, the existing Stripe flow is unchanged.

## Regression Coverage

Needs a browser scenario for the unavailable-region state asserting no orphan
editable form. No `REG-nnn` yet.

## Dependencies

Shares the no-market condition with
[[BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market]].

## Related Items

[[BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market]],
[[BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
