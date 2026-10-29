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
