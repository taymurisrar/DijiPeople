---
WP_ID: WP-02
TASK_ID: TASK-0031
TITLE: Published custom modules in the tenant runtime
STATUS: DONE
OWNER_AGENT: Frontend
DEPENDENCIES: []
LAST_VERIFIED_SHA: c213b6ae
KNOWLEDGE_IMPACT: [ARCHITECTURE, MODULE]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-02 — Published custom modules in the tenant runtime

Work package of [[TASK-0031]].

## Goal

A module published from Customization appears in the tenant app with a list,
a create screen and a record screen, built from its published definition with
no code naming the module (ADR-0016).

## Context Manifest

REQUIRED:
- `apps/web/lib/runtime/custom-modules/`
- `apps/web/app/(authenticated)/custom-modules/`
- `services/api/src/modules/data/`
- `docs/decisions/ADR-0016-published-custom-modules-render-in-the-tenant-runtime.md`

OPTIONAL:
- `apps/web/lib/runtime/modules/standard-module-route-helpers.ts` — the shared form mapping

DO_NOT_LOAD:
- the system module adapters under `apps/web/lib/runtime/modules/` other than the route helpers
- the notifications module

LAST_VERIFIED_SHA: c213b6ae — re-read any summarised source that changed since.

## Relevant Files

- `apps/web/lib/runtime/custom-modules/custom-module-runtime.ts`
- `services/api/src/modules/data/custom-data.service.ts`
- `services/api/src/modules/data/custom-records.metadata.ts`
- `services/api/test/custom-module-runtime.e2e-spec.ts`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Custom modules share the `custom-records` privilege as a family | VERIFIED | Architect decision; per-module keys deferred to ITEM-0191 |

## Implementation State

Done on `agent/walkthrough2-custom-runtime` at `c213b6ae`; merged into the
integration branch at `27bff342`. Integration found four seams, each fixed on
the integration branch: the Sidebar Designer lists custom modules (`4d249b40`),
create no longer demands a parent record (`2a8f811a`), SELF-scoped readers
query an owner column that exists (`cff72bbe`), and a published form with no
placed fields no longer blanks the create screen (`22511c32`).

## Validation State

Unit tests pass; the DB-backed custom-module e2e passes 8 of 8 locally.

## Evidence

- `npm run test:e2e -- custom-module-runtime` on the throwaway database: 8 passed, 8 total.
- Local browser QA: the published module appears in the main menu; its list renders the published view's columns; New opens `/custom-modules/<key>/new`.
- Local browser QA after `22511c32`: the create screen shows Serial Number, Condition and Assigned Employee; Save & Close creates a record that appears in the list ("Showing 1 to 1 of 1 records").
- `custom-module-runtime.spec.ts`: 29 passed, including the empty published form and the section of unpublished columns.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: ARCHITECTURE, MODULE — ADR-0016 and the data module.
OBSIDIAN_IMPACT: UPDATE_NODE — the data module note.

Follow-ups filed: ITEM-0187 (view filters), ITEM-0188 (action bars), ITEM-0189
(lookups to system entities), ITEM-0190 (sidebar icon), ITEM-0191 (per-module
access).
