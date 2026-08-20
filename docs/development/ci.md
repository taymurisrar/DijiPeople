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

| Job | Command | Timeout | Required |
|---|---|---:|---|
| `resolve` | `node scripts/ci-evidence.mjs find` — exact-SHA evidence lookup | 5m | ✅ precondition |
| `validate` | `node scripts/validate-framework.mjs` | 10m | ✅ |
| `typecheck` | `npm run prisma:generate` → `prisma:validate` → `npm run typecheck` | 25m | ✅ |
| `lint` | `npx eslint` in web, admin, landing, **and services/api** + mutation guard | 25m | ✅ |
| `test-api` | `npm --workspace api run test` — whole suite, nothing excluded, dual-permission invariant included | 25m | ✅ |
| `test-web` | `npm --workspace web run test` | 15m | ✅ |
| `test-admin` | `npm --workspace admin run test` | 15m | ✅ |
| `test-landing` | `npm --workspace landing run test` | 15m | ✅ |
| `test-runtime` | runtime schema, platform domains, release CLI, app URLs, no-hardcoded-URLs | 15m | ✅ |
| `database-migration` | Ephemeral PostgreSQL → `node scripts/verify-database.mjs` | 30m | ✅ |
| `build` | `npm run build` | 30m | ✅ |
| `browser-e2e` | Playwright journeys (`e2e/`) against API + landing + admin | 30m | ✅ **genuinely blocking since 2026-08-18** |
| `database-e2e-report` | The e2e suites against an ephemeral PostgreSQL. Job key still says `-report`; its display name is `Database e2e` | 30m | ✅ **genuinely blocking since 2026-08-20** |
| `ci-required` | Aggregates the **thirteen** jobs above | 10m | ✅ **the one to require** |

`validate` runs without installing dependencies, so a structural break in the
agent framework fails in seconds rather than minutes.

### `needs:` is used for two things, and nothing else

Every job depends on `resolve` and on **nothing else**. `ci-required` aggregates
them. There are no sequencing edges left in this pipeline.

A `needs:` edge is legitimate only when the downstream job consumes an artifact,
a generated output, or an environment the upstream job created. Two edges were
removed on 2026-08-18 because neither did:

- `build` needed `typecheck` and `test-api` for fail-fast economy, but consumed
  nothing from either — it re-checks out, re-installs and re-generates Prisma
  itself. Measured in run 32160472427 that edge WAS the critical path: typecheck
  ended 16:33:39, Build ran 16:33:41→16:38:26, total run 10m14s for a Build
  needing 4m45s of its own.
- `database-e2e-report` needed `database-migration`, but creates its own
  PostgreSQL service and runs `verify-database.mjs` itself. The edge only bought
  a ~2.5 minute late start, which widened the window for a superseding push to
  kill it mid-suite.

### Every job is time-bounded

Before 2026-08-18 no job declared `timeout-minutes`, so all inherited GitHub's
360-minute default. When `maxWorkers: 1` landed in e9cad20 the database e2e step
went from 1m28s to 36 minutes and still unfinished — only a superseding push
stopped it. `scripts/validate-framework.mjs` now fails if any job omits a
timeout.

### `browser-e2e` is a real gate now

It carried `continue-on-error: true` while being named in `ci-required.needs`.
Such a job reports `success` to `needs.*.result` **even when it fails**, so the
aggregate could not see a browser failure at all — it was named as required and
was not one. The flag was removed on evidence of six consecutive green runs
(32148516356, 32159134980, 32160472427, 32167466971, 32169868091, 32173772663)
against a written criterion of three.

`validate-framework.mjs` now fails if any required job is fail-open this way, so
the hole cannot silently reopen.

BUG-0019 remains quarantined by name as a `test.fixme` and is still visible as a
skip. A skip does not fail a run, which is why it was never what made the flag
necessary — the condition that mattered was stability, and that is what was
measured.

---

## Concurrency, duplicate runs and cancelled runs

```yaml
group: ci-${{ github.workflow }}-${{ github.ref }}
cancel-in-progress: ${{ ref is neither main nor develop }}
```

`agent/*` runs supersede — that is what superseding is for. `develop` and `main`
do not, because on a shared branch every SHA is an integration point whose
evidence may still be needed.

### Exact-SHA evidence reuse

The Integrator integrates by ref-push, so develop's tip is **equal** to the
CI-verified SHA and GitHub fires a second complete pipeline for a byte-identical
tree. Fifteen of the nineteen develop SHAs measured on 2026-08-18 were exact
duplicates of an `agent/*` run that had already passed.

The `resolve` job looks for a completed run of this workflow on the same SHA in
which **every required job individually concluded `success`**, and skips the
pipeline when it finds one. Three properties make that safe:

1. The workflow file is part of the SHA, so a matching SHA cannot have been
   validated by a different pipeline.
2. The check is job-level, never run-level — a run's own conclusion is
   unreliable in both directions here.
3. `skipped` is never accepted as `success`, which stops evidence chaining off a
   SHA that nothing ever validated.

The required job list is derived from `ci-required.needs`, not copied into the
script, so adding a job automatically widens what counts as evidence.

### Reading a cancelled run

```bash
node scripts/ci-evidence.mjs classify --run <RUN_ID>
```

A `cancelled` run conclusion is **not** a failed gate. Runs 32167466971,
32169868091 and 32173772663 each concluded `cancelled` while their
`CI required gate` job had already succeeded — the only job killed was the
unbounded report-only one. Classification returns `PASS`, `FAILED`,
`SUPERSEDED_GATE_PASSED`, `SUPERSEDED_GATE_INCOMPLETE`,
`CANCELLED_MANUAL_OR_TIMEOUT` or `RUNNING`, and says whether the run is evidence.

### Metrics and regression triggers

```bash
npm run ci:metrics
```

Writes [`../ci/metrics/ci-metrics.md`](../ci/metrics/ci-metrics.md) and exits
non-zero on a firing trigger. Owned by Release/DevOps and deliberately **not**
wired into `ci.yml` — metrics change on every run, so a `--check` in the pipeline
would fail constantly and teach everyone to ignore it.

Full policy: [`.agent/context/ci-operations.md`](../../.agent/context/ci-operations.md).

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
