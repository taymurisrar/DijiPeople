# Decisions and observations

Part of [[README]]. Facts are marked **CONFIRMED** (reproduced) or **SUSPECTED** (inferred, not proven).

## Decisions

| ID | Decision | Why |
|---|---|---|
| DEC-001 | QA runs in its own worktree `agent/starter-golive-qa` against `dijipeople_starterqa_test`, API :4098, web :3012. | Primary checkout is the user's; the shared dev DB is populated and must not be reset. |
| DEC-002 | Leads, Customers, Projects, Timesheets are tested only as **plan exclusions**. | They are not Starter features (see [[STARTER-SCOPE]]). Leads/Customers are admin-app commercial modules, out of scope. |
| DEC-003 | Tenant is addressed by **subdomain** (`qa-starter.localhost`), not `?tenant=`. | `?tenant=` is forwarded by some pages to the API, which rejects it (`property tenant should not exist`) — a localhost-only artefact that produced false failures on `/approvals` in the first run. Production is host-based. |
| DEC-004 | Playwright **MCP** was not usable for the local stack; automation uses Playwright Test + node scripts. | `.mcp.json` `--allowed-origins` lists production hosts only, so `localhost` navigations return `ERR_BLOCKED_BY_CLIENT`. Widening it edits shared repo config and needs a session restart; not done without the owner's say-so. |
| DEC-005 | Enforcement set to `ENFORCE` on the QA DB. | Default `REPORT_ONLY` would make every exclusion test meaningless. The default-mode behaviour is recorded as OBS-001. |
| DEC-006 | Firefox/WebKit run only `@xbrowser`-tagged tests. | Keeps cross-engine runs focused on rendering/interaction rather than repeating API checks. |

## Observations

| ID | Observation | Status |
|---|---|---|
| OBS-001 | Plan enforcement defaults to `REPORT_ONLY`. A fresh `seed:config` leaves `entitlementEnforcement` unset. On a Starter tenant in that mode `/projects`, `/payroll/runs`, `/timesheets` returned **200** (API) and rendered. Production's mode cannot be read from here. | CONFIRMED locally; **owner must confirm prod mode before go-live** |
| OBS-002 | `seed-demo` creates the tenant with **no Subscription**. With no live subscription, entitlement resolves to `NO_LIVE_SUBSCRIPTION`. QA added a Starter subscription by SQL. | CONFIRMED |
| OBS-003 | `Claims`, `Approvals`, `Reports` have no feature key and appear on every plan, including Starter. | CONFIRMED; intent unknown |
| OBS-004 | Dashboard tile "Pending process items — Leave, payroll, and timesheet work waiting for action" names modules a Starter tenant does not own. | CONFIRMED (copy only) |
| OBS-005 | Employee record form shows tabs for Timesheets, Compensation, Payslips, Project Allocations on a Starter tenant. | CONFIRMED — see issue register |
| OBS-006 | No documented performance targets found for the web app; provisional thresholds in [[TEST-MATRIX]] need approval. | OPEN |
| OBS-007 | Local benchmark numbers are `next dev --webpack` (unoptimised, cold-compile). Not evidence of production performance. | standing caveat |

## Added in RUN-002 (2026-10-30)

| ID | Item |
|---|---|
| DEC-007 | **Playwright MCP.** `.mcp.json` `--allowed-origins` was extended on the QA branch with exact origins only (`qa-starter`/`qa-prov-a`/`qa-prov-b.localhost:3012`, `localhost:3012`, `127.0.0.1:3012`, `localhost:4098`, `127.0.0.1:4098`; no wildcards, existing production entries untouched). The **running** MCP server was launched with the old argument list and still answers `ERR_BLOCKED_BY_CLIENT` for every local origin (verified twice). It takes effect only when the MCP server is restarted from a checkout containing the change; I cannot restart it from inside the session. All visual verification therefore used Playwright Test screenshots read back by the agent. **Blocker recorded, not worked around.** |
| DEC-008 | **Tenants.** `qa-starter` = seed-demo (comparison only). `qa-prov-a` and `qa-prov-b` were created through customer → onboarding → create-tenant, Starter plan, owner activated through the activation API, users/employees created through the tenant's own admin API (`e2e/golive/tools/provision-tenant.mjs`, `owner-access.mjs`, `seed-role-users.mjs`). Fixture shortcuts, all on the throwaway DB only: one FULLY_SIGNED `SUBSCRIPTION_AGREEMENT` Contract row inserted (the real gate needs the contracts signing workflow); `tenant-provisioning.wildcardDnsReady=true` (localhost has no DNS); tenant status walked PENDING_SETUP → ACTIVE through the real endpoint. |
| DEC-009 | `DP-QA-002` verdict: **application defect**, reproduced on provisioned tenants, authorization not weakened. |
| OBS-008 | A freshly provisioned tenant has **no leave types, no shift templates, no work sites** → leave cannot be requested and attendance cannot be recorded until an admin configures them. Seed-demo hides this. Product/onboarding decision. |
| OBS-009 | Provisioning required three operator gates in QA (executed subscription agreement, wildcard-DNS flag, owner activation before ACTIVE). Confirm the production runbook. |
| OBS-010 | Activation links are generated for `<slug>.dijipeople.com:<web port>` even locally (production root domain from env). No email was sent (SMTP empty, `ENABLE_EMAILS=false`). Gate B5. |
| OBS-011 | The login throttle is an in-memory fixed window keyed on IP + path (20 / 10 min). Failed and successful attempts both count; restarting the API clears it. Ten-plus UI logins per role in a row will hit it. |
| OBS-012 | `next dev` aborted once with a V8 out-of-memory fatal error under the full suite (all UI logins then failed until restarted with `--max-old-space-size=6144`). Environment, not product. |
| OBS-013 | Documents: uploads of `.txt` are refused ("Uploaded file type is not supported") — a type allowlist exists; `.exe`, `.html`, `.svg`-with-script and traversal filenames were refused or neutralised (DOC-004…007 pass). Size limit 10 MB enforced. |
| OBS-014 | Firefox/WebKit report CSP **Report-Only** notices (`script-src` without `'unsafe-eval'`) from the dev server; the test fixture ignores them. Production CSP must be checked (gate B8). |
| OBS-015 | Local QA clock was a Friday, a scheduled off day, so self check-in was refused with a clear reason ("scheduled off day"): the refusal text is good. |

## Added in RUN-003 (2026-10-31)

| ID | Item |
|---|---|
| DEC-010 | **MCP diagnosis (exact).** `browser_get_config` on the live server shows `network.allowedOrigins` = the original nine production entries only; `browser_navigate` to `http://qa-prov-a.localhost:3012/login` → `net::ERR_BLOCKED_BY_CLIENT` (page `chrome-error://chromewebdata/`). Cause: the MCP process was started from the **primary checkout** with its `.mcp.json`; my change is on the QA branch/worktree (valid JSON, BOM removed in e80e9492) and cannot reach a running process. A reconnect from inside the session is not possible. **Not retried further and not bypassed** (`browser_run_code_unsafe` could strip the route filter, but that would defeat the owner's origin policy). Unblock: start Claude Code from the worktree, or copy the same exact-origin entries into the primary `.mcp.json`, then reconnect with `/mcp`. |
| DEC-011 | **Production-mode runs.** `next build --webpack` works through the junctioned node_modules; `next start -p 3012` serves it. Dev-server artefacts disappeared (CSP report-only noise, 7–11 s loads, V8 OOM). |
| DEC-012 | **WebKit needs HTTPS.** Production-mode cookies are `Secure`; WebKit never stores them on `http://` (no cookies after login on `qa-starter.localhost` or `localhost`). `e2e/golive/tools/tls-proxy.cjs` fronts the app on https :3443 with a self-signed `*.localhost` cert; run WebKit with `QA_WEB_URL=https://qa-starter.localhost:3443`. Not a product defect. |
| OBS-016 | The authenticated API rate limit is 600 reads / 60 s and 120 writes / 60 s **per user per method class**. The suite shares owner tokens, so heavy sequences need a cooldown; see DP-QA-024 for the user-facing failure mode. |
| OBS-017 | Employee export/import: CSV text is parsed by the import endpoint (bad rows are reported per row and nothing is created); designation/department delete is a **soft delete** that renames the row `<name> [deleted <id8>]` and leaves it readable by id. |
| OBS-018 | Duplicate prevention is solid for employees: same work email refused (409), case-insensitively, and 5 simultaneous creates produce one row. Concurrent edits of different fields both persisted (no lost update observed). |


## RUN-004 decisions and observations
- OBS-019 Candidate environment: detached worktree at 22a21a14, fresh DB dijipeople_starterv4_test, API :4097 with `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` (floor; no PlatformSetting written), production web build :3014, TLS :3444 for WebKit, local SMTP sink. No production access.
- OBS-020 Entitlement floor: malformed env value fails closed to ENFORCE (verified on a second API :4096). Boot warning cannot be exercised locally - Blocked(environment).
- OBS-021 Tokens: invitation = 64-hex DB token; reset = signed JWT with 24 h TTL. Reset e-mails are throttled ~60 s per user; password history refuses reuse.
- OBS-022 Tenant branding applies to the login page but not to e-mails (DP-QA-026).
- DEC-013 MCP: owner authorised exact local origins (no wildcards) in the primary `.mcp.json` (uncommitted, user may keep or revert); live MCP needs `/mcp` reconnect. Testing continued with Playwright Test.
- DEC-014 Test corrections justified in RUN-004: ISO-004 expects 404 (confirmed contract); RBAC-2-PRICE replaces RBAC-2-MANAGER-03; leave form uses `available-types`.

## RUN-005 decisions and observations
- DEC-015 Starter bulk import is Growth-gated (owner). Tests now assert the gate and that Import is absent from Data Transfer; Export and Export Template remain Starter features.
- DEC-016 Approved leave may be cancelled through the approved workflow (DP-QA-019 contract change).
- DEC-017 E-mail branding (DP-QA-026): not assumed optional. Facts: the Starter feature list includes "branding"; the code marks the three e-mail branding settings NOT_IMPLEMENTED and the Branding screen does not offer them; delivered e-mails carry the tenant company name and own host but a fixed subject, platform colour, no logo/footer. No plan text promises branded e-mails. Recommendation to the owner: either implement, or state "platform-branded e-mails" in the Starter description before go-live.
- OBS-023 The sign-in limiter (20 per 10 min per IP+path, in memory) is the dominant source of false failures in long serial runs: ENT-004/005/030/060 and SEC-008 failed only because of it. Mitigation: restart only the QA API between projects (`run-all-browsers.ps1`), 429-aware logins.
- OBS-024 Editing spec files while a Playwright run is in progress breaks worker restarts ("Test not found in the worker process" rows with 0 ms): never edit during a run.
- OBS-025 `e2e/golive/` is excluded by the shared git exclude; RUN-004 suite files (mail fixture, specs 15-17, tools) had never been committed and were added with `git add -f` at the start of RUN-005.
- OBS-026 MCP can only read storage-state files inside the primary checkout; test sessions were copied into the git-ignored `.playwright-mcp/` for use and deleted afterwards.
- OBS-027 Another session's mail sink used 1025/8025; RUN-005 used its own ports (sink 1125/8125, API 4197, web 3114, TLS 3544) and never touched foreign processes.

## RUN-006 (2026-11-01)
- DEC-018 Basic import/export/templates are on every plan; Advanced Data Management is premium and has no routes (owner, 2026-10-31/11-01). Tests assert the new contract; Advanced Data Management is reported as not implemented.
- DEC-019 Desktop Agent: Enterprise, or Custom only when explicitly entitled. Custom has no plan key: it is `CUSTOM` TenantFeature rows on a plan. Whether `enterprise-plus` should carry the agent by default is open: [[DP-QA-042]].
- DEC-020 E-mail: essential branding on every plan (name, logo, AA-safe colour, "Powered by DijiPeople"); template authoring Growth+; white-label (no attribution, custom footer line) Enterprise/Custom.
- OBS-028 `idleTimeoutMinutes` has a product minimum of 15 and a maximum of 1440; a lower value is stored as given and enforced as 15. Idle expiry is tested by ageing `lastActivityAt` in the throwaway DB.
- OBS-029 Entitlement changes take effect after about 60 s (in-process cache): withdrawing the Custom grant cut the old access token and new sign-ins at 54-62 s.
- OBS-030 `GET /agent/settings` is readable by any employee of an entitled tenant (the agent's own policy read); administration (`PATCH`) is refused for employees.
- OBS-031 `enterprise-plus` cannot be sold through onboarding (no active price); a Custom customer on it is created by other means.
- OBS-032 White-label removes only the attribution line; body copy still says "your DijiPeople account" and the footer names support@dijipeople.com.
- OBS-033 E-mail links use the configured root domain (`*.dijipeople.com`) with the local port; they cannot be followed locally. Production link host is gate B5.
- OBS-034 The QA environment shows a "Development environment" banner (`APP_ENV=development`); not a product defect.
- OBS-035 Running `seed:config` against a QA database is itself a state change (default approval matrices, Console providers, notification rows): the seed suite must run last, or the fixture be re-prepared. The next run should provision a fresh database for the seed suite.
- OBS-036 `Get-NetTCPConnection` returned nothing in the agent shell, so port-owner based "restarts" silently kept the old API process and its hot login limiter; the restart script now finds the QA API by command line.
- OBS-037 An MCP screenshot of a reset e-mail contained a live token in the visible link. It was deleted and re-rendered with the token redacted; secret scanning does not read PNGs, so e-mail renders must be redacted before capture.

## RUN-007 preparation (2026-11-01)
- DEC-021 Standard exports exclude soft-deleted employees, national IDs, tax IDs and internal encrypted/hashed/storage fields (owner). Supersedes the "plaintext identifier" open question of RUN-006; tests EXP-001..003 assert it.
- DEC-022 Sensitive-identifier export, if supported at all, needs explicit authorization, deliberate field selection and an audit row (owner). EXP-004.
- DEC-023 Desktop Agent and white-label require explicit grants on Custom subscriptions even when based on enterprise-plus (owner). Resolves the direction of [[DP-QA-042]]: the current default is a deviation; CUS-001..005 assert the decision.
- DEC-024 Deployment seeding preserves valid approval workflows, e-mail settings and other tenant-specific configuration (owner). APR-010..012, EML-001..004.
- DEC-025 Revoked or downgraded agent credentials must respect current entitlements promptly (owner). QA budget: 120 s (`PROMPT_MS`), because enforcement today takes about 60 s; the owner may tighten it.
- OBS-038 RUN-007 must not apply the RUN-006 administrator remediation (owner assigned to system-admin) to any tenant; it was a workaround for DP-QA-036.
- OBS-039 Custom on enterprise-plus cannot be created through onboarding; the suite switches tenant C's plan in the throwaway database and restores it.

## RUN-007 preparation, revision 2 (2026-11-01, owner FINAL subscription architecture)
- DEC-026 DijiPeople has exactly THREE predefined plans: Starter, Growth, Enterprise. `enterprise-plus` is not a valid predefined plan and is to be eliminated. All other plans are dynamically created Custom plans (individual customers, periods, pilots, promotions, negotiated contracts) and never inherit Enterprise entitlements. Supersedes DEC-023 and the "Custom on enterprise-plus" mechanism of preparation revision 1; [[DP-QA-042]] is reframed.
- DEC-027 Basic import / export / templates are the universal baseline of every plan (including Custom plans with fewer features than Starter), subject to role permissions and module entitlement. Reaffirms DEC-018.
- DEC-028 Desktop Agent and e-mail white-label are accessible only when the Custom plan explicitly includes them; a Custom plan's resolved feature set must equal its listed features exactly.
- DEC-029 Predefined-plan seeds never overwrite Custom-plan definitions; legacy `enterprise-plus` data migrates safely and legitimate subscriptions and contractual entitlements are preserved.
- DEC-030 RUN-007 is not executed against `dfd829f3` (superseded model, handoff v5) and no `enterprise-plus` behaviour is accepted; execution waits for the newly completed committed SHA.
- OBS-040 Revision 1 emulated Custom with `TenantFeature` CUSTOM rows and an `enterprise-plus` plan switch in SQL. That was a fixture workaround for a mechanism the owner has now rejected; the suite no longer writes `TenantFeature` or `Plan` rows. AGT-020 (override-row withdrawal) is marked superseded by CUS-010/CUS-012 and is never counted as passed.
- OBS-041 The supported plan mechanism already exists in the platform API (`POST /super-admin/plans`, plan prices, `PATCH /super-admin/tenants/:id/subscription` with start/end dates and status). The tests exercise it; whether it covers eligibility and validity-date lifecycle as the owner expects is itself under test (CPL-004, CUS-030, CUS-031).
