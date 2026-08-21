---
SESSION_ID: SESSION-0036
aliases: [SESSION-0036]
TASK_ID: TASK-0016
TITLE: Tenant workspace repair, plan estimator, notification count, error-log UX, and a coded checkout block
ARCHITECT_INTENT: Tenant workspace repair, plan estimator, notification count, error-log UX, and a coded checkout block
STATUS: COMPLETE
TASK_TYPE: BUG
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 3883798e094e398ffda325c5d433633e2992d6ae
TASK_BRANCH: agent/tenant-repair-and-console-ux
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-ux2
AFFECTED_MODULES: []
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-21T22:23:03.357Z
LAST_HEARTBEAT: 2026-08-21T22:23:03.357Z
BLOCKERS: none
---

# SESSION-0036 — Tenant workspace repair, plan estimator, notification count, error-log UX, and a coded checkout block

## Intent

Tenant workspace repair, plan estimator, notification count, error-log UX, and a coded checkout block

## Scope

Six reported items, one large and five small, all of the same shape: a screen
reporting a mechanism's state instead of the thing the reader asked about.

**In scope**

- `services/api/src/modules/tenant-control-plane` — workspace health derived
  from the tenant rather than from its provisioning runs, and a narrow repair.
- `services/api/src/modules/platform-events` — an unread count independent of
  the caller's page size.
- `apps/admin` — the Operations and Domains panels, the sidebar's monitoring
  entry, and the incident queue's metric tiles.
- `apps/landing` — the plans estimator, and the subscribe page's blocked state.

**Out of scope**

- The schema. `SCHEMA_WRITE: NO`.
- [[BUG-0015]]. The business-unit finding names it and is explicitly not
  repairable; claiming otherwise would produce a button that reports success and
  changes nothing, which is BUG-0015's own shape.
- The monitoring queue's default time window — a product decision, recorded on
  TASK-0016.
- Deployment. `main` is untouched.

## Concurrency

Classified SAFE_PARALLEL at start. No lease taken: nothing here writes the
schema or the admin runtime registry, so `DATABASE_WRITER` and
`runtime-registries` are not needed.

Live state: `node scripts/session.mjs list`.

## History

- 2026-08-22 — session started from `origin/develop` at `3883798`.
- 2026-08-22 — integrated at `f87335d` by fast-forward ref-push to `develop`;
  gate green on the exact SHA on the first attempt (run 32534985937, 14/14).
  `main` untouched at `3602ec3`.
