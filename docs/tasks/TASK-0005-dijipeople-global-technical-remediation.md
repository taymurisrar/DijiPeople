---
TASK_ID: TASK-0005
aliases: [TASK-0005]
TITLE: DijiPeople Global Technical Remediation
TYPE: BUG
SIZE: PROGRAM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-17
AFFECTED_MODULES: [global, framework, qa, ci, api, web, admin, landing, agent-desktop, gateway]
AGENTS: [Architect, Backend/API, Frontend, UI/UX, Database, Integration, QA, Reviewer, Integrator, Release/DevOps]
DEPENDENCIES: current origin/develop, readable repository records, configured CI
CURRENT_PACKAGE: WP-03
COMPLETED_PACKAGES: [WP-01, WP-02]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 1
FINAL_STATUS:
---

# TASK-0005 — DijiPeople Global Technical Remediation

CONTEXT_FILES_REQUIRED:
  - `AGENTS.md`
  - `.agent/context/task-router.md`
  - `.agent/context/task-orchestration.md`
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/agent-handoffs.md`
  - `.agent/context/multi-session.md`
  - `.agent/context/knowledge-architecture.md`
  - `.agent/context/testing-architecture.md`
  - `.agent/context/repository-health.md`
  - `.agent/context/branch-model.md`

SPECIALIST_AGENTS_REQUIRED:
  - Architect — discovery, prioritisation and package routing.
  - Backend/API — verified API defects.
  - Frontend and UI/UX — verified user-surface defects.
  - Database — single writer for schema, migrations and DB-backed proof.
  - Integration — desktop, gateway, Stripe and external boundaries.
  - QA and Reviewer — re-verification, durable evidence and independent acceptance.
  - Integrator and Release/DevOps — `develop`, exact-SHA CI and repository health.

DELIBERATELY_NOT_USED:
  - None globally. Each child package narrows the roster to its actual impact.

SINGLE_WRITER_FILES:
  - Schema, permission, guard, runtime-registry, workspace, CI, framework, record-index and deployment resources covered by the session lease system.

QA_REQUIRED: yes
KNOWN_BUG_PATTERNS_IN_SCOPE: selected per package; initial scope includes authorization, tenant isolation, permission drift, hidden writes, premature completion, doc-code drift and silent configuration fallback.
REGRESSION_ENTRIES_IN_SCOPE: every active regression, narrowed per implementation package.

TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: no
DEPLOYMENT_COMPONENTS: none
DEPLOYMENT_ORDER: not applicable
ROLLBACK_CLASS: determined per child package; bootstrap is CODE_ONLY
INTEGRATOR_REQUIRED: yes
RELEASE_DEVOPS_REQUIRED: yes
POST_DEPLOY_QA_REQUIRED: no — no deployment is authorized
MERGE_STRATEGY: merge --no-ff
KNOWN_CONCURRENT_WORK: none active at registration; preserved agent branches are read-only recovery candidates
ENVIRONMENT_DEPENDENCIES: package-specific; discovery requires none

## Objective

**FACT:** At `origin/develop` `0051180`, the repository initially indexed 91
durable engineering records (48 Bugs and 43 items), 12 QA plans, 58 scenarios
and 53 declared coverage gaps. Discovery added four Bugs and three items, for a
current canonical inventory of 98 records (52 Bugs and 46 items). **FACT:** the
machine-readable inventory also captures 34 cross-record and evidence-system
findings that require reconciliation rather than duplicate canonical records.

**PROPOSAL:** reverify every durable record and external finding against current
code, build a machine-readable deduplicated inventory, remediate technically
safe work in coherent child packages, and reconcile Bugs, Backlog, QA,
Engineering History, dashboards and generated Obsidian content. Completion
requires truthful terminal dispositions, no ready technical CRITICAL/HIGH,
exact-SHA CI, `develop` containing `main`, and `main` untouched.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Global inventory and evidence triage | DONE | — | Architect, QA, Reviewer, Integrator, Release/DevOps | agent/global-remediation-program | d919e1a | PASS_WITH_RISKS | BUG-0049–0052, ITEM-0044–0046 | PASS | DONE |
| WP-02 | Record-state, validator and QA-registry reconciliation | DONE | WP-01 | Architect, QA, Reviewer | agent/remediation-record-reconciliation | c554f45 | PASS_WITH_RISKS | BUG-0051 | PASS_WITH_RISKS | DONE |
| WP-03 | Authorization invariant audit and module remediation | IN_PROGRESS | WP-01 | Backend/API, Integration, QA, Reviewer | agent/remediation-authorization | c554f45 | NOT_RUN | ITEM-0043 | NOT_RUN | NOT_STARTED |
| WP-04 | Database E2E isolation and residual defect proof | NOT_STARTED | WP-01 | Database, Backend/API, QA, Reviewer | agent/remediation-database-e2e | — | NOT_RUN | BUG-0049 | NOT_RUN | NOT_STARTED |
| WP-05 | Tenant provisioning and lifecycle proof | NOT_STARTED | WP-01, WP-04 | Backend/API, Database, QA, Reviewer | agent/remediation-tenant-lifecycle | — | NOT_RUN | ITEM-0004 | NOT_RUN | NOT_STARTED |
| WP-06 | Desktop agent distribution, security and reliability | NOT_STARTED | WP-01 | Integration, Backend/API, QA, Reviewer | agent/remediation-agent-desktop | — | NOT_RUN | BUG-0034 | NOT_RUN | NOT_STARTED |
| WP-07 | Product-surface and integration remediation | NOT_STARTED | WP-01 | UI/UX, Frontend, Backend/API, QA, Reviewer | agent/remediation-product-surfaces | — | NOT_RUN | BUG-0050, ITEM-0044, ITEM-0045, ITEM-0046 | NOT_RUN | NOT_STARTED |
| WP-08 | Production dependency security remediation | NOT_STARTED | WP-01 | Backend/API, Frontend, Integration, QA, Reviewer | agent/remediation-dependencies | — | NOT_RUN | BUG-0052 | NOT_RUN | NOT_STARTED |
| WP-09 | CI evidence integrity and required-gate promotion | NOT_STARTED | WP-02, WP-03, WP-04, WP-08 | QA, Integrator, Release/DevOps, Reviewer | agent/remediation-ci-evidence | — | NOT_RUN | BUG-0049 | NOT_RUN | NOT_STARTED |
| WP-10 | Remaining medium/low debt and documentation drift | NOT_STARTED | WP-01 | Architect, owning specialists, QA, Reviewer | agent/remediation-debt-docs | — | NOT_RUN | — | NOT_RUN | NOT_STARTED |
| WP-11 | Final reconciliation, knowledge, Obsidian and cleanup | NOT_STARTED | WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10 | Architect, Integrator, Release/DevOps | agent/remediation-final-reconciliation | — | NOT_RUN | — | NOT_RUN | NOT_STARTED |

These package boundaries reflect the WP-01 root-cause audit. Authorization and
database evidence are separated because each has a different failure mode and
proof environment; CI promotion follows both rather than masking either.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Current code and executable tests outrank historical record labels. | `AGENTS.md`; knowledge architecture | HIGH | Records may need reopening or closure with written evidence. |
| A-02 | `develop` is the only integration target and `main` is production control. | branch model; pre-task refs | HIGH | Any task commit reaching `main` fails the program. |
| A-03 | Selective Obsidian retrieval is sufficient; the whole vault must not be bulk loaded. | retrieval tooling and knowledge rules | HIGH | Manual intent could be missed if package terms are not retrieved. |
| A-04 | Child boundaries will change after the master inventory is complete. | Preliminary findings span unrelated owners and security boundaries. | HIGH | Parent state must be updated before implementation. |
| A-05 | DB and browser proof may need local credentials or services absent from Git. | QA metadata and CI workflow | MEDIUM | Evidence may become `BLOCKED_EXTERNAL`; independent work continues. |
| A-06 | Historical unmerged branches are candidates, not trusted fixes. | worktree and repo-health output | HIGH | Recovery requires a clean probe and exact-diff verification. |

## Owner Decisions

### ITEM-0032 — historical productivity totals inflated by heartbeat replays

- **Question:** should historical totals be recomputed where raw events remain,
  annotated as unverified, or accepted unchanged?
- **Evidence:** BUG-0036 prevents new replay inflation, but pre-migration events
  have no dedupe key and tenant retention may already have removed the source
  events needed for a trustworthy reconstruction.
- **Options:** (A) recompute only periods with surviving source events and mark
  older periods unverified; (B) annotate all potentially affected sessions
  without rewriting; (C) accept after measuring the observed inflation.
- **Architect recommendation:** measure per tenant first, then use option A;
  never replace an unknown historical value with a falsely precise one.
- **Safe work completed:** forward idempotency is already fixed and the repair
  decision is isolated from all independent program packages.
- **Blocked work:** only the historical data-repair plan and execution.

## Repository Health

**PRE_TASK_REPO_HEALTH = PASS.** Local and remote `develop` were
`00511803ebb0e1343ff35535996df1af98c95834`; `origin/main` was
`b90f33e00c3845439797b51ef1ceb3ed7820a620`; `DEVELOP_CONTAINS_MAIN = PASS`;
`MAIN_SYNC_STATUS = SYNCED`; `DEVELOP_SYNC_STATUS = SYNCED`; no unfinished Git
operation existed. The original worktree's unrelated
`apps/landing/next-env.d.ts` modification is preserved outside this worktree.

**MULTI_SESSION = SAFE_PARALLEL.** `SESSION-0003` started with no active sibling,
write lease or database writer. Each child package rechecks and uses the merge
queue. **POST_TASK_REPO_HEALTH = PENDING.**

## History

- 2026-08-17 — created from `origin/develop` `0051180`.
- 2026-08-17 — `SESSION-0003` registered; global discovery and selective Obsidian retrieval started.
- 2026-08-17 — inventory reconciled to 98 canonical records plus 34 cross-record findings; CI evidence exposed 796 authorization-invariant violations, 6 failing database E2E suites and 1 skipped browser assertion behind green aggregate jobs.
- 2026-08-17 — WP-01 QA returned `PASS_WITH_RISKS`; independent Reviewer returned `APPROVE WITH FOLLOW-UPS` and `REVIEWER_ACCEPTED_QA`. The 70 nonterminal re-verifications remain explicitly assigned to later packages.
- 2026-08-17 — WP-01 task SHA `423a7a8` passed exact-SHA CI run `32015389727`, merged through the serialized queue as `d919e1a`, and passed post-merge CI run `32016184547` on `develop`. WP-02 started from that merge.
- 2026-08-17 — WP-02 reconciled 98 canonical records, initially 69 QA scenarios, 39 active regressions and 34 inventory findings; 21 discovery findings were resolved or truthfully moved to `NEEDS_REVIEW`. All record/task/QA/session/dashboard checks and 1,109 framework checks passed. QA verdict: `PASS_WITH_RISKS`; exact CI later added QA-ATT-007 as scenario 70.
- 2026-08-17 — independent review rejected a false authentication closure and a regression-root false negative. BUG-0009/0010 returned to `FIXED`, ITEM-0002 returned to `READY/FIX_NOW`, QA-AUTH-002 became `PARTIAL`, REG-001–021 gained explicit canonical roots, REG-026/033 scenario roots were corrected, and validators gained root-matching negative fixtures.
- 2026-08-17 — after rework, independent Reviewer returned `APPROVE` and `REVIEWER_ACCEPTED_QA`: zero blocking findings; record/QA/regression/inventory/CI-document truth and lease compliance all passed. WP-02 advanced to exact-SHA CI.
- 2026-08-17 — WP-02 task SHA `47b127f` completed exact-SHA CI run `32020076245`: required aggregate PASS, security report 796 violations, browser 8 PASS / 1 SKIP, database E2E 7 suites / 148 tests FAIL. The new `attendance-operational` failure is durable as QA-ATT-007; WP-02 remains `PASS_WITH_RISKS` pending integration.
- 2026-08-17 — final WP-02 task SHA `03f30cb` passed exact-SHA CI run `32021401010`. Security remained 796 violations and browser 8 PASS / 1 SKIP; the same seven DB suites failed with 147 failed / 80 passed tests, a one-test variance from the prior run that WP-04 must classify.
- 2026-08-17 — WP-02 merged through the serialized queue as `c554f45` and passed post-merge CI run `32022417483` on `develop`. The required gate passed; security remained at 796 violations and browser remained 8 PASS / 1 SKIP. Database E2E shifted to 5 failed / 10 passed suites and 128 failed / 99 passed tests, with `attendance-review` and `attendance-operational` passing after both had failed on the two task-SHA runs. WP-04 therefore owns nondeterminism/root-cause classification rather than a fixed seven-suite assumption.

## Business requirement

**FACT:** The user requested a global remediation program that processes every
documented and newly verified engineering finding, persists across execution
boundaries, integrates ordinary work only into `develop`, and never modifies
`main`.

## Existing behavior

**FACT:** after WP-02 reconciliation and independent-review corrections, the
backlog generator reports 98 records: 36 open, 0 blocked, 1 deferred, 1 product
decision and 60 completed, with 0 open
CRITICAL and 5 open HIGH. Source records, generated views and the master
inventory now agree on these buckets. **FACT:** framework validation passes
1,109 checks; the two unresolved-wikilink notices are non-blocking follow-up
knowledge work.

## Existing architecture

**FACT:** durable truth is split among Bugs, Backlog, QA plans/scenarios,
regressions, parent tasks, Engineering History, repository knowledge and
generated Obsidian content. **PROPOSAL:** extend those sources and their existing
generators; create no parallel backlog, QA registry or dashboard.

## Requirements

1. Reverify every Bug, item, regression, material QA finding and GAP/PARTIAL cell against current `develop`.
2. Deduplicate overlapping root causes and give every discovered item a current evidence-backed disposition.
3. Fix all technically resolvable CRITICAL/HIGH before lower-risk work; record genuine decisions and external blocks without stopping independent packages.
4. Require regression evidence, durable QA and independent Reviewer acceptance for each material fix.
5. Serialize shared-resource and database writes through sessions, leases and the `develop` merge queue.
6. Keep generated indexes, dashboards and Obsidian Generated content aligned after each integrated package.
7. Finish with `DEVELOP_CONTAINS_MAIN = PASS`, exact-SHA CI, released leases, safe cleanup and `MAIN_CHANGE_STATUS = UNTOUCHED`.

## Dependencies

**FACT:** package dependencies may include PostgreSQL, Playwright services and
credentials, and external signing/artifact infrastructure. **PROPOSAL:** use
command evidence for external blocks; never misclassify internal effort as one.

## Files / modules affected

**FACT:** discovery spans all durable record/knowledge directories, CI/test
configuration, every application/service and preserved agent branches.
**PROPOSAL:** each child plan narrows exact paths before leases or code changes.

## Database impact

**PROPOSAL:** none in WP-01/WP-02. Any database fix receives a child ExecPlan,
exclusive `schema` lease, real PostgreSQL proof and rollback evidence.

## Backend impact

**PROPOSAL:** determined per verified Bug. Existing owning services,
repositories, DTO validation, dual permission decorators, row scope, standard
errors, audit and notification orchestration remain mandatory.

## Frontend impact

**PROPOSAL:** reuse each app's runtime and shared components. UI packages cover
loading/error/empty/access-denied states, responsiveness, accessibility and real
Playwright journeys when behavior changes.

## Permission / RBAC impact

**FACT:** authorization findings are in scope and negative/cross-tenant tests
are mandatory. **PROPOSAL:** permission/guard changes take the `permissions`
lease and validate both permission families plus row scope; no elevated bypass.

## Tenant-isolation impact

**FACT:** tenant isolation is enforced by explicit service queries.
**PROPOSAL:** every changed tenant-owned read/write derives `tenantId` from the
authenticated user; platform cross-tenant paths remain separately guarded.

## Audit / event / logging impact

**PROPOSAL:** state changes reuse AuditService, platform events and notification
orchestration. Secrets, tokens and telemetry content never enter logs/evidence.

## Integration impact

**FACT:** open work touches desktop updates, public proxies, Stripe, gateway,
release and CI boundaries. **PROPOSAL:** preserve deployed-client compatibility
and verify retry, idempotency and authentication at every boundary.

## Migration / data compatibility

**PROPOSAL:** decide per child. No destructive migration lacks explicit
backfill/rollback; no data repair runs without idempotency and neighboring-tenant
survival proof.

## Parallel-safe tasks

**PROPOSAL:** read-only discovery and later packages with disjoint files, leases
and dependencies are `PARALLEL_SAFE`. Parent state updates are serialized.

## Dependency-blocked tasks

**PROPOSAL:** schema/permission/CI/framework writers, Prisma-client consumers
and gate promotion depending on earlier fixes are `DEPENDENCY_BLOCKED` as shown.

## Integration tasks

**PROPOSAL:** only the Integrator claims the queue, reconciles latest
`origin/develop`, validates, pushes, verifies the remote ref and triggers
post-integration record/knowledge sync.

## Testing strategy

**PROPOSAL:** begin with structural checks, then use `qa:select` and exact
workspace tests per child. Security includes negative authorization and
cross-tenant cases; DB uses PostgreSQL; UI uses Chromium/Playwright; build inputs
run the relevant build. Every run records command, SHA, failure and limitation.

## Risks

1. **High:** false terminal records hide live security/lifecycle defects. Mitigation: code/test proof before status changes.
2. **High:** broad record edits conflict with another session. Mitigation: isolated worktree, checks/leases and serialized updates.
3. **High:** a giant remediation branch becomes unreviewable. Mitigation: coherent child branches and exact-SHA CI per package.
4. **High:** manual Obsidian intent is overwritten. Mitigation: manual notes remain read-only; only Generated content syncs.
5. **Medium:** broad lint rewrites unrelated files. Mitigation: scoped API lint and diff inspection.

## Rollback considerations

**PROPOSAL:** record-only packages are `CODE_ONLY` and commit-revertible. Each
implementation child declares its rollback class; generated views are rebuilt
from source records rather than hand-restored.

## Definition of Done

- Every record/QA source has a current evidence-backed disposition; ordinary `TRIAGE_REQUIRED` is zero.
- No technically resolvable CRITICAL/HIGH remains; decisions, blocks and defers are justified.
- Every required specialist handoff, QA, Reviewer, Integrator and Release/DevOps gate is accepted.
- Relevant local validation and exact-SHA remote CI pass before every `develop` integration.
- Bugs, Backlog, scenarios, regressions, coverage, task state, history, knowledge, dashboards and Obsidian Generated content agree.
- `origin/develop` contains `origin/main`; `main` contains none of this program's commits.
- Sessions release leases/queue claims and safe cleanup completes.
