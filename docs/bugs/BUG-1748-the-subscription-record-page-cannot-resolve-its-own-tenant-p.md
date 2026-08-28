---
ID: BUG-1748
aliases: [BUG-1748]
Title: The subscription record page cannot resolve its own tenant plan or price
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:platform-runtime]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-277
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1748 — The subscription record page cannot resolve its own tenant plan or price

## Summary

Opening a subscription shows **Tenant "Not set"**, **Plan "Not set"** and
**Price "Not set"**, while the Subscriptions list shows the same rows correctly
as "DijiPeople Demo" and "Starter". The ids are present in the record payload,
so nothing is missing from the data — the record page simply does not resolve
them. An operator opening a subscription cannot tell whose it is.

## Expected Behavior

The subscription record shows the tenant name, the plan name and the price, the
same way the list does.

## Actual Behavior

All three read "Not set" on the record page while rendering correctly one screen
earlier.

## Reproduction

1. Platform Admin, **Subscriptions**. The list shows Tenant "DijiPeople Demo",
   Plan "Starter".
2. Click that row.
3. The record shows Tenant "Not set", Plan "Not set", Price "Not set". Billing
   cycle, seats, currency and the prices all render correctly.

## Evidence

`GET /api/platform-runtime/subscriptions/<id>` returns the ids:

```
tenantId    91ab031f-8fa2-48b9-b346-7cdf326571ef
planId      11111111-1111-4111-8111-111111111111
planPriceId 567142f1-6145-41f9-925e-b983ab44ea20
```

`GET /api/platform-runtime/subscriptions` (the list) returns nested objects
instead:

```json
"tenant": {"id":"91ab031f-...","name":"DijiPeople Demo","slug":"dijipeople-demo"},
"plan":   {"id":"11111111-...","key":"starter","name":"Starter"}
```

So the list has names to render and the record has ids it does not resolve.

## Root Cause

Not established. The list and record endpoints return different shapes for the
same relations, and the record form's lookup fields do not resolve the scalar
ids to labels.

## Impact

Every subscription record page. It is a display defect, not a data one, but the
subscription record is where an operator goes to answer "who is this and what
are they on", and it answers neither.

Also observed on the same screen: **Base price 8.00** beside **Final price
80.00**, which reads as a tenfold discrepancy until you notice Licensed seats is
10. The base price is per seat and the label does not say so.

## Affected Areas

`apps/admin` subscription record page and runtime lookup resolution;
`platform-runtime` subscription list and record serializers.

## Proposed Resolution

Make the record endpoint return the same nested tenant and plan objects the list
returns, or make the record form resolve the ids through the lookup path it
already has for other modules. Label the per-seat price as per seat.

## Acceptance Criteria

- A subscription record shows its tenant name, plan name and price.
- The list and record endpoints agree on the shape of tenant and plan.
- The per-seat price is labelled so it cannot be read as the total.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

[[BUG-1744]] — the billing period on the same records is zero-length; found in
the same pass on the same screen.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

The record endpoint fell through to a bare `prisma.subscription.findUnique({
where: { id } })` with no `include` at all, while the list called
`listSubscriptions()`, which loads `tenant` and `plan` and projects them. The ids
were in the payload and nothing resolved them — exactly as this record said.

Rather than adding an include to the second call site, the include and the
projection are now declared once (`SUBSCRIPTION_INCLUDE`, `projectSubscription`)
and both the list and the new `getSubscription(id)` go through them. Two
endpoints answering the same question differently was the defect, so they now
share the answer.

Nothing in the frontend needed changing for tenant and plan.
`resolveLookupLabel` already reads the relation object beside a `*Id` field —
`tenantId` finds `tenant`, `planId` finds `plan`. It had nothing to read.

Price needed more. `readRelationLabel` looks for `label`, `name` or
`displayName`, and a `PlanPrice` row carries none of them, only an amount and a
cadence. So the projection composes one — and it names the unit, because a
per-seat amount shown bare reads as the whole bill. `PKR 300 per seat / month`
cannot be mistaken for a total the way `300` against 25 seats can.

Guarded by REG-277.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/super-admin/subscription-record-shape.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `subscription-record-shape.spec.ts` asserts the
structural claim — one include, one projection, both call sites through them, and
the runtime record path no longer bare-fetching — plus the price label's shape.

A source-level assertion by design: the behaviour needs a database, and the
defect was two code paths diverging rather than either one misbehaving.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - list and record share one include and one projection; the plan price gained a label that names its unit. REG-277.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/super-admin/subscription-record-shape.spec.ts`

Proven by:

- `npm --workspace api run test` — 2016 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-277 (see the regression register)

<!-- GRAPH:END -->
