# QA and CI Architecture

> Reverified against repository evidence at `d919e1a` on 2026-08-17.

## Why QA is a first-class role here

The defects this repository actually produces — a missing `tenantId` filter, a
permission declared in one family and not the other, a scope that fails open,
sensitive fields behind the wrong authorization — are **invisible to a passing
test suite**. Every one of them shipped past green tests.

"All tests pass" is therefore not a QA verdict, and a green CI run means no
*new* regression in the gated set, not that the design is sound.

## What can and cannot be tested

| Type | Status |
|---|---|
| `UNIT` | Available — jest |
| `INTEGRATION` / `API` | Available; 15 suites execute against ephemeral PostgreSQL in CI, currently report-only with 6 failing suites |
| `BROWSER_E2E` | Playwright is installed in `e2e/`; 2 journey specs run in CI, with 8 passing cases and 1 skipped assertion in the latest audited run |
| Component render | **Not possible** — web/admin jest run in a node environment with no jsdom |
| `DEPLOYMENT_SMOKE` | `scripts/smoke-deployment.mjs` |

The browser job is named by the required aggregate but remains fail-open through
job-level `continue-on-error`. Its artifact and test summary are evidence; the
aggregate conclusion alone is not. [[BUG-0049]].

## CI

`.github/workflows/ci.yml` — twelve jobs named behind a single
`CI required gate` check, plus one report-only known baseline
(`security-invariant-report`) that does not block. `database-e2e-report` was
the second such baseline and became a gate on 2026-08-20 ([[ITEM-0047]]).
Count them in `ci-required.needs`; a number written here goes stale.

The `database-migration` job stands up an **ephemeral PostgreSQL** and applies
the entire committed migration history to an empty database — which is exactly
what a new deployment does. `scripts/assert-test-database.mjs` fails closed on
any host it does not recognise as disposable.

**CI runs on push, not locally.** A local pass is not a CI pass: different Node
build, filesystem and cache.

### The merge gate

On a shared target — `main`, `develop`, `release/*`, `production`, `staging` —
`MERGE requires REMOTE_CI_STATUS = PASS`, read on the **exact SHA being
merged**. `BLOCKED_BY_ACCESS`, `UNAVAILABLE`, `UNKNOWN`, `PENDING` and `FAILED`
authorise nothing, and `ASSUMED_PASS` is not a value.

This exists because a task once merged and pushed `main` on an unread verdict.
Nothing broke, but the merge was authorised by inference on a branch other
people pull from.

**Branch protection is the other half and is not configured** — these rules
govern agents; branch protection governs everyone. [[ITEM-0014]].

## Classifying a failure before acting on it

`DETERMINISTIC_FAILURE` · `ENVIRONMENT_FAILURE` · `FLAKY_TEST` ·
`KNOWN_BASELINE` · `EXTERNAL_DEPENDENCY_FAILURE`.

**Only the last justifies an automatic retry.** Re-running anything else until
it goes green hides a defect and normalises instability.

Database failures have their own taxonomy, and only `TEST_INFRA_FAILURE`
justifies a retry. A `TENANT_ISOLATION_FAILURE` is **never** assumed to be a
test bug.

## Proving a regression

For a bug fix or security change, run the new test against the **unfixed** code
and record that it fails. A regression test that passes both with and without
the fix is decoration.

This is done here in practice: the 2026-08-15 run stashed each fix individually
and recorded 7, 4 and 3 failures respectively across three new specs.

## The durable record set

QA runs are **history**, never edited. Bug records, the regression register and
known bug patterns are **evergreen**, updated in place. One defect touches all
four, each carrying something the others do not — see
[[agent-engineering-architecture]].

## Related

[[agent-engineering-architecture]] · [[database-architecture]] ·
[[deployment-architecture]] · [[rbac]] · [[multi-tenancy]]

Source: `.agent/context/testing-architecture.md`, `.agent/agents/qa.md`,
`docs/qa/README.md`, `docs/development/ci.md`, `.github/workflows/ci.yml`.
