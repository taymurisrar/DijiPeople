# QA Runbook — Starter plan go-live (tenant web)

Part of [[README]]. Scope: [[STARTER-SCOPE]]. Everything here runs **locally against a throwaway database**.
Nothing in this runbook touches production, Neon, Stripe, SMTP or R2.

## Safety rails (enforced in code, not just policy)

- `e2e/golive/fixtures/env.ts` refuses to run unless `QA_WEB_URL`/`QA_API_URL` are localhost and
  `QA_DATABASE_URL` is local with a `_test`/`_ci`/`_scratch`/`_tmp` marker.
- The QA API `.env` has `STRIPE_SECRET_KEY`, `SMTP_*` empty and `ENABLE_EMAILS=false`; storage is a local dir.
- `scripts/assert-test-database.mjs` must pass before any seed or migrate.

## Credentials — variable names only

Real values live in gitignored `.env.qa.local` at the worktree root (never in Git, Obsidian, logs or screenshots).

```
QA_WEB_URL        http://<slug>.localhost:<web-port>   (tenant resolved from host, like production)
QA_API_URL        http://localhost:<api-port>
QA_TENANT_SLUG    qa-starter
QA_DATABASE_URL   postgresql://…/dijipeople_starterqa_test   (local only)
QA_PASSWORD       shared password of the seeded QA users
QA_ADMIN_EMAIL  QA_HR_EMAIL  QA_MANAGER_EMAIL  QA_EMPLOYEE_EMAIL  QA_PAYROLL_EMAIL  QA_RECRUITER_EMAIL
```

The seeded users are `system-admin@`, `hr@`, `manager@`, `employee@`, `payroll@`, `recruiter@dijipeople.local`;
their password comes from `DEMO_USER_PASSWORD` in `services/api/.env` **at seed time** (the seed does not use the
documented default).

## One-time environment build

```powershell
# 0. worktree + node_modules (see memory: fresh-worktree-has-no-node-modules). node_modules must be a real directory
#    of junctions with @repo/* pointing at THIS worktree, else seeds fail on a stale @repo/config.
# 1. database
createdb dijipeople_starterqa_test          # via any local connection; role needs CREATEDB
$env:DATABASE_URL = "<local url>/dijipeople_starterqa_test"; node scripts/assert-test-database.mjs
cd services/api; npx prisma migrate deploy --config prisma.config.ts
# 2. seeds (DEMO_TENANT_SLUG=qa-starter, DEMO_USER_PASSWORD=<qa password> in services/api/.env first)
$env:TS_NODE_TRANSPILE_ONLY="true"; npm run seed:config; npm run seed:demo
# 3. put the tenant on Starter (seed-demo leaves it with NO subscription) — SQL on the QA DB only:
#    insert a "Subscription" row for plan key 'starter', status ACTIVE
# 4. turn entitlement enforcement on (default is REPORT_ONLY):
#    PlatformSetting key 'module-settings' value {"entitlementEnforcement":"ENFORCE"}  (60 s cache)
```

`apps/web/.env.local` must point at the QA API (`API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`) and web origin.
`services/api/.env`: `PORT=4098`, `CORS_ALLOWED_ORIGINS=http://localhost:3012,http://qa-starter.localhost:3012`,
`WEB_APP_URL=http://localhost:3012`.

## Starting the stack

```powershell
# API  (cwd services/api)   — Bash has no network here; use PowerShell
$env:TS_NODE_TRANSPILE_ONLY="true"; npx ts-node -r tsconfig-paths/register src/main.ts     # :4098
# Web  (cwd apps/web)       — --webpack is mandatory through junctions (Turbopack panics)
npx next dev --webpack -p 3012
curl http://localhost:4098/api/health
```

## Running suites (cwd `e2e/`)

| Goal | Command |
|---|---|
| Everything, Chromium | `npx playwright test -c playwright.golive.config.ts --project=chromium` |
| Smoke only | `… --project=chromium -g "DPQA-SMK"` |
| One feature | `… -g "DPQA-EMP"` (prefixes: SMK AUTH ENT EMP LV ATT DOC SET A11Y RESP PERF ISO) |
| Cross-browser | `… --project=firefox --project=webkit` (only `@xbrowser` tests) |
| Responsive | `… --project=mobile --project=tablet` (only `@responsive` tests) |
| Re-run failures only | `… --last-failed` |
| HTML report | `npx playwright show-report golive-report` |

`retries` is 0 by design: a test that fails once is investigated, not retried into green.
Browsers: `npx playwright install firefox webkit` once (Chromium is already present).

## After a run

1. `node e2e/golive/tools/make-run-report.mjs` → writes `docs/qa/go-live/runs/RUN-<n>-<date>.md` from
   `golive-results/results.json` (immutable; never edit a past run).
2. Raise or update issues in `issues/` and [[KNOWN-ISSUES]]; update [[TEST-MATRIX]] execution history.
3. Update the checkpoint in [[README]].

## Recovery

- *"Database system is in recovery mode"* — Postgres crashed under parallel load; wait and retry, not a product bug.
- *API port stuck / stale code* — kill the ts-node process; a locked log file can make a relaunch silently fail and
  leave the old process serving.
- *Login 429* — 20 POSTs / 10 min throttle; wait, and prefer the cached `.auth` sessions.
- *Reset the tenant to a known state* — drop and recreate `dijipeople_starterqa_test`, repeat the build above.
- *Stripe/SMTP* — must stay empty; if an outbound call appears in the API log, stop and investigate.

## Tools (`e2e/golive/tools/`)

`explore.mjs ROLE /path…` screenshots + visible controls · `probe-api.mjs ROLE /path…` status codes ·
`discover-nav.mjs ROLE` walks the sidebar · `usermenu.mjs` profile-menu dump · `make-run-report.mjs`.

## RUN-002 additions

**Provision real tenants** (needs `seed:admin` once, `QA_PLATFORM_*` in `.env.qa.local`):
```powershell
node e2e/golive/tools/provision-tenant.mjs qa-prov-a "QA Provisioned A" qa-owner-a@qa.dijipeople.test   # customer -> onboarding -> create-tenant
node e2e/golive/tools/owner-access.mjs qa-prov-a      # run TWICE: first activates the owner, second moves the tenant to ACTIVE
node e2e/golive/tools/seed-role-users.mjs qa-prov-a qa-owner-a@qa.dijipeople.test a   # employee, manager, hr, payroll-manager users
```
Fixture shortcuts used on the throwaway DB only: an executed SUBSCRIPTION_AGREEMENT `Contract` row (inserted by `provision-tenant.mjs`) and
`PlatformSetting tenant-provisioning = {"wildcardDnsReady": true}`. Add `qa-prov-a.localhost:3012,qa-prov-b.localhost:3012` to the API `CORS_ALLOWED_ORIGINS`.

**Throttle:** login is limited to 20 / 10 min per IP+path in memory. Cached sessions (`.auth/*.json`, 20 min) and tokens (`.auth/api-tokens.json`, 25 min) avoid it. On 429, restart the API.
**Web crash:** run `next dev` with `NODE_OPTIONS=--max-old-space-size=6144`; if every UI login suddenly fails, check that port 3012 is still listening.
**Browsers:** `npx playwright install firefox webkit` (done). Run per project and save each result: `Copy-Item golive-results\results.json golive-results\results-<project>.json`; `make-run-report.mjs` merges all `results-*.json`.
**Cleanup:** `node e2e/golive/tools/qa-cleanup.mjs` (leftover employees / pending leave / correction requests). Tests are self-contained because Playwright restarts a worker after a failure.
**Probes:** `probe-api.mjs`, `explore.mjs`, `click-explore.mjs`, `dom-probe.mjs`, `ui-probe.cjs`, `mobile-shot.cjs`, `xt-delete-probe.mjs`. Run Node tools from PowerShell, not Git Bash (path mangling, no network).
**Playwright MCP:** see DEC-007 — restart it from a checkout containing the updated `.mcp.json`.

## RUN-003 additions
- **Production-mode web:** `cd apps/web`; `$env:NODE_OPTIONS="--max-old-space-size=6144"`; `npx next build --webpack`; `npx next start -p 3012`. Rebuild after any `.env.local` change (NEXT_PUBLIC_* are baked in). Never build while `next dev` serves the same `.next`.
- **WebKit:** `node e2e/golive/tools/tls-proxy.cjs 3443 3012` (self-signed cert in `e2e/golive-results/tls/`, openssl SAN `DNS:localhost,DNS:*.localhost`), then `QA_WEB_URL=https://qa-starter.localhost:3443`, `QA_FORCE_LOGIN=1`, `npx playwright test -c playwright.golive.config.ts --project=webkit`.
- **Visual baselines:** `--project=chromium -g DPQA-VIS --update-snapshots` only for an intended, reviewed UI change; baselines live in `e2e/golive/tests/14-visual-commands.spec.ts-snapshots/`.
- **Rate limits:** reads 600/min and writes 120/min per user; heavy suites start with a cooldown. Login 20 / 10 min per IP (restart the API to clear).
- **Stopping the QA web server:** stop only the PID that owns port 3012 (`Get-NetTCPConnection -LocalPort 3012`); never pattern-kill node/next.

## RUN-005 (exact final candidate)
Prepare with `e2e/golive/tools/prepare-run005.ps1 -Sha <full 40-hex>`: it refuses an abbreviated/unknown SHA, a database not ending `_test`, and a dirty QA tree; creates a **detached** worktree at that SHA (never merges, never touches the development worktree); writes `e2e/golive-results/run005/environment.json` (application SHA, QA suite SHA, DB, fixture version, Node, Playwright, OS). Browser engine versions are appended to the run report by the report generator from the Playwright run.
Fixtures: Starter tenants `qa-starter`, `qa-prov-a`, `qa-prov-b`; add a **Growth** tenant (`provision-tenant.mjs qa-growth "QA Growth" qa-owner-g@qa.dijipeople.test growth`) for entitled import and Growth-gated checks. Local mail sink :1025/:8025; TLS front :3444 for WebKit. Credentials only in gitignored `.env.qa.local*` (also listed in the shared git exclude file; never `git add -A` without checking `git diff --cached --name-only`).
Playwright MCP is only usable after the user runs `/mcp` (config is read at server start); until `browser_get_config` shows the local origins, use Playwright Test.

Growth tenant for RUN-005: `provision-tenant.mjs qa-growth "QA Growth" qa-owner-g@qa.dijipeople.test growth`, `owner-access.mjs qa-growth` twice, `seed-role-users.mjs qa-growth qa-owner-g@qa.dijipeople.test g`, then set `QA_TENANT_G_SLUG=qa-growth` and `QA_TENANT_G_OWNER=qa-owner-g@qa.dijipeople.test` in `.env.qa.local` (gitignored). Without them the GRW-010..013 tests are reported Not Run. Traceability: `cd e2e; node golive/tools/traceability.mjs --write`.


## RUN-006 (new subscription requirements)
See [[RUN-006-PREPARATION]]. Extra fixtures: an Enterprise tenant (provision-plan-tenants.ps1) and, once Q3 is answered, a Custom tenant; keys QA_TENANT_{G,E,C}_SLUG and _OWNER in .env.qa.local. Repeated WebKit regression: webkit-regression.ps1. Idle-expiry tests need no extra service (tenant policy idleTimeoutMinutes).


## RUN-006 execution notes
Worktree `dijipeople-starter-verify6` (detached at the application SHA), database `dijipeople_starterv6_test`, ports API 4297 / web 3214 / TLS 3644 / sink 1225 and 8225. Results go to `e2e/golive-results/run006/` (never `run005`): `run-project.ps1` and `run-all-browsers.ps1` default to it. Merge targeted reruns with `merge-run.cjs <runDir> <outDir> <subset files>`, keep only the five per-project files in the merged folder, then `make-run-report.mjs --dir e2e/golive-results/run006/merged` and `retest-matrix.mjs`. Tenants: A, B, G, E, C (Custom = Growth plan + `CUSTOM` overrides) plus `qa-probe`. Agent sign-in payload: email, password, deviceFingerprint, deviceName, os, platform, agentVersion. Redact tokens before screenshotting e-mails.
