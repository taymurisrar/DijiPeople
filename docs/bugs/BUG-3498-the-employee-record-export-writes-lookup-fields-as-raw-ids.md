---
ID: BUG-3498
aliases: [BUG-3498]
Title: The employee record export writes lookup fields as raw ids
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-497
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: [docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md, apps/web/lib/runtime/module-adapter-command-handlers.ts, apps/web/app/components/runtime/module-record-page.tsx]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3498 — The employee record export writes lookup fields as raw ids

## Summary

The **Export** command on an employee record downloads a CSV of the record's
fields. Lookup fields in that file hold raw UUIDs instead of the names shown on
screen, which makes the export unreadable wherever it matters: Owner, Reporting
Manager and Emergency Contact Relation Type.

## Expected Behavior

Every exported value reads the way it does on the record: a lookup exports the
referenced record's display name, not its id. Exporting may download directly,
but the file is usable by a person without a database.

## Actual Behavior

Clicking Export on an employee record immediately downloads
`employees-<name>.csv`. The Owner, Reporting Manager and Emergency Contact
Relation Type rows contain UUIDs.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` (demo tenant) as the workspace owner.
2. Open an employee record that has an owner, a reporting manager and an emergency contact relation type set.
3. Click **Export** in the record command bar.
4. Open the downloaded `employees-<name>.csv`.
5. Observe that the Owner, Reporting Manager and Emergency Contact Relation Type values are UUIDs.

## Evidence

Browser QA on the live demo tenant at `df0f84f1`. Code references are at the
worktree HEAD.

`record.export` in `apps/web/lib/runtime/module-adapter-command-handlers.ts:401-415`
exports client-side through `exportRecordFormCsv` whenever a form and record are
loaded. That function (lines 560-675) walks the header, status fields and form
sections and writes one `Section, Field, Value` row per field.

Each value comes from `displayExportValue` (lines 700-719):
- It maps option-set values to their labels.
- It reads `label`/`name`/`fullName`/`displayName`/`email` off an object value.
- Any other string goes through `String(value)`.

A lookup field whose record value is the referenced id string matches none of
those branches, so the id is written verbatim.

## Root Cause

`displayExportValue` (`module-adapter-command-handlers.ts:700-719`) has no
lookup resolution. It reads the raw value stored under the field's logical name
on the record. For a lookup that value is the referenced id, and nothing in the
export path consults the display name the record page renders for the same
field.

## Impact

- Every tenant user who exports an employee record gets a file with unreadable relationship fields.
- The same function serves every module whose record export takes the client-side form path, so the defect is not limited to employees.
- Reachable in production. No data exposure: the ids are the tenant's own.

## Affected Areas

- `apps/web` runtime command handlers: `record.export`, `exportRecordFormCsv`, `displayExportValue`.
- Employee record page and any other runtime record page using the same export.

## Proposed Resolution

No ExecPlan needed. Resolve lookup values to the same display text the record
page shows. Use the lookup display value the record payload or form runtime
already carries, rather than re-querying per field. Apply it once in
`displayExportValue`, where the value is chosen, so every module benefits.

## Acceptance Criteria

- Exporting an employee record writes the owner's name, the reporting manager's name and the relation type's label, not UUIDs.
- No exported cell for a populated lookup field is a bare UUID.
- Option-set, boolean, date and plain text values export as they do today.

## Regression Coverage

REG-497, QA scenario QA-EMPLOYEE-003:
`apps/web/lib/runtime/module-adapter-command-handlers.export.spec.ts` — Owner,
Reporting Manager and relation type export as names; no UUID anywhere in the
CSV; option set, boolean and date values unchanged. Mutation-checked: bypassing
the display-name substitution fails the names case.

As filed, the record required:

A web unit test of `exportRecordFormCsv` with a record whose lookup fields hold
ids and whose display values are available must assert the CSV contains the
display names. It fails today. REG entry to be added when the test exists.

## Dependencies

None.

## Related Items

[[BUG-3497]] is the other record command-bar defect found in the same walkthrough.
[[ITEM-0184]] collects the remaining employee record usability defects.

## Resolution

Fixed in TASK-0031 WP-03 (commit 270757ba on `agent/walkthrough2-employee-record`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0047).

- The record page's `lookupDisplayValues` are threaded to the export:
  `module-record-page.tsx` → `ModuleRuntimeCommandHandler` →
  `buildAdapterCommandHandlers` → `exportRecordFormCsv`.
- Every lookup field's value is replaced by its display name before rows are
  built (`withLookupDisplayNames`); a lookup still holding an id exports as an
  empty cell (`displayExportLookupValue`), and embedded objects export their
  name.
- Option set, boolean, date and text values export as before.
- Applies to every module that uses the client-side record export, not only
  employees.

By design, a lookup whose name the page does not know exports blank rather than
the id.

## QA Retest

**NOT BROWSER-TESTED.** This record was not exercised in a browser during the
local QA run or on production. Coverage is unit specs only
(`module-adapter-command-handlers.export.spec.ts`). CI runs 34732185363,
34732682935 and 34732697734 passed on f865ac5e (the merged tree), which is
evidence the unit suite is green, not that the browser scenario below was run.
Scenario QA-EMPLOYEE-003: export an employee with owner,
reporting manager and emergency contact relation type set, and open the CSV —
names, no UUIDs; Employment Status reads "Active"; dates and Yes/No unchanged.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-03; unit-tested; browser verification pending.
- 2026-09-13 — QA retest: NOT BROWSER-TESTED — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]]
- Implementation — [[EXECPLAN-0047-employee-record-walkthrough-two-remediation]]
- Regression — REG-497 (see the regression register)

<!-- GRAPH:END -->
