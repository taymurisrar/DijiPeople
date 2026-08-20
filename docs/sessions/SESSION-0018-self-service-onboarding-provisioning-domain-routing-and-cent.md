---
SESSION_ID: SESSION-0018
aliases: [SESSION-0018]
TASK_ID: TASK-0008
TITLE: Self-service onboarding, provisioning, domain routing and central login
ARCHITECT_INTENT: Self-service onboarding, provisioning, domain routing and central login
STATUS: ACTIVE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 494c44de866a885c083084d81303fa3707b48002
TASK_BRANCH: agent/self-service-onboarding-provisioning
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople-selfservice
AFFECTED_MODULES: [billing, super-admin, outbox, tenant-domains, prisma]
WRITE_LEASES: [schema]
ACTIVE_WORK_PACKAGES: [WP-09]
SCHEMA_WRITE: YES
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
STARTED_AT: 2026-08-18T23:23:49.309Z
LAST_HEARTBEAT: 2026-08-18T23:23:49.309Z
BLOCKERS: none
---

# SESSION-0018 — Self-service onboarding, provisioning, domain routing and central login

## Intent

Self-service onboarding, provisioning, domain routing and central login

## Scope

[[TASK-0008]]. The brief was reconciled against the repository before planning:
most of the self-service system already exists, so the scope is the genuine gaps
rather than the brief's chapter list.

Delivered: [[BUG-0075]] — an unthrottled public write plus the inert invariant
that should have caught it — and WP-01, the workspace-address reservation, one
column, proven against real PostgreSQL.

Found and deliberately **not** fixed: [[BUG-0077]] and [[BUG-0078]], which
together mean the website has never reached the provisioning engine. WP-10 and
[`EXECPLAN-0001`](../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md)
carry that work. An implementation of BUG-0077 alone was written and reverted,
because removing the pre-payment tenant without wiring the provisioning consumer
would strand paying customers.

## Concurrency

`schema` lease held — taken for the WP-01 migration, retained for WP-10's
transaction-boundary work. `session.mjs check` returned `SAFE_PARALLEL` against
SESSION-0003, SESSION-0015 and SESSION-0017; none touches `modules/billing`.

`develop` moved from `aa33524` to `494c44d` during this session's discovery
phase, when a concurrent session landed framework hardening. The worktree was cut
from the new tip rather than from the SHA discovery started at.

Database work used `dijipeople_t8_test`, a throwaway carrying the full
211-migration history. The populated `dijipeople` development database was not
touched, and `dijipeople_wp_test` was left to its owning session.

## History

- 2026-08-18 — session started from `origin/develop` at `494c44d`.
- 2026-08-19 — `a40f038` BUG-0075 fixed and mutation-tested. `8b51613`
  reconciliation corrected against `CustomerAccount`. `4f966ea` WP-01. `0177db9`
  BUG-0077 and BUG-0078 recorded, EXECPLAN-0001 written, TASK-0007 WP-07
  reopened, WP-10 made the critical path.
