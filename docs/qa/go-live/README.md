# Go-live QA — Starter plan, tenant web (DijiPeople)

Entry point for any QA agent. Read this, then [[QA-RUNBOOK]]; a resume prompt is in [[FUTURE-AGENT-PROMPT]].

| Doc | Purpose |
|---|---|
| [[QA-RUNBOOK]] | build the isolated environment, provision tenants, run suites, recover |
| [[STARTER-SCOPE]] | what Starter actually includes (differs from the first brief) |
| [[TEST-MATRIX]] | suites, status, the six first-failures mapped, unresolved items, not-covered list |
| [[KNOWN-ISSUES]] | defect register (34 records; detail `issues/`, screenshots `evidence/`) |
| [[REMEDIATION-BACKLOG]] | ordered work for a separate development agent |
| [[PRODUCTION-RELEASE-GATES]] | checklist the **owner** runs on production (QA never touches production) |
| [[DECISIONS-AND-OBSERVATIONS]] | decisions, discrepancies, open questions |
| [[TRACEABILITY]] | generated defect -> test map (DP-QA-001..034) |
| [[RUN-005-PREPARATION]] | MCP blocker, remediation reconciliation, RUN-005 protocol (awaiting final SHA) |
| `runs/` → [[INDEX]] | immutable run reports (RUN-001, RUN-002) |

Session SESSION-0129 · branch `agent/starter-golive-qa` · **not merged, nothing deployed, production untouched**.

## Verdict (RUN-005, application `f47e504c6397a8d51508fb3dbcf102314e9c9648`, QA suite `03131c8a`): **CONDITIONALLY READY**

Zero open P0/P1 application defects. All four RUN-003 blockers (002, 010, 011, 012) and the three RUN-004 blockers (027 invitation tokens, 030 soft-deleted employees, 031 reset replay) are independently verified fixed through UI/API/database. 30 of 34 records Resolved; open: [[DP-QA-005]] (owner's production ENFORCE cutover), [[DP-QA-006]] (not reproduced), [[DP-QA-026]] (owner decision on e-mail branding), [[DP-QA-023]] reopened for WebKit only (intermittent P3).
Conditions before go-live are listed in [[PRODUCTION-RELEASE-GATES]] (A1-A5 cutover/grandfather, C* items below). Results: [[RUN-005-2026-10-31]] (360 rows, 331 pass, 3 fail - all WebKit, 26 skipped = 25 cached-login setup rows + 1 superseded), compared with RUN-004 (28 failures, 3 P1). Evidence per defect: [[KNOWN-ISSUES]], [[RUN-005-RETEST-MATRIX]], [[TRACEABILITY]]. Limitations: see the report ("Coverage limitations"). The verdict does not rest on pass rate.

## Coverage statement
303 executed results in RUN-003 over Chromium, Firefox, WebKit (https), mobile and tablet. **No test is "Not Verified".** Each mandatory scenario is Passed, Failed (with issue) or explicitly Blocked/Not Run with a reason —
see [[TEST-MATRIX]] "Explicitly Blocked or Not Run". The remaining gaps are environmental (working-day clock, mailbox, MCP restart) or next-batch items, so the audit is **not** declared complete.

## Checkpoint (RUN-005)
**Done:** RUN-005 executed on the final candidate in a detached validation worktree, all five browser projects, interactive MCP inspection, 34-defect retest, repeat Chromium run, report + matrix + traceability.
**Pending (owner/development):** production ENFORCE cutover and grandfathering (DP-QA-005); decision on e-mail branding (DP-QA-026); WebKit intermittent fetch errors (DP-QA-023, P3); production-like logout measurement (DP-QA-007); existing tenants need `seed:config` and keep stored brand colours; populated valid-file Growth import execution, delegation (unsupported), accrual clock, idle timeouts.
**Environment state:** QA processes stopped (API :4197, web :3114, TLS :3544, sink :1125/:8125); DB `dijipeople_starterv5_test` and worktree `dijipeople-starter-verify5` kept (build already done). Restart with the tools below, stop by owning port only; remove worktree with the repo guard, never `git worktree remove`.
**Next exact action for RUN-006:** `powershell e2e\golive\tools\prepare-run005.ps1 -Sha <full sha>`, then `restart-api.ps1`, `run-project.ps1 -Project chromium`, `run-all-browsers.ps1`, `merge-run.cjs`, `make-run-report.mjs`, `retest-matrix.mjs`.
