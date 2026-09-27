---
TASK_ID: TASK-0036
aliases: [TASK-0036]
TITLE: Custom fields: screens for API-only modules; sort and filter by custom fields; BUG-3800
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-09-27
AFFECTED_MODULES: [customization, employees, documents, claims, onboarding, organization, payroll, apps/web]
AGENTS: [backend-api, frontend, security, qa, reviewer, integrator, knowledge-graph, release-devops]
DEPENDENCIES: WP-07<-WP-01,WP-02,WP-03,WP-04,WP-05,WP-06; WP-08<-WP-07
CURRENT_PACKAGE: WP-08
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS:
---

# TASK-0036 — Custom fields: screens for API-only modules; sort and filter by custom fields; BUG-3800

## Objective

This task closes what the TASK-0035 report left open:
- BUG-3800, the lookups that refused paging and search;
- create and edit screens for the system modules whose custom fields were
  reachable only through the API (document types, employee pay setup, claims
  with line items, onboarding templates);
- server-side sort and filter by custom fields on the one list that pages on
  the server (Employees);
- a live test of the bound modules that had no demo data.

It is finished when each of these is proven by tests and integrated.
Decision: ADR-0025.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Lookups accept paging and search (BUG-3800) | DONE | — | backend-api | agent/custom-fields-screens-and-query | 92386e1a | PASS | BUG-3800 | — | — |
| WP-02 | Document types: edit route and settings screen; tenants cannot write shared rows | DONE | — | backend-api, frontend, security | agent/custom-fields-screens-and-query | 06cdfab5 | PASS | BUG-3809 | — | — |
| WP-03 | Employee Pay setup tab; EmployeeCompensation secrets encrypted | DONE | — | backend-api, frontend, security | agent/custom-fields-screens-and-query | a636b7db | PASS | BUG-3154 | — | — |
| WP-04 | Employee list sort and filter by custom fields | DONE | — | backend-api, frontend, security | agent/custom-fields-screens-and-query | e21b7574 | PASS | — | — | — |
| WP-05 | Claims create/edit with line items (admin and self-service) | DONE | — | frontend | agent/custom-fields-screens-and-query | e21b7574 | PASS | — | — | — |
| WP-06 | Onboarding template editor; GET template by id | DONE | — | backend-api, frontend | agent/custom-fields-screens-and-query | c13fe597 | PASS | — | — | — |
| WP-07 | QA: bound modules live over HTTP, browser pass, records | DONE | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06 | qa | agent/custom-fields-screens-and-query | e21b7574 | PASS | BUG-3809 | — | — |
| WP-08 | Integrate into develop, release to main, verify the deploy | NOT_STARTED | WP-07 | integrator, release-devops | agent/custom-fields-screens-and-query | — | — | — | — | — |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Only the employee list needs server-side custom-field sort and filter. | Every other system list sorts and filters the loaded page in the browser; only the employees page forwards `orderBy` and filter parameters to the API. | HIGH | Another paged list would still sort one page only. |
| A-02 | Keeping the bare-array response for unpaged calendar, period and business unit lists keeps existing callers working. | The payroll list pages map over the response; the e2e checks both shapes. | HIGH | Those pages would break. |
| A-03 | An omitted bank or tax identifier on a compensation update should keep the stored value. | The screen never posts the masked secrets back; the old code wiped them on every update, so any partial client would have erased them. | HIGH | A client relying on omission to clear would have to send null. |

## Owner Decisions

- 2026-09-27: besides BUG-3800 and the live test, the owner chose "Screens for
  API-only modules" and "Sort/filter by custom fields".

## Results

- **BUG-3800 fixed:** business unit, payroll calendar and payroll period lookups accept paging and search (REG-641).
- **BUG-3809 found and fixed (HIGH, tenant isolation):** tenants can no longer write shared document types or categories (REG-642).
- **BUG-3154 partly fixed:** EmployeeCompensation's tenant path dual-writes and reads its secrets encrypted, and an omitted secret is kept rather than wiped.
- **New screens:** employee Pay setup tab, document types settings, claims create/edit with line items (admin and self-service), onboarding template editor — each with the table's custom fields.
- **The employee list sorts and filters by custom fields** on the server (ADR-0025), on both list paths.
- **Live test:** custom fields verified on the 13 bound tables with no demo data (13/13), plus a browser pass that found and fixed three defects in this task's own screens before integration.
- QA run 2026-09-27-custom-fields-screens-and-query-e21b757: PASS WITH RISKS (document types not browser-verified; the page is plan-gated for the demo tenant).

## Repository Health

PRE_TASK_REPO_HEALTH PASS at `7d810999` (MAIN_SYNC_STATUS SYNCED).
POST_TASK_REPO_HEALTH to be recorded at the end.

## History

- 2026-09-27 — created at `7d810999`.
- 2026-09-27 — WP-01 to WP-06 committed on `agent/custom-fields-screens-and-query`; BUG-3809 found and fixed; BUG-3154 partly fixed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3154]], [[BUG-3800]], [[BUG-3809]]
- Modules — [[customization]], [[employees]], [[organization]], [[payroll]]

<!-- GRAPH:END -->
