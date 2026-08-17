# QA Run — framework-autonomous-v2

## Metadata

| | |
|---|---|
| Date / time | 2026-08-17T00:01:51.934Z |
| Branch | `agent/framework-autonomous-v2` |
| Commit SHA | `f64ba4ede2b34becb29dbcdf05b70446ab70dae4` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-framework` |
| Environment | Node 24 local, Windows. No live PostgreSQL. No Obsidian vault configured. Working tree clean at the validated SHA; later commits are documentation only and are noted below |
| QA agent | qa |
| Scope | The agent framework itself — `.agent/`, `scripts/`, `docs/` record systems, `.github/workflows/ci.yml`. **No product code, schema, API contract or UI is in scope**, and none was changed |

## Requirement

TASK-0004 extends the existing framework so a user talks only to the Architect,
several Architect chats can run at once without corrupting shared state, ordinary
work integrates into `develop` while `main` stays production control, QA reuses
durable plans and scenarios rather than starting from zero, and the Obsidian
relationship runs both ways. Plan:
[`docs/tasks/TASK-0004`](../../tasks/TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s.md).

The routed type is `FRAMEWORK`, whose definition of done requires that new
behaviour be **simulated, not merely documented**. That is what this run is
mostly about.

## Risk Areas

| Risk | Why | Pattern |
|---|---|---|
| A gate that exists only as prose | The framework's recurring failure mode: a rule nobody executed. `FRAMEWORK`'s definition of done exists because of it | `premature-completion` |
| A validator that passes after its behaviour is deleted | A check asserting a file *mentions* something survives the behaviour being removed | `divergent-duplicate-guard` |
| The id allocator silently reverting to a working-tree scan | The exact defect being fixed; a cache or a refactor reintroduces it invisibly | — |
| Documents asserting tooling state | Four plans claimed no browser automation existed; `main` added Playwright mid-task | `doc-code-drift` |
| A coverage matrix reporting coverage nobody has | A declared `GOOD` with no scenario, or scenarios that cannot run | `declared-but-unwired-step` |
| Generated indexes drifting from their records | Five record systems now generate indexes; any can drift | — |

## Scenarios

Expected behaviour written **before** execution. `S*` are the behavioural
simulations added to `scripts/validate-framework.mjs`; each is executed on every
run of that script, in CI as well as locally.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Two Architect sessions start concurrently | concurrency | Distinct `SESSION-` ids | PASS | `simulation 1` |
| S1b | Two active sessions declare the same branch | concurrency | Rejected by the record loader | PASS | `simulation 1b` |
| S2 | Independent sessions on unrelated files | concurrency | `SAFE_PARALLEL` | PASS | `simulation 2` |
| S2b | Two sessions edit the same ordinary file | concurrency | `SHARED_FILE_CONFLICT` | PASS | `simulation 2b` |
| S3 | Second session requests the held `schema` lease | concurrency | Refused; owner named | PASS | `simulation 3` |
| S3a | Contended schema write classified | concurrency | `BLOCKED_BY_ACTIVE_SESSION` | PASS | `simulation 3` |
| S3b | Contended non-global resource classified | concurrency | `SERIALIZE`, not blocked | PASS | `simulation 3b` |
| S3c | Read requested while a write lease is held | concurrency | Granted — reads are never leased | PASS | `simulation 3c` |
| S4 | Eight concurrent `BUG` allocations | idempotency | Eight distinct ids | PASS | `simulation 4` |
| S4b | Id allocated on a **sibling branch**, not in the working tree | concurrency | Ceiling still sees it | PASS | `simulation 4b` — commits `BUG-0900` on a branch, checks out the first |
| S4c | Reservation visible before its record file exists | concurrency | Present in the ledger | PASS | `simulation 4c` |
| S4d | Next allocation after a reservation | concurrency | Strictly above it | PASS | `simulation 4d` |
| S5 | Eight concurrent `ITEM` allocations | idempotency | Eight distinct ids | PASS | `simulation 5` |
| S6 | A `LARGE` task with no work packages | contract | Rejected | PASS | pre-existing task-record check |
| S7 | Continuation picks the dependency-satisfied package | contract | Only that one | PASS | pre-existing |
| S10 | A change selects the durable scenarios for its module | selection | Plans + scenarios returned | PASS | `simulation 10` |
| S10b | A scenario whose `AREA` has no plan | contract | Rejected | PASS | `simulation 10b` |
| S10c | Security scenarios surfaced as mandatory | selection | Present in `mandatory` | PASS | `simulation 10c` |
| S11 | QA records valid and indexes current | contract | `--check` clean | PASS | `simulation 11` |
| S12 | `AUTOMATED` scenario naming a missing test | contract | Rejected | PASS | `simulation 12` — **this check found `BUG-0047`** |
| S13 | `COVERAGE_X = GOOD` with no scenario of that type | contract | Rejected | PASS | `simulation 13` |
| S13b | `COVERAGE_X = GOOD` where every scenario is blocked | contract | Rejected | PASS | `simulation 13b` |
| S14 | Ordinary session targeting `develop` | branch model | Accepted | PASS | `simulation 14` |
| S15 | **Ordinary session targeting `main`** | branch model | **Rejected** | PASS | `simulation 15` |
| S16 | `RELEASE` session targeting `main` | branch model | Accepted | PASS | `simulation 16` |
| S17 | `HOTFIX` session targeting `main` | branch model | Accepted | PASS | `simulation 17` |
| S18 | Two sessions ready to integrate | concurrency | Exactly one offered | PASS | `simulation 18` |
| S18b | Second branch while one is `INTEGRATING` | concurrency | Refused | PASS | `simulation 18` |
| S18c | Next branch after the lock releases | concurrency | Offered | PASS | `simulation 18` |
| S24 | Engineering Control Center regenerates identically | contract | `--check` clean | PASS | `simulation 24` |
| S26 | Backlog aging and revalidation computed | contract | `dueForRevalidation` present | PASS | `simulation 26` |
| S26b | Revalidation policy per severity | contract | `CRITICAL` reverified per task | PASS | `simulation 26b` |
| S27 | A finished session releases every lease | concurrency | All released | PASS | `simulation 27` |
| S27b | A finished session leaves the merge queue | concurrency | Removed | PASS | `simulation 27` |
| S27c | Unfinished Git operations reported | repo health | Array present | PASS | `simulation 27` |
| S28 | `MAIN_CHANGE_STATUS` with no baseline | repo health | `UNKNOWN`, never `UNTOUCHED` | PASS | `simulation 28` |
| S28b | `MAIN_CHANGE_STATUS` distinguishes this task from other sessions | repo health | Names who moved main | PASS | `simulation 28b` — **found by running it: the first implementation reported CHANGED because a concurrent session merged** |
| S28c | How far others advanced main is reported | repo health | Numeric | PASS | `simulation 28c` |
| S29 | `DEVELOP_SYNC_STATUS` emitted | repo health | Non-empty string | PASS | `simulation 29` |
| S30 | An active regression naming a missing test | contract | **Fails validation** | PASS | see Regression-test proof |
| S31 | A `VERIFIED` bug whose regression is inactive | contract | **Fails validation** | PASS | see Regression-test proof |

Simulations 8, 19, 20, 21, 22, 23 and 25 are **structural**, not behavioural, and
are recorded as such in Known Limitations rather than claimed as executed.

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `node scripts/validate-framework.mjs` | framework structure + 32 simulations | 1045 | 0 | 0 | ~9s |
| `node scripts/rebuild-backlog.mjs --check` | 88 records, 3 indexes | clean | 0 | — | <2s |
| `node scripts/rebuild-tasks.mjs --check` | 4 task records | clean | 0 | — | <2s |
| `node scripts/rebuild-sessions.mjs --check` | 1 session record | clean | 0 | — | <2s |
| `node scripts/rebuild-qa.mjs --check` | 12 plans, 58 scenarios, coverage matrix | clean | 0 | — | <2s |
| `node scripts/generate-dashboards.mjs --check` | 3 dashboards | clean | 0 | — | <2s |
| `node scripts/repo-health.mjs --main-baseline 714632d` | repository state | `MAIN_CHANGE_STATUS = UNTOUCHED` | — | — | <3s |
| `node scripts/verify-branch-policy.mjs` | GitHub protection | 2 findings, both recorded | — | — | <5s |
| `node scripts/backlog-review.mjs` | aging, duplicates | 0 `TRIAGE_REQUIRED` | — | — | <2s |
| `node scripts/sync-obsidian.mjs --verify` | vault | `SKIPPED_NO_LOCAL_CONFIG` | — | — | <1s |

**Not run, and not applicable:** `npm run typecheck`, `npm run lint`,
`npm --workspace api run test`, `npm run build`. This task changed no TypeScript,
no workspace source and no build input — only `.agent/`, `scripts/*.mjs`,
`docs/`, `package.json` scripts and `.github/workflows/ci.yml`. CI runs all of
them regardless, and did.

### Regression-test proof

The two `BUG-0047` checks must fail on the unfixed state. Both were **observed
failing against the repository as it stood before this task corrected it** —
that is not a stash-and-rerun, it is the original discovery:

| Test | With fix | Without fix |
|---|---|---|
| `REG-nnn regression test exists` | PASS | **FAIL** ×5 — `employee-compensation-access.spec.ts`, `attendance.correction-authorization.spec.ts`, `approvals.scope.spec.ts`, `organization-structure-authorization.spec.ts`, `feature-availability-authorization.spec.ts` |
| `a VERIFIED bug's regression entry is active` | PASS | **FAIL** ×1 — `BUG-0007` / `REG-007`, which the first check had not caught |
| `simulation 4b` — sibling-branch id | PASS | **FAIL** — reproduced during development when a per-process scan cache made the ceiling stale. The cache was removed |
| `simulation 28b` — who moved `main` | PASS | **FAIL** — the first `MAIN_CHANGE_STATUS` compared the baseline with `origin/main` and reported `CHANGED` on its own first real run, because a concurrent session merged two PRs mid-task |

The last two are the useful ones: both caught real defects in **this task's own
code**, before it shipped. A framework that cannot find its own bugs has not
been tested, only written.

## Manual Validation

- Read `origin/main:services/api/src/modules/organization/organizations.controller.ts`
  and confirmed `@UseGuards(JwtAuthGuard)` with no `PermissionsGuard` and no
  `@Permissions` on `@Post`, `@Patch(':id')` or `@Delete(':id')` — `BUG-0006`
  live on the integration branch.
- Read `origin/main:…/error-logs/error-logs.service.ts` and confirmed
  `findForUser` returns any log to a support user with no tenant comparison —
  `BUG-0005` live.
- `git merge-base --is-ancestor` before fast-forwarding `develop`, confirming zero
  unique commits and a lossless advance.
- Lease contention exercised by hand across two session ids before it was
  automated, to confirm the denial message names the holder and its reason.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| `REG-001`–`REG-003`, `REG-006`, `REG-007` | Named test present on the integration branch | **FAIL → recorded.** Marked `Active: no` with the reason; `BUG-0047` tracks landing them |
| All other entries | Named test exists | PASS — verified for all 33 register entries |

No product regression was re-executed: this task changes no product behaviour, so
the applicable regression check is the register's own integrity.

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| `BUG-0047` | **CRITICAL** | Seven records `VERIFIED` while their fixes exist only on unmerged branches; two are CRITICAL and live on `main` | `premature-completion`, `doc-code-drift` | Yes — two checks in `validate-framework.mjs`, both proven failing on the unfixed state |
| `ITEM-0040` | MEDIUM | `develop` carries no branch protection | — | `verify-branch-policy.mjs` reports it every run |
| `ITEM-0041` | LOW | Repository ruleset matches no branch and is inert | — | Same |

`BUG-0001`–`BUG-0007` were **reopened**, not newly found. Their disposition is
`PLAN_REQUIRED`: landing them is authorization work on branches owned by other
tasks, and folding it into a `FRAMEWORK` task is the scope violation the router
forbids.

## Known Limitations

**These are the reason this verdict is `PASS_WITH_RISKS` rather than `PASS`.**

- **No live PostgreSQL.** Nothing in this task needs one, but it means the ten
  `BLOCKED_INFRASTRUCTURE` scenarios seeded into the registry are recorded from
  reading their specs, not from running them.
- **No Obsidian vault configured.** Simulations 21, 22 and 23 — inbound
  retrieval, conflict classification, outbound graph validation — are verified as
  *mechanism* only: the code exists, is wired and is checked structurally.
  **A green run here does not prove any vault is correct.**
- **GitHub protection could not be written.** `develop` protection was designed,
  committed as `docs/development/develop-protection.json` and verified as absent;
  the `PUT` was refused by this environment's tooling policy. Recorded as
  `ITEM-0040`, `BLOCKED_EXTERNAL`.
- **Simulations 8, 19, 20, 25 are structural.** "No direct user-agent selection
  is required", "develop PR is optional", "main remains production-protected" and
  "a missing required agent prevents completion" are checks that the rule is
  written and wired, not executions of an agent conversation. A framework cannot
  simulate its own operator.
- **The QA plans were derived, not executed.** Twelve plans and fifty-eight
  scenarios describe what must be true; the `AUTOMATED` ones name tests that
  exist and are verified to exist, but this run did not execute the product test
  suites. CI did.
- **Three commits after the validated SHA** (`f64ba4e`) are documentation only —
  this run file, the engineering history and `git-ci-cost.md`. The integration
  SHA is revalidated before merge.

## Final QA Verdict

**PASS WITH RISKS**

Every gate this task introduced is executed rather than asserted: 1045 checks
including 32 behavioural simulations, and the two most important — an ordinary
session may not target `main`, and an id allocated on a sibling branch is not
handed out again — both fail against the unfixed state. The framework's own
`FRAMEWORK` definition of done is met.

The risks are the four Known Limitations above, and one of them matters more than
the rest: **the Obsidian half is verified as mechanism, not as behaviour.** No
vault exists in this checkout, so `--verify` has never read a real one. That is
stated rather than rounded up.

Separately — and not a risk introduced by this task — the repository carries
three open CRITICAL records, two of which (`BUG-0005`, `BUG-0006`) are live
authorization defects on the integration branch that were believed fixed until
this run. That is a finding *about* the repository, produced by the work; it does
not block this task, and it should block the next release.

## Follow-up

- **`BUG-0047` remediation** — land `agent/authz-batch0*`,
  `agent/authz-org-bu` and `agent/authz-feature-availability` through the ordinary
  lifecycle. Owner: Architect, as a separate `SECURITY` task. **Two CRITICALs are
  live until it does.**
- **`ITEM-0040`** — apply `develop` protection from an environment permitted to
  write it. Owner: Release/DevOps.
- **`ITEM-0041`** — decide whether the inert ruleset is deleted, repaired or
  accepted. Owner: repository owner.
- **Browser coverage** — Playwright now exists and covers two journeys. The
  authentication and runtime-module browser cases are written as scenarios and
  unautomated; closing them is ordinary QA work, not a framework change.
