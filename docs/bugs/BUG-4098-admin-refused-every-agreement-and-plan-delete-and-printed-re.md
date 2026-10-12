---
ID: BUG-4098
aliases: [BUG-4098]
Title: Admin refused every agreement and plan delete and printed reference ids as values
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-10-12
DetectedInSha: a46d6bbb
AffectedModules: [contracts, super-admin, platform-runtime]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-678
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-delete-and-labels
CreatedAt: 2026-10-12
UpdatedAt: 2026-10-12
ResolvedAt: 2026-10-12
---

# BUG-4098 — Admin refused every agreement and plan delete and printed reference ids as values

## Summary

In the platform admin, a draft agreement created by mistake on a customer could
not be deleted from the customer's Agreements tab or anywhere else, an inactive
plan that was never sold could not be deleted, subgrids had no selection or
delete at all, and the customer Summary printed the Tenant primary owner as a
raw user id.

## Expected Behavior

- A super admin can permanently delete an agreement that never left drafting
  (DRAFT through LEGAL_APPROVAL, no signature requests, nothing pointing at it).
  Anything sent or signed is kept and the refusal says to void, supersede or
  terminate it.
- A super admin can delete an inactive plan nothing was ever sold on; a plan
  with subscriptions, orders or plan changes is kept and Archive is offered.
- Every subgrid whose target module permits deletion offers per-row Delete,
  row/page/all selection and Delete selected.
- No reference field shows a UUID; it shows the related record's name or a
  readable fallback.

## Actual Behavior

`PlatformRuntimeService.deleteRecords` threw "Delete is not available for this
module or is prevented by retention policy" for every `contracts` and `plans`
record, and the console rendered Delete disabled with that reason. The subgrid
panel had no delete path. `primaryOwnerUserId` was declared as a `text` field,
so the form printed the id although the API embedded `primaryOwnerUser`.

## Reproduction

1. Admin → Customers → any customer with a Draft agreement → Agreements tab.
2. There is no Delete on the row; Contracts → the agreement → Delete is disabled.
3. Plans → an inactive, never-sold plan → Delete is disabled.
4. Customer → Summary → Ownership → Tenant primary owner shows a UUID.

## Evidence

- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` — the
  `default` arm of `deleteRecords` refused both modules wholesale.
- `apps/admin/lib/runtime/platform-module-registry.ts` — `DELETE_REFUSALS`
  carried `contracts` and `plans`; `primaryOwnerUserId` was typed `text`.
- The REST route `DELETE /super-admin/plans/:id` existed with its own, stricter
  rule (refused any priced plan) and was not used by the console.

## Root Cause

A correct retention rule (executed agreements and sold plans are evidence) was
implemented at module granularity instead of record granularity, so drafts and
never-sold plans inherited a refusal meant for evidence. Separately, reference
fields typed as text bypassed the lookup resolution the form already had.

## Impact

Every platform operator; reachable in production. Junk drafts accumulated on
customer records with no way to remove them.

## Affected Areas

Admin Customers, Contracts and Plans record pages and lists; every subgrid;
`/platform-runtime/contracts|plans` delete and dependencies endpoints;
`DELETE /super-admin/plans/:id`.

## Proposed Resolution

Record-level deletion services with a dependency report, and one shared
reference-display rule for forms, lists and subgrids.

## Acceptance Criteria

- Draft agreement deletes from the customer's Agreements subgrid; a SENT one is
  kept with a named reason; the customer is untouched; the delete is audited.
- Inactive never-sold plan deletes with its prices and features; preferred-plan
  links are cleared; it is absent from `/public/plans`.
- Active/published or sold plans are refused with deactivate/archive guidance,
  identically through the runtime and the REST route.
- Tenant primary owner shows the owner's name.

## Regression Coverage

REG-678. `contract-deletion.spec.ts`, `plan-lifecycle.spec.ts`,
`generic-delete.spec.ts`, `reference-display.spec.ts`,
`subgrid-selection.spec.ts`.

## Dependencies

None.

## Related Items

- [[BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-]]
- [[BUG-1578-admin-customer-form-stores-a-country-lookup-id-where-every-r]]

## Resolution

Branch `agent/admin-delete-and-labels`.

- `ContractDeletionService` and `PlanDeletionService` (lock → classify →
  delete children → audit, per record, in one transaction) implement
  `RecordDependencyProvider`; the runtime routes `contracts`/`plans` to them and
  the REST plan route delegates to the same rule.
- Admin registry enables delete for both, limits the record Delete on agreements
  to pre-send statuses, and enables the dependency-aware dialog.
- Subgrids get selection, Select all (across pages), Delete selected and per-row
  Delete from one shared model (`subgrid-selection.ts`).
- `reference-display.ts` applies one rule in the form, the list and the
  subgrid: an id resolves through the embedded relation or `…Name`, else
  "Unknown user"/"Unavailable record". The owner field is a `userLookup`;
  payments embed tenant and invoice names.

## QA Retest

QA-PLATFORM-063. API end-to-end (18/18) and browser pass (10/10) against a
throwaway database on 2026-10-12.

## History

- 2026-10-12 — created from qa run at `a46d6bbb`.
- 2026-10-12 — owner decided deletion scope (unsent drafts; inactive never-sold
  plans; platform admin tier). Fixed on `agent/admin-delete-and-labels`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]], [[super-admin]]
- Regression — REG-678 (see the regression register)

<!-- GRAPH:END -->
