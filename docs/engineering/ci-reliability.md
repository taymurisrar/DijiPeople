# CI reliability

Evidence base: last 50 runs of `ci.yml` read through `gh` on 2026-11-03 (`node scripts/ci-doctor.mjs`). Method and tooling are reproducible; numbers below are measured, not estimated.

## Baseline (before)

| | Runs | Success | Failure | Cancelled |
|---|---|---|---|---|
| All | 50 | 7 (14%) | 36 (72%) | 7 (14%) |
| `develop` | 5 | 5 | 0 | 0 |
| `main` | 2 | 2 | 0 | 0 |
| `agent/starter-golive-qa` | 25 | 0 | 18 | 7 |
| `dependabot/*` (9 branches) | 18 | 0 | 18 | 0 |

**Trunk is green; the red rate is entirely feature-branch and Dependabot runs.** Headlines that treat "72% failing" as a platform problem are wrong — it is a branch-hygiene and dependency-pipeline problem, and different fixes apply.

## Causes (failed jobs, aggregate gate excluded)

| Cause | Where | Evidence | Class | Prevention |
|---|---|---|---|---|
| Framework validation + advisory check failing off-trunk | `agent/starter-golive-qa`, `dependabot/*` | "Validate agent framework" failed in 40 of the 43 non-passing runs and "No undocumented production advisories" in 35; on the QA branch (run 41472410252) the failing checks were framework simulations 26b/61/61b; `develop` passes both. The Dependabot branches' framework failures were not individually diagnosed | branch drift (probable; stale base) | `preflight` rejects >25 commits behind develop; rebase before push |
| Production advisory check | feature + dependabot | `check-production-advisories`: 19 advisories, 1 CRITICAL | dependency drift | resolved on `develop`; branches must rebase; never widen allowlist (SEC-004) |
| `npm ci` EUSAGE | `dependabot/.../electron-42.11.16` (2 runs) | log: `EBADENGINE required npm 11.x, current npm 10.9.9` then `EUSAGE` | **workflow config + tool drift** | `setup-node` `22.x` ships npm 10; repo requires npm 11 — see R-2 below |
| Type error in e2e workspace | `agent/starter-golive-qa` | `TS2551 QA_TENANT_C_SLUG does not exist on QaEnv` (12 runs) | application | `preflight --full` / typecheck before push |
| `DEVELOP_CONTAINS_MAIN could not be checked — origin/main or origin/develop is not fetched` | every `Framework validation` run | log line in run 41472410252 | **workflow config** (shallow checkout) | the new governance workflow uses `fetch-depth: 0`; same change recommended for the `validate` job (R-2) |
| `CI required gate` | all | derived job, 41 occurrences | not a cause | `ci-doctor` excludes it |

Not observed in this sample: flaky-test failures, runner timeouts, network failures, port conflicts. The classifier covers them (retry only the transient classes, once, evidence kept) so they will be named when they occur.

## Controls added (this branch)

- `scripts/ci-doctor.mjs` — read-only classification; first-failure evidence written once, never overwritten; tests built from real log excerpts.
- `scripts/preflight.mjs` — engines (node 22 / npm 11), branch staleness, lockfile version, API/module gates, governance tests; `--full` adds framework validation, advisories, typecheck.
- `.github/workflows/governance.yml` — fast, dependency-free PR path + nightly read-only trend. Not part of `CI required gate` (CI-004: policy change needs review).
- `.github/workflows/ci-failure-report.yml` — on a failed `CI` run, writes the diagnosis to the run summary and uploads first-failure evidence. Uses the default branch's classifier, never the failing branch's code.
- `scripts/hooks/guard-bash.mjs` — blocks `--no-verify`, `git push` to main, force-push (CI-003).

## Recommended, needs owner review (not applied: they alter the shared required gate)

- **R-2a** Pin npm 11 in every job: `npm install -g npm@11` after `setup-node` (or `package-manager-cache` + corepack). Fixes the Dependabot `EUSAGE` class. Fifteen jobs share the pattern — extract a composite action `./.github/actions/setup` so it changes in one place and reduces ~15 duplicated install blocks.
- **R-2b** `fetch-depth: 0` (or fetch `origin/main` + `origin/develop`) in the `validate` job so `DEVELOP_CONTAINS_MAIN` is checked rather than silently skipped.
- **R-2c** Add `.github/dependabot.yml` (none exists) with grouped updates and the npm version pinned, so security PRs stop arriving with incompatible lockfiles.
- **R-2d** Add "Governance gates" to branch protection once stable for a week.
- **R-2e** `merge_group` trigger: confirm whether a merge queue is enabled on `develop`/`main` (`npm run branch:policy`); only then add the event to required workflows. Not assumed.

## Retry policy

A retry is a diagnosis, not a fix. Allowed once, only for `NETWORK_TRANSIENT` and `RUNNER_TIMEOUT`, after confirming the duration is in family with prior runs. A failing test, type error, lint error or advisory is never retried; the first failure's log excerpt + sha256 is preserved before anything else happens.

## Self-healing boundaries

Automated: collect, classify, summarise, preserve evidence. Not automated by design: opening PRs that change CI policy, relaxing a check, rerunning failed tests, merging. A remediation issue/PR can be created from `ci-doctor` output by an agent under review; posting needs a write-scoped token the owner has not granted.
