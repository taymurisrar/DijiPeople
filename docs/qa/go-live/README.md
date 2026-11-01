# Go-live QA — Starter plan, tenant web (DijiPeople)

Entry point for any QA agent. Read this, then [[QA-RUNBOOK]]; a resume prompt is in [[FUTURE-AGENT-PROMPT]].

| Doc | Purpose |
|---|---|
| [[QA-RUNBOOK]] | build the isolated environment, provision tenants, run suites, recover |
| [[STARTER-SCOPE]] | what Starter actually includes (differs from the first brief) |
| [[TEST-MATRIX]] | suites, status, the six first-failures mapped, unresolved items, not-covered list |
| [[KNOWN-ISSUES]] | defect register (42 records; detail `issues/`, screenshots `evidence/`) |
| [[REMEDIATION-BACKLOG]] | ordered work for a separate development agent |
| [[PRODUCTION-RELEASE-GATES]] | checklist the **owner** runs on production (QA never touches production) |
| [[DECISIONS-AND-OBSERVATIONS]] | decisions, discrepancies, open questions |
| [[TRACEABILITY]] | generated defect -> test map (DP-QA-001..034) |
| [[RUN-006-2026-11-01]] | **latest run**: verdict NOT READY on `17d0dcaf`; narrative, business rules, defects, gates |
| [[RUN-006-RETEST-MATRIX]] | RUN-006 evidence by defect (statuses per browser project) |
| [[RUN-007-PREPARATION]] | owner decisions D1-D6, 55 new regression ids (specs 27-30), protocol, calibration notes; awaiting the final development SHA |
| [[RUN-006-PREPARATION]] | new subscription requirements, owner answers Q1-Q6, prepared suites, protocol, lessons |
| [[RUN-005-PREPARATION]] | MCP blocker, remediation reconciliation, RUN-005 protocol (awaiting final SHA) |
| `runs/` → [[INDEX]] | immutable run reports (RUN-001 to RUN-006) |

Session SESSION-0129 · branch `agent/starter-golive-qa` · **not merged, nothing deployed, production untouched**.

## Verdict (RUN-006, application `17d0dcafa33bdb8123e88f73d3346c577d25b4e3`, QA suite `21b318b6`): **NOT READY**

Two unresolved **P1** application defects and the owner enforcement gate. [[DP-QA-036]]: after `seed:config` (every deploy) an onboarded tenant that never configured approvals gets a default route to `system-admin`, a role nobody holds, so leave and timesheet submission is refused. [[DP-QA-037]]: the employee export includes soft-deleted employees with plaintext national ID and tax ID. Also open: [[DP-QA-038]], [[DP-QA-035]], [[DP-QA-039]], [[DP-QA-041]] (P2), [[DP-QA-040]], [[DP-QA-023]] (P3), [[DP-QA-042]] and the plaintext-identifier question (owner decisions), [[DP-QA-005]] (owner gate).

The owner-approved subscription requirements hold: basic import/export on every plan, Desktop Agent Enterprise or explicitly entitled Custom only (downgrade cuts old tokens within about a minute), essential branded e-mail on every plan, template authoring Growth+, white-label Enterprise/Custom, Starter resolves to exactly eight features. All 34 earlier records were retested: 32 Resolved, 023 Reopened, 005 owner gate. Results: [[RUN-006-2026-11-01]] (459 rows: 431 passed, 12 failed - every failure is a recorded defect - 16 skipped, none counted as passed). Gates: [[PRODUCTION-RELEASE-GATES]] section E.

## Previous verdict (RUN-005, application `f47e504c`, QA suite `03131c8a`): CONDITIONALLY READY - superseded

Zero open P0/P1 application defects. All four RUN-003 blockers (002, 010, 011, 012) and the three RUN-004 blockers (027 invitation tokens, 030 soft-deleted employees, 031 reset replay) are independently verified fixed through UI/API/database. 30 of 34 records Resolved; open: [[DP-QA-005]] (owner's production ENFORCE cutover), [[DP-QA-006]] (not reproduced), [[DP-QA-026]] (owner decision on e-mail branding), [[DP-QA-023]] reopened for WebKit only (intermittent P3).
Conditions before go-live are listed in [[PRODUCTION-RELEASE-GATES]] (A1-A5 cutover/grandfather, C* items below). Results: [[RUN-005-2026-10-31]] (360 rows, 331 pass, 3 fail - all WebKit, 26 skipped = 25 cached-login setup rows + 1 superseded), compared with RUN-004 (28 failures, 3 P1). Evidence per defect: [[KNOWN-ISSUES]], [[RUN-005-RETEST-MATRIX]], [[TRACEABILITY]]. Limitations: see the report ("Coverage limitations"). The verdict does not rest on pass rate.

## Coverage statement
303 executed results in RUN-003 over Chromium, Firefox, WebKit (https), mobile and tablet. **No test is "Not Verified".** Each mandatory scenario is Passed, Failed (with issue) or explicitly Blocked/Not Run with a reason —
see [[TEST-MATRIX]] "Explicitly Blocked or Not Run". The remaining gaps are environmental (working-day clock, mailbox, MCP restart) or next-batch items, so the audit is **not** declared complete.

## Status after RUN-006
RUN-005 remains the accurate historical result for `f47e504c`. RUN-006 tested the final candidate `17d0dcaf` against the owner-approved subscription requirements and is **not** a go-live approval: NOT READY until DP-QA-036 and DP-QA-037 are fixed and the run is repeated on the new commit. See [[RUN-006-PREPARATION]] section 7 for lessons.

## Checkpoint (RUN-006)
**Done:** fresh worktree and database at the exact SHA, production build, ENFORCE floor, local mail sink, tenants for Starter/Growth/Enterprise/Custom created through onboarding, full Chromium plus four targeted reruns, Firefox, WebKit (plus 10x regression with traces), mobile, tablet, interactive Playwright MCP checks, retest of DP-QA-001..034, eight new defect records (035-042), report, matrix, gates, secret scan.
**Pending (development):** DP-QA-036, 037 (P1), 038, 035, 039, 041 (P2), 040, 023 (P3). **Pending (owner):** DP-QA-042 and plaintext-identifier decisions; ENFORCE/grandfathering (005); production-like logout latency; real-mailbox links; section E gates.
**Not run:** absolute session lifetime (days); refresh-token behaviour after a downgrade; Advanced Data Management (no routes); populated valid-file import execution.
**Environment state:** QA processes stopped by port/command line; DB `dijipeople_starterv6_test` and worktree `dijipeople-starter-verify6` kept.

## Checkpoint (RUN-005)
**Done:** RUN-005 executed on the final candidate in a detached validation worktree, all five browser projects, interactive MCP inspection, 34-defect retest, repeat Chromium run, report + matrix + traceability.
**Pending (owner/development):** production ENFORCE cutover and grandfathering (DP-QA-005); decision on e-mail branding (DP-QA-026); WebKit intermittent fetch errors (DP-QA-023, P3); production-like logout measurement (DP-QA-007); existing tenants need `seed:config` and keep stored brand colours; populated valid-file Growth import execution, delegation (unsupported), accrual clock, idle timeouts.
**Environment state:** QA processes stopped (API :4197, web :3114, TLS :3544, sink :1125/:8125); DB `dijipeople_starterv5_test` and worktree `dijipeople-starter-verify5` kept (build already done). Restart with the tools below, stop by owning port only; remove worktree with the repo guard, never `git worktree remove`.
**Next exact action for RUN-006:** `powershell e2e\golive\tools\prepare-run005.ps1 -Sha <full sha>`, then `restart-api.ps1`, `run-project.ps1 -Project chromium`, `run-all-browsers.ps1`, `merge-run.cjs`, `make-run-report.mjs`, `retest-matrix.mjs`.
