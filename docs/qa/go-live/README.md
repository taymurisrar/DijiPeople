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

## Verdict (RUN-002): **NOT READY**

Four confirmed P1 defects — [[DP-QA-002]] (non-admin roles cannot load self-service; reproduced on tenants provisioned through the real workflow, so it is **not** a seed artefact),
[[DP-QA-011]] (employees cannot list leave types or cancel their own request), [[DP-QA-010]] (four paid features have no backend plan guard) and [[DP-QA-012]] (an invalid timezone is accepted and breaks every page) —
plus the owner decision [[DP-QA-005]] (enforcement default `REPORT_ONLY`). Eleven P2/P3 defects are open. Strengths verified: tenant isolation between two provisioned tenants (12/12), authentication
and API refusals, document upload controls, in-app notification isolation.

Coverage is **substantial but not complete**: see "Not covered yet" and "Unresolved test-side items" in [[TEST-MATRIX]]. The audit must not be called complete.

## Checkpoint
**Done:** discovery; isolated stack; two provisioned tenants + seed-demo comparison; 14 suites / 254 executed results over Chromium, Firefox, WebKit, mobile, tablet;
17 defect records with screenshots; release gates, remediation backlog and resume prompt.

**Pending, in order:**
1. Resolve EMP-003/004/006 and ATT-008 (automation can't yet drive the relation-type combobox / edit mode / correction body) — or verify manually once MCP can reach localhost (restart MCP from this branch, DEC-007).
2. Not-covered list in TEST-MATRIX: leave approval chain, balances, attendance check-in on a working day, import/export, org CRUD, invitation flow, documents tab UI, branding visuals, session expiry/refresh/concurrency, password reset, visual-regression baselines.
3. Re-run everything against `next build && next start` (cross-browser noise, real performance) and after the P1 fixes, then retest each issue and move it Open → Ready for Retest → Resolved.
4. Owner works through [[PRODUCTION-RELEASE-GATES]].

**Environment state:** API :4098 and web :3012 running from the worktree (logs `.qa-api.log`, `.qa-web.log`, gitignored); QA DB `dijipeople_starterqa_test`; tenants `qa-starter`, `qa-prov-a`, `qa-prov-b`.
**Next exact action:** `node e2e/golive/tools/qa-cleanup.mjs` then `cd e2e; npx playwright test -c playwright.golive.config.ts --project=chromium`.
