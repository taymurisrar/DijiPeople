---
SESSION_ID: SESSION-0034
aliases: [SESSION-0034]
TASK_ID: TASK-0014
TITLE: Landing UX modernisation, notification popover, workspace host resolution, timeline paging, template signatures
ARCHITECT_INTENT: Landing UX modernisation, notification popover, workspace host resolution, timeline paging, template signatures
STATUS: ACTIVE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 0d10a9d944eec55d3fa1e2cccddd2ee4169721e5
TASK_BRANCH: agent/ux-round-two
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-ux2
AFFECTED_MODULES: [apps/landing, apps/admin, apps/web, api:tenants, api:contracts]
WRITE_LEASES: [runtime-registries]
ACTIVE_WORK_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07]
SCHEMA_WRITE: NO
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-21T19:25:07.378Z
LAST_HEARTBEAT: 2026-08-21T19:25:07.378Z
BLOCKERS: none
---

# SESSION-0034 — Landing UX modernisation, notification popover, workspace host resolution, timeline paging, template signatures

## Intent

Landing UX modernisation, notification popover, workspace host resolution, timeline paging, template signatures

## Scope

Seven reported items, all landing on `develop`. Two are regressions from
SESSION-0033's own output, one is a defect that session aimed at and missed, and
four are new.

**In scope**

- `apps/landing` — the country field's failure mode, the wizard progress rail,
  and the Features page.
- `apps/admin` — the notification bell as a popover, tenant timeline paging, and
  the contract template editor's fields rail and signature inserter.
- `services/api/src/modules/tenants` — workspace hostname resolution.
- `services/api/src/modules/contracts` — one assertion pinning the sanitiser
  contract the editor depends on. No behaviour change.

**Out of scope**

- The schema. `SCHEMA_WRITE: NO`; no migration, no model change.
- The signing flow itself. A signature box is authored here; what fills it is
  unchanged.
- Deployment. `main` is untouched and stays that way.

## Concurrency

`runtime-registries` held for the duration — the admin runtime registry and the
contract template editor are both under it. Six other sessions were listed
ACTIVE with stale heartbeats and none of them holds a lease this work needs; no
overlap on the paths touched here. `DATABASE_WRITER` is not held and is not
needed: nothing in this session writes the schema.

Live state: `node scripts/session.mjs list`.

## History

- 2026-08-21 — session started from `origin/develop` at `0d10a9d`.
