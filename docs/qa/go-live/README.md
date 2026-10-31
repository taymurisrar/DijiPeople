# Go-live QA — Starter plan, tenant web (DijiPeople)

Entry point for any QA agent. Read this, then [[QA-RUNBOOK]]; a resume prompt is in [[FUTURE-AGENT-PROMPT]].

| Doc | Purpose |
|---|---|
| [[QA-RUNBOOK]] | build the isolated environment, provision tenants, run suites, recover |
| [[STARTER-SCOPE]] | what Starter actually includes (differs from the first brief) |
| [[TEST-MATRIX]] | suites, status, the six first-failures mapped, unresolved items, not-covered list |
| [[KNOWN-ISSUES]] | defect register (17 records; detail `issues/`, screenshots `evidence/`) |
| [[REMEDIATION-BACKLOG]] | ordered work for a separate development agent |
| [[PRODUCTION-RELEASE-GATES]] | checklist the **owner** runs on production (QA never touches production) |
| [[DECISIONS-AND-OBSERVATIONS]] | decisions, discrepancies, open questions |
| `runs/` → [[INDEX]] | immutable run reports (RUN-001, RUN-002) |

Session SESSION-0129 · branch `agent/starter-golive-qa` · **not merged, nothing deployed, production untouched**.

## Verdict (RUN-004, candidate 22a21a14): **NOT READY**

RUN-004 independently verified the remediation candidate (`22a21a14`, detached validation worktree, production build, ENFORCE floor, fresh DB, local mail sink): the four RUN-003 P1 blockers
([[DP-QA-002]], [[DP-QA-010]], [[DP-QA-011]], [[DP-QA-012]]) are **Resolved**, as are 001, 003, 008, 009, 014, 022. [[DP-QA-004]] and [[DP-QA-016]] are **Reopened**, [[DP-QA-015]] is reopened for My Profile.
Deeper coverage found three **new P1** defects: [[DP-QA-027]] (revoked/expired invitation tokens activate), [[DP-QA-030]] (soft-deleted employees still listed), [[DP-QA-031]] (reset link reusable) plus six P2/P3 (026, 028, 029, 032, 033, 034).
[[DP-QA-005]]: **`ENFORCE` is mandatory for go-live**; the mechanism is verified locally, the production state remains a separate owner gate ([[PRODUCTION-RELEASE-GATES]] A1–A5). [[DP-QA-018]] still open. Full table: [[KNOWN-ISSUES]]. RUN-004: 341 executed, 301 passed, 28 failed, 12 skipped ([[INDEX]]).
Playwright MCP: primary `.mcp.json` now lists exact local origins; the live MCP still needs `/mcp` reconnect by the user (not possible from the session) — all RUN-004 execution used Playwright Test with traces/screenshots.
Verified strengths: tenant isolation between two independently provisioned tenants (12/12), authentication/session/tamper handling, duplicate prevention (including concurrent creates), document upload controls,
organization CRUD, employee import/export guards, 8 visual baselines, and — on a production build — warm page loads of ~2–3 s and a 25-way concurrent read worst case of 1.3 s (local machine only).

## Coverage statement
303 executed results in RUN-003 over Chromium, Firefox, WebKit (https), mobile and tablet. **No test is "Not Verified".** Each mandatory scenario is Passed, Failed (with issue) or explicitly Blocked/Not Run with a reason —
see [[TEST-MATRIX]] "Explicitly Blocked or Not Run". The remaining gaps are environmental (working-day clock, mailbox, MCP restart) or next-batch items, so the audit is **not** declared complete.

## Checkpoint (RUN-004)
**Done:** RUN-004 full execution on candidate 22a21a14 (Chromium, Firefox, WebKit/TLS, mobile, tablet), 3 tenants, local SMTP sink, ENFORCE floor test, 9 new defect records (026-034), RUN-003 reconciliation ([[KNOWN-ISSUES]]).
**Pending:** (1) user runs `/mcp` to reconnect Playwright MCP, then an interactive visual pass; (2) development agent fixes DP-QA-027/030/031 (P1) and reopened 004/015/016; (3) valid-file bulk import, leave delegation, manager/HR chain, idle/absolute session timeouts, accrual schedule remain Not Run/Blocked (see [[TEST-MATRIX]]); (4) RUN-005 against the next candidate; (5) owner executes [[PRODUCTION-RELEASE-GATES]].
**Environment state:** candidate worktree `dijipeople-starter-verify`; production-mode web :3014 (+ TLS :3444), API :4097, mail sink :1025/:8025, DB `dijipeople_starterv4_test`, tenants `qa-starter`, `qa-prov-a`, `qa-prov-b`; API restart via `e2e/golive/tools/restart-api.ps1`.
**Next exact action:** `cd e2e; npx playwright test -c playwright.golive.config.ts --list` then run per project; merge re-runs with `node golive/tools/merge-run.cjs`, report with `make-run-report.mjs`.