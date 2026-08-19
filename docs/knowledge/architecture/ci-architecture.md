# CI Architecture

> Generated from repository evidence at `3f6775e`.

One GitHub Actions workflow, `.github/workflows/ci.yml`. Thirteen jobs plus an
aggregate gate. Everything below was measured against the nineteen `develop` runs
preceding `aa33524`, not assumed.

## The shape

```
resolve  ─┬─ validate  typecheck  lint  test-api  test-web  test-admin
          │  test-landing  test-runtime  database-migration  build  browser-e2e
          │            ── all parallel, all gated on `resolve` and nothing else
          └─ database-e2e-report        (report only — NOT in the gate)
                     ↓
              ci-required   ← the single check branch protection keys on
```

`needs:` is used for exactly two things: the evidence resolver, and the aggregate
gate. There are no sequencing edges. An edge is legitimate only when the
downstream job consumes an artifact, a generated output, or an environment the
upstream job created.

## The critical path is `browser-e2e`, and only it can be

| Job | Median | p95 |
|---|---:|---:|
| **Browser e2e** | **8m01s** | **12m57s** |
| Database e2e (report only) | 4m38s | 25m56s |
| Build | 4m22s | 5m15s |
| Lint | 3m28s | 5m40s |
| Typecheck | 2m43s | 3m51s |
| Database migration gate | 2m27s | 2m43s |
| API tests | 1m37s | 5m00s |

Every other job finishes inside `browser-e2e`'s median. It carries more
environmental surface than any other gate — a PostgreSQL service, a migrated and
seeded database, a browser binary, three dev servers and a real login — and
roughly half its wall clock is that setup rather than the assertions.

If a new job is ever slower than `browser-e2e`, it becomes the critical path and
this table is stale. Re-measure with `npm run ci:metrics`.

## Three things that were true and were invisible

### One integration, two full pipelines

The Integrator integrates by ref-push, so `develop`'s tip is deliberately
**equal** to the CI-verified SHA. GitHub then fires a second complete pipeline
for a byte-identical tree. **Fifteen of nineteen** measured `develop` SHAs were
exact duplicates of an `agent/*` run that had already passed.

This is the direct cost of an otherwise correct integration strategy, and nothing
in the pipeline or the framework could see it, because duplication is a
cross-branch property: counting runs per SHA within `develop` alone reports zero
every time.

### A `cancelled` run that had already passed

Runs 32167466971, 32169868091 and 32173772663 each concluded `cancelled` while
their `CI required gate` job had **already succeeded**. The only job killed was
the report-only database e2e job, which declared no timeout and so inherited
GitHub's 360-minute default; after `maxWorkers: 1` landed in e9cad20 it ran for
36 minutes unfinished and was still running when the next push superseded the
run.

**A run's own conclusion is not a verdict.** It is unreliable in both directions:
a `cancelled` run may be complete evidence, and a run-level check could accept a
run that was itself a reuse. Read the job level.

### A required job that was not required

`browser-e2e` was named in `ci-required.needs` while carrying
`continue-on-error: true`. Such a job reports `success` to `needs.*.result`
**even when it fails**, so the aggregate could not see a browser failure at all.
The job was structurally listed and functionally absent from the gate.

The general lesson: `continue-on-error` and gate membership are mutually
exclusive, and nothing about the YAML makes the contradiction visible. It needs a
machine to notice, which is why `scripts/validate-framework.mjs` now checks it.

## Exact-SHA evidence reuse

The `resolve` job asks one question: has this exact SHA already had **every
required job individually conclude `success`** in an earlier run of this
workflow? If yes, the heavy jobs skip and `ci-required` names the run carrying
the evidence.

Three properties make it safe, and none may be relaxed:

1. **The workflow file is part of the SHA**, so a matching SHA cannot have been
   validated by a different pipeline.
2. **Job-level, never run-level** — see above.
3. **`skipped` is never accepted as `success`**, which is what stops evidence
   chaining off a SHA nothing ever validated. A reused run's jobs are `skipped`,
   so it can never itself become a source of reuse.

The required job list is **derived** from `ci-required.needs` and each job's
`name:`, not copied into the script. Adding a job to the gate automatically
widens what counts as evidence; a hardcoded list would silently accept a SHA that
never ran the new job. This was mutation-tested four ways.

## Concurrency

```yaml
group: ci-${{ github.workflow }}-${{ github.ref }}
cancel-in-progress: ${{ ref is neither main nor develop }}
```

`agent/*` supersedes — four pushes in eight minutes should not hold four runners,
and on 2026-08-18 exactly that happened (runs 32122794801, 32122995076,
32123416867, 32124051650, three cancelled mid-suite producing no evidence).

`develop` and `main` do not supersede, because on a shared branch every SHA is an
integration point whose evidence may still be needed. Excluding only `main` was
the earlier policy, and it is what turned three passing develop runs yellow.

## What the framework now reads

Before this work it read one bit: did the gate pass. That is the correctness
question and it was answered well — but it meant no agent could notice a doubled
pipeline, an unbounded job, a misleading cancellation, or a needless edge on the
critical path. A human noticed from a screenshot.

`scripts/ci-metrics.mjs` writes `docs/ci/metrics/ci-metrics.md` and a rolling
baseline, and fires five triggers: `JOB_DURATION_REGRESSION`, `QUEUE_REGRESSION`,
`CANCELLATION_SPIKE`, `FLAKY_JOB`, `DUPLICATE_RUN_STORM`. A firing trigger is a
finding and the Architect triages it.

It is deliberately **not** a CI job. Metrics change on every run, so a `--check`
in the pipeline would fail constantly and teach everyone to ignore it.

Cache hit rate is reported `NOT_OBSERVABLE`: `actions/cache` reports a hit only
in the raw step log, and inferring it from step duration would put a guess in a
metrics table. Recorded as ITEM-0056 rather than faked.

## Related

- `.agent/context/ci-operations.md` — the operating rules
- `docs/development/ci.md` — the job-by-job reference
- `docs/ci/metrics/ci-metrics.md` — the current generated window
- ITEM-0055 — serial database e2e runtime
- ITEM-0056 — cache observability
- BUG-0049 — why a report-only job's `RESULT:` line, not its conclusion, is the evidence
