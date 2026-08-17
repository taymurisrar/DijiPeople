# CI

**Platform: GitHub Actions.** The remote is GitHub and no other CI system is
configured — verified at `78072d2`: no `.gitlab-ci.yml`, `Jenkinsfile`,
`.circleci`, `azure-pipelines.yml`, `.travis.yml` or `bitbucket-pipelines.yml`.
`.github/workflows/` holds `ci.yml` and `release-app.yml`.

> This sentence used to include "no `.github/`" in that list, which contradicted
> the very next line pointing at `.github/workflows/ci.yml`. Left over from
> before CI existed; corrected 2026-08-16.

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
| `test-api` | `npm --workspace api run test` — whole suite, nothing excluded, dual-permission invariant included | ✅ |
| `test-web` | `npm --workspace web run test` | ✅ |
| `test-admin` | `npm --workspace admin run test` | ✅ |
| `test-landing` | `npm --workspace landing run test` | ✅ |
| `test-runtime` | runtime schema, platform domains, release CLI, app URLs, no-hardcoded-URLs | ✅ |
| `database-migration` | Ephemeral PostgreSQL → `node scripts/verify-database.mjs` | ✅ |
| `build` | `npm run build` (needs typecheck + test-api) | ✅ |
| `browser-e2e` | Playwright journeys (`e2e/`) against API + landing + admin | ⚠️ named by `ci-required`, but fail-open through `continue-on-error: true` |
| `ci-required` | Aggregates the **eleven** jobs above | ✅ **the one to require** |
| `database-e2e-report` | The e2e suites against an ephemeral PostgreSQL | ❌ report only — read its `RESULT:` line, not its conclusion |

`validate` runs without installing dependencies, so a structural break in the
agent framework fails in seconds rather than minutes.

`build` is gated behind `typecheck` and `test-api` because it is the slowest job
(~6 minutes locally) — an obvious break should fail fast.

`browser-e2e` appears in `ci-required.needs`, but its job-level
`continue-on-error: true` converts a failing browser step into a successful
dependency result. It is therefore structurally listed but not yet a genuine
blocking gate. The latest audited execution was 8 passed and 1 skipped; the
skip is the stale BUG-0019 reachability assertion, not a passing scenario.

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

**`database-e2e-report` (report only)** runs all fifteen e2e suites against a
second ephemeral database. WP-02 exact-SHA runs `32020076245` and `32021401010`
both had the same 8 passing and 7 failing suites; test totals varied between
79–80 passing and 147–148 failing. Post-merge run `32022417483` shifted to 10
passing / 5 failing suites and 99 passing / 128 failing tests, so two suites are
also run-variable. This job is not eligible for promotion. The workflow records
the failing exit code but does not return it, which is tracked by [[BUG-0049]].

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

## The excluded test that no longer is

`test-api` now runs the whole suite:

```
npm --workspace api run test
```

Until 2026-08-17 it carried a negative lookahead excluding exactly one test by
name — the dual-permission wiring invariant — because that invariant failed
against a large pre-existing inventory. It was excluded by *name* rather than by
*path* on purpose: `wiring-invariants.spec.ts` holds four other invariants that
did pass, and dropping the file would have silently stopped gating those too.

**WP-03 removed the reason.** The inventory went from 796 violations to 0, so
the exclusion and the separate `security-invariant-report` job were both deleted
and the invariant became an ordinary required test. See BUG-0049 and ITEM-0043.

If it fails now, a route was added behind `PermissionsGuard` declaring only one
of the two permission families. Fix the route; do not restore the exclusion.

---

## Known baselines

One check reports without gating, and it is not weakened.

**`database-e2e-report`** — the fifteen database-backed e2e suites. Non-gating
while its baseline is red, but as of BUG-0049 its summary opens with an explicit
`RESULT: PASS` / `RESULT: FAIL (jest exit N)` line and annotates a warning when
red. **Read that line, never the job conclusion** — the job concludes `success`
regardless, and a QA run once copied "all jobs green" from that conclusion over
136 failed tests. Promote when the suites pass.

Both former baselines have now been promoted:

- **Dual-permission invariant** — was 796 violations across 894 in-scope
  handlers. WP-03 took it to 0; it runs inside required `test-api` since
  2026-08-17.
- **`services/api` lint** — was 2 `@typescript-eslint/unbound-method` errors;
  promoted into the required `lint` job on 2026-08-17.

A baseline that is never promoted becomes permanent debt, and a report-only job
does not hold a baseline still — it only stops anyone noticing it grow.

---

## Not yet in CI

| Check | Why not | Path forward |
|---|---|---|
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
