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

## Verdict (RUN-003): **NOT READY**

Four confirmed P1 defects — [[DP-QA-002]], [[DP-QA-011]], [[DP-QA-010]], [[DP-QA-012]] — remain release blockers (owner decision), plus [[DP-QA-005]]: **`ENFORCE` is mandatory for go-live** and its production state is a separate gate
([[PRODUCTION-RELEASE-GATES]] A1–A5). [[DP-QA-018]] (manager approves outside the reporting line) and [[DP-QA-022]] are new High findings. 24 defect records are open; none was fixed or silently closed.
Verified strengths: tenant isolation between two independently provisioned tenants (12/12), authentication/session/tamper handling, duplicate prevention (including concurrent creates), document upload controls,
organization CRUD, employee import/export guards, 8 visual baselines, and — on a production build — warm page loads of ~2–3 s and a 25-way concurrent read worst case of 1.3 s (local machine only).

## Coverage statement
303 executed results in RUN-003 over Chromium, Firefox, WebKit (https), mobile and tablet. **No test is "Not Verified".** Each mandatory scenario is Passed, Failed (with issue) or explicitly Blocked/Not Run with a reason —
see [[TEST-MATRIX]] "Explicitly Blocked or Not Run". The remaining gaps are environmental (working-day clock, mailbox, MCP restart) or next-batch items, so the audit is **not** declared complete.

## Checkpoint
**Done:** everything in RUN-002 plus the production-mode build, WebKit over TLS, 9 new suites (leave approval/balance, import/export, organization, session/password/invitation, concurrency, visual, command visibility) and issue records 018–024.
**Pending:** (1) restart the MCP from a checkout with the local origins (DEC-010) and do an interactive visual pass; (2) rerun on a Sun–Thu date for real check-in; (3) org locations/BU/holiday CRUD, valid-file import, branding visuals, email-dependent flows with a mail sink;
(4) RUN-004 against the **fixed** build to retest every P1/P2 (Open → Ready for Retest → Resolved) and to get diff-based visual verdicts; (5) owner executes the release gates.
**Environment state:** production-mode web :3012 (+ TLS front :3443), API :4098, DB `dijipeople_starterqa_test`, tenants `qa-starter`, `qa-prov-a`, `qa-prov-b`; logs `.qa-*.log` (gitignored).
**Next exact action:** `node e2e/golive/tools/qa-cleanup.mjs`; `cd e2e`; `npx playwright test -c playwright.golive.config.ts --project=chromium` (WebKit: set `QA_WEB_URL=https://qa-starter.localhost:3443` and run `node golive/tools/tls-proxy.cjs` first).
