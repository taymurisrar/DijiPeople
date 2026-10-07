---
ID: BUG-3982
aliases: [BUG-3982]
Title: Partner commissions accept any status jump and unverified links, and agreements change when the partner default commission is edited
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-10-07
DetectedInSha: 898a6ac3
AffectedModules: [partners, contracts]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-654
RelatedBacklogItem: ITEM-0227
RelatedDecision: ADR-0026
RelatedImplementation: [services/api/src/modules/partners/partner-commission-lifecycle.ts, services/api/src/modules/contracts/agreement-commercial-defaults.ts, apps/admin/lib/runtime/platform-module-registry.ts]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-08
---

# BUG-3982 — Partner commissions accept any status jump and unverified links, and agreements change when the partner default commission is edited

## Summary

Partner commissions were unusable and unsafe.
- **Creation and status:** commissions could only be created by hand with a spread DTO. Linked lead, customer and invoice ids were never verified. Any status change was allowed, including PAID back to PENDING.
- **Subgrid:** the Commissions subgrid was usually empty, with a false empty state that said commissions are "calculated when a partner-referred subscription bills".
- **Agreements:** agreements read the partner's default commission at render time, so editing the partner silently changed unsigned agreements.

## Expected Behavior

- **Ledger:** commissions are an operator-created ledger with an enforced lifecycle. Amounts are computed on the server, the linked records must belong to the partner, and every entry is audited.
- **Agreements:** an agreement snapshots the partner's default commission and currency when it is created. A later edit to the partner never changes an existing agreement.

## Actual Behavior

- `partners.service.ts` lines 529 to 603 spread the DTO and allowed any status.
- The `partner.commissionPercentage` placeholder fell back to the partner's current default (`contracts.service.ts` lines 6814 to 6850).

## Reproduction

1. Create an agreement for a partner whose default commission is 10.
2. Change the partner default to 15.
3. Render the agreement. It shows 15%.
4. On a commission, set PAID back to PENDING. The change is accepted.

## Evidence

- Investigation reports B and C.
- `PartnerCommission` (`schema.prisma` around line 3011) stores bare id references to the lead, customer and invoice, with no foreign keys.

## Root Cause

Commissions were modelled as editable rows rather than a ledger, and agreement commercial terms were never captured when the agreement was created.

## Impact

- Financial records could be rewritten without any trace.
- Agreement terms could drift after they were agreed.

## Affected Areas

Partner commissions (API, runtime and admin), contract creation, and agreement rendering.

## Proposed Resolution

ADR-0026 D3.

## Acceptance Criteria

- **Status machine:** PENDING, then APPROVED, then PAYABLE, then PAID. VOID is reachable from any state except PAID. Every other transition is refused with `PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED`.
- **Amount:** calculated as base × rate / 100 on the server. The rate defaults to the partner's default commission.
- **Linked records:** must belong to the partner.
- **Agreements:** snapshot the partner's commission when it is above 0, plus its currency, at creation. An explicit value is never overwritten.
- **Placeholders:** 10 renders as "10%".

## Regression Coverage

REG-654:
- `services/api/src/modules/partners/partner-commission-lifecycle.spec.ts`
- `services/api/src/modules/partners/partner-commissions.service.spec.ts`
- `services/api/src/modules/contracts/contracts.commission-snapshot.spec.ts`

## Dependencies

None.

## Related Items

- [[ITEM-0227]]: automatic accrual is an open product decision.
- [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]], work package WP-06.

## Resolution

- **New shared code:** `partner-commission-lifecycle.ts`, which has four runtime actions, and `agreement-commercial-defaults.ts`, which runs inside `ContractsService.create`.
- **Conditional transitions:** each status change only applies if the record is still in the expected state. Audit and timeline entries are written in the same transaction.
- **Money terms:** cannot be changed after creation. Correcting one means voiding the commission and creating a new one.
- **Admin:**
  - The subgrid shows source, rate, base, commission, currency, status, created date and paid date.
  - New commission actions and a `/commissions/new?partnerId=` page.
  - Create agreement from a partner pre-fills its currency and default commission.
- **Out of scope:** automatic accrual is not built and is tracked in ITEM-0227.

## QA Retest

QA-PLATFORM-052:
- API: 1,009 of 1,009 tests pass.
- Admin: 614 of 614 tests pass.
- Mutation checks killed both mutants (snapshot and paid-is-final).

## History

- 2026-10-07 — created from user report at `c01b778b`.
- 2026-10-08 — fixed in TASK-0037 WP-06.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0227]]
- Modules — [[partners]], [[contracts-and-agreements]]
- Regression — REG-654 (see the regression register)

<!-- GRAPH:END -->
