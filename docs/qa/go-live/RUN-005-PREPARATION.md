# RUN-005 preparation (no sign-off)

Part of [[README]]. Prepared from RUN-004 (`5a98e550`, see [[RUN-004-2026-10-31]]). **RUN-005 has not been executed and no verdict is issued** — the development agent has not supplied a finished commit SHA for the RUN-004 findings.

## 1. Preservation
RUN-001..RUN-004 reports, issue records DP-QA-001..034, `evidence/`, `e2e/golive-results/run003|run004` and `.env.qa.local.run003` (untracked, credentials) are untouched. RUN-005 gets its own `runs/RUN-005-<date>.md`, `e2e/golive-results/run005/`, and issue "Retest history" rows appended — never rewritten.

## 2. Playwright MCP — status: BLOCKED (user action)
Checked with `browser_get_config` on 2026-10-31 after the RUN-004 commit: the live `network.allowedOrigins` is still the original production-only list (admin/app/api/www.dijipeople.com, `*.ws.dijipeople.com`, Stripe). **No local origin is allowed**, so the live server cannot open `qa-starter.localhost:3014/3444`, the API (`:4097`) or the mail sink (`:8025`).
Cause: the edited `.mcp.json` (primary checkout, 20 exact local origins, no wildcards) is read only when the MCP server starts; `/mcp` reconnect is an interactive command that cannot be issued from this session. No security control was bypassed.
Action for the owner: run `/mcp` and reconnect the `playwright` server (or restart Claude Code in the primary checkout), then re-run `browser_get_config` and confirm the local origins are present. Until then all RUN-005 execution uses Playwright Test (traces, screenshots, video on failure) — equivalent coverage, no interactive pass.

## 3. Remediation reconciliation
Latest remediation branch `agent/starter-golive-remediation` (local only, worktree `dijipeople-starter-fix`): HEAD `77128f5a` (docs-only handoff v2) on code SHA `0d95bc28`; 13 commits after RUN-004's `22a21a14`. Handoff: `REMEDIATION-HANDOFF-v2-2026-10-31.md` (in that branch).

| Scope | Handoff v2 | QA position |
|---|---|---|
| RUN-003 register DP-QA-004, 006, 007, 013, 015–021, 023, 024 | claims fixed (006 not fixed; 007 needs production-like measurement; 023 WebKit not re-run) | **Unverified** — all stay Open/Reopened until RUN-005 |
| **DP-QA-025–034 (RUN-004 findings)** | **not addressed** (handoff covers the 24 RUN-003 issues only) | Open. P1 DP-QA-027 (invitation revoke/expiry), -030 (soft-deleted listed), -031 (reset replay) have no fix on this branch |
| DP-QA-005 | mechanism shipped; owner cutover required | owner gate unchanged |

Consequence: the branch is **not a sign-off candidate**; testing it would reproduce three known P1s. RUN-005 starts when the development agent supplies a finished SHA that addresses 027/030/031 (and 026, 028, 029, 032–034 as scoped).

## 4. Test updates planned (apply only after the exact candidate confirms the contract)
Each is a contract change declared by the owner/developer; assertions change only after observing the candidate's behaviour, never to turn red green.
- **SMK-004 / CMD-022** (`01-smoke`, `17-…`): Starter `/employees/import` expected to land on the Data Management plan gate (import is Growth-gated). Assert the gate, no console error, no 5xx, and that Import is hidden/gated in the command bar.
- **LV-023** (`11-…`): replace "approved cannot be cancelled" with the approved-cancellation workflow: owner cancels future approved leave → balance restored once; started leave refused to owner; HR requires a reason; audit row written; double-cancel refused.
- **RBAC-2** manager price: keep RBAC-2-PRICE (price/cycle absent for manager, present for owner).
- **VIS baselines** (8): review each diff against the RUN-003/004 baseline before accepting; accent/muted colours are expected to change — an unexplained diff is a defect, not a re-baseline.
- **LV fixtures**: look up default `ANNUAL` type instead of creating; keep rate-limit-aware access.
- New/renewed: invitation expiry+revocation (INV-102/105), reset replay (MAIL-002), soft-delete listing (EMP-010), leave balance on approval/cancel (LV-031), manager reporting-line scope (LV-026), overlap concurrency (CONC-003), contrast (A11Y ×5), mobile overflow (RESP-001), logo for payroll-manager (BRAND-002), My Profile tabs/lookups (EMP-007, DP-QA-034).

## 5. RUN-005 execution protocol
1. Record: application SHA (`git rev-parse HEAD` of the **detached** validation worktree), QA suite SHA (clean tree required — commit QA edits first), DB/fixture version (new throwaway `dijipeople_starterv5_test`, fresh provisioning of `qa-starter`, `qa-prov-a`, `qa-prov-b`; seed fixture version in run header), browser versions (`npx playwright --version`, each engine's `browser.version()`), OS/Node.
2. New validation worktree (not `dijipeople-starter-verify`/`-fix`; create with `git worktree add --detach`, `npm ci`, production `next build --webpack`, API with `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE`, SMTP sink env), TLS front for WebKit.
3. Full suite: Chromium, Firefox, WebKit(https), mobile, tablet; cooled between heavy suites (rate limits, DP-QA-024/025). Console/network errors are failures via the diag fixture.
4. Per remediation: UI + API + DB persistence + negative case; Resolved/Reopened/Blocked/Not Run exactly as defined in the brief; screenshots for reopened items.
5. Report: immutable `RUN-005`, comparison table vs RUN-004 (pass/fail/skip, P0/P1, uncovered, P2/P3, gates). READY only with zero unresolved P0/P1, full critical-workflow coverage, verified entitlement security, repeatable results.

## 6. Still Blocked / Not Run (carried to RUN-005)
Valid-file import where entitled (needs Growth tenant; add a Growth fixture tenant), leave delegation (no such feature located), manager→HR approval chain (LV-029), idle/absolute session timeouts (time), accrual schedule (time-driven), production boot warning for `ENTITLEMENT_NOT_ENFORCED` (production boot refuses loopback), invitation e-mail after resend (blocked by DP-QA-028), WebKit retest of DP-QA-023.


## 7. Preparation update (checkpoint after e6ba632c)
- **Playwright MCP verified (2026-10-31):** `browser_get_config` returns `"network": {}` (no origin allowlist). Against a throwaway loopback page (127.0.0.1:3991, stopped afterwards; no application stack touched) navigate, type, click, console inspection and screenshot all worked - evidence `evidence/MCP-local-smoke-2026-10-31.png`. Interactive coverage of the application itself is still Not Run until the RUN-005 stack exists (DP-QA-006 DevTools trace, visual review of branding diffs, subgrid/command-bar exploration).
- **Framework checks:** `playwright test --list`: 339 test instances in 22 files, 0 load errors; every spec has a stable `DPQA-<FAMILY>-<n>` id (cross-browser duplicates are the same spec on several projects by design). New `e2e/golive/tools/traceability.mjs` maps DP-QA-001..034 to real test ids, fails on a missing id/unmapped defect (mutation-tested: renaming one mapped id exits 1); output `TRACEABILITY.md`. `tsc` reports two pre-existing DOM-iterable typing errors (10, 15 specs), none in new files.
- **New suites (authored before the candidate; NOT executed):** `18-security-regression` SEC-001..009 (concurrent reset replay, reset replay with same/attacker password, concurrent + replayed invitation activation, deleted-employee absence from list/search/data API/by-id/lookups, session end after reset, cross-tenant sign-in) and `19-growth-and-coverage` GRW-001..004 (Starter backend refuses import routes), GRW-010..013 (Growth-entitled template/analyse/executable refusal/isolation; **skipped as Not Run unless `QA_TENANT_G_SLUG` and `QA_TENANT_G_OWNER` are set**), TRC-034 (employee My Profile makes no 403). Fixture `TenantKey` gained optional `G`.
- **Contract assumptions to confirm on first run (not product requirements until the owner says so):** SEC-008 assumes a password reset revokes existing access tokens; SEC-006 assumes 404 for a deleted id; GRW-011 assumes analyse writes no employees; GRW-001..004 assume 403 on Starter. A failure of an assumption is recorded as a new finding or a test correction justified in the report, never silently adjusted.
- **Unsupported / not testable (documented, not invented):** leave *delegation* (no user-facing feature; only an internal approval delegate class), clock-driven accrual (policy persistence covered by LV-030..032; clock run needs a controlled application time), idle/absolute session timeouts (time), production boot warning (production boot refuses loopback).
- **Fixtures/infrastructure review:** deterministic ids via per-run suffix; disposable users for password/reset flows; file-backed token cache + 429 retries; pacing for heavy form loads; DB guard refuses non-`_test` databases (`fixtures/mail-db.ts`, `prepare-run005.ps1`); mail sink cleared per suite; credentials only in `.env.qa.local*` (git-excluded) - `git diff --cached --name-only` is checked before every commit. Note `e2e/golive/` is matched by a local git exclude, so **new files there need `git add -f`**.