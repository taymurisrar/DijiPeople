---
ID: BUG-1884
aliases: [BUG-1884]
Title: The re-check payment action is offered on every customer, including ones who have paid
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-08-28
DetectedInSha: 1003a2ac
AffectedModules: [apps/admin, api:billing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-301
RelatedBacklogItem: ITEM-0075
RelatedDecision:
RelatedImplementation: docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1884 — The re-check payment action is offered on every customer, including ones who have paid

## Summary

`PaymentRecheckPanel` renders unconditionally on every customer record, with
"Re-check payment with Stripe" as a primary black button. On a customer whose
payment succeeded and whose workspace is provisioned, the most prominent action
on the record is an invitation to go and question a settled payment. Pressing it
answers `NO_RECHECKABLE_ORDER` — the API always knew there was nothing to
re-check; the screen never asked.

## Expected Behavior

The action appears when there is an order Stripe could still change its mind
about. On a settled customer the screen states what was paid and offers nothing
to press.

## Actual Behavior

The button is offered on every customer regardless of payment state, and on a
paid one it exists only to be refused.

## Reproduction

1. Platform Admin → **Customers** → open `DijiPeople Demo`, whose status is
   Active / Workspace Provisioned.
2. The Payment panel renders with "Re-check payment with Stripe" as the primary
   control.
3. Press it. The API answers `NO_RECHECKABLE_ORDER` — "This customer has no
   order waiting on payment. Nothing to re-check."

## Evidence

Reported by the repository owner on 2026-08-28 with a screenshot of
`admin.dijipeople.com/customers/b409c57c-…`.

- `apps/admin/app/_components/runtime/runtime-record-page.tsx:597` —
  `{moduleKey === "customers" && !isCreate ? <PaymentRecheckPanel … /> : null}`.
  Payment state is not consulted.
- `services/api/src/modules/billing/services/payment-recheck.service.ts:62` —
  `findRecheckableOrder` already restricts to `PENDING_PAYMENT | PAID | FAILED`,
  and `recheckCustomerPayment` throws `NO_RECHECKABLE_ORDER` when there is none.

## Root Cause

The panel was written as an unconditional slot on the customer record, and the
knowledge of whether there is anything to re-check lived only behind the POST.
No read endpoint exposed it, so the frontend had nothing to branch on.

## Impact

Operational, not functional. An operator mid-support-call sees a prominent
action that cannot help them, and a settled account looks unsettled. No data is
at risk — the re-check path advances an order only on Stripe's word.

## Affected Areas

`apps/admin` customer record page; `api:billing` payment re-check service;
`api:super-admin` controller.

## Proposed Resolution

Expose payment state as a read, built on the same query the POST already uses so
the button and the action cannot disagree, and branch the panel on it.

## Acceptance Criteria

- A customer whose payment is confirmed shows amount, currency, paid date and
  order number, and no button.
- A customer with a pending or failed order shows the existing panel unchanged.
- A customer with no order — or an abandoned/cancelled one — shows nothing.
- A failed state probe falls back to the full panel rather than hiding it.

## Regression Coverage

REG-301 — `services/api/src/modules/billing/services/payment-state.spec.ts`. It
drives every `SubscriptionOrderStatus` through the new read and asserts the
mapping, including that no unsettled status can report `CONFIRMED` — the
assertion that matters if the mapping is ever edited, because a settled panel on
an unsettled payment tells an operator to stop chasing money that has not
arrived.

## Dependencies

None. Filed alongside [[ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap]],
which was reported in the same message.

## Related Items

Modules [[billing|Billing]], [[platform-admin|Platform Admin]]. Backlog item
[[ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap]].

## Resolution

Fixed on branch `agent/admin-console-fx-and-agent-settings`.

- `GET /super-admin/customers/:id/payment-state` returns
  `{ state: CONFIRMED | AWAITING | FAILED | NONE, orderNumber, paidAt, amount,
  currency }`, derived from the newest order — the same record
  `findRecheckableOrder` reads.
- `PaymentRecheckPanel` fetches it on mount and renders one of three things: a
  confirmed summary line, the existing panel, or nothing.
- A failed probe falls through to the full panel deliberately: withholding an
  operator's tool because a status request failed is worse than showing a button
  that might answer "nothing to do".

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/billing/services/payment-state.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser — production cannot be driven from here. Verified by
`npm --workspace api run test` (2006 passing), `npm --workspace admin run test`
(374 passing) and both `check-types`.

The browser check: open a customer with a succeeded payment and confirm the
green summary line with no button; open one mid-checkout and confirm the panel
is unchanged.

## History

- 2026-08-28 — reported by the repository owner with a production screenshot.
- 2026-08-28 — fixed as part of EXECPLAN-0024.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/billing/services/payment-state.spec.ts`

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

- Backlog item — [[ITEM-0075]]
- Modules — [[platform-admin]], [[billing]]
- Regression — REG-301 (see the regression register)

<!-- GRAPH:END -->
