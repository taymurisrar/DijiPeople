---
ID: BUG-0461
aliases: [BUG-0461]
Title: The cost estimator listed flat-priced plans under a headcount input
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 3883798
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-192
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-repair-and-console-ux
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0461 — The cost estimator listed flat-priced plans under a headcount input

## Summary

"Estimate your cost" rendered every plan under an "Active employees" input,
including flat-priced ones whose cost does not vary with headcount, and plans
with no offer in the region — which appeared as "On request" beside three
prices, reading as a fourth quote rather than as an absence.

## Expected Behavior

A headcount estimator shows the plans headcount actually affects.

## Actual Behavior

Four cards, three of them flat prices that never moved when the input changed,
under a paragraph that said "Each plan is one flat price, whatever your
headcount" — a section explaining that its own control does nothing.

## Reproduction

1. Open `/plans` and scroll to **Estimate your cost**.
2. Change Active employees between 25, 50 and 100.
3. No figure changes.

## Evidence

- `apps/landing/app/plans/plans-experience.tsx` — `plans.map(...)` over every
  plan, with `estimateCost` returning the flat price and `billable = 1` for a
  `FLAT` offer.
- Reported screenshot: "Plan msueyrb6 — On request", Starter $199, Growth $399,
  Enterprise $899, all "estimated per month".

## Root Cause

The section was correct earlier, when the copy claimed a per-seat relationship
that `estimateCost` refused to compute. That contradiction was fixed by changing
the *copy* to describe flat pricing — which left an estimator whose input is
inert and whose heading promises an estimate. Fixing the sentence rather than the
scope moved the inconsistency instead of removing it.

## Impact

Every visitor comparing plans, on the page where they decide what to buy. Not
misleading about price — the numbers are right — but it teaches a visitor that
the control does nothing, so a genuine per-seat estimate later will not be
trusted either.

## Affected Areas

`apps/landing` — the plans experience.

## Proposed Resolution

Filter the estimator to available `PER_SEAT` offers. When none exist, say so and
point at the cards above rather than rendering an empty or flat list.

## Acceptance Criteria

- Only available per-seat offers appear in the estimator.
- With no per-seat plans, the section explains that and offers no inert control.
- Changing the headcount changes every figure shown.
- A plan with no regional offer never appears as "On request" beside real prices.

## Regression Coverage

REG-192 — `apps/landing/lib/plan-estimator.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0080]] — the page-versus-invoice disagreement `estimateCost` already
guards against.

## Resolution

Fixed on `agent/tenant-repair-and-console-ux`.

## QA Retest

Not opened in a browser.

## History

- 2026-08-22 — reported as "make sure that it only shows 'per seat' plan in that
  section and it should work properly".
