---
WP_ID: WP-01
TASK_ID: TASK-0031
TITLE: Customization blockers - permission-based access, field creation, publish path, editor validation, hydration modal
STATUS: DONE
OWNER_AGENT: Backend/API
DEPENDENCIES: []
LAST_VERIFIED_SHA: 811a915c
KNOWLEDGE_IMPACT: [SECURITY, DECISION]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-01 — Customization blockers

Work package of [[TASK-0031]].

## Goal

Make Settings → Customization usable by anyone holding the `customization.*`
permissions (ADR-0013) and remove the blockers that stopped a component being
created and published: field creation, the publish path, editor validation and
the hydration error modal.

## Context Manifest

REQUIRED:
- `services/api/src/modules/customization/`
- `apps/web/app/(authenticated)/settings/customization/`
- `docs/decisions/ADR-0013-customization-access-is-granted-by-permission.md`

OPTIONAL:
- `services/api/src/common/constants/rbac-matrix.ts` — for the permission keys

DO_NOT_LOAD:
- the notifications module — WP-04..WP-06 own it
- the employee record runtime — WP-03 owns it

LAST_VERIFIED_SHA: 811a915c — re-read any summarised source that changed since.

## Relevant Files

- `services/api/src/modules/customization/customization.service.ts`
- `apps/web/app/(authenticated)/settings/customization/`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Access is granted by permission, never by role key | USER_CONFIRMED | ADR-0013 |
| A-02 | A package prefix that differs from the package name is intended | VERIFIED | Architect review; BUG-3495 recorded as intended behaviour |

## Implementation State

Done on `agent/walkthrough2-customization` at `811a915c`; merged into the
integration branch at `ca33e9a5`. Detail is in the stream report
`docs/tasks/TASK-0031-streams/WP-01-report.md`.

## Validation State

Unit tests pass. Local browser QA on a throwaway database passed (see Evidence).

## Evidence

- Local browser QA, batch 1: a system administrator without the System Customizer role loads Modules, Packages, Publish Center and Sidebar; the tables API answers 200.
- Local browser QA, batch 2: a custom table, a text field, a choice field and a reference field are each created (201) and published from the Publish Center.
- Records BUG-3491, BUG-3492, BUG-3493, BUG-3495, BUG-3496 carry their regression entries.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: SECURITY, DECISION — access by permission (ADR-0013).
OBSIDIAN_IMPACT: UPDATE_NODE — the customization module note.

A custom role holding only `customization.publish` no longer manages packages;
the Architect accepted that.
