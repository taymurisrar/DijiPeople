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
| `build` | `npm run build` (needs typecheck + test-api) | ✅ |
| `ci-required` | Aggregates the eight above | ✅ **the one to require** |
| `lint-api-report` | `npx eslint` in services/api | ❌ report only |
| `security-invariant-report` | Dual-permission wiring invariant | ❌ report only |

`validate` runs without installing dependencies, so a structural break in the
agent framework fails in seconds rather than minutes.

`build` is gated behind `typecheck` and `test-api` because it is the slowest job
(~6 minutes locally) — an obvious break should fail fast.

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
| **Integrator** | **Does not merge while required CI is red** |
| **Release/DevOps** | **Does not promote a release while required CI is red** |

"Tests passed locally" is **not** a substitute for CI when CI is available and
has not passed. Local runs use a different Node version, a different filesystem
and a warm cache.
