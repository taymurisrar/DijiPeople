---
ID: BUG-1555
aliases: [BUG-1555]
Title: An inactive plan with no prices is offered as a customer preferred plan
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [super-admin, billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-291
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1555 — An inactive plan with no prices is offered as a customer preferred plan

> **Architect triage, 2026-08-27 — `FIX_NOW`.** An unsellable plan is offered for sale. Commercial correctness on the revenue path.


## Summary

A plan that is inactive and has no prices is offered for selection as a
customer's preferred plan. `QA00591` — status Inactive, zero prices — appears in
the plan picker on the customer form. Selecting it produces a customer whose
preferred plan cannot be sold.

## Expected Behavior

Only plans that can actually be sold are selectable as a customer's preferred
plan. An inactive plan, or one carrying no price, is excluded.

## Actual Behavior

`QA00591` is listed and selectable despite being Inactive with no prices.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open a customer record, or create one.
3. Open the preferred plan picker.
4. Observe `QA00591` listed, and confirm on the Plans screen that it is Inactive
   with zero prices.

## Evidence

Observed on production, 2026-08-26. `QA00591` was present in the customer form's
plan picker while the Plans screen showed it as Inactive with no prices attached.

## Root Cause

Not established. The picker evidently queries plans without filtering on status
or price availability, but whether that filter is missing or is deliberately
permissive has not been confirmed.

## Impact

An operator can set a customer's preferred plan to something unsellable. The
consequence surfaces later, at quoting or checkout, where the absent price will
fail — at which point the cause is several steps behind.

This is the same class of defect as a read filter that hides a plan from one
surface while another surface still accepts it by id, which this repository has
already seen once. Whether the write paths validate the plan independently was
not tested during this pass and should be, since a filter on the picker alone
would not be a control.

## Affected Areas

- `apps/admin` — the customer form's plan picker
- `services/api/src/modules/super-admin` — plans
- `services/api/src/modules/billing` — prices

## Proposed Resolution

Filter the picker to plans that are active and carry at least one price. Then
check whether the write path validates the plan it is given, and add that
validation if it does not — the picker filter is a usability improvement, not an
enforcement point.

## Acceptance Criteria

- An inactive plan does not appear in the preferred plan picker.
- A plan with no prices does not appear.
- Submitting an inactive or priceless plan id directly to the API is rejected.

## Regression Coverage

None yet. Needs a test asserting both that the picker excludes such plans and
that the write path rejects them by id. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]] and [[BUG-1516]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, both halves this record names.

**The picker.** `GET /super-admin/plans` takes `?sellable=true`, which narrows
to plans that are active and carry at least one price. The customer form's
Preferred plan and the onboarding form's Plan both use it. The Plans screen
itself still gets the full catalogue, which is what it is for.

**The enforcement.** This record is right that a picker filter is a usability
improvement rather than an enforcement point — the id can still arrive from a
lead's `agreedPlanId`, from a customer chosen before the plan was retired, or
straight from the API. Tenant creation validated only that a plan id was
non-null; it now checks the plan is active and carries at least one *active*
price, and says which of the two it failed on. An inactive price bills nobody,
so a plan carrying only inactive prices is as unsellable as one carrying none.

Guarded by REG-291.

## QA Retest

Not retested in a browser. `onboarding-prerequisites.spec.ts` covers the
enforcement, including that only active prices are counted.

The browser check is `QA00591` — inactive, zero prices, the plan this record
found. It should no longer appear in the customer form's plan picker. Then
attempt tenant creation against it through the API directly, which is the path
the picker cannot protect.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - the picker offers only sellable plans and tenant creation refuses one that is not. REG-291.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[billing]]
- Regression — REG-291 (see the regression register)

<!-- GRAPH:END -->
