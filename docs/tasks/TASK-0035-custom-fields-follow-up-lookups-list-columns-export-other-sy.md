---
TASK_ID: TASK-0035
aliases: [TASK-0035]
TITLE: Custom fields follow-up: lookups, list columns, export, other system modules
TYPE: FEATURE
SIZE: LARGE
STATUS: COMPLETE
PRIORITY: P1
CREATED_AT: 2026-09-26
AFFECTED_MODULES: [customization, employees, apps/web]
AGENTS: [backend-api, frontend, security, qa, reviewer, integrator, knowledge-graph, release-devops]
DEPENDENCIES: WP-03<-WP-02; WP-04<-WP-02; WP-05<-WP-04; WP-06<-WP-04; WP-07<-WP-03,WP-05,WP-06; WP-08<-WP-07
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS: COMPLETE — develop at be7189f7 (CI 36300804101 PASS); released by PR #90 at 4f64e5e7, live in production
---

# TASK-0035 — Custom fields follow-up: lookups, list columns, export, other system modules

## Objective

The task closes the items the TASK-0034 report left open:
- ITEM-0221: lookup custom fields on Employees, list-view columns, export, and custom field values on every other system module;
- the 29 problems the Obsidian vault check reported.

It is finished when every customizable system table stores, shows and saves its custom field values. Tables that cannot store them stop offering them. Everything is proven by DB-backed tests, a live HTTP sweep and a browser pass, and integrated. Plan: EXECPLAN-0054. Decision: ADR-0024.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Obsidian verify: duplicate plan ids, graph orphans | DONE | — | knowledge-graph | agent/custom-fields-followup | 89d075d0 | PASS | — | — | — |
| WP-02 | Interceptor, decorator, definitions endpoint; closed tables; createColumn enforces the flag | DONE | — | backend-api, security | agent/custom-fields-followup | 0a9e643c | PASS | BUG-3786 | — | — |
| WP-03 | Decorators on every editable module's routes (138), e2e over the full app | DONE | WP-02 | backend-api | agent/custom-fields-followup | 69b64766 | PASS | — | — | — |
| WP-04 | Web: custom fields on every generic record page and settings page | DONE | WP-02 | frontend | agent/custom-fields-followup | 1f9e6cf6 | PASS | — | — | — |
| WP-05 | Web: drop-in section in the bespoke forms; binding invariants | DONE | WP-04 | frontend | agent/custom-fields-followup | 4e32ea28 | PASS | — | — | — |
| WP-06 | Employees lookups, list rows, export; lookup resolver | DONE | WP-04 | backend-api, frontend | agent/custom-fields-followup | 1f9e6cf6 | PASS | BUG-3787 | — | — |
| WP-07 | QA: HTTP sweep, browser pass, records | DONE | WP-03, WP-05, WP-06 | qa | agent/custom-fields-followup | — | PASS | BUG-3800 | — | — |
| WP-08 | Integrate into develop, release to main, verify the deploy | DONE | WP-07 | integrator, release-devops | agent/custom-fields-followup | be7189f7 | PASS | — | PASS | DONE |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Interceptors run before the global ValidationPipe, so `customFields` can be removed from the body before a strict DTO sees it. | The e2e drives the full app with `main.ts`'s pipe settings. With the removal disabled, 4 of 8 cases fail. | HIGH | A strict DTO would refuse every save carrying custom fields. |
| A-02 | Closing fifteen tables affects no existing data. | A read-only production check on 2026-09-26 found no custom columns on any system table. | HIGH | An existing field on a closed table would stay visible but take no new values. |
| A-03 | A route's handler is the right access authority for its record's custom values. | Values are written or read only after the handler succeeds for that record id; a response whose id differs gets nothing. | HIGH | — |

## Owner Decisions

- 2026-09-27: "Generic hook, all modules" was chosen over a three-module pilot, Employees only, or blocking field creation.

## Results

- **Every editable system module stores custom field values.** 138 bound routes across 26 controllers, the Employees list among them, go through one global interceptor.
- **Fifteen tables that no route can carry values for are closed**, and createColumn and package import both refuse new fields on them (BUG-3786).
- **The web shows the fields everywhere a form edits these records:** generic record pages, settings pages, three bespoke forms and the employee form.
- **Lookup custom fields list their target's records** (BUG-3787).
- **The employee list and export carry custom fields.**
- **The Obsidian vault check:** 4 duplicate plan ids renumbered, and 25 orphan records given the relationships they already had.
- **Found in QA:** BUG-3800 (pre-existing: three lookups refuse paging), triaged PLAN_REQUIRED.

## Repository Health

Pre-task: `develop` and `main` at `c791e3d8` / `1aeda297`, primary checkout clean, no other active session. The full record is in the engineering history.

## History

- 2026-09-26: created at `c791e3d8`.
- 2026-09-27: WP-01 to WP-07 done, at `89d075d0` through `4e32ea28`.
- 2026-09-27: develop at `be7189f7` (CI 36300804101 PASS); PR #90 merged at `4f64e5e7`; Render and Vercel live on it, no migration; Obsidian verify PASS.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3786]], [[BUG-3787]], [[BUG-3800]], [[ITEM-0221]]
- Modules — [[customization]], [[employees]]

<!-- GRAPH:END -->
