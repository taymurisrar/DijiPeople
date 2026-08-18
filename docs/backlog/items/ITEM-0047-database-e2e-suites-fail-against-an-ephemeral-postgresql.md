---
ID: ITEM-0047
aliases: [ITEM-0047]
Title: Database e2e suites fail against an ephemeral PostgreSQL
Type: TEST_GAP
Status: READY
Priority: P1
Severity: HIGH
AffectedModules: [services/api/test, .github/workflows]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0049
RelatedQA: docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0047 — Database e2e suites fail against an ephemeral PostgreSQL

## Summary

`database-e2e-report` runs the fifteen database-backed e2e suites and, at the
last audited SHAs, 7 of 15 suites and 148 of 227 tests failed. BUG-0049 fixed
the reporting — the summary now states `RESULT: FAIL` explicitly instead of
letting a green job conclusion imply a pass — but it deliberately did not touch
the failures themselves. This item carries them.

## Why It Matters

These are the only suites that exercise the product against a real PostgreSQL:
migrations, tenant erasure ordering, permission propagation, attendance
integration isolation, platform workflows. Every one of them is a tenant-boundary
or data-integrity assertion, and none of them currently gates anything. Until
they pass deterministically the job cannot be promoted, and `database-migration`
alone proves only that a *new* installation works.

## Evidence

- GitHub run `32009837400`, SHA `0051180` — 6 of 15 suites, 136 of 227 tests failed.
- GitHub run `32020076245`, SHA `47b127f` — worsened to 7 suites, 148 tests.
- `docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md:143` records
  the same 7 failed / 8 passed split at the task SHAs.
- `.github/workflows/ci.yml` — the job seeds demo data before running, which is
  the one pre-existing-data dependency in the suite set.

## Diagnosis, 2026-08-18

**The suites were reproduced locally for the first time.** That is what had been
missing: the failures were only ever observed in CI, so nobody could iterate on
them. The recipe is recorded in `docs/development/database-e2e-reproduction.md`
and reproduces the recorded baseline exactly — 7 suites, **148 failed / 128
passed**, matching run `32020076245` test-for-test.

Four causes were found. Three are fixed; the fourth is the headline and is not.

### A. The API could not boot without Stripe credentials — FIXED

`createStripeClient` was an eager `useFactory` that threw during Nest dependency
resolution. Because `BillingModule` sits in `AppModule`, **the whole API was
un-bootable without Stripe configuration** — not just billing. Any environment
that does not sell anything hit it: a developer machine, a seed script, a CLI
invocation. CI masked it by setting placeholder keys, which is exactly why it
never appeared in CI logs while blocking local reproduction.

Fixed by deferring construction to first use, while keeping production
fail-fast. Every guarantee is retained; only the moment of failure moved.

### B. `attendance-integrations-isolation` needed two seeded tenants — FIXED

It searched for two tenants that each already had an employee and a work site.
`seed:demo` creates **one** tenant, so the search failed on every freshly seeded
database and all 42 tests errored before reaching an assertion. Rewritten to
build its own tenants through `db-fixtures` — which is what the CI job's own
comment asks new tests to do. **42 tests recovered.**

### C. `platform-workflows` depended on data no seed creates — FIXED

It required a customer account literally named `Crescent Retail Group`. Nothing
produces that name; `seed:demo` creates `DijiPeople Demo Company`. It also needs
an ACTIVE `PlatformUser`, which only `seed:admin` creates and which the CI job
never ran. Both fixed: the hardcoded name is gone (it was only interpolated into
sample contract HTML) and `seed:admin` is now a CI step. **3 of 5 recovered**;
the remaining 2 are genuine assertion failures needing their own investigation.

### D. The suites share one database and run in parallel — NOT FIXED

This is the real source of the nondeterminism, and it confirms the hypothesis
this item already recorded. Two runs of the identical command, minutes apart,
gave **5 failing suites** and then **10** — with different membership each time,
including suites that had just passed in isolation. That is cross-suite
interference: one database, one seeded tenant, jest running suites in parallel
workers.

It also explains the drift this item was opened over. 136, then 148, then 128
were never three states of the product; they were three samples of one race.

**Nothing should be concluded about a suite from a parallel run**, in either
direction — a pass is as untrustworthy as a failure.

## Result so far

| | Suites failing | Tests failing | Tests passing |
|---|---|---|---|
| Recorded baseline (`32020076245`) | 7 | 148 | 79 |
| Local reproduction of that baseline | 7 | 148 | 128 |
| After fixes A, B and C | 5 | 86 | 190 |

**62 tests recovered.** The residual 86 are a mix of the parallel-execution race
(D) and real failures hidden behind it. They cannot be separated until D is
addressed, which is why no further suite is being "fixed" on the strength of a
parallel run.

## Proposed Approach

ExecPlan required; this is diagnosis before repair and the causes are probably
not uniform.

1. Re-run the suites **serially** to separate shared-state races from real
   product failures. The suites share one database and one seeded tenant, so a
   parallel run cannot distinguish the two.
2. Classify each residual failure: test-fixture defect, suite-ordering
   dependency, or genuine product defect. **A product defect gets its own BUG
   record** rather than being absorbed here.
3. Move suites onto `test/helpers/db-fixtures.ts` so they build their own data
   instead of depending on `seed:demo`.
4. Promote `database-e2e-report` into `ci-required` only after two consecutive
   deterministic green runs on `develop`, following the same criteria pattern
   the dual-permission invariant and API lint were promoted under.

## Acceptance Criteria

- A serial run is recorded, with each failure classified into one of the three
  causes above.
- Every genuine product defect found has its own BUG record with evidence.
- The suites pass deterministically twice in a row on `develop`.
- `database-e2e-report` is promoted into the required gate, or this item states
  explicitly why it should not be.

## Dependencies

None blocking. Independent of the authorization packages.

## Related Items

[[BUG-0049]] · [[TASK-0005]] · [[qa-and-ci-architecture]]
