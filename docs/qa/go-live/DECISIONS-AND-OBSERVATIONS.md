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
