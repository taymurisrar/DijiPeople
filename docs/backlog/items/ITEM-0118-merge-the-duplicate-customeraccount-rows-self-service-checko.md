---
ID: ITEM-0118
aliases: [ITEM-0118]
Title: Merge the duplicate CustomerAccount rows self-service checkout created before BUG-2530
Type: DATA_MIGRATION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [super-admin, billing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
RelatedBug: BUG-2530
RelatedQA: QA-COMMERCIAL-001
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0118 — Merge the duplicate CustomerAccount rows self-service checkout created before BUG-2530

## Summary

[[BUG-2530]] stops self-service checkout creating a second `CustomerAccount` per
signup. It does nothing about the pairs already in the database. Every
self-service signup between the BUG-1516 fix landing and BUG-2530 shipping left
one orphan `PROSPECT` row holding `pending@onboarding.invalid`, alongside the
real customer that paid and provisioned. This item is the decision and the
cleanup for those rows.

## Why It Matters

Two costs, and only the first is cosmetic.

1. The Customers list in Platform Admin shows each affected company twice, and
   the duplicate carries no organisation profile, no plan and no channel — so
   any report grouping customers by plan or channel undercounts.
2. Two `CustomerAccount` rows for one Stripe customer is the state that makes
   webhook attribution ambiguous. Left in place, the orphans keep the condition
   that raises the CRITICAL "Stripe subscription customer could not be resolved
   to one tenant" alert alive for those companies even though new signups are
   now clean.

## Evidence

- [[BUG-2530]] — root cause and the fix that stops new ones.
- Reported production pair, `admin.dijipeople.com/customers`, 2026-08-30: two
  `Nisa Co` rows, `PROSPECT`/0 onboarding at 3:52 AM and `Active`/1 onboarding at
  3:53 AM.
- [[BUG-1516]] records earlier pairs from the same mechanism: two
  `QA E2E Signup 20260826` rows, two `QA E2E Signup B 20260826` rows, and
  `DijiPeople QA Verification` twice.

The population is identifiable without guesswork: an orphan is a
`CustomerAccount` whose `contactEmail` is `pending@onboarding.invalid`. That
value is written by exactly one code path and by nothing else, which is what
makes this a bounded cleanup rather than a fuzzy dedup.

### Measured against production, 2026-08-30

Read-only query, run after the fix deployed. **Eight orphans out of eighteen
customer rows in total** — the placeholder accounts for very nearly half the
Customers list.

| Orphan | Created | Company | Surviving twin |
|---|---|---|---|
| `230b3c5f` | 2026-08-29 21:52Z | Nisa Co | `8c56bfb3` ACTIVE |
| `fa69f039` | 2026-08-28 07:16Z | DIJINATION | none |
| `e816098c` | 2026-08-27 14:50Z | DijiPeople Demo | `b409c57c` ACTIVE |
| `521fe4ad` | 2026-08-26 10:27Z | QA E2E Signup B 20260826 | `7374a80c` ACTIVE |
| `9beffd91` | 2026-08-26 10:17Z | QA E2E Signup 20260826 | `512dda5e` PROSPECT |
| `6e37974e` | 2026-08-25 20:18Z | DijiPeople QA Verification | `08b4a1a8` PROSPECT |
| `ce5a7ddd` | 2026-08-22 18:08Z | NISACO | none |
| `4645cb15` | 2026-08-21 10:36Z | Demo | none |

`e816098c` is the very record BUG-1516 quoted as its root-cause evidence on
2026-08-27. It has been in production ever since, which is the clearest possible
statement that that record's `VERIFIED` was about a test and not about the
system.

**Every one of the eight is attached to exactly one thing, and it is a `DRAFT`
order.** Per row: `orders=1`, `non-draft orders=0`, and `tenants`,
`subscriptions`, `onboardings`, `contacts`, `contracts` and `provisioningRuns`
all `0`. Nothing of commercial value hangs off any of them, which answers step 2
of the sketch below before it is attempted.

**Zero same-name groups are unexplained by the placeholder.** Every duplicate
company name in the Customers list is one of these eight, so there is no second,
unrelated duplication mechanism still to find.

Three of the eight — DIJINATION, NISACO, Demo — have **no twin**. They are
checkouts abandoned before the e-mail step. They are also not the followable
leads the pre-payment customer record exists to preserve: the placeholder *is*
their only contact address, so there is nobody to follow up. Worth stating,
because that reasoning is the stated justification for writing a customer before
payment, and for these three it does not hold.

**Ordering constraint for whoever executes this.** `SubscriptionOrder` is
`onDelete: Restrict` against `CustomerAccount`, so the order must be resolved
before its customer can be — the reverse fails at the database.

## Proposed Approach

**Needs an ExecPlan** under [`PLANS.md`](../../../PLANS.md). It is a destructive
change to commercial records, and the count is not yet known.

Sketch, in order:

1. **Measure first.** Count the rows with the placeholder address, and for each,
   what hangs off it: `SubscriptionOrder`, legal acknowledgements, outbox events,
   any `Tenant` or `Subscription` link. A row with nothing attached is a delete;
   a row with anything attached is a merge, and the two need different handling.
2. **Decide per class, not per row.** The expected shape is that orphans carry a
   `DRAFT` order and nothing else, because the paying half went to the second
   record. Confirm that before assuming it.
3. **Reassign, then remove.** Anything genuinely attached moves to the surviving
   customer — the one with the real e-mail and the provisioned tenant — before
   the orphan goes.
4. **Audit every step.** These are commercial records; `AuditService.log()` with
   before/after snapshots, as any state change on them requires.

**Do not** widen `CustomerIdentityService` to merge on company name alone to
absorb these retrospectively. That service is deliberately conservative for a
stated reason — a missed merge is a recoverable duplicate, a wrong merge puts one
company's workspace under another company's billing account — and loosening a
live identity rule to clean up historical data trades a permanent risk for a
one-off tidy-up.

## Outcome — 2026-08-30, done

Approved by the repository owner on the specific list of eight, not on a general
go-ahead. All eight removed; **`removed=8 skipped=0`**.

```text
CustomerAccount total       19 → 11
placeholder rows             8 → 0
company names appearing >1   5 → 0
```

Removed: `Demo`, `NISACO`, `DijiPeople QA Verification`,
`QA E2E Signup 20260826`, `QA E2E Signup B 20260826`, `DijiPeople Demo`,
`DIJINATION`, `Nisa Co` — each with its single `DRAFT` order.

**How the write was made safe**, because a measurement is not an authorisation:

- Dry run first, and the dry run's output matched the measurement row for row.
- **Every precondition re-checked inside each row's transaction**, at the moment
  of deletion — tenants, subscriptions, onboardings, contacts, contracts,
  provisioning runs and non-`DRAFT` orders. The earlier count is what made the
  decision reasonable; it is not what authorised the write. A row that had gained
  an attachment in the interval would have been skipped, not deleted.
- Equality on the placeholder address, never a `LIKE` or a company-name match.
- Bounded: the script aborts above twelve candidates, on the grounds that a
  larger population is not the one that was measured.
- **Audited before deleting**, so the evidence survives even if the delete fails:
  one `PlatformAuditLog` row per customer, `action:
  CUSTOMER_ACCOUNT_ORPHAN_REMOVED`, `sourceModule: item-0118`, with the complete
  customer row and its orders as `beforeSnapshot`. Anything removed here is
  reconstructible from that snapshot.
- One transaction per row, so a failure could neither roll back completed rows
  nor half-delete its own.

Order matters and is enforced by the schema: `SubscriptionOrder` is
`onDelete: Restrict` against `CustomerAccount`, so the order goes first.

**What this does not fix.** The wizard still writes `pending@onboarding.invalid`
when a draft is opened before the e-mail step, so a checkout abandoned at the
workspace step will create another such row. BUG-2530 stopped that placeholder
causing a *duplicate*; it did not stop it existing. Three of the eight removed
here — DIJINATION, NISACO, Demo — were exactly that case rather than duplicates.
Carried forward as its own record.

## Acceptance Criteria

- No `CustomerAccount` with `contactEmail = 'pending@onboarding.invalid'` remains
  in production.
- No company that signed up self-service appears twice in the Customers list.
- Every removed row's attached records are either reassigned to the surviving
  customer or shown to have been unattached, with the evidence recorded.
- Every reassignment and removal is audited.
- No Stripe customer resolves to more than one tenant afterwards.

## Dependencies

[[BUG-2530]] must be deployed first. Cleaning up while the defect is live means
new orphans appear behind the cleanup.

## Related Items

- [[BUG-2530]] — the fix that stops new duplicates.
- [[BUG-1516]] — the same mechanism, fixed at both ends and not in the middle.

## History

- 2026-08-30 — created at `c18b5024`, alongside the BUG-2530 fix, because the
  fix deliberately does not touch existing rows.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2530]]
- Modules — [[super-admin]], [[billing]]

<!-- GRAPH:END -->
