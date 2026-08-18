---
ID: ITEM-0055
aliases: [ITEM-0055]
Title: Database e2e runs serially and now dominates its own job
Type: PERFORMANCE
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [api, ci]
Source: ARCHITECT
OwnerAgent: qa
ArchitectDisposition: DEFER
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-19
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0055 — Database e2e runs serially and now dominates its own job

## Summary

`services/api/test/jest-e2e.json` sets `maxWorkers: 1`. That landed in e9cad20 as
ITEM-0047 CAUSE D and it is **correct**: the suites share one database and one
seeded fixture set, so parallel workers raced each other and produced
non-deterministic failures. Serialising them made the results trustworthy.

It also made the job far slower, and those are the same fact. The
`Run database-backed e2e suites` step went from **1m28s** to **36 minutes and
still unfinished**. Part of that is real work newly enabled — suites that used to
crash on import now actually execute — and part is the loss of parallelism.

This item is about the parallelism, not the determinism. Do not "fix" it by
restoring `maxWorkers` to the default; that reopens ITEM-0047.

## Why It Matters

`database-e2e-report` is report-only and does not gate, so this costs runner time
and feedback latency rather than correctness. But it is the second-slowest job in
the pipeline at a p95 of 25m56s, and it was the direct cause of three `develop`
runs concluding `cancelled`: the job was still running when the next push
superseded them, which made three runs whose required gate had **already passed**
look red in the GitHub UI.

The immediate bleeding is stopped — the job now declares `timeout-minutes: 30`
instead of inheriting GitHub's 360-minute default, and `develop` no longer
cancels in-flight runs. What remains is the underlying cost.

## Evidence

| Run | Step duration | Note |
|---|---:|---|
| 32148516356 (14:31, pre-change) | 1m28s | several suites still crashing on import |
| 32167466971 (17:49) | 24m25s | cancelled by supersede, unfinished |
| 32169868091 (18:17) | 35m56s | cancelled by supersede, unfinished |
| 32173772663 (18:59) | 10m16s | cancelled by supersede, unfinished |

No post-`maxWorkers: 1` run has ever been observed to complete.

**Confirmed on 2026-08-19**: the 30-minute cap is now hit on *every* run —
32179954819 (30m17s), 32182849325 (30m25s), 32186211469 (30m17s), all cancelled
by timeout rather than by a superseding push. The cap established what the
unbounded runs could not: the serial suite does not finish inside 30 minutes.

The consequence is that [[ITEM-0047]] has no current pass/fail evidence at all,
which makes this item a blocker for that one rather than a parallel concern.

- `services/api/test/jest-e2e.json` — `maxWorkers: 1`
- `.github/workflows/ci.yml` — `database-e2e-report`
- `docs/qa/test-strategy/e2e-suite-classification.md`
- `docs/development/database-e2e-reproduction.md`

## Proposed Approach

Give each Jest worker its own database rather than sharing one, so parallelism
returns without reintroducing the races:

1. Create a template database once via `verify-database.mjs`.
2. Each worker creates `dijipeople_e2e_test_<JEST_WORKER_ID>` from that template
   in `globalSetup`, and drops it in `globalTeardown`.
3. `test/helpers/db-fixtures.ts` seeds per worker instead of relying on the
   single shared `seed:demo` run.
4. Restore `maxWorkers` to the default only once 3 holds.

Step 3 is the real work, and it is the same work the job's own promotion criteria
already imply — the suite's one pre-existing-data dependency is called out in the
workflow comments.

**Needs an ExecPlan under `PLANS.md`**: it changes test infrastructure every e2e
suite depends on.

## Acceptance Criteria

- `database-e2e-report` completes inside its timeout on three consecutive runs.
- The suite passes with `maxWorkers` at the default, three consecutive runs, with
  no cross-suite interference.
- No suite reads data seeded by another suite.
- ITEM-0047 does not regress: no non-deterministic failure across those runs.

## Dependencies

None blocking. Independent of the criteria for promoting this job to a gate,
though it is a prerequisite for the "under ~10 minutes" one.

## Related Items

- [[ITEM-0047]] — the determinism work whose fix caused this cost
- [[ITEM-0056]] — CI cache hit rate is not observable
- [[BUG-0049]] — why this job's `RESULT:` line, not its conclusion, is the evidence

## History

- 2026-08-18 — created at `aa33524`.
- 2026-08-18 — triaged `DEFER` by the Architect. The job is report-only and can
  no longer hang a runner or redden a run, so the cost is bounded. The fix is a
  test-infrastructure change deserving its own plan, not a tail-end edit to a CI
  performance task.
