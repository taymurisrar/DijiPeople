---
TASK_ID: TASK-0031
aliases: [TASK-0031]
TITLE: Demo walkthrough 2 remediation - hierarchy, work sites, customization, notifications
TYPE: FEATURE
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-09-12
AFFECTED_MODULES: [apps/web, customization, notifications, employees, attendance, data]
AGENTS: [architect, qa, backend-api, frontend, ui-ux, security, reviewer, integrator, release-devops, knowledge-graph]
DEPENDENCIES: WP-07 depends on WP-01..WP-06; WP-08 depends on WP-07
CURRENT_PACKAGE: WP-00
COMPLETED_PACKAGES: []
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 9
FINAL_STATUS:
---

# TASK-0031 — Demo walkthrough 2 remediation - hierarchy, work sites, customization, notifications

## Objective

Every defect and decided improvement from the second demo walkthrough of the
live demo tenant (2026-09-13, production at `df0f84f1`) is fixed on `develop`,
verified in a running app against a throwaway database, green in CI, released to
production, and re-verified on the demo tenant. The task is finished when every
record listed below is `FIXED` or `DONE` with a regression entry where required,
production serves the release commit, and the temporary System Customizer role
has been removed from the demo tenant's owner.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-00 | Findings records and owner decisions | IN_PROGRESS | — | architect, qa | agent/demo-walkthrough-2-records | — | — | BUG-3491..BUG-3501, ITEM-0179..ITEM-0184 | — | — |
| WP-01 | Customization blockers: permission-based access, field creation, publish path, editor validation, hydration modal | READY | — | backend-api, frontend, security | agent/walkthrough2-customization | — | — | BUG-3491, BUG-3492, BUG-3493, BUG-3495, BUG-3496 | — | — |
| WP-02 | Published custom modules in the tenant runtime | READY | — | frontend, backend-api | agent/walkthrough2-custom-runtime | — | — | BUG-3494 | — | — |
| WP-03 | Employee record: hierarchy dialog, work-sites tab, reset password, export, record usability, helper text | READY | — | frontend, ui-ux, backend-api | agent/walkthrough2-employee-record | — | — | BUG-3497, BUG-3498, BUG-3499, ITEM-0179, ITEM-0183, ITEM-0184 | — | — |
| WP-04 | Email templates: real default copy and visual editor | READY | — | backend-api, frontend | agent/walkthrough2-email-templates | — | — | BUG-3500, ITEM-0181 | — | — |
| WP-05 | One plain notification events page | READY | — | frontend, backend-api | agent/walkthrough2-notification-events | — | — | ITEM-0180 | — | — |
| WP-06 | Email providers and delivery logs: retire sinks in production, truthful status, logs | READY | — | backend-api, frontend, security | agent/walkthrough2-providers-logs | — | — | BUG-3501, ITEM-0182 | — | — |
| WP-07 | Integration, browser QA on a throwaway database, review, CI, develop | NOT_STARTED | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06 | qa, reviewer, integrator | agent/walkthrough2-integration | — | — | — | — | — |
| WP-08 | Production release and demo-tenant verification | NOT_STARTED | WP-07 | release-devops, qa | release PR to main | — | — | — | — | — |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Render's pre-deploy step runs `npm --workspace api run release` (migrate, seed:config) on every deploy, so seeded template copy reaches production on release | Render service API read 2026-09-13 | HIGH | Template copy would need a deliberate script |
| A-02 | Production has a working platform relay for tenant email once sink providers are ignored | Not yet verified | MEDIUM | Demo tenant would send nothing instead of real mail; verify before WP-08 closes |
| A-03 | No schema change is needed for WP-01, WP-03, WP-04 | Code reading during record filing | MEDIUM | An ExecPlan database section and migration would be added |
| A-04 | WP-01 to WP-06 touch mostly disjoint files; shared seams are `module-widget-renderer.tsx` (WP-03 only) and the notifications service (WP-04, WP-06) | File ownership plan | MEDIUM | Integration conflicts resolved in WP-07 |

## Owner Decisions

All asked and answered on 2026-09-13; each is `USER_CONFIRMED`.

1. Hierarchy: fix the current chain-scoped dialog — ADR-0017.
2. Work sites: related-records tab with transactional Make primary; Location read-only — ADR-0014.
3. Customization: keep the package model, fix the blockers; access by permission — ADR-0013.
4. Published custom modules render in the runtime as part of the blocker fix — ADR-0016.
5. Notifications: one events page, real default templates, visual template editor, truthful providers and logs.
6. Sink providers retired in production, tenants fall back to the platform relay, drafted copy ships active — ADR-0015.
7. Remove all agent-added explanatory helper text found — [[ITEM-0183]].
8. Keep the QA test data on the demo tenant; keep the temporary System Customizer role until the access fix ships.
9. Scope tonight: fix everything decided, verify locally on a throwaway database, release to production.

## Repository Health

- PRE_TASK_REPO_HEALTH — 2026-09-13, main baseline `df0f84f1`, develop `f36ec9a9`; primary checkout clean; warnings: three other worktrees dirty (other sessions), `render.yaml` differs from the live service on 31 fields (not in scope). MAIN_SYNC_STATUS recorded at start by `npm run repo:health`.
- POST_TASK_REPO_HEALTH — pending.

## History

- 2026-09-12 — created at `f36ec9a9`.
- 2026-09-13 — decomposed into WP-00..WP-08 after the owner's decisions; records BUG-3491..BUG-3501 and ITEM-0179..ITEM-0184 filed; ADR-0013..ADR-0017 accepted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3491]], [[BUG-3492]], [[BUG-3493]], [[BUG-3494]], [[BUG-3495]], [[BUG-3496]], [[BUG-3497]], [[BUG-3498]], [[BUG-3499]], [[BUG-3500]], [[BUG-3501]], [[ITEM-0179]], [[ITEM-0180]], [[ITEM-0181]], [[ITEM-0182]], [[ITEM-0183]], [[ITEM-0184]]
- Modules — [[notifications]], [[employees]], [[attendance]]

<!-- GRAPH:END -->
