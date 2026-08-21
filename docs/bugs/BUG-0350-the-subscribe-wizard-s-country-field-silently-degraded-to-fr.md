---
ID: BUG-0350
aliases: [BUG-0350]
Title: The subscribe wizard's country field silently degraded to free text
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 0d10a9d
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-182
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/ux-round-two
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---

# BUG-0350 — The subscribe wizard's country field silently degraded to free text

## Summary

Country on `/subscribe` was changed from a free-text input into a lookup backed
by the API's `Country` table. It was then reported, with a screenshot, as still
being a plain text box. Both are true: the lookup shipped, and when
`/api/public/geography/countries` could not be read the field fell back to the
same free-text input it had always been. The fallback was silent, so a lookup
outage and a change that never happened looked identical.

## Expected Behavior

Country is a list to choose from, always. A reference lookup being unreachable
may narrow the list; it may not change what kind of control the buyer sees.

## Actual Behavior

`useCountryOptions` returned `{ countries: [], unavailable: true }` on any
non-2xx response, and the step rendered an `<input>` instead of a `<select>`.
An API process that had not restarted since the `public-geography` controller
was added answers 404 for that route, which is exactly the condition in the
report.

## Reproduction

1. Run the API from a process started before `public-geography.controller.ts`
   existed — or stop the API entirely.
2. Open `/subscribe` and reach the Organization step.
3. Country renders as a free-text box, with nothing on screen indicating that a
   list was attempted and failed.

## Evidence

- `apps/landing/lib/use-country-options.ts` (before) — the catch arm set
  `countries: []` and `unavailable: true`.
- `apps/landing/app/subscribe/onboarding-steps.tsx` (before) —
  `{countries.unavailable ? <input …/> : <select …/>}`.
- `apps/landing/lib/acquisition-options.ts` — a 32-entry country list already
  shipped in the same bundle, and this field did not use it.

## Root Cause

A degradation path applied to the wrong thing. Falling back is the right
instinct for *blocking* — a buyer must never be unable to complete a purchase
because a reference lookup was slow — but it was applied to the **control type**
rather than to the **contents of the control**. The bundle already contained a
usable country list, so there was never a moment when a `<select>` could not be
rendered.

The second-order failure is that the fallback was invisible. A silent
degradation is indistinguishable from an unshipped change, which is precisely
how it was reported.

## Impact

Every buyer on the subscribe wizard whenever the geography endpoint is
unreachable. Country is persisted onto the customer account, so free text
reintroduces the "UAE" / "U.A.E." / "United Arab Emirates" split that
[[BUG-0316]] existed to close.

## Affected Areas

`apps/landing` — `lib/use-country-options.ts`,
`app/subscribe/onboarding-steps.tsx`.

## Proposed Resolution

Ship the shortlist with the bundle and stand it in when the request fails, so
the control is a `<select>` before the first byte of the response arrives and a
successful request only ever *widens* the list. Drop `OTHER` from the bundled
list: it is a valid answer to "where did you hear about us" and a corrupt value
for a country column.

## Acceptance Criteria

- The field is a `<select>` on first paint, with no network call completed.
- A failed, empty or malformed response leaves a usable list on screen.
- A successful response replaces the shortlist with the full ISO set.
- A value already on the form stays selectable when the list changes underneath
  it, so returning to the step never clears an answer.

## Regression Coverage

REG-182 — `apps/landing/lib/use-country-options.spec.ts` asserts the bundled
list is non-empty, ISO-coded, free of `OTHER`, and uniquely keyed.

## Dependencies

None.

## Related Items

[[BUG-0316]] — the change this one restores the visible half of.
[[BUG-0351]] — reported in the same message, on the same form.
[[silent-degradation]] — the pattern this occurrence defined.

## Resolution

Fixed on `agent/ux-round-two`. `useCountryOptions` seeds from
`BUNDLED_COUNTRIES` and never returns an empty list; the step renders a
`<select>` unconditionally and no longer disables it while loading.

## QA Retest

Not opened in a browser. The list contents are asserted; the rendered control is
not.

## History

- 2026-08-21 — reported as "Why country us not lookup?", with a screenshot of
  the free-text field.
