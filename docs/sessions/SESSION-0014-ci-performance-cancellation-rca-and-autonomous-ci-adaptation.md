---
SESSION_ID: SESSION-0014
aliases: [SESSION-0014]
TASK_ID: 
TITLE: CI performance, cancellation RCA and autonomous CI adaptation
ARCHITECT_INTENT: CI performance, cancellation RCA and autonomous CI adaptation
STATUS: ACTIVE
TASK_TYPE: FRAMEWORK
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: aa335249839fa1c44449b5b620ab2e3c5936e37a
TASK_BRANCH: agent/ci-performance-adaptation
TARGET_BRANCH: develop
WORKTREE: C:/Users/hp/AppData/Local/Temp/claude/wt-ci-perf
AFFECTED_MODULES: [ci]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-18T19:15:42.554Z
LAST_HEARTBEAT: 2026-08-18T19:15:42.554Z
BLOCKERS: none
---

# SESSION-0014 — CI performance, cancellation RCA and autonomous CI adaptation

## Intent

CI performance, cancellation RCA and autonomous CI adaptation

## Scope

CI performance and cancellation root-cause analysis against real run history,
followed by implementation. Not a product task and not a framework rewrite.

**Changed**

- `.github/workflows/ci.yml` — a `resolve` evidence job, concurrency policy,
  removal of both sequencing `needs:` edges, `timeout-minutes` on every job,
  Turborepo and Playwright caches, and removal of `continue-on-error` from
  `browser-e2e`.
- `scripts/ci-evidence.mjs` (new) — exact-SHA evidence lookup and cancellation
  classification. Zero dependencies: the `resolve` job runs without
  `node_modules`.
- `scripts/ci-metrics.mjs` (new) — rolling metrics and five regression triggers.
- `scripts/validate-framework.mjs` — three new CI gate-integrity checks, each
  mutation-tested.
- `.agent/context/ci-operations.md` (new), plus Architect, Integrator and
  Release/DevOps role updates.
- `docs/development/ci.md`, `docs/knowledge/architecture/ci-architecture.md`,
  `docs/ci/metrics/`.

**Deliberately not changed**

- `services/api/test/jest-e2e.json` — `maxWorkers: 1` is the ITEM-0047
  determinism fix. Reverting it for speed would reopen a closed defect. The cost
  is recorded as ITEM-0055 instead.
- No gate was weakened. `browser-e2e` and `services/api` lint remain required,
  migration validation and the security invariants are untouched.

## Concurrency

`SAFE_PARALLEL` against SESSION-0003 and SESSION-0015 at registration.
SESSION-0015 (`agent/provisioning-ops-and-qa`) is product work — provisioning
UX and a QA campaign — and touches none of the CI, `.agent/` or `scripts/` paths
this session writes.

No write lease was taken: this session writes no schema, no seed and no shared
generated index beyond the backlog and dashboard files it regenerates from its
own two new records.

`SCHEMA_WRITE: NO`. `DATABASE_WRITER` was not claimed and was not needed.

Live state: `node scripts/session.mjs list`.

## History

- 2026-08-18 — session started from `origin/develop` at `aa33524`.
- 2026-08-18 — `3f6775e` integrated to `develop` by ref-push after CI run
  32178458380 reported `CI required gate` success. `main` untouched at `b90f33e`.
- 2026-08-18 — the develop run for the same SHA did NOT reuse evidence, exposing
  a run-level filter in `ci-evidence.mjs` `find`. Fixed and verified live; see
  the engineering history record.
