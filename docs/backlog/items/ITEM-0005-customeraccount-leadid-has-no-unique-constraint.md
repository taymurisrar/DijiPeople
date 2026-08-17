---
ID: ITEM-0005
aliases: [ITEM-0005]
Title: CustomerAccount.leadId has no unique constraint, so double conversion is unprevented
Type: TECH_DEBT
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/prisma, services/api/src/modules/super-admin]
Source: QA_RUN
OwnerAgent: database
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0005 — CustomerAccount.leadId has no unique constraint, so double conversion is unprevented

## Summary

`CustomerAccount.leadId` is a plain nullable foreign key with a **non-unique**
index, and the "already converted?" pre-check runs **outside** the conversion
transaction. Nothing in the schema prevents one lead becoming two customers.

## Why It Matters

The concurrent double-conversion test (A6.01) produced exactly one customer, so
the race did not materialise under test — but it was not prevented, it simply did
not happen. A duplicate customer account carries a duplicate subscription and a
duplicate invoice downstream, which is the expensive kind of duplicate.

Compare `PartnerInquiry`, which deduplicates by `submissionHash` at the data
layer and therefore cannot race.

## Evidence

`services/api/prisma/schema.prisma:2446` — `leadId String?`;
`:2483` — `@@index([leadId])`, not `@@unique`.
By contrast `:3381` shows `leadId String @unique` on a different model, so the
constraint is idiomatic here and was simply not applied.

`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`, Residual risks:
"`CustomerAccount.leadId` has **no unique constraint** … the pre-check runs
outside the conversion transaction."

## Proposed Approach

Add `@@unique([leadId])` and let the database enforce it, translating the
constraint violation into the existing 409 the idempotency scenario (A6.06)
already expects.

**This is a destructive-class migration** in the sense `PLANS.md` means: it can
fail on existing data. It needs a duplicate check and a backfill decision before
the constraint is added — expand, verify, then contract.

## Acceptance Criteria

- A pre-migration query proves no existing `CustomerAccount` shares a `leadId`.
- Two concurrent conversions of one lead produce one customer and one 409.
- The migration applies cleanly to a fresh database in the `database-migration`
  CI job.

## Dependencies

Database agent owns the migration semantics. Needs a real-database check for
existing duplicates before the constraint can be added.

## Related Items

Modules [[leads|Leads]], [[customers|Customers]] · architecture [[database-architecture|Database Architecture]] ·
requirement [[requirement-lead-conversion|Lead Conversion]] · [[BUG-0012]] (the other conversion-seed defect).

## History

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-15 — imported from the commercial onboarding E2E's residual risks.

- 2026-08-15 — Architect triage: PLAN_REQUIRED, as the record itself argues. Adding `@@unique([leadId])` can fail on existing data, so it needs a duplicate check and a backfill decision before the constraint is added — expand, verify, contract. That is the change class PLANS.md names, and the plan is cheap compared with a migration that fails on a customer database.

## Resolution

Fixed. `CustomerAccount.leadId` is now `@@unique`, so the database — not a
pre-check — decides that one lead becomes at most one customer.

The pre-check ran **outside** the conversion transaction, so two concurrent
conversions of the same lead both passed it and both created a customer, each
carrying its own subscription and first invoice.

**Treated as the destructive-class change this item said it was.** The migration
does not simply create the index and hope. It queries for leads already holding
more than one customer and, if any exist, **raises with their ids** and refuses:

> cannot add the unique constraint — these leads already have more than one
> CustomerAccount: … Decide which customer survives for each, merge or archive
> the others, then re-run this migration.

The duplicates are deliberately **not** resolved by the migration. Choosing which
of two real customers survives — each with a subscription, invoices and possibly
a live tenant — is a commercial decision with an owner. A bare index-build
failure would name nothing and leave whoever is on the deploy guessing.

NULLs are distinct in a PostgreSQL unique index, so any number of customers
created without a lead stay legal; only a *second* customer for the same lead is
refused.

The constraint violation is translated into the same `409 Lead has already been
converted.` the single-threaded path returns, which is what the idempotency
scenario (A6.06) expects. Only a `leadId` conflict is translated — any other
unique violation is rethrown, because reporting "already converted" for an
unrelated failure would send an operator hunting a customer that does not
exist.

## Verification

Migration `20260817110000_customer_lead_unique` — duplicate pre-check that
raises with ids, then the unique index, then the now-redundant plain index
dropped.

`npm run prisma:validate` passes. API suite 162 suites / 1149 tests. The
migration is exercised by the `Database migration gate` against an empty
PostgreSQL 16.
