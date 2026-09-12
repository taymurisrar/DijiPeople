---
ID: BUG-3498
aliases: [BUG-3498]
Title: The employee record export writes lookup fields as raw ids
Status: OPEN
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
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
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

A web unit test of `exportRecordFormCsv` with a record whose lookup fields hold
ids and whose display values are available must assert the CSV contains the
display names. It fails today. REG entry to be added when the test exists.

## Dependencies

None.

## Related Items

[[BUG-3497]] is the other record command-bar defect found in the same walkthrough.
[[ITEM-0184]] collects the remaining employee record usability defects.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
