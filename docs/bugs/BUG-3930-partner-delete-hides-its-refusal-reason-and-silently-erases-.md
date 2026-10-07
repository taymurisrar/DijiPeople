---
ID: BUG-3930
aliases: [BUG-3930]
Title: Partner delete hides its refusal reason and silently erases customer and tenant attribution
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-10-07
DetectedInSha: 898a6ac3
AffectedModules: [partners, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-650
RelatedBacklogItem: ITEM-0226
RelatedDecision:
RelatedImplementation: [services/api/src/modules/partners/partner-dependencies.ts, services/api/src/modules/partners/partner-deletion.service.ts, services/api/src/common/deletion/record-dependencies.ts, apps/admin/app/_components/runtime/dependency-aware-delete-dialog.tsx]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-07
---

# BUG-3930 — Partner delete hides its refusal reason and silently erases customer and tenant attribution

## Summary

The owner reported that deleting a partner does not work reliably from either
the list or the record page. There are three defects:

1. The API refused the delete with a named reason, but the reason was never
   shown in the admin app.
2. The dependency count ran outside the delete transaction.
3. `CustomerAccount.originatingPartnerId` and `Tenant.originatingPartnerId` are
   `SetNull` relations that were not counted. A permitted delete therefore
   silently erased customer and tenant attribution.

## Expected Behavior

- Before confirming, the operator sees every dependency, with a count, a reason
  and a link to the related records.
- Blocking dependencies disable the delete.
- Attribution and financial records are never silently removed.
- An allowed delete removes the partner and its cascade data atomically.

## Actual Behavior

- The API wraps `{deleted, refused, message}` inside `data`. The admin app read
  the top-level `message`, which does not exist, then navigated to the list as
  if the delete had succeeded.
- Customer and tenant attribution were not counted, so the database's `SetNull`
  cleared them without warning.
- Commissions use `Cascade`. Deletion refused when commissions existed, but no
  rule recorded why that refusal mattered.

## Reproduction

1. Create a partner with a referral link and an attributed customer.
2. Delete it from the record page.
3. The page returns to the list and the partner is still there. No reason is
   shown.
4. Remove the link and delete again. The partner is deleted, and the customer's
   attribution is gone.

## Evidence

- `partner-deletion.service.ts` at `898a6ac3`: the count of 12 relations runs
  outside the transaction.
- `schema.prisma`: `CustomerAccount.originatingPartnerId` and
  `Tenant.originatingPartnerId` use `onDelete: SetNull`.
- `runtime-record-action-handler.ts:83-87` and `runtime-module-list.tsx:362-366`
  read the top-level `message`.

## Root Cause

Two different contracts were each half-implemented. The API returned refusals
inside `data`, and the admin app read them from the top level. On the API side,
the deletion rules listed only the `Restrict` relations and missed the
`SetNull` attribution.

## Impact

- Platform operators could not tell why a delete failed.
- A successful delete could permanently lose which partner brought in a
  customer or tenant, and that attribution is a commission and legal record.

## Affected Areas

- Partner delete from both the list and the record page.
- The platform-runtime delete path.

## Proposed Resolution

Add a generic dependency contract, implement it for partners, re-check inside
the transaction, and add an admin dialog.

## Acceptance Criteria

- `GET /platform-runtime/partners/:id/dependencies` classifies every Partner
  relation.
- A spec fails when a new relation is left unclassified.
- Customer and tenant attribution and leads are RETAIN, and they block the
  delete. Commissions BLOCK.
- The delete re-checks under a row lock inside its transaction.
- The admin dialog shows blockers with links and disables Confirm. Success
  navigates to the list.

## Regression Coverage

REG-650, covered by two specs:

- `services/api/src/modules/partners/partner-dependencies.spec.ts`
- `apps/admin/lib/runtime/dependency-delete-model.spec.ts`

## Dependencies

None.

## Related Items

[[ITEM-0226]]: the foreign-key error mapping beyond partners.

## Resolution

TASK-0037 WP-07:

- **Generic contract.** `common/deletion/record-dependencies.ts` defines the
  policies BLOCKS, CASCADE, DETACH and RETAIN.
- **Partner rules.** `partner-dependencies.ts` holds the rule table, with a
  reason for each relation.
- **Transactional delete.** `deletePartners` runs one interactive transaction
  per partner, takes a `FOR UPDATE` row lock, re-classifies, and audits both
  deletion and refusal inside the transaction. A foreign-key violation becomes
  a named refusal.
- **Runtime endpoint.** `GET /platform-runtime/:module/:id/dependencies`,
  served through a provider registry.
- **Admin.** `DependencyAwareDeleteDialog` is wired to both record and list
  Delete. It adds `?tab=` deep links into the record tabs.

## QA Retest

QA-PLATFORM-048 passed against the throwaway database:

1. A partner with a referral link and an attributed customer: the delete was
   refused, the refusal named both dependencies and was audited, and the
   attribution stayed intact.
2. With both removed: the delete went through, the timeline was removed with
   it, and the deletion was audited.

Test runs:

- API partners and platform-runtime: 245 of 245 pass.
- Admin: 575 of 575 pass.
- Mutation check: changing attributedCustomers to DETACH fails 4 tests.

## History

- 2026-10-07 — created from the owner's report. Fixed in TASK-0037 WP-07.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0226]]
- Modules — [[partners]], [[platform-admin]]
- Regression — REG-650 (see the regression register)

<!-- GRAPH:END -->
