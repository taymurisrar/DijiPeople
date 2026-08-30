---
ID: ITEM-0119
aliases: [ITEM-0119]
Title: Stop writing a placeholder e-mail into an identity column when the wizard opens a draft
Type: TECH_DEBT
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [billing, landing, super-admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
RelatedBug: BUG-2530
RelatedQA: QA-COMMERCIAL-001
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0119 — Stop writing a placeholder e-mail into an identity column when the wizard opens a draft

## Summary

The subscribe wizard opens a draft order on the workspace-address step, before
the buyer has been asked for an e-mail, and writes
`pending@onboarding.invalid` into `CustomerAccount.contactEmail` — the column the
identity rules match on. [[BUG-2530]] stopped that placeholder causing a
*duplicate* customer, by carrying the draft's id forward. It did not stop the
placeholder being written, so a checkout abandoned at the workspace step still
leaves a `PROSPECT` row that nobody can contact.

[[BUG-1516]]'s own resolution said this should be closed:

> Whichever is chosen, `pending@onboarding.invalid` should stop being written to
> a column the identity rule matches on. A placeholder in an identity field is a
> record that cannot be found by design.

## Why It Matters

Three of the eight rows [[ITEM-0118]] removed — DIJINATION, NISACO, Demo — were
this case rather than duplicates: abandoned pre-e-mail drafts, dated 2026-08-21,
08-22 and 08-28. They are not the followable leads the pre-payment customer
record exists to create, because the placeholder *is* their only address. They
are pure noise in the Customers list, and they accumulate.

The cleanup in ITEM-0118 was one-off. Without this, the list refills.

## Evidence

- `apps/landing/app/subscribe/subscribe-form.tsx` — `emailForDraft` falls back to
  the placeholder because the e-mail is collected on step 3 and the draft is
  opened on step 2.
- `services/api/src/modules/billing/services/subscription-order.service.ts` —
  `resolveCustomer` writes it to `contactEmail`, `primaryContactEmail` and
  `billingContactEmail`.
- [[ITEM-0118]] — the eight rows, and which three were this case.

## Proposed Approach

**Needs an ExecPlan.** Every option below is either a schema change on a live
revenue path or a change to when a commercial record is created, and the two
obvious ones have a blast radius large enough that guessing is not acceptable.

Measured 2026-08-30: `contactEmail` is `String` — **NOT NULL** — with 52
references across `services/api/src` and `apps`; `SubscriptionOrder.customerAccountId`
is also NOT NULL, with 211 mentions in the API.

Options, with the honest cost of each:

1. **Create the customer only when the e-mail is known.** The cleanest model: a
   draft order exists (which is all the workspace-address check binds to) and no
   customer does until submit. Requires making
   `SubscriptionOrder.customerAccountId` nullable — a *widening* migration, so
   non-destructive and needing no backfill — but every reader that joins order to
   customer must handle the null.
2. **Make `contactEmail` nullable** and leave it null on a draft. Smaller
   migration, but it pushes null-handling into 52 call sites including invoicing,
   contracts and notifications, several of which already chain
   `primaryContactEmail ?? contactEmail` and would silently produce nothing.
3. **Keep the row, sweep it away.** Depends entirely on [[BUG-2618]] — there is
   no scheduler in this application at all, so today nothing sweeps anything.
   Cheapest, but it treats the symptom: the placeholder still sits in an identity
   column for the life of the draft.

Option 1 is the recommendation. It is the only one that makes the invalid state
unrepresentable rather than tolerated.

**Do not** defer opening the draft order itself. [[BUG-1516]] considered and
rejected that: the workspace-address check is session-bound on purpose, so that
answering "is `maseer` taken" costs a rate-limited, durably recorded row rather
than being a free enumeration oracle over the customer base.

## Acceptance Criteria

- No code path writes `pending@onboarding.invalid`, or any other synthetic
  address, into a column the identity rules read.
- A checkout abandoned at the workspace step leaves no `CustomerAccount`.
- A completed checkout still produces exactly one, as QA-COMMERCIAL-001 asserts.
- The workspace-address check still refuses to answer without a live session.

## Dependencies

Independent of [[BUG-2618]], but that one should land first: it is a live P1, and
option 3 here is only even coherent once a sweeper exists.

## Related Items

- [[BUG-2530]] — stopped the placeholder causing duplicates; did not remove it.
- [[BUG-1516]] — where the placeholder was introduced and its removal recommended.
- [[ITEM-0118]] — the one-off cleanup this prevents needing again.
- [[BUG-2618]] — nothing sweeps expired orders, so nothing ages these out either.

## History

- 2026-08-30 — raised by the repository owner immediately after the BUG-2530
  hotfix, on being shown that three of the eight removed rows were abandoned
  drafts rather than duplicates.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2530]]
- Referenced by — [[BUG-2618]]
- Modules — [[billing]], [[landing-architecture]], [[super-admin]]

<!-- GRAPH:END -->
