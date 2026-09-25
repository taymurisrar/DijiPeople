---
ID: BUG-3546
aliases: [BUG-3546]
Title: Tenant record Edit leaves the operator on a tab with nothing editable
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-590
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3546 — Tenant record Edit leaves the operator on a tab with nothing editable

## Summary

Clicking Edit on a tenant record in `apps/admin` enables the Save action but
lands the operator on the Overview tab, which has no editable fields at all —
the only writable fields (`name`, `displayName`, `legalName`) live on the
Configuration tab. An operator who clicks Edit and looks at the screen in
front of them sees nothing to change.

## Expected Behavior

Clicking Edit should either switch to (or visually indicate) the tab that
actually contains editable fields, or the Overview tab should surface the
writable fields directly, so the operator is never left on a tab with an
enabled Save button and no visible input to act on.

## Actual Behavior

On `/tenants/:tenantId`, clicking Edit enables the header Save action but
leaves the currently-selected tab as-is. The default tab, Overview, contains
none of the three writable fields — an operator has to know to switch to
Configuration first.

## Reproduction

1. Open any tenant record in `apps/admin` (`/tenants/:tenantId`).
2. Land on the default Overview tab.
3. Click Edit — the Save action becomes enabled.
4. Look at the Overview tab: no input fields are present to edit.
5. Switch to the Configuration tab: `name`/`displayName`/`legalName` are here
   and editable.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts:2686-2853` — of the 26
  form fields declared for `tenants`, only `name`, `displayName`,
  `legalName` are writable (`readOnly: false`); everything else, across
  Overview, Identifiers, Record history and Provenance, is `readOnly: true`.
  The writable three live on the Configuration tab grouping, not Overview.
- `apps/admin/app/(internal)/tenants/[tenantId]/page.tsx:25-32` —
  `RuntimeRecordRoute moduleKey="tenants"` renders the generic tabbed runtime
  record page with no tab pre-selection tied to edit mode.
- `RECORD_HEADER_READ_ONLY_REASON.tenants` (`platform-module-registry.ts:302-303`)
  only disables the header status slot; it does not redirect the operator to
  a tab with editable content when Edit is clicked.

## Root Cause

The generic runtime record page enables Edit/Save based on whether **any**
field across the whole record is writable (`MODULE_CAPABILITIES.tenants.update
= true`), without regard to which tab the writable fields are grouped under,
or which tab is currently selected. For `tenants`, the writable fields happen
to be concentrated on one non-default tab.

## Impact

Cosmetic/usability only — no data or access impact. Every operator editing a
tenant for the first time is likely to hit this, since Overview is the
landing tab, and may conclude Edit is broken before discovering the
Configuration tab holds the fields.

## Affected Areas

- `/tenants/:tenantId` record page, Overview and Configuration tabs.
- Potentially any other runtime module where writable fields are not on the
  default tab (not audited here; flagged for a follow-up if the pattern
  recurs).

## Proposed Resolution

When Edit is clicked, switch the active tab to the first tab containing a
writable field (or, more generally, teach the runtime record page to jump to
a tab with editable content on Edit). No ExecPlan needed — this is a small,
scoped frontend UX fix in the existing runtime shell.

## Acceptance Criteria

- Clicking Edit on the tenant record either switches to the Configuration tab
  or otherwise makes an editable field visible without an extra manual tab
  switch.
- Overview tab behaviour for a read-only viewer (not editing) is unchanged.

## Regression Coverage

REG-590 (`apps/admin/lib/runtime/edit-tab-selection.spec.ts`). Proven to fail
against the pre-fix code: before `edit-tab-selection.ts` existed,
`enterEditMode` was `() => setMode("edit")` with no tab-switching logic at
all, so the spec's assertions had nothing to call.

## Dependencies

None.

## Related Items

- [[BUG-3544]] — the same tenant-edit screen's authorization defect, found in
  the same discovery pass.
- TASK-0032 — the program that found and will fix this.

## Resolution

Fixed by commit `9baf16e1` on `agent/pah-wp08-admin-crud` (TASK-0032 WP-08,
merged as `b967aae1`): `apps/admin/lib/runtime/edit-tab-selection.ts`'s
`editEntryTab` now switches to the first tab (in the record's own tab order)
containing an editable field when the current tab has none.

## QA Retest

Verified by TASK-0032 WP-09 live QA against the throwaway stack — see
`docs/tasks/TASK-0032-streams/QA-summary.md` ("Admin screens … tenants …": no
failed calls, no console errors) and the passing
`edit-tab-selection.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; live browser observation.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).
- 2026-09-25 — fixed at `9baf16e1` (WP-08); verified by WP-09 live QA;
  Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-590 (see the regression register)

<!-- GRAPH:END -->
