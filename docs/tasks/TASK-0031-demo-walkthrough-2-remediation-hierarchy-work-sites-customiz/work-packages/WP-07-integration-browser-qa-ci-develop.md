---
WP_ID: WP-07
TASK_ID: TASK-0031
TITLE: Integration, browser QA on a throwaway database, review, CI, develop
STATUS: DONE
OWNER_AGENT: Integrator
DEPENDENCIES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
LAST_VERIFIED_SHA: f865ac5e
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
- `.github/workflows/ci.yml` — the Database e2e job's seed steps and the API lint ratchet

DO_NOT_LOAD:
- the populated local `dijipeople` database — only the throwaway `_test` database is used
- production data beyond the read-only checks already recorded in TASK-0031

LAST_VERIFIED_SHA: f865ac5e — re-read any summarised source that changed since.

## Relevant Files

- `services/api/src/modules/data/custom-data.service.ts`
- `services/api/src/modules/data/custom-records.metadata.ts`
- `apps/web/lib/runtime/custom-modules/custom-module-runtime.ts`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Ref-pushing the integration branch keeps `develop` identical to the CI-verified SHA | VERIFIED | `develop` moved `c494311d..f865ac5e` by ref-push, the SHA CI verified |

## Implementation State

Done. All six streams and the records branch are merged. Integration fixes:
`dba1605d`, `4d249b40`, `23044aed`, `89bc55a6`, `2a8f811a`, `cff72bbe`,
`22511c32` and `f865ac5e`; records merged at `58e4c32a`. `develop` was
ref-pushed to `f865ac5e`.

Browser QA also surfaced one pre-existing defect outside this program's scope:
the page header of a custom module shows its table key rather than its name,
because the shell titles a page from the last URL segment. Filed as BUG-3523
rather than changed here.

## Validation State

Locally: data unit specs 87/87, custom-module e2e 8/8, custom-module web specs
29/29, API lint at the 787-warning ceiling, framework validation 5741 checks.
CI green on `f865ac5e`.

## Evidence

- CI runs 34732185363, 34732682935 and 34732697734 — PASS on `f865ac5e`.
- CI run 34729157744 on `23044aed` — failed; causes fixed in `89bc55a6`, `2a8f811a` and `cff72bbe`.
- CI run 34731422731 on `a42741a0` — failed only the API lint ratchet (789/787); fixed in `f865ac5e`.
- `docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md` — 20 browser scenarios, verdict PASS WITH RISKS.

## Questions

None open.

## Handoff

KNOWLEDGE_IMPACT: REGRESSION, QA_SCENARIO — REG entries and scenarios filed by the records update.
OBSIDIAN_IMPACT: UPDATE_NODE.

WP-08 released `develop` to production.
