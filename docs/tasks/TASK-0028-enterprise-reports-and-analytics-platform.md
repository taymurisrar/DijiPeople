---
TASK_ID: TASK-0028
aliases: [TASK-0028]
TITLE: Enterprise Reports and Analytics platform
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-30
AFFECTED_MODULES: [services/api/src/modules/reporting, services/api/src/modules/reports, apps/web/app/(authenticated)/reports, apps/web/app/components/charts, services/api/prisma]
AGENTS: [architect, database, backend-api, frontend, ui-ux, security, integration, qa, reviewer, integrator, release-devops, product-backlog-steward, knowledge-graph]
DEPENDENCIES:
CURRENT_PACKAGE: WP-08
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-06]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 4
FINAL_STATUS:
---

# TASK-0028 — Enterprise Reports and Analytics platform

## Objective

Replace the `/reports` page — today a weaker copy of the Dashboard, with no
filters, no period, no comparison, no drill-down and no export — with a reporting
platform: a semantic layer over the domain schema, one authoritative definition
per business metric, a query engine that composes tenant, row and field security,
and a workspace with analytics surfaces, a standard report library, a custom
report builder, saved views, exports and scheduled delivery. It is finished when a
new metric or subject area is a registry entry rather than a new endpoint, and
when the deployed demo tenant demonstrates each surface end to end.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Schema, migration and indexes | DONE | — | database | agent/reports-analytics-platform | — | — | — | — | — |
| WP-02 | Permissions, RBAC entities and audit actions | DONE | WP-01 | security | agent/reports-analytics-platform | — | — | BUG-2623 | — | — |
| WP-03 | Semantic layer, metric registry and query engine | DONE | WP-01 | backend-api | agent/reports-analytics-platform | — | — | BUG-2624, BUG-2625 | — | — |
| WP-04 | Chart primitives and filter components | DONE | — | frontend | agent/reports-analytics-platform | — | — | BUG-2626 | — | — |
| WP-05 | Report definitions, library, saved views, favourites | IN_PROGRESS | WP-03 | backend-api | agent/reports-analytics-platform | — | — | — | — | — |
| WP-06 | Analytics fixture generator | DONE | WP-01 | qa | agent/reports-analytics-platform | — | — | — | — | — |
| WP-07 | Exports — CSV, XLSX, PDF and artifact retention | IN_PROGRESS | WP-05 | backend-api | agent/reports-analytics-platform | — | — | — | — | — |
| WP-08 | Scheduler, workforce snapshot and backfill | IN_PROGRESS | WP-05, WP-07 | backend-api, integration | agent/reports-analytics-platform | — | — | — | — | — |
| WP-09 | Reports web workspace | IN_PROGRESS | WP-03, WP-04 | frontend, ui-ux | agent/reports-analytics-platform | — | — | — | — | — |
| WP-10 | Module wiring and legacy endpoint migration | NOT_STARTED | WP-05, WP-07, WP-08 | backend-api | agent/reports-analytics-platform | — | — | BUG-2624, BUG-2625 | — | — |
| WP-11 | Tests — unit, integration, e2e, tenant isolation | NOT_STARTED | WP-10 | qa, security | agent/reports-analytics-platform | — | — | — | — | — |
| WP-12 | Browser QA and responsive validation | NOT_STARTED | WP-09, WP-10 | qa, ui-ux | agent/reports-analytics-platform | — | — | — | — | — |
| WP-13 | Documentation, metric definitions and Obsidian sync | NOT_STARTED | WP-10 | knowledge-graph | agent/reports-analytics-platform | — | — | — | — | — |
| WP-14 | Integration into develop | NOT_STARTED | WP-11, WP-12, WP-13 | integrator | agent/reports-analytics-platform | — | — | — | — | — |
| WP-15 | Release to main, deploy and post-deploy validation | NOT_STARTED | WP-14 | release-devops, qa | agent/reports-analytics-platform | — | — | — | — | — |

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The API runs as a single instance, so an in-process `setInterval` worker cannot double-run. | `render.yaml` mounts a persistent disk at `/var/data` and states the tradeoff in a comment: a Render disk pins the service to one instance. | HIGH | Scheduled reports could be sent twice. Mitigated regardless by claiming each schedule with a conditional `updateMany`. |
| A-02 | Export artifacts written to the persistent disk remain downloadable across requests and redeploys. | Same disk declaration; `FILE_STORAGE_DIR=/var/data/storage`. | HIGH | Async exports would 404 after a deploy. |
| A-03 | `AttendanceDay` is populated for tenants using attendance, so attendance analytics has a denominator. | The model carries non-null `scheduledMinutes`/`workedMinutes` and a 1:1 seam `attendanceEntryId`; `prisma/backfill-attendance.ts` exists to populate it. | MEDIUM | Attendance surfaces render empty for tenants the reconciliation engine has never processed. Surfaced as an empty state naming that cause, not as a zero. |
| A-04 | Desktop telemetry lookbacks are bounded by `AgentTrackingSettings.historyRetentionDays` (default 90). | `AgentService.enforceTelemetryRetention` deletes `ActivityEvent`, `DailyProductivitySummary` and ended `WorkSession` rows past the cutoff. | HIGH | A 12-month desktop trend would silently show partial data. Surfaced as a caveat and the range is capped. |
| A-05 | Tenant email is live in production, so a scheduled report really sends. | `platform-email-and-tenant-email-are-separate` — a real activation email shows `SENT` on the demo tenant. | HIGH | Either schedules fail silently, or test runs mail real people. Test recipients use non-deliverable `@demo.dijipeople.com` addresses. |

## Owner Decisions

1. **Deployment authority (2026-08-31).** "You deploy to develop and then to main
   by yourself. You have absolute and unconditional permission." The release leg
   is therefore in scope and is classified `DEPLOY`, not folded into the feature.
2. **Rollout (2026-08-31).** Enabled for **all tenants immediately**, not gated to
   the demo tenant.
3. **Scheduled reports (2026-08-31).** Ship **fully enabled**, sending real email
   to validated recipients — not built-but-disabled.
4. **Desktop Activity visibility (2026-08-31).** **HR/admin only, plus employees
   seeing their own.** Managers receive no individual desktop telemetry by
   default. Encoded in `SYSTEM_ROLE_PRIVILEGES`: `desktop-analytics:READ` is
   `ORGANIZATION` for HR and CEO, `SELF` for manager and employee.

## Repository Health

PRE_TASK_REPO_HEALTH — captured at session start on `origin/develop` @ `1965b5cc`.
Primary checkout carried one pre-existing untracked file,
`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`,
recorded as the primary baseline so it is not attributed to this task.
`MAIN_SYNC_STATUS` at start: `SYNCED` (`origin/main` @ `c603abea`).

POST_TASK_REPO_HEALTH — pending WP-14.

## History

- 2026-08-30 — created at `1965b5cc`.
- 2026-08-31 — decomposed into 15 work packages; WP-01 through WP-04 and WP-06 complete.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-2623]], [[BUG-2624]], [[BUG-2625]], [[BUG-2626]]

<!-- GRAPH:END -->
