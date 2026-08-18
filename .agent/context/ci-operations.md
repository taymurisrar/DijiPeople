# CI Operations

> **Last verified:** 2026-08-18
> **Verified against commit:** aa33524
> **Key source files:** `.github/workflows/ci.yml`, `scripts/ci-evidence.mjs`,
> `scripts/ci-metrics.mjs`, `docs/ci/metrics/ci-metrics.md`,
> `docs/development/ci.md`

Owner: **Release/DevOps**, with the Integrator owning run sequencing and the
Architect owning triage of anything this document tells them to notice.

---

## CURRENT

### Why this document exists

Until 2026-08-18 the framework read exactly **one bit** out of CI: did the
`CI required gate` check pass on the exact SHA. That is the correctness
question, and it was answered well. Nothing read a duration, a queue time, a
cancellation class, or the critical path — so nothing in the framework could
notice that CI had a problem, and four separate problems accumulated unseen:

| What was wrong | How long it was invisible |
|---|---|
| Every integrated SHA ran the whole pipeline **twice** | For as long as ref-push integration has existed |
| The database e2e step went **1m28s → 36 min, unbounded** | Since e9cad20, ~3 hours, still growing |
| Three consecutive `develop` runs reported `cancelled` **while their gate had passed** | Until a human looked at the GitHub UI |
| `build` sat behind `typecheck` on the critical path for **no artifact** | Since the job was written |

A human noticing CI is slow from a screenshot is the failure mode this closes.
`REMOTE_CI_STATUS = PASS` remains necessary and is no longer sufficient
awareness.

### The pipeline, as it actually runs

`.github/workflows/ci.yml`. One workflow, thirteen jobs plus an aggregate gate.

```
resolve  ─┬─ validate                  ┐
          ├─ typecheck                 │
          ├─ lint                      │
          ├─ test-api                  │
          ├─ test-web                  ├─ all parallel, all gated on `resolve`
          ├─ test-admin                │  and on nothing else
          ├─ test-landing              │
          ├─ test-runtime              │
          ├─ database-migration        │
          ├─ build                     │
          ├─ browser-e2e               ┘
          └─ database-e2e-report          (report only — NOT in the gate)
                     ↓
              ci-required  ← the single check branch protection keys on
```

**`needs:` is used for exactly two things now: the evidence resolver, and the
aggregate gate.** No job waits on another for sequencing. A `needs:` edge is
legitimate only when the downstream job consumes an artifact, a generated
output, or an environment the upstream job created. `build` had `needs:
[typecheck, test-api]` and consumed nothing from either — it re-checked out,
re-installed and re-generated Prisma itself — so that edge was pure serial time
on the critical path.

### The critical path

Measured across the 19 develop runs before this change:

| Job | Median | p95 |
|---|---:|---:|
| **Browser e2e** | **8m01s** | **12m57s** |
| Database e2e (report only) | 4m38s | 25m56s |
| Build | 4m22s | 5m15s |
| Lint | 3m28s | 5m40s |
| Typecheck | 2m43s | 3m51s |
| Database migration gate | 2m27s | 2m43s |
| API tests | 1m37s | 5m00s |

**`browser-e2e` is the critical path**, and it is the only job that can be.
Everything else finishes inside its median. It carries more environmental
surface than any other gate — a PostgreSQL service, a migrated and seeded
database, a browser binary, three dev servers and a real login — and roughly
half its wall clock is that setup, not the assertions.

Do not add a `needs:` edge in front of it, and do not put a new job behind
anything. If a new job is slower than `browser-e2e`, it becomes the critical
path and this table is stale — re-measure with `npm run ci:metrics`.

### Concurrency policy

```yaml
group: ci-${{ github.workflow }}-${{ github.ref }}
cancel-in-progress: ${{ ref is neither main nor develop }}
```

| Ref | Superseding cancels? | Why |
|---|---|---|
| `agent/*` | **Yes** | This is what superseding is for. Four pushes in eight minutes should not hold four runners. |
| `develop` | **No** | Every develop SHA is an integration point whose evidence may still be needed. |
| `main` | **No** | Release decisions depend on these. |

Excluding only `main` was the earlier policy and it was wrong in a specific way:
a develop push cancelled the previous develop run, and because the report-only
database e2e job was unbounded it was usually still running, so the *run* went
`cancelled` even though the gate had already passed. The evidence survived; the
signal did not.

Not cancelling develop is nearly free now, because an integrated develop SHA is
byte-identical to the `agent/*` SHA that just passed and therefore skips.

### Exact-SHA evidence reuse

The Integrator integrates by ref-push, which deliberately keeps develop's tip
**equal** to the CI-verified SHA. GitHub then fires a second complete pipeline
for a byte-identical tree. Fifteen of the last nineteen develop SHAs were exact
duplicates of an `agent/*` run that had already passed.

The `resolve` job asks one question: **has this exact SHA already had every
required job conclude `success` in an earlier run of this workflow?** If yes,
every heavy job skips and `ci-required` records which run carries the evidence.

Three rules make this safe, and none may be relaxed:

1. **The workflow file is part of the SHA.** A matching SHA cannot have been
   validated by a different pipeline.
2. **The check is job-level, never run-level.** A run's own conclusion lies in
   both directions here — `cancelled` runs whose gate passed are valid, and a
   run-level check could accept a run that was itself a reuse.
3. **`skipped` is never accepted as `success`.** This is what stops evidence
   chaining off a SHA that nothing ever actually validated.

The required job list is **derived** from `ci-required.needs` in the workflow,
not copied into the script. Adding a job to the gate automatically widens what
counts as evidence; a hardcoded list would silently accept a SHA that never ran
the new job.

### Cancellation classes

`node scripts/ci-evidence.mjs classify --run <id>` returns one of:

| Class | Evidence? | Expected? |
|---|---|---|
| `PASS` | Yes | — |
| `FAILED` | No | — |
| `SUPERSEDED_GATE_PASSED` | **Yes** | Expected. Only non-gating work was killed. |
| `SUPERSEDED_GATE_INCOMPLETE` | No | Expected on `agent/*`; **unexpected** on a shared branch. Follow the superseding run. |
| `CANCELLED_MANUAL_OR_TIMEOUT` | No | **Unexpected.** No superseding run exists — manual, a job timeout, or infrastructure. |
| `RUNNING` | Not yet | — |

**A yellow icon is not a verdict.** Never record a cancelled run as a failure,
and never record one as a pass, without running this.

### Every job is time-bounded

Each job declares `timeout-minutes`. Before 2026-08-18 none did, so every job
inherited GitHub's 360-minute default — which is how `database-e2e-report` was
able to run for 36 minutes and would have run for six hours had nothing
superseded it. A report-only job must never be able to hold a runner that long.

A job hitting its timeout is a real signal. Raise the limit only with evidence
that the work legitimately grew; otherwise find out what is hanging.

---

## Adaptation — what the framework now notices

`npm run ci:metrics` writes `docs/ci/metrics/ci-metrics.md` and a rolling
`baseline.json`, and exits non-zero when a trigger fires:

| Trigger | Threshold |
|---|---|
| `JOB_DURATION_REGRESSION` | Median > 1.3× baseline **and** > 60s absolute growth |
| `QUEUE_REGRESSION` | Median queue > 60s — usually external runner availability |
| `CANCELLATION_SPIKE` | > 20% of runs cancelled without a completed gate |
| `FLAKY_JOB` | The same job both passed and failed **on the same commit** |
| `DUPLICATE_RUN_STORM` | Any SHA ran the full pipeline more than once |

Cache hit rate is deliberately reported as `NOT_OBSERVABLE`: it is not in the
Actions REST API, only in raw step logs. Inferring it from step durations and
presenting the guess as a metric would be worse than not having it — ITEM-0056.

**A firing trigger is a finding, and findings do not live in reports.** The
Architect triages it exactly like a QA finding — `FIX_NOW`, `PLAN_REQUIRED`,
`DEFER`, `PRODUCT_DECISION`, `BLOCKED_EXTERNAL` or `ACCEPTED_RISK`.

### When to run it

CI optimisation is **not** a per-task activity, and the metrics script is
deliberately **not** wired into `ci.yml` — metrics change on every run, so a
`--check` in the pipeline would fail constantly and teach everyone to ignore it.

Release/DevOps runs it when any of these is true:

```
CI_SLOW                      a run took materially longer than the recorded median
CI_CANCELLED_REPEATEDLY      more than one cancellation in a session
CI_DUPLICATED                the same SHA ran the full pipeline twice
CI_FLAKY                     a job disagreed with itself on one commit
CI_CRITICAL_PATH_REGRESSION  the slowest job changed identity
```

and otherwise on a release, or when a task changes `ci.yml` itself.

---

## Rules

- **Never accept a cancelled run as a pass** without `ci-evidence.mjs classify`
  saying `IS_EVIDENCE YES`. Never record one as a failure without it either.
- **Never wait on a dead run.** If a run was superseded, find the successor and
  follow that SHA. See `.agent/agents/integrator.md`.
- **Never accept SHA B's CI as proof for SHA A.** Evidence is per-SHA, and the
  resolver is the only mechanism permitted to reuse it.
- **Do not add a `needs:` edge for sequencing.** Artifact, generated output or
  environment only.
- **Do not weaken a gate for speed.** Specifically forbidden: making a required
  job report-only, adding `continue-on-error` to a gating job, dropping browser
  e2e, dropping API lint, removing migration validation, or skipping security
  invariants. Optimise architecture, caching, parallelism and sequencing.
- **A report-only job must be time-bounded and must state its own result.** Its
  green conclusion is not a pass; its `RESULT:` line is (BUG-0049).
- **Local checkpoints are not remote CI checkpoints.** Commit locally as often
  as is useful; push when a work package is ready for integration evidence.
  Every push to `agent/*` starts a full pipeline and cancels the previous one.

---

## Related

- [`.agent/agents/integrator.md`](../agents/integrator.md) — run sequencing, waiting, exact-SHA following
- [`.agent/agents/release-devops.md`](../agents/release-devops.md) — CI ownership and regression response
- [`.agent/context/task-completion-contract.md`](task-completion-contract.md) — `REMOTE_CI_STATUS`
- [`.agent/context/branch-model.md`](branch-model.md) — which branch a task targets
- [`docs/development/ci.md`](../../docs/development/ci.md) — the job-by-job reference
- [`docs/ci/metrics/ci-metrics.md`](../../docs/ci/metrics/ci-metrics.md) — the current generated window
