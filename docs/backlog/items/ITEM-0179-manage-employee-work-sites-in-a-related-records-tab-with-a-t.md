---
ID: ITEM-0179
aliases: [ITEM-0179]
Title: Manage employee work sites in a related-records tab with a transactional Make primary action
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, employees, attendance]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: 
RelatedQA: [QA-EMPLOYEE-005, QA-EMPLOYEE-006]
RelatedADR: docs/decisions/ADR-0014-employee-work-sites-are-a-related-records-tab.md
RelatedImplementation: [docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md, apps/web/lib/runtime/modules/employee-metadata.adapter.ts, apps/web/lib/runtime/modules/employee-data.adapter.ts, apps/web/app/components/runtime/module-related-subgrid.tsx, services/api/src/modules/attendance-integrations/operations/attendance-operations.service.ts, services/api/src/modules/employees/employees.service.ts, packages/config/system-widget-registry.js]
TargetMilestone: 
BlockedBy: 
---

# ITEM-0179 — Manage employee work sites in a related-records tab with a transactional Make primary action

## Summary

[[ITEM-0165]] moved an employee's authorised work sites into the record form,
as a widget beneath the Location lookup. On the live demo tenant that control
still does not read as one thing. It stacks three explanatory texts that
contradict each other and the record itself. Its add row is squeezed until the
controls truncate, and it can be edited while the record is in read mode.
Saving Location through the form still does not touch the work-site rows.

The owner decided on 2026-09-13 to stop fitting work sites into the form. They
become a **Work Sites** related-records tab built on the standard subgrid, with
site, primary, valid from and valid to columns and a transactional **Make
primary** row action. The Location field becomes read-only and mirrors the
primary site. The in-form widget and all of its text go away.

## Why It Matters

Attendance check-in is decided by the authorised set, so this control decides
whether an employee can clock in. At the moment it gives the wrong answer on
screen. The workspace owner's own record has Head Office as its Location, yet
the widget says "No work site assignments yet". An administrator reading that
either adds a duplicate assignment or concludes the record is broken. Two
editable surfaces for one fact, the Location field and the widget, also mean
the form can change the primary site without the work-site rows following it.
That is the drift ADR-0014 exists to close.

## Evidence

Observed on the demo tenant (`https://dijipeople-demo.ws.dijipeople.com`) as
the workspace owner, deployed build at `df0f84f1`.

**W1 — three stacked texts that contradict each other.** The widget, rendered
by `ModuleEmployeeWorkSitesWidget` in
`apps/web/app/components/runtime/module-widget-renderer.tsx`, shows three texts
stacked on each other:

| Text | Where |
|---|---|
| The widget description | above the list |
| A sky-blue info box: "This employee has no explicit work site assignment, so they are authorised for their primary work site only. Adding an assignment replaces that inherited access." | `module-widget-renderer.tsx:2378-2384` |
| Empty state: "No work site assignments yet. … refused at check-in everywhere except their inherited primary site." | `module-widget-renderer.tsx:2517-2523` |

For an employee whose Location is Head Office, the page says both that they are
authorised for their primary site and that they have no assignment. It also
uses the jargon "inherited primary site".

**W2 — the add row does not fit.** The add row (`module-widget-renderer.tsx:2531-2604`)
is a `sm:grid-cols-3` grid holding a native `<select>` and two native
`type="date"` inputs. It sits in a one-third-width form column, so the controls
render as "Selec" and "mm/c". These are hand-rolled controls, not the shared
`FormControl` components. The row is also available while the record is in
read mode.

**W3 — the Location field and the work-site rows are still two edit paths.**
`locationId` is an ordinary required form field
(`apps/web/lib/runtime/modules/employee-metadata.adapter.ts:310`, placed at
`:837`). The widget is attached beside it at `:854` (`widgetKey:
"employee.workSites"`). Saving the form goes through the generic employee
update. `services/api/src/modules/employees/employees.service.ts` has no
reference to `EmployeeWorkSite`, so a Location change made there leaves the
work-site rows untouched. [[ITEM-0165]]'s own Resolution recorded this gap
without filing it.

**W4 — why this was not a subgrid originally.** The transactional writes live in
`services/api/src/modules/attendance-integrations/operations/attendance-operations.service.ts`:
`assignWorkSite` (`:76`), `setPrimaryWorkSite` (`:131`) and `removeWorkSite`
(`:189`). Each wraps `Employee.locationId` and `EmployeeWorkSite` in one
`$transaction`. They are exposed at `employees/:employeeId/work-sites` under
`attendanceDevices.read` / `attendanceDevices.manage` in
`services/api/src/modules/attendance-integrations/operations/attendance-operations.controller.ts:97-130`.
A generic subgrid's create/update/delete cannot express "make primary", because
that operation rewrites a second model in the same transaction. It also cannot
use the attendance permission pair. The generic related subgrid with an
assignment panel already exists
(`apps/web/app/components/runtime/module-related-subgrid.tsx`, `subgrid.assignment`
from `:439`), declared for project allocations in
`apps/web/lib/runtime/modules/standard-module-specs.ts:911`. So a standard tab
is possible, but only if the row action is routed to the transactional endpoint
rather than to generic CRUD. No decision record captured that trade-off until
ADR-0014.

## Proposed Approach

An ExecPlan is needed under `PLANS.md`. The work crosses the web runtime, the
employee adapter, the employees service and the attendance endpoints, and it
changes how a field that attendance depends on is written.

1. Declare a **Work Sites** related-records tab on the employee record using the
   standard related subgrid. Columns: site, primary, valid from, valid to.
   Adding, editing validity and removing go through the existing transactional
   endpoints via the employee data adapter's `runWidgetAction` seam (or its
   subgrid equivalent). A shared runtime component must never hardcode the
   route; the adapter owns it, as [[ITEM-0165]]'s post-merge correction
   established.
2. Add a **Make primary** row action that calls `setPrimaryWorkSite`. It must be
   one transaction, never a subgrid update followed by an employee update.
3. Make the Location field read-only on the form and have it display the
   primary site. Remove `locationId` from the writable employee update path, or
   route it through `setPrimaryWorkSite`, so no second write path remains.
   Settle how `settings.requireWorkLocation` (`employee-metadata.adapter.ts:2522`)
   is satisfied at create time before implementation.
4. Delete the `employee.workSites` widget from the form section, and its
   renderer, description, info box and empty-state paragraph. Where a column or
   action is unclear, fix its label; do not add sentences.
5. Keep `attendanceDevices.*` as the permission pair for the tab's actions, and
   hide the actions, not only disable them, for a user without `manage`.

## Acceptance Criteria

- The employee record has a Work Sites tab listing site, primary, valid from
  and valid to for every assignment, using the standard related subgrid.
- Make primary on a row updates `Employee.locationId` and the `EmployeeWorkSite`
  rows in one `$transaction`. A spec proves both, or neither, change.
- The Location field on the employee form is read-only and shows the primary
  site. No request from the form can change `Employee.locationId` without
  `EmployeeWorkSite` following it.
- The `employee.workSites` widget, its three texts and the add row are gone from
  the form.
- No action in the tab is available while the record is in read mode, or to a
  user without `attendanceDevices.manage`.
- The tab is usable at 400px: no truncated select or date control.
- For the owner employee on the demo tenant, the record shows Head Office as
  primary, with no statement that there are no assignments.

## Dependencies

ADR-0014 records the decision this item implements. It must be merged
alongside or before the ExecPlan. Sequence the text removal with [[ITEM-0183]]
so the widget texts are not edited twice.

## Related Items

[[ITEM-0165]] built the widget this replaces. [[ITEM-0183]] removes
agent-added helper text across screens, including these three. [[ITEM-0167]]
is the record shell conformance work the new tab should follow. Decision:
ADR-0014.

## Resolution

Done in TASK-0031 WP-03 (commit 270757ba on `agent/walkthrough2-employee-record`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0047), completed at
integration by commit dba1605d on `agent/walkthrough2-integration`. Browser
verification pending in WP-07/WP-08 (QA-EMPLOYEE-005, QA-EMPLOYEE-006).

- **Tab.** `employee-metadata.adapter.ts` adds relationship `employee_work_sites`
  (target field `employeeId`) and a Work Sites related-records tab (order 25),
  also on stored main forms, visible with `attendanceDevices.read`.
- **Subgrid.** Columns Site, Primary, Valid From, Valid To. Assign over active
  locations with Valid From / Valid To; Edit (validity) through the quick panel;
  confirmed Remove; row action Make primary, hidden on the primary row. Every
  action requires `attendanceDevices.manage`.
- **Adapter.** `employee-data.adapter.ts` (shapes in `employee-work-sites.ts`)
  lists `GET …/work-sites` rows, showing the derived primary row when there are
  none; Assign and validity edit go to `POST …/work-sites` with `null` for empty
  dates; Remove to `DELETE …/work-sites/{locationId}`; Make primary to
  `POST …/work-sites/primary`, the existing transactional endpoint.
- **Shared subgrid.** `module-related-subgrid.tsx` gains generic optional
  `rowActions`, `removeConfirmation` through the shared `ConfirmDialog`, and
  create now honours `api.permissions.create` as update and delete already did.
- **Latent defect fixed (found while fixing).** `assignWorkSite` passed
  `dto.isPrimary ?? false`, so editing a site's validity demoted the primary row
  while `Employee.locationId` still pointed at it; it now forwards `isPrimary`
  unchanged (REG-501).
- **Location.** Read-only on an existing record, editable at create so
  `requireWorkLocation` stays satisfiable; the form's update payload drops
  `locationId`.
- **Server enforcement (integration, dba1605d).** `EmployeesService.update`
  refuses a changed `locationId` with a `VALIDATION_FAILED` field error, so the
  primary site moves only through the transactional endpoint, and
  `employee.workSites` is retired from `packages/config/system-widget-registry.js`
  so the Form Designer cannot offer it again (REG-488).
- **Removed.** The in-form widget, its panel and its three texts, the adapter
  widget code and the `runWidgetAction` types; stored layouts naming the widget
  are stripped when mapped.
- No new endpoint; permissions and tenant scoping unchanged.

Architect decisions: "no action while the record is in read mode" is
implemented as the `attendanceDevices.manage` gate (related tabs are always used
in read mode); Assign hidden without create permission is accepted (the server
enforces). Residual: an old record with a required but empty Location fills it
through Assign and Make primary, not from the form.

Regression coverage: REG-500, REG-501, REG-488.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — done in TASK-0031 WP-03, with server enforcement and widget retirement at integration (dba1605d); unit-tested; browser verification pending.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]], [[attendance]]
- Decision — [[ADR-0014-employee-work-sites-are-a-related-records-tab]]
- Implementation — [[EXECPLAN-0047-employee-record-walkthrough-two-remediation]]

<!-- GRAPH:END -->
