---
TASK_ID: TASK-0007
aliases: [TASK-0007]
TITLE: Commercial platform completion — transactional, legal and lifecycle half
TYPE: FEATURE
SIZE: PROGRAM
WORK_PACKAGE_FILES: NOT_REQUIRED - predates the per-package file convention introduced by TASK-0012; table-only state retained rather than backfilled with invented manifests
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-18
AFFECTED_MODULES: [billing, super-admin, tenant-control-plane, legal, notifications, platform-events, employees, landing, admin, web]
AGENTS: [Architect, Database, Backend/API, Frontend, UI/UX, Integration, QA, Reviewer, Integrator, Release/DevOps]
DEPENDENCIES: origin/develop c332992; PARENT-SCOPE-RECONCILIATION; schema and permissions leases
CURRENT_PACKAGE:
NEXT_READY_WORK_PACKAGE: NONE
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10, WP-11, WP-12, WP-13, WP-14, WP-15, WP-16]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
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
| WP-03 | Consent — privacy acknowledgement, marketing, cookie categories | DONE | WP-02 | Backend/API, Frontend | agent/consent-legal-knowledge | e9cad20 | PASS | PASS | DONE |
| WP-04 | Active-employee seat engine, usage history and overage | DONE | WP-01 | Database, Backend/API | agent/commercial-platform-completion | 416996d | PASS | PASS | DONE |
| WP-05 | Customer-before-payment, pending subscription, checkout authority, tax basis | DONE | WP-01, WP-04 | Database, Backend/API, Integration | agent/commercial-platform-completion | 68ef4d1 | PASS | PASS | DONE |
| WP-06 | Seat change and plan change lifecycle | DONE | WP-04, WP-05 | Backend/API, Integration | agent/commercial-platform-completion | 943a826 | PASS | PASS | DONE |
| WP-07 | Payment to onboarding to provisioning automation, steps, resumability, targets | DONE | WP-01, WP-05 | Backend/API, Database, Integration | agent/commercial-platform-completion | 943a826 | PASS | PASS | DONE |
| WP-08 | Cancellation, retention, holds, deletion request and erasure orchestration | DONE | WP-01, WP-07 | Database, Backend/API | agent/commercial-platform-completion | 1520b67 | PASS | PASS | DONE |
| WP-09 | Stripe and internal reconciliation jobs | DONE | WP-04, WP-05, WP-07 | Backend/API, Integration | agent/commercial-platform-completion | 1520b67 | PASS_WITH_RISKS | PASS | DONE |
| WP-10 | Landing legal, trust and subprocessor surface | DONE | WP-02, workspace lease | Frontend, UI/UX | agent/landing-legal-surface | f2957ae | PASS | PASS | DONE |
| WP-11 | Admin dashboard, monitoring and provisioning operations UX | DONE | WP-07, workspace lease | UI/UX, Frontend, Backend/API | agent/provisioning-ops-and-qa | b43ee1e | PASS | PASS | PENDING_INTEGRATION |
| WP-12 | Notification ownership and business-event coverage | DONE | WP-01, WP-07 | Backend/API | agent/consent-legal-knowledge | e9cad20 | PASS | PASS | DONE |
| WP-13 | Consolidated QA, regression, security, accessibility and visual campaign | DONE | WP-01..WP-12 | QA, Reviewer | agent/provisioning-ops-and-qa | a28d967 | PASS | PASS | PENDING_INTEGRATION |
| WP-14 | Final review, exact-SHA CI, develop integration | DONE | WP-13 | Reviewer, Integrator | agent/provisioning-ops-and-qa | 1f6b508 | PASS | PASS | INTEGRATED |
| WP-15 | Release, main promotion, deployment and production smoke | DONE | WP-14 | Release/DevOps | main | 6ed7a44 | PASS | PASS | DEPLOYED |
| WP-16 | Knowledge, Obsidian, history and parent closure | DONE | WP-14 | Architect | agent/provisioning-ops-and-qa | 1f6b508 | PASS | PASS | INTEGRATED |

WP-01, WP-02 and WP-04 are the roots: everything downstream either emits a
durable event, resolves a published legal version, or reads a billable
quantity. They are sequenced first for that reason and not by size.

### WP-13 campaign result

Ran against a live stack on a real PostgreSQL, 2026-08-19.

| Type | Result |
|---|---|
| Unit | 184 suites, 1406 tests — PASS |
| API / integration / database | DB-backed suites on real PostgreSQL — PASS |
| Security | **2 defects found and fixed** — BUG-0071 (CRITICAL), BUG-0072 (HIGH) |
| Browser | 48 tests across flows C, D, E, F — PASS |
| Accessibility | **2 defects found and fixed** — BUG-0073, BUG-0074 |
| Visual / layout | asserted as properties at 390/768/1366 — PASS |
| SEO | 10 tests — PASS |
| Production build | CI `Build` job — PASS |
| Performance | **NOT RUN** — no load-testing harness exists; not created here |

**The Stripe purchase journey refuses safely, which is the only correct
outcome.** No published PKR price exists (OD-01), `commercial-offer.resolver.ts`
fails closed, and `/subscribe` says so on the part of the page that invites
action rather than only on the other card. Verified live and covered by REG-062
through Flow C. A completed purchase is not achievable and must not be
manufactured by inventing a price.

**Honest gaps, stated rather than implied away:**

- Performance was not run at all. There is no harness, and building one was not
  in scope for this package.
- The accessibility audit covers two admin screens out of many, and the public
  site. `PLAN-019` declares `COVERAGE_BROWSER: PARTIAL` for exactly that reason.
- `text-slate-400` persists on admin screens the audit does not yet reach.
  BUG-0073 fixed what was found and says so.
- Moderate and minor axe violations are reported, not gated. Failing a first
  audit on its whole long tail produces a suite nobody can act on.

**A harness defect found by running the campaign honestly.** Flow D's fixtures
were written to one database while the API served another, so its assertions
passed against rows seeded by hand hours earlier. Four orphaned `nest start
--watch` processes were reclaiming port 4000. Proved by probe rather than
inferred, then fixed; the suite now validates its own data.

### Parent closure

**15 of 16 work packages DONE. WP-15 is `BLOCKED_EXTERNAL` and cannot be moved
from this environment by anyone** — no `RENDER_API_KEY`, no `VERCEL_TOKEN`, and
neither the Render nor the Vercel CLI on `PATH`. Established as fact on
2026-08-18 and unchanged since; see OD-03.

Everything up to and including a validated `develop` is complete.

**What this program delivered that was not asked for, because the work found
it:** four defects, two of them serious enough to have been the whole task.
BUG-0071 let any tenant administrator read the platform's customer, billing and
staff data. BUG-0072 let a role named read-only rewrite the commercial plan
catalog. Both were found by asking whether a *new* endpoint asserted platform
identity the way its siblings did — it did not, and the sweep that followed
found the rest.

**What remains outstanding, stated rather than closed over:**

- **Performance was never tested.** No harness exists and building one was
  outside every package here. Not "acceptable" — untested.
- **Accessibility covers two admin screens and the public site.** `PLAN-019`
  declares `COVERAGE_BROWSER: PARTIAL` for that reason, and `text-slate-400`
  persists on screens the audit does not reach.
- **Prices remain OWNER_DECISION_REQUIRED** (OD-01) and the legal entity
  unset (OD-02). Checkout refuses safely; that is the correct behaviour, not a
  workaround, and it will stay correct until an owner supplies real values.
- **A completed purchase has never been exercised end to end**, because one
  cannot be without a published price. What is proven is the refusal.

**Concurrency note for whoever picks this up.** SESSION-0018 is working on
self-service onboarding, provisioning and domain routing — the same module as
WP-11. This session's integration should land before that branch grows, or the
register-and-inventory collisions resolved here recur in a module with real code
overlap rather than records alone.

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

### OD-03 — deployment access (~~BLOCKED_EXTERNAL~~ — **discharged 2026-08-22**)

- **Established as fact on 2026-08-18**, not assumed: no `RENDER_API_KEY`, no
  `VERCEL_TOKEN`, no `STRIPE_SECRET_KEY` in the environment, and neither the
  Render nor Vercel CLI is on `PATH`.
- **That fact expired on 2026-08-22** and the record did not follow it. Both
  CLIs are installed and both tokens live in User-scope environment variables;
  `docs/deployment/platform-access.md` documents the access. The premise this
  block rested on is simply no longer true.
- **WP-15 is closed as `DONE`.** It did not need doing separately: five releases
  have since been promoted to `main` and deployed — PRs #40, #42, #43, #44, #45.
  Production runs `6ed7a44`, which is `origin/main`, confirmed at `/api/health`.
  The deploy log shows the full `preDeployCommand` chain completing, including
  `prisma migrate deploy` (219 migrations, none pending) and `legal:publish`.
- **What this does not mean.** Deployment works; *selling* does not. That is
  [[BUG-0989]] (every Stripe webhook rejected) and [[BUG-0903]] (test mode), and
  both are configuration on the live service rather than anything in WP-15's
  scope.

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
CURRENT_WORK_PACKAGE        WP-11 (next ready)
COMPLETED_WORK_PACKAGES     WP-01..WP-10 and WP-12 — merged behind a green required gate
NEXT_READY_WORK_PACKAGE     WP-11 — admin dashboard, monitoring and provisioning operations UX
INTEGRATED_DEVELOP_SHA      f2957ae — fast-forward, develop tip IS the CI-verified SHA
BASE_DEVELOP_SHA            304bfda
MAIN                        b90f33e — UNTOUCHED
UNCOMMITTED_STATE           none — worktree clean at every checkpoint
LEASES_HELD                 none — SESSION-0013 finished and released them
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
- 2026-08-18 — WP-05 implemented at `2051133`: the `SubscriptionOrder` pre-payment snapshot, conservative customer deduplication (corporate domain **and** normalised company name, generic domains excluded), server-authoritative money, and the tax chain defaulting to `NOT_DETERMINED` rather than a fabricated rate or a false `NOT_APPLICABLE`. The erasure invariant forced two design changes: the order is *detached* rather than deleted, like `Contract`, because a financial record must outlive the workspace it paid for; and its plan pointers became `SetNull`, because `Plan` is tenant-owned and a retained order's `Restrict` edge would otherwise have blocked erasure entirely. A DB-backed test caught that a permanently unique `submissionHash` would make a company and plan unbuyable forever after one abandoned checkout.
- 2026-08-18 — BUG-0070 found by the first real-PostgreSQL run of QA-BILLING-002 and fixed: outbox deduplication aborted the caller transaction. WP-04 (active-employee seat engine) implemented with 9 DB-backed tests. Both integrated at `416996d` by fast-forward; all 13 CI jobs green. A local PostgreSQL credential was supplied mid-session, so DB-backed proof now runs locally against `dijipeople_wp_test`, which carries the full 204-migration history applied to a fresh database.
- 2026-08-18 — WP-01 and WP-02 integrated into `develop` at `2bdac3a` by fast-forward, so the develop tip is bit-for-bit the SHA the required gate verified. All 13 CI jobs green including browser e2e and the real-PostgreSQL migration gate. `origin/main` untouched at `b90f33e`; `DEVELOP_CONTAINS_MAIN = PASS`; POST_TASK_REPO_HEALTH = PASS.
- 2026-08-18 — first exact-SHA CI on `7c97ff2` returned `failure`: framework validation (module inventory, task indexes, dashboards) and lint. **Database migration gate passed**, which is the real-PostgreSQL proof for both migrations. Fixed at `d02ae6c` and re-run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0070]], [[BUG-0071]], [[BUG-0072]], [[BUG-0073]], [[BUG-0074]], [[BUG-0903]], [[BUG-0989]]
- Modules — [[billing]], [[super-admin]], [[tenant-control-plane]], [[legal]], [[notifications]], [[employees]]

<!-- GRAPH:END -->
