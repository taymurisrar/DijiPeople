---
ID: ITEM-0165
aliases: [ITEM-0165]
Title: Present an employee's primary location and authorised work sites as one control
Type: UX
Status: DONE
Priority: P2
Severity: 
AffectedModules: [apps/web, employees, attendance]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: apps/web/lib/runtime/modules/employee-metadata.adapter.ts, apps/web/app/components/runtime/module-widget-renderer.tsx, apps/web/lib/runtime/modules/employee-data.adapter.ts, apps/web/lib/runtime/module-data-adapter.types.ts, packages/config/system-widget-registry.js
TargetMilestone: 
BlockedBy: 
---

# ITEM-0165 — Present an employee's primary location and authorised work sites as one control

## Summary

Looking at the employee record, the product owner asked why the work site is
"like that" and whether it should be a lookup. The answer is that it is two
things presented as one absence. A **Location** lookup sits among the fields on
the main form, and a separate **Authorised work sites** panel sits further down
the page with its own Add work site button, reading "No work site assignments
yet". Nothing on screen connects them, so the panel looks like a broken lookup.

The underlying data model is sound. This is a presentation problem.

## Why It Matters

The two surfaces answer different questions — where does this person normally
work, and where are they allowed to record attendance — and a reader who does
not already know that cannot tell. The immediate consequence is the one
observed: a reviewer reads the panel as a malfunctioning field. The operational
consequence is worse, because attendance depends on the authorised set and an
employee with a Location but no work site assignment will be refused at
check-in for reasons the record page does not make visible.

## Evidence

**There is no duplicate source of truth here — checked before filing.**
`Employee.locationId` is a normal Location lookup field, declared at
`apps/web/lib/runtime/modules/employee-metadata.adapter.ts:309-314` and placed
on the main form at line 828. `EmployeeWorkSite` rows hold the authorised set,
with multiple sites and validity dates. The two are kept in step transactionally
rather than drifting: `assignWorkSite`, `setPrimaryWorkSite` and
`removeWorkSite` in
`services/api/src/modules/attendance/attendance-operations.service.ts:76-119`
and `:131-188` update `Employee.locationId` alongside the `EmployeeWorkSite` row
inside a `$transaction`. A comment at
`apps/web/app/(authenticated)/employees/[employeeId]/_components/employee-work-sites.tsx:14-21`
documents the relationship explicitly.

So `AGENTS.md` principle 4 is respected in the data model, and no schema change
is warranted.

**The panel is not part of the form.**
`apps/web/app/(authenticated)/employees/[employeeId]/page.tsx:196-232` renders
three siblings: the runtime form wrapper, `EmployeeWorkSites`, and
`EmployeeDlpCaptures`. The last two are page-level React components mounted
outside the metadata form entirely.

That shows up in the rendered document. Reading the heading levels on the live
employee record at `cbd9b812`:

| Heading | Level |
|---|---|
| Aisha Rahman (record title) | h2 |
| Employment Information, Basic Information, Reporting Hierarchy, … | h4 |
| Authorised work sites | h2 |
| Data-loss prevention captures | h3 |

Three peer sections at three different levels, because two of them are not
sections at all. The work sites panel is rendered at the same heading level as
the record title.

## Proposed Approach

Presentational, contained, no ExecPlan needed.

Bring the primary location and the authorised set together into one control on
the form, where the Location lookup is today. The Location lookup stays the
primary-site picker; beneath or beside it, show the authorised sites as a small
list with the Add work site affordance, so the relationship is legible without
explanation. Remove the free-floating page-level panel.

While doing it, say what the empty state means. "No work site assignments yet"
is accurate and unhelpful; it should say that attendance at a site requires an
assignment, which is the consequence the reader needs.

If the combined control is better rendered as a related list inside the form
rather than inline, declare it through the metadata form as a section so it
inherits the form's heading level and spacing, instead of being a sibling of the
whole form.

## Acceptance Criteria

- An employee's primary location and authorised work sites are presented
  together, with the relationship between them evident on screen.
- No work-sites panel is rendered as a sibling of the record form.
- Heading levels on the employee record descend properly from the record title.
- The empty state states the operational consequence of having no assignment.
- Assigning a site from the record still updates `Employee.locationId` and the
  `EmployeeWorkSite` row in one transaction, unchanged.

## Dependencies

None.

## Related Items

[[ITEM-0166]] removes the other page-level panel from the same record page.
[[ITEM-0164]] is the hierarchy viewer. [[ITEM-0167]] is the record shell
conformance work.

## Resolution

Declared through the metadata form rather than the page. `employee.workSites`
is a new System Widget (`packages/config/system-widget-registry.js`), rendered
via `createSystemWidgetComponent` as a `components` entry on the existing
`organization-reporting` section in `employee-metadata.adapter.ts` — the same
section the Location field is already in, so the authorised-sites list now
renders directly beneath it, in the same section, at the same `h4` heading
level as every other form section. `employees/[employeeId]/page.tsx` no
longer renders `EmployeeWorkSites` or fetches work-site/location data
server-side; the widget (`ModuleEmployeeWorkSitesWidget` in
`module-widget-renderer.tsx`) fetches its own data client-side, the same
pattern Reporting Hierarchy and Timeline already use, and calls the same
`assignWorkSite` / `setPrimaryWorkSite` / `removeWorkSite` transactional
endpoints the old panel called — nothing about that transaction changed.

**Verified, not assumed:** the transactional update lives in
`services/api/src/modules/attendance-integrations/operations/attendance-operations.service.ts`
(`assignWorkSite:76-123`, `setPrimaryWorkSite:131-179`,
`removeWorkSite:189-253`), each wrapping `EmployeeWorkSite` and
`Employee.locationId` writes in one `$transaction`. This record's own
Evidence section named
`services/api/src/modules/attendance/attendance-operations.service.ts` — that
path does not exist in this codebase; the module lives under
`attendance-integrations/operations/`, not `attendance/`. Corrected here
rather than left to propagate.

**A pre-existing gap found while verifying, left alone as out of scope:**
`services/api/src/modules/employees/employees.service.ts` has no reference to
`EmployeeWorkSite` at all, so a generic `PATCH /employees/{id}` carrying
`locationId` (the plain field's own edit path, unchanged by this record)
updates `Employee.locationId` without touching the `EmployeeWorkSite` table.
This widget does not use that path — it calls the transactional endpoints
above — so it does not introduce or worsen the gap, but the gap itself
predates this record and is not something a presentation-only, no-ExecPlan
item should absorb. Not filed as a new bug record in this session because it
was identified late against a hard session boundary; flagging it here for the
Architect to triage and file if it is not already known.

Empty state rewritten to state the operational consequence: "No work site
assignments yet. Attendance at a site requires an assignment here — without
one, this employee will be refused at check-in everywhere except their
inherited primary site."

**Post-merge correction:** the widget's add/edit-validity/remove/make-primary
actions initially called `fetch()` against the literal
`/api/integrations/attendance/employees/{id}/work-sites...` routes directly
from inside `module-widget-renderer.tsx` — the *shared* widget-rendering
engine every module's record page renders through. That broke the same
invariant [[ITEM-0166]]'s DLP relocation broke, caught by the same spec
(`package-layer-runtime.spec.ts`'s "keeps shared runtime components free of
Module-specific names and routes"): a shared file must not hardcode one
module's REST route, the same way it must not import from one module's
folder. Fixed by adding a generic `runWidgetAction` method to
`ModuleDataAdapter` (`module-data-adapter.types.ts`) — the write-side
counterpart to the `getWidgetData` method this widget, Reporting Hierarchy
and Timeline already used for reads. The widget now calls
`dataAdapter.runWidgetAction({ action: "assign" | "setPrimary" | "remove",
payload, ... })` with no route or module knowledge of its own; only
`employee-data.adapter.ts` — an employees-owned file, not a shared one —
knows this maps to the transactional endpoints named above. The endpoints,
permissions and transactional behaviour are unchanged; only where the route
string lives moved.

## History

- 2026-09-11 — created at `cbd9b812` from a user report. The suspected duplicate
  source of truth between `Employee.locationId` and `EmployeeWorkSite` was
  investigated and found not to exist; the record was narrowed to presentation
  accordingly.
- 2026-09-12 — implemented for SESSION-0103. See Resolution.
- 2026-09-13 — reviewed on production (`df0f84f1`); the owner chose a
  related-records tab instead of the in-form widget (ADR-0014). Superseding
  work tracked as [[ITEM-0179]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]], [[attendance]]

<!-- GRAPH:END -->
