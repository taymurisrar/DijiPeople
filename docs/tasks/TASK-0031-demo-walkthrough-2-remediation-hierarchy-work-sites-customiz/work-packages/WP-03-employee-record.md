---
WP_ID: WP-03
TASK_ID: TASK-0031
TITLE: Employee record - hierarchy dialog, work-sites tab, reset password, export, record usability, helper text
STATUS: DONE
OWNER_AGENT: Frontend
DEPENDENCIES: []
LAST_VERIFIED_SHA: 270757ba
KNOWLEDGE_IMPACT: [UI_CONVENTION, DECISION]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-03 — Employee record

Work package of [[TASK-0031]].

## Goal

Fix the reporting hierarchy dialog in place (ADR-0017), move work sites to a
related-records tab (ADR-0014), and fix the reset password, export and record
usability defects, removing agent-added helper text.

## Context Manifest

REQUIRED:
- `apps/web/app/components/runtime/module-widget-renderer.tsx`
- `apps/web/lib/runtime/modules/employee-metadata.adapter.ts`
- `docs/decisions/ADR-0014-employee-work-sites-are-a-related-records-tab.md`
- `docs/decisions/ADR-0017-the-hierarchy-viewer-stays-a-chain-scoped-dialog.md`

OPTIONAL:
- `apps/web/lib/runtime/modules/employee-hierarchy-tree.ts` — interaction rules

DO_NOT_LOAD:
- customization and notifications source
- the org chart module — ADR-0017 keeps the dialog chain-scoped

LAST_VERIFIED_SHA: 270757ba — re-read any summarised source that changed since.

## Relevant Files

- `apps/web/app/components/runtime/module-widget-renderer.tsx`
- `services/api/src/modules/employees/employees.service.ts`
- `packages/config/system-widget-registry.js`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The dialog stays scoped to the employee's chain | USER_CONFIRMED | ADR-0017 |
| A-02 | Location is read-only on the record; the primary site changes from the tab | USER_CONFIRMED | ADR-0014 |

## Implementation State

Done on `agent/walkthrough2-employee-record` at `270757ba`; merged at
`9183d737`. Integration commit `dba1605d` enforces ADR-0014 on the server and
retires the `employee.workSites` widget.

## Validation State

Unit tests pass. Local browser QA passed every hierarchy and work-site check.

## Evidence

- Hierarchy dialog: named "Reporting hierarchy", a Close button, a branching tree with the current employee marked, fits at 400px.
- Hover shows the detail card inside the viewport and hides it on leave; keyboard focus shows it; a click opens the manager's record; the first touch tap shows the card without navigating.
- Work Sites tab renders with Assign, Edit, Remove and Refresh; a record update changing `locationId` is refused with 400.
- Reset password asks for confirmation first.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: UI_CONVENTION, DECISION.
OBSIDIAN_IMPACT: UPDATE_NODE — the employees module note.

ITEM-0196 carries the CNIC field, form selector and Global Administrator
description that no package covered.
