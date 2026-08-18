---
TASK_ID: TASK-0007
aliases: [TASK-0007]
TITLE: Commercial platform completion — transactional, legal and lifecycle half
TYPE: FEATURE
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-18
AFFECTED_MODULES: [billing, super-admin, tenant-control-plane, legal, notifications, platform-events, employees, landing, admin, web]
AGENTS: [Architect, Database, Backend/API, Frontend, UI/UX, Integration, QA, Reviewer, Integrator, Release/DevOps]
DEPENDENCIES: origin/develop c332992; PARENT-SCOPE-RECONCILIATION; schema and permissions leases
CURRENT_PACKAGE: WP-05
COMPLETED_PACKAGES: [WP-01, WP-02, WP-04]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 2
FINAL_STATUS:
---

# TASK-0007 — Commercial platform completion — transactional, legal and lifecycle half

This is **not a new program**. It is the durable parent record for the
commercial-platform brief whose Waves 1–3 already shipped and are recorded in
[`docs/engineering-history/tasks/`](../engineering-history/tasks/). That program
had a reconciliation document but never had a parent task record, so its
remaining half had no machine-readable state and no dependency graph. This
record supplies both.

The scope boundary is exactly the remainder established by
[`PARENT-SCOPE-RECONCILIATION.md`](../engineering-history/PARENT-SCOPE-RECONCILIATION.md)
and re-probed at `c332992` — see
[`FINAL-PARENT-SCOPE-RECONCILIATION.md`](../engineering-history/FINAL-PARENT-SCOPE-RECONCILIATION.md).

CONTEXT_FILES_REQUIRED:
  - `AGENTS.md`
  - `.agent/context/task-router.md`
  - `.agent/context/task-orchestration.md`
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/agent-handoffs.md`
  - `.agent/context/multi-session.md`
  - `.agent/context/branch-model.md`
  - `services/api/prisma/AGENTS.md`
  - `docs/architecture/settings-and-branding.md`

SPECIALIST_AGENTS_REQUIRED:
  - Database — single writer for every schema change and migration in this program.
  - Backend/API — outbox, legal, seat engine, lifecycle, reconciliation services.
  - Frontend and UI/UX — landing legal surface, Admin operational screens.
  - Integration — Stripe boundary, webhook, provisioning.
  - QA and Reviewer — consolidated campaign after the implementation gate.
  - Integrator and Release/DevOps — `develop` integration, exact-SHA CI, promotion.

DELIBERATELY_NOT_USED:
  - None. Every package narrows the roster to its own impact.

SINGLE_WRITER_FILES:
  - `services/api/prisma/schema.prisma` and `migrations/` — `schema` lease.
  - `common/constants/permissions.ts`, `rbac-matrix.ts` — `permissions` lease.
  - `apps/landing`, `apps/admin`, `apps/web` — `workspace` lease.

TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: yes — Release/DevOps phase only
MERGE_STRATEGY: merge --no-ff
INTEGRATOR_REQUIRED: yes
RELEASE_DEVOPS_REQUIRED: yes

## Objective

Close the transactional and operational half of the commercial platform: money
movement after checkout, the tenant lifecycle after payment, the legal and
consent surface, and the Admin operational UX. A reader knows it is finished
when every requirement in the final reconciliation is `DONE` or carries a
non-engineering disposition, and `develop` holds it behind a green exact-SHA
gate.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Transactional outbox and typed domain events | DONE | — | Database, Backend/API | agent/commercial-platform-completion | 2bdac3a | PASS_WITH_RISKS | PASS | DONE |
| WP-02 | Legal document system, versioning and publication | DONE | WP-01 | Database, Backend/API | agent/commercial-platform-completion | 2bdac3a | PASS_WITH_RISKS | PASS | DONE |
| WP-03 | Consent — privacy acknowledgement, marketing, cookie categories | NOT_STARTED | WP-02 | Backend/API, Frontend | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-04 | Active-employee seat engine, usage history and overage | DONE | WP-01 | Database, Backend/API | agent/commercial-platform-completion | 416996d | PASS | PASS | DONE |
| WP-05 | Customer-before-payment, pending subscription, checkout authority, tax basis | NOT_STARTED | WP-01, WP-04 | Database, Backend/API, Integration | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-06 | Seat change and plan change lifecycle | NOT_STARTED | WP-04, WP-05 | Backend/API, Integration | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-07 | Payment to onboarding to provisioning automation, steps, resumability, targets | NOT_STARTED | WP-01, WP-05 | Backend/API, Database, Integration | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-08 | Cancellation, retention, holds, deletion request and erasure orchestration | NOT_STARTED | WP-01, WP-07 | Database, Backend/API | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-09 | Stripe and internal reconciliation jobs | NOT_STARTED | WP-04, WP-05, WP-07 | Backend/API, Integration | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-10 | Landing legal, trust and subprocessor surface | NOT_STARTED | WP-02, workspace lease | Frontend, UI/UX | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-11 | Admin dashboard, monitoring and provisioning operations UX | NOT_STARTED | WP-07, workspace lease | UI/UX, Frontend | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-12 | Notification ownership and business-event coverage | NOT_STARTED | WP-01, WP-07 | Backend/API | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-13 | Consolidated QA, regression, security, accessibility and visual campaign | NOT_STARTED | WP-01..WP-12 | QA, Reviewer | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-14 | Final review, exact-SHA CI, develop integration | NOT_STARTED | WP-13 | Reviewer, Integrator | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-15 | Release, main promotion, deployment and production smoke | NOT_STARTED | WP-14 | Release/DevOps | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-16 | Knowledge, Obsidian, history and parent closure | NOT_STARTED | WP-15 | Architect | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |

WP-01, WP-02 and WP-04 are the roots: everything downstream either emits a
durable event, resolves a published legal version, or reads a billable
quantity. They are sequenced first for that reason and not by size.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `StripeWebhookEvent` already gives provider-event persistence and idempotency, so the missing half is the internal outbox only. | `schema.prisma:8061`; `webhook.service.ts` | HIGH | The outbox would also need provider-event dedupe, widening WP-01. |
| A-02 | `Subscription.tenantId` being required and unique means a pre-payment subscription cannot reuse that model. | `schema.prisma:4008` | HIGH | A simpler design would exist; the new order model would be redundant. |
| A-03 | Migrations can be authored offline with `prisma migrate diff --from-schema --to-schema` and proven against real PostgreSQL in CI. | Verified: 14,391-line SQL generated with a placeholder `DATABASE_URL` | HIGH | Every schema package would block on a local database credential. |
| A-04 | No local PostgreSQL credential is available, so real-PG proof is a CI-only environment for this session. | `pg_isready` accepts connections; `postgres` auth fails; no `.env` | HIGH | Real-PG evidence would be available earlier and locally. |
| A-05 | The `workspace` lease held by the abandoned SESSION-0005 will free, or its landing work will land, before WP-10/WP-11. | `session.mjs list` | MEDIUM | WP-10/WP-11 stay `DEPENDENCY_WAIT` and the frontend half defers. |

## Owner Decisions

### OD-01 — Pakistan PKR price schedule

- **Question:** the per-active-employee PKR unit price for Starter, Growth and Enterprise.
- **Evidence:** `markets.catalog.ts` launches Pakistan/PKR; `commercial-offer.resolver.ts` is the single authority and fails closed when no published price exists.
- **Architect position:** engineering completes without these. Checkout refuses safely rather than inventing a number.
- **Blocked work:** publishing a live price only. No package waits on it.

### OD-02 — legal operator identity

- **Question:** registered legal name, registration number, registered office, tax number and contracting jurisdiction.
- **Evidence:** no registered entity is recorded anywhere in the repository.
- **Architect position:** build the configuration source of truth and leave the values unset; a legal page that names no entity is honest, a fabricated one is not.
- **Blocked work:** publishing legal document content that relies on entity identity. The document system itself is not blocked.

## Repository Health

**PRE_TASK_REPO_HEALTH = PASS.** `origin/develop` and local `develop` were both
`c332992d8ff08d389838e53f65997839b1c69590`; `origin/main` was
`b90f33e00c3845439797b51ef1ceb3ed7820a620`; `DEVELOP_CONTAINS_MAIN = PASS`;
`MAIN_SYNC_STATUS = SYNCED`; no unfinished Git operation. The primary worktree's
unrelated `apps/landing/next-env.d.ts` modification and SESSION-0005's
uncommitted landing work are both preserved outside this worktree.

**MULTI_SESSION.** `SESSION-0006` holds `schema` and `permissions`.
`workspace` is held by `SESSION-0005` — classified `DEPENDENCY_WAIT` for
WP-10/WP-11, which is why the backend roots are sequenced first.

**POST_TASK_REPO_HEALTH = PENDING.**

## Definition of Done

- Every requirement in the final reconciliation is `DONE` or carries an evidenced non-engineering disposition.
- No engineering requirement remains `PARTIAL` or `NOT_STARTED`.
- Consolidated QA, regression, security and accessibility campaigns pass, with real-PostgreSQL evidence for the migration, outbox, idempotency, seat and erasure paths.
- Exact-SHA CI passes and `develop` contains the work; `main` is untouched until the release package.
- Bugs, backlog, QA, history, knowledge and Obsidian Generated content agree.

## Program state

Updated 2026-08-18.

```text
CURRENT_PHASE               PHASE 2 — implementation
CURRENT_WORK_PACKAGE        WP-05 (next ready)
COMPLETED_WORK_PACKAGES     WP-01, WP-02, WP-04 — all merged behind a green required gate
NEXT_READY_WORK_PACKAGE     WP-05 — customer-before-payment and checkout authority
INTEGRATED_DEVELOP_SHA      416996d — fast-forward, develop tip IS the CI-verified SHA
BASE_DEVELOP_SHA            304bfda
MAIN                        b90f33e — UNTOUCHED
UNCOMMITTED_STATE           none — worktree clean at every checkpoint
LEASES_HELD                 schema, permissions, workspace (SESSION-0007)
BLOCKERS                    none — a local PostgreSQL credential was supplied; dijipeople_wp_test carries the full migration history and DB-backed proof now runs locally
```

**Resumption contract.** The next invocation continues this same parent and registers a NEW session (SESSION-0006 is finished, so its leases are free). It does
not re-run discovery: the reconciliation is written, the graph is above, and the
next package is named. Read
[`FINAL-PARENT-SCOPE-RECONCILIATION.md`](../engineering-history/FINAL-PARENT-SCOPE-RECONCILIATION.md)
for what remains and start at WP-04.

**Why WP-04 and not WP-03.** WP-03 (cookie/marketing consent) needs the landing
surface to be worth anything, and the seat engine is a root that WP-05, WP-06
and WP-09 all depend on. Roots before leaves.

## History

- 2026-08-18 — created at `c332992` as the durable record for the existing commercial parent. Reconciliation re-probed; 16 packages sequenced; WP-01 started.
- 2026-08-18 — WP-01 implemented at `6ebde36`: outbox schema, migration `20260818090000`, emitter/dispatcher/worker, 13 tests. Rebased onto `304bfda` after a sibling session landed the landing remediation and released the `workspace` lease.
- 2026-08-18 — WP-02 implemented at `7c97ff2`: legal document schema and migration `20260818100000`, publication lifecycle with immutability enforced, lead and partner consent wired to published versions, `Subprocessor` model. The schema-derived tenant-erasure invariant caught both new tenant-owned models before they could reach a live erasure.
- 2026-08-18 — BUG-0070 found by the first real-PostgreSQL run of QA-BILLING-002 and fixed: outbox deduplication aborted the caller transaction. WP-04 (active-employee seat engine) implemented with 9 DB-backed tests. Both integrated at `416996d` by fast-forward; all 13 CI jobs green. A local PostgreSQL credential was supplied mid-session, so DB-backed proof now runs locally against `dijipeople_wp_test`, which carries the full 204-migration history applied to a fresh database.
- 2026-08-18 — WP-01 and WP-02 integrated into `develop` at `2bdac3a` by fast-forward, so the develop tip is bit-for-bit the SHA the required gate verified. All 13 CI jobs green including browser e2e and the real-PostgreSQL migration gate. `origin/main` untouched at `b90f33e`; `DEVELOP_CONTAINS_MAIN = PASS`; POST_TASK_REPO_HEALTH = PASS.
- 2026-08-18 — first exact-SHA CI on `7c97ff2` returned `failure`: framework validation (module inventory, task indexes, dashboards) and lint. **Database migration gate passed**, which is the real-PostgreSQL proof for both migrations. Fixed at `d02ae6c` and re-run.
