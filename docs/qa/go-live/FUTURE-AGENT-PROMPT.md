# Resume prompt for a future QA agent

Paste everything below the line.

---

DP QA: Continue the DijiPeople Starter-plan go-live QA from branch `agent/starter-golive-qa` (do NOT merge, deploy, or touch production).
Read, in order and nothing else first: `docs/qa/go-live/README.md` (checkpoint), `QA-RUNBOOK.md`, `KNOWN-ISSUES.md`, `TEST-MATRIX.md`,
then the newest file in `docs/qa/go-live/runs/`. Do not rescan the repository; `STARTER-SCOPE.md` and `DECISIONS-AND-OBSERVATIONS.md` hold the context.

Rules: local only (`.env.qa.local` is gitignored and holds all credentials; never print or commit them). Application bugs are recorded, never fixed;
test infrastructure may be improved. Every result is Passed / Failed / Blocked / Skipped / Not Run with evidence. Keep existing issues Open until a retest
shows them resolved, then mark Ready for Retest -> Resolved with the run id.

Cycle:
1. `node scripts/session.mjs list` and register a session; use a worktree if the primary checkout is dirty.
2. Bring the stack up exactly as `QA-RUNBOOK.md` says (throwaway DB `dijipeople_starterqa_test`, API :4098, web `next dev --webpack` :3012). If the API throttle
   returns 429 on login, restart the API (the limiter is in memory) — do not loop logins.
3. `cd e2e && npx playwright test -c playwright.golive.config.ts --project=chromium` (then `firefox`, `webkit`, `mobile`, `tablet`).
4. Triage each failure: product defect vs test fault vs environment. Real defects get `issues/DP-QA-nnn.md` + a screenshot under `evidence/` and a row in `KNOWN-ISSUES.md`.
5. `node e2e/golive/tools/make-run-report.mjs --note "<what changed>"` (immutable run report + index), update `TEST-MATRIX.md` and the README checkpoint, commit on the branch.
6. Re-provision tenants only if the DB was recreated: `provision-tenant.mjs`, `owner-access.mjs`, `seed-role-users.mjs` (see runbook).

Verdict rules: READY only with zero open P0/P1, every Starter feature covered, isolation + security + a11y + cross-browser green, and every gate in `PRODUCTION-RELEASE-GATES.md` ticked by the owner.
