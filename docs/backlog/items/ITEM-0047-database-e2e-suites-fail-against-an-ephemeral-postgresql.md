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
