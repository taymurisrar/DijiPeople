---
ID: BUG-0497
aliases: [BUG-0497]
Title: Fifteen modules offered no Delete and no reason for its absence
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 098a0e6
AffectedModules: [apps/admin, services/api/src/modules/partners, services/api/src/modules/platform-runtime]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-200
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-commands-monitoring-bulk-delete
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0497 — Fifteen modules offered no Delete and no reason for its absence

## Summary

Three of eighteen admin modules offered Delete. The other fifteen showed no
Delete control and no explanation, so a missing feature and a deliberate refusal
were indistinguishable.

## Expected Behavior

Every list page either deletes, or says why it does not and what to do instead.

## Actual Behavior

`defaultActionsFor` emitted Delete and Bulk delete only when
`capabilities.delete` was true — leads, customers, customer-onboarding — and
nothing at all otherwise.

## Reproduction

Open Partners, Invoices or Tenants, select rows, open **More**. There is no
Delete and nothing saying why.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts` — the capability map, 3
  of 18 with `delete: true`.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` —
  `remove` and `bulkDelete` handled the same three and threw otherwise.

## Root Cause

The capability map is correct about the API and silent about the *why*. For most
of the fifteen, deleting is genuinely wrong — invoices, payments and commissions
are records the business must be able to produce; an executed agreement is
hashed into its own signature chain; a tenant sits in front of a cascade that
would take a customer's entire workspace. Those are refusals.

For three of them — partners, partner inquiries, partner onboarding — deletion
is the right operator action and was simply never built.

Rendering nothing for both cases is what made them look like one case.

## Impact

Operators cannot clear an inbox of spam partner inquiries, and cannot tell
whether the absence of Delete elsewhere is a bug to report.

## Affected Areas

`apps/admin` registry and command bar; `platform-runtime`; a new
`PartnerDeletionService`.

## Proposed Resolution

**Implement** guarded bulk delete for the three partner modules: delete only
what nothing depends on, refuse per row with the dependency named, and delete
the rest of the selection rather than failing the batch. Audited, and refusing
an empty selection outright.

**Explain** the other twelve: `DELETE_REFUSALS` gives each a sentence naming the
constraint and the non-destructive action that does what the operator wanted —
void an invoice, supersede an agreement, erase a tenant through the governed
flow. The command renders, disabled, carrying the reason.

The server stays the authority regardless: `remove` still throws for every
module outside its switch.

## Acceptance Criteria

- Partners, partner inquiries and partner onboarding support bulk delete.
- A row with dependents is refused by name, and the rest of the batch proceeds.
- Every module without the capability shows a disabled Delete carrying a reason.
- No module is silently missing Delete.
- Deletions are audited.

## Regression Coverage

REG-200 — `services/api/src/modules/partners/partner-deletion.service.spec.ts`
and the refusal assertions in
`apps/admin/lib/runtime/platform-module-capabilities.spec.ts`.

## Dependencies

[[BUG-0018]] is **stale** and should be revisited: it records that every
platform DELETE is dead for want of a method mapping, but `actionFor` gained a
DELETE branch in `ac17223`. It is also not on this path — the runtime delete
route is guarded by `assertModuleWrite`, not by that resolver.

## Related Items

[[BUG-0018]] — the record that needs correcting.

## Resolution

Fixed on `agent/tenant-commands-monitoring-bulk-delete`.

## QA Retest

Unit-verified. No deletion was executed against real data.

## History

- 2026-08-22 — reported as "most critical thing is to add 'Delete' button on all
  list of records page on all modules in admin app for bulk delete".
