---
ID: ITEM-0008
aliases: [ITEM-0008]
Title: Product decision — CustomerAccount carries no origin channel
Type: PRODUCT_DECISION
Status: PRODUCT_DECISION
Priority: P3
Severity: LOW
AffectedModules: [services/api/prisma, services/api/src/modules/super-admin]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
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

- 2026-08-15 — imported from the commercial onboarding E2E observations.
