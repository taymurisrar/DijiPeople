---
ID: BUG-2026
aliases: [BUG-2026]
Title: The employee export produces columns the employee import template does not accept
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2026 — The employee export produces columns the employee import template does not accept

## Summary

Export and import speak different languages. `GET /api/employees/export` emits 11
human-titled columns; `GET /api/employees/export-template` — the file the import
screen hands the customer — expects 21 field-key columns. The names differ, the
export collapses four name fields into one `Full Name`, it identifies the manager
by display name where the template wants `reportingManagerEmployeeCode`, and it
omits the four emergency-contact columns that are **mandatory at create time** on
this tenant. So the export-edit-reimport round trip — the first thing a customer
tries when they want to bulk-correct their people data during onboarding — cannot
work.

## Expected Behavior

Either the export is a valid import file, so a customer can export, edit in a
spreadsheet and re-upload; or the two are deliberately different artefacts (a
report versus a data-loading template) and the import screen says so plainly
before the customer discovers it by failing.

## Actual Behavior

Two disjoint column sets.

`GET /api/employees/export` — 11 columns, human titles:

```
Employee Code, Full Name, Work Email, Phone, Employment Status, Department,
Designation, Reporting Manager, Owner, Owner Email, Hire Date
```

`GET /api/employees/export-template` — 21 columns, field keys:

```
employeeCode, firstName, middleName, lastName, …,
reportingManagerEmployeeCode, ownerEmail,
emergencyContactName, emergencyContactPhone,
emergencyContactRelation, emergencyContactRelationType
```

Four specific incompatibilities:

1. **Naming convention** — human titles versus field keys, so no column matches
   by name.
2. **`Full Name` versus `firstName` / `middleName` / `lastName`** — one exported
   column has to be split three ways to import.
3. **`Reporting Manager` versus `reportingManagerEmployeeCode`** — the export
   gives a display name, the template wants a code.
4. **The four emergency-contact columns are absent from the export** and are
   mandatory at create time on this tenant, so even a perfectly renamed export
   would fail to create anyone.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. `GET /api/employees/export` and read the header row — the 11 columns above.
2. `GET /api/employees/export-template` and read the header row — the 21 columns
   above.
3. Compare. No column name is shared between the two files.

## Evidence

The two header rows quoted above, taken from the live responses on the production
demo tenant.

**What was verified as correct, so nobody re-tests it:**

- **The import template is complete and correct.** All 21 columns are present,
  including all four emergency-contact fields. Those were checked specifically,
  because employees cannot be created without them under this tenant's settings
  and a template missing them would make bulk import impossible on its own. It
  does not.
- **The export returns correct CSV with correct data** for all 11 seeded
  employees.

**Coverage gap, stated plainly:** `POST /api/employees/import` was **not
executed**. Only the template the import screen hands out was inspected. Nothing
here should be read as evidence that the import path itself works — it is
unverified, in either direction.

No file:line evidence was collected for either handler.

## Root Cause

Not established in code. Observably, the export was built as a human-readable
report and the template as a machine-readable loader, and no requirement tied the
two together.

## Impact

The round trip a customer expects during onboarding does not exist. "Export your
people, fix them in Excel, upload them back" is the standard way an HR
administrator corrects a few hundred records, and here it fails — not with a
clear message, but by producing a file the importer cannot read.

The emergency-contact omission is the part that cannot be worked around by
renaming columns: those fields are required at create time, so a customer who
does the renaming work by hand still cannot import the result.

Rated MEDIUM: no data is wrong and no journey is blocked outright — employees can
be created individually and the template can be filled in from scratch — but it
defeats a common onboarding path and wastes the customer's time before it tells
them anything.

## Affected Areas

`services/api/src/modules/employees` (the export handler and the export-template
handler); the Import screen in `apps/web` that offers the template.

## Proposed Resolution

Either option is acceptable; pick one and say which in the plan.

- **Make the export re-importable.** Emit the template's field keys and its full
  column set from the export, including the emergency-contact fields and
  `reportingManagerEmployeeCode` instead of the manager's display name. If a
  human-readable export is also wanted, offer it as a second, clearly labelled
  format rather than replacing this one.
- **Document the mismatch on the Import screen.** State that the export is a
  report and not an import file, and that the template is the file to use. Cheap,
  honest, and it stops the customer discovering it the expensive way.

The first is the better product answer; the second is a legitimate interim if the
export's human titles are relied on elsewhere.

Whichever is chosen, verify `POST /api/employees/import` separately — this record
does not establish that it works.

## Acceptance Criteria

- Either the file produced by `GET /api/employees/export` is accepted by
  `POST /api/employees/import` without hand-editing, or the Import screen states
  in the UI that it is not.
- If the export becomes re-importable, it carries the four emergency-contact
  columns and identifies the manager by employee code.
- The import path itself is exercised at least once, by a test or a QA run, so
  its status stops being unknown.

## Regression Coverage

None yet. A test asserting the export's header row is a subset of the import
template's accepted columns would fail today and is cheap; it also pins the two
together so they cannot drift apart again.

## Dependencies

None identified.

## Related Items

BUG-2014 records that the users `Data > Import` link is a dead end, which is the
same capability failing on a different entity.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet. The retest must include an actual
`POST /api/employees/import`, which this run did not perform.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.
- 2026-08-29 — corrected in the second pass (SESSION-0072): `POST /api/employees/import` executed for the first time and **passes**, resolving named lookups into foreign keys. The defect is on the export side only; the import path is not broken. Disposition unchanged.

## Correction — the import path works; only the export is at fault — 2026-08-29

This record was written with `POST /api/employees/import` **unexecuted**, and it
says so in its own Evidence section. It has now been executed, in the second
Starter-plan production pass (SESSION-0072, deployed API `949f461c`, tenant
`DijiPeople Demo`); full run at
`docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md`, scenarios S8–S10,
and promoted to `QA-TENANT-056`.

```
GET  /api/employees/export-template                       -> 21 columns
POST /api/employees/import  (1 data row from that header) -> 201
     {"totalRows":1,"successCount":1,"failureCount":0,"errors":[]}
```

The created employee, EMP-0012, came back with `department` "Marketing",
`designation` "Marketing Specialist" and `emergencyContactRelationType` "Spouse"
**resolved by name into real foreign keys** — the importer does lookup
resolution, not merely column mapping. That is the expensive half of a bulk
loader, and it works.

**What this changes and what it does not.** The defect stands exactly as
recorded: `GET /api/employees/export` emits a different, smaller, human-titled
column set, so the export → edit → re-import round trip still cannot work, and
the four emergency-contact columns are still absent from the export. What is now
disproven is any reading of this record as "bulk import is broken". It is not.
The template round-trips with the importer correctly, and a customer who fills in
the template gets working rows. The fault is on the **export** side alone, and a
fix should be scoped there.

The third acceptance criterion — "the import path itself is exercised at least
once, by a test or a QA run, so its status stops being unknown" — is satisfied by
this pass. The other two remain open.

Not covered, and left open deliberately: volume, a duplicate `employeeCode`, a
lookup name that does not resolve, and how a failing row is reported in `errors`.
One row proves the path; it does not characterise it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]

<!-- GRAPH:END -->
