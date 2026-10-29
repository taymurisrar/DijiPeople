# Go-live QA — Starter plan, tenant web (DijiPeople)

Entry point for any QA agent. Read this, then [[QA-RUNBOOK]], and you can continue without the original brief.

| Doc | Purpose |
|---|---|
| [[QA-RUNBOOK]] | build the isolated environment, run suites, recover |
| [[STARTER-SCOPE]] | what Starter actually includes (differs from the brief — read it) |
| [[TEST-MATRIX]] | feature → scenario IDs → automation → latest status |
| [[KNOWN-ISSUES]] | defect register (details in `issues/`, evidence in `evidence/`) |
| [[DECISIONS-AND-OBSERVATIONS]] | assumptions, discrepancies, open questions |
| `runs/` → [[INDEX]] | immutable per-run reports |

Session: SESSION-0129 · branch `agent/starter-golive-qa` · target `develop` · **no production contact, no deploy**.

## Verdict (latest): **NOT READY**

Coverage is **partial** (smoke, auth, plan entitlements only). One High/P1 defect with confirmed symptoms
([[DP-QA-002]]), one P1-if-prod-misconfigured owner decision ([[DP-QA-005]]), and the Starter plan-gate UX is
inconsistent ([[DP-QA-001]], [[DP-QA-003]]). Nothing here says the remaining modules are good — they are **untested**.

## Checkpoint (update after every batch)

**Done:** discovery; isolated env (DB `dijipeople_starterqa_test`, API :4098, web :3012 on `qa-starter.localhost`);
Starter subscription + ENFORCE on QA DB; framework (config, env guard, per-role sessions, diagnostics fixture, run-report tool);
suites SMK / AUTH / ENT on Chromium.

**Pending, in order:**
1. Resolve DP-QA-002 fixture question: provision a tenant through the real super-admin flow and re-probe non-admin roles.
2. Write EMP (create/edit/validation/duplicate/commands) → LV → ATT → DOC → SET suites; each with POMs and data factories that clean up.
3. ISO: second tenant, assert cross-tenant reads/writes are refused at API and by direct URL.
4. A11Y (axe), RESP (mobile/tablet), XB (`npx playwright install firefox webkit`), PERF, VIS baselines.
5. Re-run all with `--last-failed`, then full regression, then write the go-live report.

**Blockers:** none hard. Playwright MCP cannot reach localhost (see DEC-004).
**Env state:** stack started from the worktree; logs `.qa-api.log`, `.qa-web.log` (gitignored). To restart see [[QA-RUNBOOK]].
**Next exact action:** `cd e2e; npx playwright test -c playwright.golive.config.ts --project=chromium` (expect the known failures in [[KNOWN-ISSUES]]).
