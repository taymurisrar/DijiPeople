---
ID: ITEM-0008
aliases: [ITEM-0008]
Title: Product decision — CustomerAccount carries no origin channel
Type: PRODUCT_DECISION
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [services/api/prisma, services/api/src/modules/super-admin]
Source: QA_RUN
OwnerAgent: architect
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

# ITEM-0008 — Product decision: CustomerAccount carries no origin channel

## Summary

`Lead.source` records "Website" or "Partner Referral". `CustomerAccount` has no
counterpart, so a customer's origin channel is reachable only by joining back
through `sourceLead`. Partner **attribution** does survive conversion —
`originatingPartnerId` is carried — but channel does not.

## Why It Matters

Two things that look similar are being treated differently: attribution (who
gets paid) is denormalised onto the customer, and channel (where they came from)
is not. Any commercial report grouping customers by channel has to join, and any
customer created without a lead has no channel at all.

Whether that matters depends on how the business intends to report — which is a
product question, not an engineering one.

## Evidence

`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`, scenario A6.05
and the "Observations that are not defects" section. B7.04 confirms all four
attribution fields — including `originatingPartnerId` — do survive conversion.

## Proposed Approach

Decide whether channel is a reporting dimension the platform owns. If yes, it is
an additive column plus a backfill from `sourceLead.source`, and belongs with
whoever owns commercial reporting. If no, document that the join is the intended
access path, so it is not re-raised.

## Acceptance Criteria

The decision is recorded in the Customers module knowledge. If the answer is
yes, the column exists and is backfilled for every customer that has a
`sourceLead`.

## Dependencies

None.

## Related Items

Modules [[customers|Customers]], [[leads|Leads]], [[partners|Partners]] ·
requirement [[requirement-commercial-onboarding|Commercial Onboarding]] · [[ITEM-0005]], which concerns the same
`Lead → CustomerAccount` edge.

## History

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-15 — imported from the commercial onboarding E2E observations.

## Resolution

**Decided by the product owner on 2026-08-17: yes, channel is a reporting
dimension the platform owns.** Added as an additive column with a backfill.

`CustomerAccount.originChannel` is a new `CustomerOriginChannel` enum —
`WEBSITE`, `PARTNER_REFERRAL`, `DIRECT`, `OTHER` — indexed, because grouping
customers by channel is the query this exists to serve. Channel is now
denormalised the same way attribution already was, so the two similar things are
treated the same way.

**The values are grounded, not invented.** `submitLead` writes exactly "Website"
or "Partner Referral"; a customer created directly in admin has no lead, which is
what `DIRECT` records; and `Lead.source` is admin-editable free text, so
anything unrecognised becomes `OTHER`.

`OTHER` is the load-bearing part. Mapping an unrecognised source to `WEBSITE`
because most leads are website leads would put a confident wrong value into a
commercial report, indistinguishable from a correct one. `OTHER` says "arrived
some way we do not model", which a reader can act on.

**The column is nullable and the backfill is deliberately incomplete.** Every
customer that still has a lead is classified from it. A customer whose lead was
deleted (`leadId` is `ON DELETE SET NULL`) cannot be distinguished from one
created directly, so those stay NULL — "not known" — rather than being asserted
as `DIRECT`. The blanket `WHERE leadId IS NULL → DIRECT` statement is written
into the migration and left commented, with the reason, so the next person sees
the decision instead of rediscovering the trap.

## Verification

- Migration `20260817090000_customer_origin_channel` — enum, nullable column,
  index, and a backfill joined through `sourceLead`.
- `origin-channel.spec.ts` — 5 assertions: both platform-issued sources map,
  case and whitespace are ignored, an unrecognised source goes to `OTHER`,
  a missing source never infers `DIRECT`, and `DIRECT` is never derived from a
  lead at all.
- Verified to fail without the fix: mapping the default arm to `WEBSITE` fails
  2 of the 5.
- `npm run prisma:validate` passes; API suite 160 suites / 1142 tests.
