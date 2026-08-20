---
SESSION_ID: SESSION-0009
aliases: [SESSION-0009]
TASK_ID: TASK-0007
TITLE: Commercial platform WP-06 and WP-07 — seat/plan change and provisioning automation
ARCHITECT_INTENT: Commercial platform WP-06 and WP-07 — seat/plan change and provisioning automation
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 9ed77f0bd5b8b130da02e8ca50e7ca45178efced
TASK_BRANCH: agent/commercial-platform-completion
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople
AFFECTED_MODULES: [billing, outbox, tenant-control-plane]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: YES
CI_STATUS: PASS
MERGE_STATUS: DONE
STARTED_AT: 2026-08-18T12:23:24.943Z
LAST_HEARTBEAT: 2026-08-18T12:23:24.943Z
BLOCKERS: none
---

# SESSION-0009 — Commercial platform WP-06 and WP-07 — seat/plan change and provisioning automation

## Intent

Commercial platform WP-06 and WP-07 — seat/plan change and provisioning automation

## Scope

WP-06 (seat and plan change lifecycle) and WP-07 (payment to onboarding to
provisioning). Integrated into develop at 943a826 behind a green exact-SHA gate.

Two course corrections came from reading the code rather than the plan: plan
direction was moving to the deprecated Plan.monthlyBasePrice, which the schema
forbids for money decisions, and a competing provisioning run/step model was one
commit from being written when TenantProvisioningRun already existed.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-18 — session started from `origin/develop` at `9ed77f0`.
