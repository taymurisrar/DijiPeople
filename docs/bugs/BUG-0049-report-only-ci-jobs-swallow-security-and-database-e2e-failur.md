---
ID: BUG-0049
aliases: [BUG-0049]
Title: Report-only CI jobs swallow security and database E2E failures
Status: VERIFIED
Severity: HIGH
Priority: P0
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 0051180
AffectedModules: [.github/workflows, services/api/src/common/constants, services/api/test, docs/qa]
OwnerAgent: release-devops
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md
RegressionId: REG-047
RelatedBacklogItem: ITEM-0043
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0049 — Report-only CI jobs swallow security and database E2E failures

## Summary

The CI workflow captures failures from the dual-permission security invariant
and the database-backed E2E suite without returning their exit codes. Both jobs
therefore conclude `success` while their test steps are red, and the aggregate
`CI required gate` remains green.

## Expected Behavior

Report-only engineering evidence may remain non-gating while it has a known
baseline, but its recorded result must truthfully expose PASS or FAIL and must
never be rounded up to a green job or green QA verdict.

## Actual Behavior

GitHub Actions run `32009837400` on `develop` SHA `0051180` concluded success.
Inside those green jobs, the security invariant had 796 violations and database
E2E had 6 failed suites / 136 failed tests. The durable QA run also reports all
jobs green and browser E2E 8/0, while the actual browser result is 8 passed / 1
skipped. Exact WP-02 run `32020076245` reproduced the false-green behavior and
worsened database evidence to 7 failed suites / 148 failed tests while the job
and required aggregate still concluded success.

## Reproduction

1. `gh run view 32009837400 --json headSha,conclusion,jobs` — overall and both
   report-only job conclusions are `success`.
2. `gh run view 32009837400 --job 95326876583 --log` — 894 handlers in scope,
   98 compliant, 796 violations, 1 failed suite.
3. `gh run view 32009837400 --job 95327538057 --log` — 6 failed suites, 9
   passed, 136 failed tests, 91 passed.
4. `gh run view 32009837400 --job 95326876559 --log` — 8 passed, 1 skipped.

## Evidence

- `.github/workflows/ci.yml:324-418` — database E2E captures the test result but
  never makes the job fail.
- `.github/workflows/ci.yml:450-503` — the security invariant is report-only and
  excluded from the required API suite.
- `services/api/src/common/constants/wiring-invariants.spec.ts` — inventory of
  1,198 handlers, 29 public, 275 outside `PermissionsGuard`, 894 in scope, 98
  compliant and 796 violations: 3 missing only legacy permissions, 715 missing
  only matrix permission and 78 missing both.
- GitHub run `32009837400`, exact SHA
  `00511803ebb0e1343ff35535996df1af98c95834` — DB result 6/15 failed suites and
  136/227 failed tests; browser 8 passed / 1 skipped.
- GitHub run `32020076245`, exact SHA
  `47b127fb50ef2bd828af5901628f5e3079186662` — security remained 796
  violations; DB result worsened to 7/15 failed suites and 148/227 failed tests;
  browser remained 8 passed / 1 skipped; required aggregate concluded success.
- GitHub run `32021401010`, final task SHA
  `03f30cb74efb6fa12f5f8044eb85590f2361a532` — the same 7 DB suites failed,
  with 147 failed / 80 passed tests; security and browser results were unchanged;
  required aggregate again concluded success.
- GitHub run `32022417483`, merge SHA
  `c554f45e127c189bbd5e124d85869675c3ba6216` — the required aggregate passed,
  security remained at 796 violations and browser at 8 passed / 1 skipped. DB
  E2E remained red but shifted to 5 failed / 10 passed suites and 128 failed /
  99 passed tests; `attendance-review` and `attendance-operational` passed after
  failing on both task-SHA runs, exposing additional nondeterminism.
- `docs/qa/runs/2026-08-17-framework-remediation-e6a173d.md` — incorrectly
  treats green job conclusions as passing report-only evidence.

## Root Cause

Established: `continue-on-error` / `set +e` is used as both non-gating policy
and result handling. The scripts retain text summaries but do not propagate the
captured exit status or publish a machine-readable failure verdict. The
aggregate gate checks job conclusions only, so swallowed failures become green.

## Impact

Security and data-integrity failures are hidden from every consumer that reads
the aggregate check or job badge. This is false-success/lifecycle corruption:
the current required gate can be green while hundreds of authorization wiring
and database assertions fail. Individual violations still require verification
before being called product exploits, but the loss of evidence is live.

## Affected Areas

GitHub CI, API authorization inventory, all database-backed E2E suites, QA run
truthfulness, the Engineering Control Center and every integration decision
that relies on `CI required gate` alone.

## Proposed Resolution

Keep noisy suites non-gating until stabilized, but make their internal verdict
explicit and durable. Publish structured PASS/FAIL counts and fail an evidence
integrity step when a report cannot be parsed. Audit the 78 missing-both routes
first. Run DB suites serially with isolated fixtures to distinguish shared-state
races from product failures. Promote only after deterministic zero-failure runs.

## Acceptance Criteria

- A failing report-only test produces a visible FAIL verdict in its summary and
  durable QA evidence even if it does not yet block the aggregate.
- No QA run infers PASS from a green `continue-on-error` job.
- Security inventory is reduced by module; missing-both routes are triaged
  before half-wired routes.
- Database E2E is rerun serially; residual product failures get separate Bugs.
- Gate promotion occurs only after deterministic green runs.

## Regression Coverage

[REG-047](../qa/regressions/index.md) — `validate-framework` requires every job
named "report only" to publish an explicit `RESULT:` verdict carrying PASS or
FAIL, not counts alone. Mutation-tested by deleting the `RESULT:` line from
`database-e2e-report`.

[REG-040](../qa/regressions/index.md) covers the other half: the dual-permission
invariant itself, which now runs inside the required `test-api` job rather than a
job that could conclude success while reporting 796 violations.

## Dependencies

Related to `ITEM-0043`; implementation packages require the `ci` lease. Product
authorization and DB defects discovered after isolation become separate records.

## Related Items

[[ITEM-0043]] · [[premature-completion]] · [[qa-and-ci-architecture]] ·
[[TASK-0005]]

## Resolution

Fixed 2026-08-17. Both false-green mechanisms are gone, and the security half
was promoted rather than repaired.

**Security invariant.** WP-03 took the dual-permission inventory from 796
violations to 0, so the report-only job was deleted outright and the
`--testNamePattern` exclusion was removed from the required `test-api` job. The
invariant now gates like any other test. Repairing the job in place would have
been the smaller change and the wrong one — it read jest's status from `$?`
after a `| tee` pipeline, which is tee's status and therefore always 0, and a
job that can report 796 violations while concluding success should not survive
its own baseline reaching zero.

**Database e2e.** Stays non-gating, because its baseline is genuinely red, but
its summary now opens with an explicit `RESULT: PASS` or
`RESULT: FAIL (jest exit N)` line, raises a CI warning annotation when red, and
says in plain text not to read the job conclusion as a pass. Its captured exit
code was already correct via `PIPESTATUS`; nothing consumed it.

**Scope note.** The suite failures themselves — 7 of 15 suites, 148 of 227
tests — are a different defect from swallowing them, and are carried by
[[ITEM-0047]] with a serial-rerun and classification plan. This record covers
the swallowing and the promotion only, which is what its title claims.

## QA Retest

Verified on the exact SHA. The required gate now includes the dual-permission
invariant through `test-api`, and the API suite passes unexcluded: 178 suites,
1,334 tests. `docs/development/ci.md` was corrected in the same change — and
`validate-framework` proved its own worth here by failing on the stale
`security-invariant-report` reference until the document matched the workflow.

## History

- 2026-08-17 — fixed and verified. Security invariant promoted into the required
  gate, database e2e reporting made truthful, [[ITEM-0047]] opened for the
  residual suite failures.
- 2026-08-17 — created by TASK-0005 after reading the internal logs of the
  latest `develop` CI run rather than trusting its green job conclusions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0043]]
- Referenced by — [[ITEM-0047]]
- Regression — REG-047 (see the regression register)

<!-- GRAPH:END -->
