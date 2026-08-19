---
ID: ITEM-0056
aliases: [ITEM-0056]
Title: CI cache hit rate is not observable from the Actions REST API
Type: INFRA
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [ci]
Source: ARCHITECT
OwnerAgent: release-devops
ArchitectDisposition: DEFER
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0056 — CI cache hit rate is not observable from the Actions REST API

## Summary

`scripts/ci-metrics.mjs` tracks job duration, queue time, failure rate,
cancellation class and duplicate runs. It does **not** track cache hit rate, and
reports it as `NOT_OBSERVABLE` rather than estimating it.

The reason is a real API limitation: `actions/cache` reports a hit or a miss only
in the raw step log. The REST endpoints this script uses expose step names,
timings and conclusions, and nothing about whether a cache was restored. There is
an `/actions/caches` endpoint, but it lists cache entries and their sizes — not
whether a given run used one.

## Why It Matters

Three caches are in play after 2026-08-18: npm via `setup-node`, the Turborepo
cache on `build`, and the Playwright browser cache on `browser-e2e`. If one
silently stops hitting — a key change, an eviction, the 10 GB repository cache
limit — the pipeline gets slower and the metrics attribute the slowdown to the
job rather than to the cache.

`JOB_DURATION_REGRESSION` still fires in that case, so the slowdown is not
invisible. But it is misattributed, and the first diagnosis would be wrong.

## Evidence

- `scripts/ci-metrics.mjs` — the `NOT_OBSERVABLE` row and the header note
- GitHub Actions REST `/repos/{repo}/actions/runs/{id}/jobs` returns
  `steps[].name`, `.conclusion`, `.started_at`, `.completed_at` only
- Caches added: `.github/workflows/ci.yml`, the `build` and `browser-e2e` jobs

## Proposed Approach

The honest options, in order of cost:

1. **Accept the gap.** `JOB_DURATION_REGRESSION` catches the symptom, and a human
   reads one step log to attribute it. This is what is being done.
2. Have the cache steps write their `cache-hit` output to `$GITHUB_STEP_SUMMARY`
   or an artifact, and have `ci-metrics.mjs` read that. Cheap, but it adds a step
   to hot jobs to measure something that only matters when it breaks.
3. Download and parse step logs. Slow, rate-limit-hungry, and brittle against
   log-format changes.

Do **not** infer a hit from step duration. A fast step is not proof of a cache
hit, and presenting that inference as a metric would be worse than the gap.

## Acceptance Criteria

Only if this is ever picked up:

- Cache hit or miss for npm, Turbo and Playwright appears per run in
  `docs/ci/metrics/ci-metrics.md`.
- A `CACHE_MISS_SPIKE` trigger fires on a sustained drop, derived from a reported
  hit flag rather than from step duration.

## Dependencies

None.

## Related Items

- [[ITEM-0055]] — database e2e serial runtime
- [[BUG-0042]] — the `turbo globalEnv` gap that makes build-cache correctness a
  live concern, guarded by `check:env-registered`

## History

- 2026-08-18 — created at `aa33524`.
- 2026-08-18 — triaged `DEFER` by the Architect. The gap is a platform
  limitation rather than a repository defect, the symptom is already caught by
  `JOB_DURATION_REGRESSION`, and every alternative costs more than the gap does.
  Deliberately **not** `ACCEPTED_RISK`: that disposition requires an explicit
  recorded human acceptance, and none was sought. Recorded rather than closed, so
  the reasoning is visible if caching behaviour ever becomes suspect.
