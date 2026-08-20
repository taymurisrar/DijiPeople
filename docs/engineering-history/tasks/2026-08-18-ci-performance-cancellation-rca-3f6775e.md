# Engineering History — CI performance, cancellation RCA and autonomous CI adaptation

| | |
|---|---|
| **Task Title** | CI performance, cancellation RCA and autonomous CI adaptation |
| **Task Type** | FRAMEWORK / INFRA |
| **Date** | 2026-08-18 |
| **Session** | SESSION-0014 |
| **Architect Plan** | NOT_APPLICABLE — diagnosis-led. The change set could not be specified before the run history was measured, and the task explicitly required measurement before implementation. |
| **Agents Used** | Release/DevOps (lead — CI runtime), Integrator (run sequencing, exact-SHA following), QA (test topology and duplication), Reviewer (gate integrity). No domain specialist was needed: no job required backend, frontend or database knowledge to analyse. Database agent deliberately NOT used — `maxWorkers: 1` was left alone rather than tuned. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/ci-performance-adaptation` |
| **Base SHA** | `aa335249839fa1c44449b5b620ab2e3c5936e37a` |
| **Target Branch** | `develop` |
| **Implementation SHA** | `3f6775e0c7f6a387d97460e04dc8adc25f8a4163` |
| **CI Run (implementation)** | 32178458380 — `CI required gate` success at 20:01:06Z |
| **Merge Commit** | none — fast-forward ref-push, so develop's tip IS the CI-verified SHA |
| **Final Target SHA** | `3f6775e0c7f6a387d97460e04dc8adc25f8a4163` |

## What was measured, before anything was changed

Nineteen completed `develop` runs preceding `aa33524`, plus every `agent/*` run
in the same window, read through the Actions REST API at job and step level.

| Metric | Value |
|---|---|
| Median total run | 8m54s |
| p95 total run | 28m33s |
| SHAs that ran the full pipeline twice | **15 of 19** |
| Cancelled runs | 3, all on `develop` |
| Unexpected cancellations | 0 |

Slowest jobs by median: `browser-e2e` 8m01s (p95 12m57s), `database-e2e-report`
4m38s (p95 25m56s), `build` 4m22s, `lint` 3m28s, `typecheck` 2m43s.

## The five findings

### 1. Every integration ran the pipeline twice

The Integrator integrates by ref-push, so `develop`'s tip is deliberately
**equal** to the CI-verified SHA. GitHub fires a second complete pipeline for a
byte-identical tree.

`agent/database-e2e-determinism`@2d6cf1a3 → success, then `develop`@2d6cf1a3 →
a second full run. Fifteen of nineteen develop SHAs matched this shape.

Invisible because duplication is a **cross-branch** property: counting runs per
SHA within `develop` alone reports zero every time.

### 2. `build` was the critical path, for no artifact

`needs: [typecheck, test-api]`, added for fail-fast economy. Build consumes
nothing from either — it re-checks out, re-installs and re-generates Prisma
itself.

Run 32160472427: typecheck ended 16:33:39, Build ran 16:33:41→16:38:26, total
run 10m14s for a Build needing 4m45s of its own.

`database-e2e-report` had the same shape: `needs: [database-migration]` while
creating its own PostgreSQL service.

### 3. The cancelled runs had already passed

Runs 32167466971, 32169868091 and 32173772663 each concluded `cancelled` while
their `CI required gate` job had **already succeeded**. The only job killed was
the report-only database e2e job.

That job declared no `timeout-minutes`, so it inherited GitHub's 360-minute
default. After `maxWorkers: 1` landed in e9cad20 its suite step went from 1m28s
to 36 minutes unfinished, and was still running when the next push superseded
the run.

Classification of the whole sample:

| Class | Count | Expected? |
|---|---|---|
| `PASS` | 16 | — |
| `SUPERSEDED_GATE_PASSED` | 3 | Yes — evidence survived, only the signal was lost |
| `SUPERSEDED_GATE_INCOMPLETE` | 4 (`agent/*`) | Yes — four pushes in eight minutes |
| `CANCELLED_MANUAL_OR_TIMEOUT` | 0 | — |

No cancellation was manual, none was a timeout, and none was caused by the
Architect or the Integrator directly.

### 4. A required job that was not required

`browser-e2e` was named in `ci-required.needs` while carrying
`continue-on-error: true`. Such a job reports `success` to `needs.*.result`
**even when it fails** — the aggregate could not see a browser failure at all.

The workflow's own comment acknowledged this and deferred removal until the
BUG-0019 skip became a passing assertion. That was the wrong condition: a
`test.fixme` does not fail a run, so it was never what made the flag necessary.

### 5. Why the framework had not adapted

It read exactly **one bit** out of CI: did the gate pass. `REMOTE_CI_STATUS` has
values for `PASS`, `FAILED`, `PENDING`, `UNAVAILABLE`, `BLOCKED_BY_ACCESS` — and
none for *how long*, *how often cancelled*, or *what the critical path is*.

Grepping `.agent/` for any timing, duration, cancellation or critical-path
awareness returned **one incidental line**, in an unrelated context. The
Integrator's "Waiting for CI is not a place to stop" section told the agent to
watch a run and react to pass/fail, and nothing else.

So the gap was not that an agent ignored a signal. **The signal was never read.**

## What was changed

| Change | Effect |
|---|---|
| `resolve` job — exact-SHA evidence lookup | Eliminates the duplicate pipeline |
| `build` and `database-e2e-report` `needs:` removed | Build off the critical path |
| `timeout-minutes` on every job | No job can inherit the 360-minute default |
| `develop` excluded from `cancel-in-progress` | Integration evidence is preserved |
| `continue-on-error` removed from `browser-e2e` | The gate can finally see a browser failure |
| Turborepo + Playwright caches | Build and browser setup |
| `scripts/ci-evidence.mjs` | Evidence reuse + cancellation classification |
| `scripts/ci-metrics.mjs` | Rolling metrics + five regression triggers |
| 3 new `validate-framework` checks | The gains cannot silently regress |
| `.agent/context/ci-operations.md` + 3 role updates | The framework can now react |

## Validation

`node scripts/validate-framework.mjs` — 2597 checks, pass. It grew from 2580;
the count check it already carried caught the documented job-count drift my own
change introduced (eleven → twelve), which is the check working.

**Mutation tests.** A check that only asserts a file mentions something still
passes after the behaviour is deleted, so each new check was verified against a
deliberate regression:

| Mutation | Result |
|---|---|
| Re-add `continue-on-error: true` to `browser-e2e` | **Caught** |
| Strip `timeout-minutes` from `build` | **Caught** |
| Remove `resolve` from `ci-required.needs` | **Caught** |
| Drop `browser-e2e` from the gate | Required-job list shrank 11→10 — derived, not hardcoded |
| Rename the `Browser e2e` job | Followed the rename |
| Gate needs only `resolve` | Threw rather than passing vacuously |
| Gate needs a job that does not exist | Threw |

The first M1 attempt reported a pass; the mutation had not applied, because
backticks in a double-quoted shell string were expanded before Python saw them.
Re-run correctly, it was caught. Worth recording: a mutation test that "passes"
is only meaningful once you have confirmed the mutation landed.

`node scripts/ci-evidence.mjs classify` was run against all five real outcome
classes in the history — three `SUPERSEDED_GATE_PASSED`, one
`SUPERSEDED_GATE_INCOMPLETE`, one `FAILED` — and agreed with manual inspection
in every case.

Backlog, tasks, QA, sessions and dashboards all `--check` clean.

`npm run typecheck` NOT_REQUIRED and not run: the change set contains no
TypeScript. Confirmed with `git diff --cached --name-only | grep -E '\.tsx?$'` —
empty.

## Findings recorded

| Record | Disposition | Why |
|---|---|---|
| ITEM-0055 — database e2e serial runtime | `DEFER` | Report-only, now bounded; the fix is per-worker databases and needs an ExecPlan. `maxWorkers: 1` must NOT be reverted — that reopens ITEM-0047 |
| ITEM-0056 — cache hit rate not observable | `DEFER` | Platform limitation; `JOB_DURATION_REGRESSION` catches the symptom. Deliberately not `ACCEPTED_RISK`, which requires a recorded human acceptance that was never sought |

Nothing left `TRIAGE_REQUIRED`.

## Conflicts and Conflict Resolutions

None. `SAFE_PARALLEL` against SESSION-0003 and SESSION-0015 throughout;
SESSION-0015 is product work and touched none of the CI, `.agent/` or `scripts/`
paths this session wrote.

## The implementation defect that running it exposed

The first version of `find` filtered candidate runs on
`run.status === 'completed'`. Integrating to develop proved that wrong within
minutes: the report-only `database-e2e-report` job keeps a run `in_progress`
long after the required gate has passed, so develop@3f6775e found no eligible
candidate and re-ran the whole pipeline against a tree run 32178458380 had
already proven — exactly the duplication the job exists to eliminate.

It is the same error the rest of this work is about, made one level up. Evidence
is a property of the **required jobs**, not of the run envelope. A job conclusion
is terminal once set, so eleven green required jobs mean the same thing whether
or not a non-gating job is still writing its report. A still-running required job
has `conclusion: null`, which is not `success`, so `evaluateRun` rejects it
anyway: the safety was always in the job check, and the run-level filter only
ever discarded valid evidence.

Verified live against run 32178458380 while it was still `in_progress` with all
eleven required jobs green — `reuse=true`, evidence run named correctly.

Recorded rather than quietly patched, because "read the job level, never the run
level" was already the stated principle and it still got applied incompletely.
