---
WP_ID: WP-07
TASK_ID: TASK-0031
TITLE: Integration, browser QA on a throwaway database, review, CI, develop
STATUS: IN_PROGRESS
OWNER_AGENT: Integrator
DEPENDENCIES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
LAST_VERIFIED_SHA: 58e4c32a
KNOWLEDGE_IMPACT: [REGRESSION, QA_SCENARIO]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-07 — Integration, browser QA, CI, develop

Work package of [[TASK-0031]].

## Goal

Merge WP-01..WP-06 into `agent/walkthrough2-integration`, prove the result in a
running app against a throwaway local database, get a green gate at the exact
SHA, and ref-push it to `develop`.

## Context Manifest

REQUIRED:
- `.agent/agents/integrator.md`
- `.agent/context/branch-model.md`
- `docs/tasks/TASK-0031-streams/` — the six stream reports

OPTIONAL:
- `.github/workflows/ci.yml` — the Database e2e job's seed steps

DO_NOT_LOAD:
- the populated local `dijipeople` database — only the throwaway `_test` database is used
- production data beyond the read-only checks already recorded in TASK-0031

LAST_VERIFIED_SHA: 58e4c32a — re-read any summarised source that changed since.

## Relevant Files

- `services/api/src/modules/data/custom-data.service.ts`
- `services/api/src/modules/data/custom-records.metadata.ts`
- `apps/web/lib/runtime/custom-modules/custom-module-runtime.ts`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Ref-pushing the integration branch keeps `develop` identical to the CI-verified SHA | VERIFIED | Established practice in this repository |

## Implementation State

In progress. All six streams and the records branch are merged. Integration
fixes so far: `dba1605d`, `4d249b40`, `23044aed`, `89bc55a6`, `2a8f811a`,
`cff72bbe` and `22511c32`; records merged at `58e4c32a`. Remaining: push, green
gate, ref-push to `develop`.

Browser QA also surfaced one pre-existing defect outside this program's scope:
the page header of a custom module shows its table key rather than its name,
because the shell titles a page from the last URL segment. Filed as BUG-3523
rather than changed here.

## Validation State

Locally: data unit specs 87/87, custom-module e2e 8/8, framework validation
passes. The first CI run failed on a stale component index and two custom-module
e2e cases; each is fixed above. No green gate yet.

## Evidence

- CI run 34729157744 — failed; causes fixed in `89bc55a6`, `2a8f811a` and `cff72bbe`.
- Local browser QA batches 1–5 on the throwaway database — results recorded in WP-01..WP-06.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: REGRESSION, QA_SCENARIO — REG entries and scenarios filed by the records update.
OBSIDIAN_IMPACT: UPDATE_NODE.

Next: push once, await the gate, ref-push to `develop`, then start WP-08.
