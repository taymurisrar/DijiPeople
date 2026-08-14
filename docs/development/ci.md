# CI

**Platform: GitHub Actions.** The remote is GitHub and no other CI system was
configured — verified: no `.github/`, no `.gitlab-ci.yml`, `Jenkinsfile`,
`.circleci`, `azure-pipelines.yml`, `.travis.yml` or `bitbucket-pipelines.yml`.

Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
Branch protection: [`branch-protection.md`](branch-protection.md).
Roadmap: [`ci-recommendation.md`](ci-recommendation.md).

---

## Two rules the pipeline enforces mechanically

**1. CI never mutates the checkout.** The repository's own `npm run lint` runs
`eslint --fix` in `services/api`. That command is never used in CI. ESLint is
invoked directly in check-only mode, and the `lint` job ends with a step that
fails if `git status --porcelain` is non-empty — so if a lint step ever regains
`--fix`, CI fails instead of silently passing against rewritten files.

**2. CI never touches a real database.** `prisma.config.ts` resolves the
datasource eagerly, so `DATABASE_URL` must be *set* for `generate` and
`validate` — but neither connects. A placeholder is used throughout. No
production or staging credentials exist in the workflow.

---

## Jobs

| Job | Command | Required |
|---|---|---|
| `validate` | `node scripts/validate-framework.mjs` | ✅ |
| `typecheck` | `npm run prisma:generate` → `prisma:validate` → `npm run typecheck` | ✅ |
| `lint` | `npx eslint` in web, admin, landing + mutation guard | ✅ |
| `test-api` | `npm --workspace api run test` (one test excluded by name) | ✅ |
| `test-web` | `npm --workspace web run test` | ✅ |
| `test-admin` | `npm --workspace admin run test` | ✅ |
| `test-runtime` | `npm run test:runtime-schema` | ✅ |
| `database-migration` | Ephemeral PostgreSQL → `node scripts/verify-database.mjs` | ✅ |
| `build` | `npm run build` (needs typecheck + test-api) | ✅ |
| `ci-required` | Aggregates the nine above | ✅ **the one to require** |
| `database-e2e-report` | The 9 e2e suites against an ephemeral PostgreSQL | ❌ report only |
| `lint-api-report` | `npx eslint` in services/api | ❌ report only |
| `security-invariant-report` | Dual-permission wiring invariant | ❌ report only |

`validate` runs without installing dependencies, so a structural break in the
agent framework fails in seconds rather than minutes.

`build` is gated behind `typecheck` and `test-api` because it is the slowest job
(~6 minutes locally) — an obvious break should fail fast.

---

## The database jobs

Both use a `postgres:16-alpine` **service container**: created fresh for the
job, reachable only from it, destroyed with the runner. Nothing persists, so
there is no cleanup step to forget and no shared state between runs. Service
containers are per-job, so the two databases cannot collide.

Credentials are synthetic (`ci` / `ci`) and deliberately **not** repository
secrets — storing them as secrets would imply they protect something.

**`database-migration` (required)** proves what a developer's machine cannot: a
developer database already holds the schema, so a broken migration history still
appears to work locally. Applying the whole history to an *empty* database is
the only thing that tests the history itself.

```
assert the target is disposable   scripts/assert-test-database.mjs
  → prisma generate
  → prisma migrate deploy          never `migrate dev` in CI
  → prisma migrate status          must report fully applied
  → seed:config → seed:verify
```

**`database-e2e-report` (report only)** runs the nine e2e suites against a
second ephemeral database. It is not required **yet** because those suites have
never run in CI and have not been observed passing here — requiring them on
arrival risks a permanently red gate, which trains people to ignore CI.

**Promotion criteria** — move it into `ci-required` when all hold:

1. every suite classified `READY` passes three consecutive runs
2. suites needing fixtures or environment are fixed, or quarantined by name with
   the reason recorded in `docs/qa/`
3. total runtime stays under ~10 minutes

### Database failure classification

`MIGRATION_FAILURE` · `SEED_FAILURE` · `CONSTRAINT_FAILURE` ·
`E2E_PRODUCT_FAILURE` · `TEST_INFRA_FAILURE` · `TENANT_ISOLATION_FAILURE` ·
`DATA_CLEANUP_FAILURE`

**Only `TEST_INFRA_FAILURE` may be retried.** A migration that fails
intermittently has a real ordering problem, and retrying hides it. Never weaken
a migration to make the gate green.

### Not yet automated

**Upgrade-from-previous-schema.** `database-migration` proves a *new*
installation works; it does not prove an *existing* database upgrades cleanly,
which is the case that actually breaks. The manual procedure is in
[`../../.agent/agents/database.md`](../../.agent/agents/database.md); automating
it is the next step for this job.

---

## The one excluded test, and why it is excluded by name

`test-api` runs:

```
npm --workspace api run test -- \
  --testNamePattern "^(?!.*declares both permission systems).*$"
```

This excludes exactly one test: the dual-permission wiring invariant.

**It is excluded by name, not by path, on purpose.** The same file
(`wiring-invariants.spec.ts`) holds four other invariants that currently pass —
permissions granted to a role, role grants being defined permissions, settings
menu wiring, and filter-operator support. Excluding the *file* would have been
easier and would have silently stopped gating those four as well.

Verified locally: **127 suites pass, 764 tests pass, 1 skipped.**

The excluded invariant still runs in full in `security-invariant-report`, which
uploads its inventory as an artifact and writes it to the job summary.

---

## Known baselines

Two checks report without gating. Neither is weakened.

**Dual-permission invariant** — 780 violations across 878 in-scope handlers.
Gating would block every unrelated PR on pre-existing debt. Promote when the
count reaches zero.

**`services/api` lint** — 2 pre-existing errors, both
`@typescript-eslint/unbound-method` in `src/modules/auth/auth.service.spec.ts`
lines 120 and 125, plus ~815 warnings. Fix the two errors and the step moves
into the required `lint` job.

Both are tracked in [`ci-recommendation.md`](ci-recommendation.md). A baseline
that is never promoted becomes permanent debt — these should be revisited, not
inherited.

---

## Not yet in CI

| Check | Why not | Path forward |
|---|---|---|
| **e2e** (9 suites) | Require a live PostgreSQL database | Add a `postgres:16` service container, run migrations against it, then the suites. Phase 2 |
| **Migration application** | Same | Same ephemeral database; create → migrate → verify → destroy |
| **Gateway** (.NET) | Needs the .NET SDK; separate toolchain | `dotnet build`/`test` in a job with `actions/setup-dotnet` |
| **Electron** | Windows-only packaging | Only if installer regressions become a real problem |
| **Deployment readiness** | Needs environment credentials | After deployment policy is defined |

**Never** use production credentials for any of these.

---

## Failure classification

When CI is red, classify before acting. Never re-run until green.

| Class | Meaning | Action |
|---|---|---|
| `DETERMINISTIC_FAILURE` | Fails consistently; the change caused it | Owning specialist fixes |
| `ENVIRONMENT_FAILURE` | Runner, network or toolchain | Fix the workflow; do not touch product code |
| `FLAKY_TEST` | Passes and fails on identical input | Record in QA knowledge, then fix or quarantine deliberately |
| `KNOWN_BASELINE` | Pre-existing, already non-gating | No action; do not let it grow |
| `EXTERNAL_DEPENDENCY_FAILURE` | Registry or third-party outage | Retry is legitimate here — and only here |

**Automatic retry is permitted only for `EXTERNAL_DEPENDENCY_FAILURE`.**
Retrying anything else hides a real defect and normalises instability.

A flaky test is a defect with a scheduling component, not an act of nature.
Record it in `docs/qa/` with the evidence, then fix it or quarantine it
explicitly — never leave it silently re-running.

---

## Ownership when CI is red

| Role | Responsibility |
|---|---|
| **Specialist agent** | Owns failures caused by its implementation |
| **QA** | Interprets test and regression failures; classifies flakiness |
| **Reviewer** | Decides whether a failure reveals an architecture or security problem |
| **Integrator** | **Does not merge while required CI is red — and never merges into a shared target without a verified PASS** |
| **Release/DevOps** | **Does not promote a release while required CI is red** |

"Tests passed locally" is **not** a substitute for CI when CI is available and
has not passed. Local runs use a different Node version, a different filesystem
and a warm cache.

---

## The shared-target merge gate

Where the target is shared — `main`, `develop`, `release/*`, `production`,
`staging`, or anything policy marks protected — and CI is configured:

```
MERGE requires REMOTE_CI_STATUS = PASS, read on the exact SHA
```

Nothing else authorises it: not `BLOCKED_BY_ACCESS`, not `UNAVAILABLE`, not
`UNKNOWN`, not `PENDING`, not `FAILED`, and certainly not `ASSUMED_PASS`, which
is not a value at all.

When the verdict cannot be read: **push the task branch** — always allowed, it
starts CI and preserves the work — then stop with
`MERGE_STATUS = BLOCKED_CI_UNVERIFIED` and
`TASK_STATUS = BLOCKED_FINALIZATION`. Do not push the target.

> This exists because a task merged and pushed `main` on
> `REMOTE_CI_STATUS = BLOCKED_BY_ACCESS`. Local gates were green and nothing
> broke — but the merge was authorised by inference, on a branch other people
> pull from.

Full rule:
[`.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

**Branch protection is the enforcement half of this** — see
[`branch-protection.md`](branch-protection.md). Framework rules constrain agent
behaviour; branch protection constrains everyone, including humans, other Git
clients and direct pushes. Both are required, and this repository currently has
only the first.
