---
ID: BUG-1744
aliases: [BUG-1744]
Title: Every subscription has a zero-length billing period and a renewal date in the past
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [api:super-admin, api:billing, integration:stripe]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-276
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1744 — Every subscription has a zero-length billing period and a renewal date in the past

## Summary

Both subscriptions in production carry `currentPeriodStart`, `currentPeriodEnd`
and `renewalDate` set to the same instant — the moment the row was created. Each
is `MONTHLY` with `autoRenew: true` and a live Stripe subscription. The
platform's copy of the billing period is therefore zero-length, and the renewal
date for the older tenant is already in the past. Anything reading these fields
— renewal, dunning, the Renewal column, any MRR figure — is reading a wrong
value.

## Expected Behavior

After a successful checkout, `currentPeriodEnd` is one billing cycle after
`currentPeriodStart`, and `renewalDate` is when the next invoice falls due,
mirroring the period Stripe holds for that subscription.

## Actual Behavior

`currentPeriodStart == currentPeriodEnd == renewalDate == createdAt`.

## Reproduction

1. Platform Admin, **Subscriptions**, open either subscription.
2. Read **Period start** and **Period end** under Dates — identical.
3. Or read them directly: `GET /api/platform-runtime/subscriptions/<id>`.

## Evidence

Both production subscriptions, read through `platform-runtime`:

```
ecaa6e49  periodStart 2026-08-27T17:55:27.000Z
          periodEnd   2026-08-27T17:55:27.000Z
          renewalDate 2026-08-27T17:55:27.000Z
          autoRenew true   billingCycle MONTHLY   stripeSubscriptionId sub_1U97WO...

2890b93b  periodStart 2026-08-26T13:36:38.000Z
          periodEnd   2026-08-26T13:36:38.000Z
          renewalDate 2026-08-26T13:36:38.000Z
          autoRenew true   billingCycle MONTHLY   stripeSubscriptionId sub_1U8h0O...
```

Each timestamp equals its own row's creation time. Both subscriptions are
`ACTIVE`, both invoices are `PAID` at QAR 80.00, and both carry a real Stripe
subscription id — so Stripe holds a correct period that the platform did not
copy.

The Subscriptions list renders **Renewal** as an em dash for both rows, which is
the same fact surfacing in the UI.

## Root Cause

Not established. The period is either never written from the Stripe subscription
object when checkout completes, or written from the wrong field. Establish which
before proposing a change rather than assuming the webhook is at fault.

## Impact

Every subscription in production, which today means every paying customer. The
platform cannot say when a customer's period ends or when they will next be
charged. Renewal, dunning and any revenue projection built on `renewalDate` are
wrong.

The damage is silent in a particular way: Stripe will keep billing correctly on
its own schedule, so nothing visibly breaks while the platform's mirror
disagrees with the system actually taking the money.

## Affected Areas

`super-admin` subscription records, the billing checkout completion path, the
Stripe webhook handlers, and the Subscriptions list and record screens.

## Proposed Resolution

Find the write path that sets the period on checkout completion and populate
`currentPeriodStart` / `currentPeriodEnd` / `renewalDate` from the Stripe
subscription's `current_period_start` / `current_period_end`. Then backfill the
two existing rows from Stripe rather than from a computed guess.

Needs an ExecPlan: it changes billing data and requires a backfill.

## Acceptance Criteria

- A new paid signup produces `currentPeriodEnd` one cycle after
  `currentPeriodStart`, matching the Stripe subscription.
- `renewalDate` is in the future for an active subscription.
- The Subscriptions list renders a real renewal date rather than an em dash.
- The two existing production rows are backfilled from Stripe.
- A regression test asserts the period is copied from the Stripe object.

## Regression Coverage

None yet.

## Dependencies

Backfilling correctly requires reading the live Stripe subscription objects.

## Related Items

[[BUG-1748]] — the subscription record page cannot resolve its own tenant or
plan; found in the same pass, on the same screen.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. The root cause this record left open
turned out to be a version skew, not a missing write.

The write path existed and was correct for the API version it was written
against. Stripe removed `current_period_start` / `current_period_end` from the
Subscription object in `2025-03-31.basil` and moved them onto each
SubscriptionItem, because a subscription may hold items on different cadences.
This service read only the top-level fields, so on an endpoint rendering at that
version or later they are `undefined`, `fromUnix` returns null, and the period is
written as nothing at all.

That is [[BUG-1128]] one field pair over. This file already carries a long note
explaining that `STRIPE_API_VERSION` pins outbound calls only and that a webhook
arrives at whatever version a dashboard dropdown says — and it reads both shapes
of `invoice.parent` for exactly that reason. The period read never got the same
treatment.

Both shapes are now read, at all four write sites. Where a subscription carries
several items the widest span is taken — earliest start, latest end — rather
than `items.data[0]`, which is right for what this platform sells today and
would be quietly wrong for the first multi-item subscription.

Second half, a real gap of its own: `createOrUpdateSubscription` never set
`currentPeriodStart` / `currentPeriodEnd`. The columns are nullable with no
default and the webhook was their only writer, so a subscription created through
provisioning carried no period until an event arrived. It is now born with the
platform's own view of the cycle, which the webhook overwrites from Stripe as
soon as one arrives — Stripe owns proration, trials and clock skew, and this
does not.

Guarded by REG-276.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/billing/subscription-billing-period.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested against Stripe, and the backfill this record asks for was **not
done**.

`services/api/src/modules/billing/subscription-billing-period.spec.ts` asserts
both API shapes, the multi-item span, the precedence when a version renders
both, and that an absent period resolves to null rather than to a wrong instant.

**Explicitly out of scope today:** the two existing production rows. Backfilling
them means reading the live Stripe subscriptions, and the repository owner
decided on 2026-08-28 to leave Stripe alone for now. Those rows stay wrong until
someone runs that backfill; this change stops new ones being written wrong. The
acceptance criterion "the two existing production rows are backfilled from
Stripe" is therefore still open.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - root cause established: Stripe moved the period onto subscription items in basil and only the top level was read. Both shapes now read; creation no longer leaves the period null. Production backfill NOT done. REG-276.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/billing/subscription-billing-period.spec.ts`

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

- Modules — [[super-admin]], [[billing]]
- Regression — REG-276 (see the regression register)

<!-- GRAPH:END -->
