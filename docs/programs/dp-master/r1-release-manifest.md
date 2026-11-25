# DP-MASTER R1 release manifest (window 2026-12-01 to 2026-12-07)

Status: **R1 CANDIDATE - G4 NOT MET.** Two verification items could not be performed (below);
everything else is evidenced. Integrated base: `develop` at `fe15f090`; this manifest describes the
G4 hardening on top of it (commit recorded in `program-state.json`). No deployment, no `main`
change, no production data touched.

## What R1 contains

| Slice | What it does | Evidence |
|---|---|---|
| WP-01.S1/S2 | Baseline, 53/53 traceability, DAG, benchmark, measured budgets | `docs/programs/dp-master/*`, `node scripts/dp-master.mjs check` |
| WP-03.S1 | Conditions fail closed; PARTIALLY_FAILED status and UI | unit specs |
| WP-03.S2 | Stable `workflowKey`, immutable `WorkflowVersion`, runs record the version; migration verified with colliding names ("A", "a ", "A 2") | `workflow-versioning.e2e-spec.ts` (real DB) |
| WP-03 (G4) | Authoring validation of condition path, value and operator type; runs execute the PINNED snapshot and refuse an ACTIVE workflow with no published version; saves of one workflow serialise on a row lock | `workflow-conditions.spec.ts`, runtime spec, `workflow-versioning.e2e-spec.ts` |
| WP-04.S1 | `recruitment.application.stage.changed`; `CANDIDATE` recipient | unit specs |
| WP-08 | Terminate = status + user DISABLED + web and agent tokens + audit in ONE transaction under a row lock; sweeper (ON by default, every 60 s) re-verifies under the lock, so a concurrent rehire or reschedule wins; owner never disabled; disabled users holding tokens are recovered; keyset cursor prevents starvation; an exit already in effect keeps its date; login, refresh and `/auth/me` refuse on the effective date | `employee-access-revocation.e2e-spec.ts` (11 tests, real database, real guard, real row locks); removing the lock re-check and the auth check makes 3 of them fail |
| WP-17 | Window titles off by default and in the agent (also before first sync); consent is MANDATORY whenever content capture is on, for the CURRENT policy version, and cannot be waived by the tenant flag; the agent is told capture is off until acknowledged, drops buffered events, and stops and re-syncs when the server refuses; employee can read and acknowledge the policy from the tray; acknowledgement and its audit row commit together; migration is audited and reversible | `dlp-monitoring-consent.e2e-spec.ts` (real DB), `agent-monitoring-consent.spec.ts`, `dlp.service.spec.ts`, agent `dlp-manager`, `config-manager`, `tray`, `collection-disclosure` specs |
| WP-35.S0 / WP-02.S0 | ADR-0030 (PROPOSED) | `docs/decisions/ADR-0030-*` |

## Gate evidence (Node 22.23.4, isolated PostgreSQL 18)

| Gate item | Result |
|---|---|
| API unit suite | PASS: 527+ suites / 9,155+ tests |
| Desktop agent suite | PASS: 10 suites / 146 tests; `tsc --noEmit` clean |
| Database e2e (targeted, real DB + real guard) | PASS: 7 suites / 252 tests: access revocation, workflow versioning, DLP consent, tenant lifecycle, permission propagation, payroll cross-tenant, **auth query budget (ceiling 25 held)** |
| Migrations | fresh deploy 32 s; backfills verified with legacy rows; privacy migration re-run and rolled back |
| Entitlement regression | PASS (plan/agent/custom entitlement specs in the full suite) |
| T-SCALE smoke (opt-in `DP_SCALE_SMOKE=1`) | measured, not a capacity claim: 1,000 terminated employees (1,000 users, 1,000 web + 1,000 agent tokens) revoked in one sweep in 18.1 s (18 ms each); authenticated `GET /roles` sequential x100 p50 31 ms p95 84 ms; 50 concurrent identical requests complete in 1.2 s wall (single process; identical concurrent requests serialise, so read it as throughput, not latency) |
| Independent review | DONE by a separate read-only agent (not a human; see limits). 12 findings; all medium findings fixed or answered, see below |
| Runbook | `docs/engineering/runbooks/access-revocation-sweeper.md` |
| Regression-id reconciliation | REG-730 is the register's next id and is used; the allocator ledger is inflated (REG-4276+) by validate-framework probes: ITEM-0246 |

## Independent review: disposition

| # | Finding | Disposition |
|---|---|---|
| 1 | Key backfill can collide (`A`,`A`,`A 2`) and abort the migration | Fixed: second pass appends the row id; verified on a database holding exactly those names |
| 2 | Consent waivable through the tenant flag | Fixed: mandatory whenever capture is on (server config, ingest) |
| 3 | Agent keeps capturing on stale consent | Fixed: server refusal stops sampling, purges buffers, forces a config refresh; test added |
| 4 | Acknowledgement and audit not atomic | Fixed: one transaction |
| 5 | Per-request employee read breaks the BUG-3165 query budget | Confirmed (26 > 25). Fixed without raising the ceiling: the check runs on login, refresh and `/auth/me`; the guard path is unchanged; sweeper interval cut to 60 s. Residual below |
| 6 | Concurrent saves of one workflow could 500 on the version number | Fixed: row lock. Slug collision between two simultaneous creates of different names remains possible and returns an error rather than corrupting data |
| 7 | Email template content stays live | Accepted: templates have their own lifecycle; the snapshot pins conditions, the action list and template references, not template text. Recorded limitation |
| 8 | ACTIVE workflow set directly in the database has no version | Accepted: fails closed with a visible FAILED run |
| 9 | Re-terminate could move a past date to the future | Fixed: an exit already in effect keeps its date |
| 10 | Behaviour change on deploy | Documented in the runbook; needs a customer note |
| 11 | Weak 500 assertion | Fixed (`toBe(500)`) |
| 12 | Concurrency | No deadlock found |

## NOT proven (why G4 stays open)

1. **No real-Electron run.** The tray menu, disclosure lines and the acknowledgement dialog are verified against the
   menu template the real code builds (mocked Electron module), not in a running Electron window.
2. **No browser run of the two web tweaks** (PARTIALLY_FAILED badge and the CANDIDATE recipient option). Type-checked
   and linted; CI's browser job does not exercise them.
3. The independent review was another AI agent working from the diff; it ran no code, and did not read every spec.
4. Residual access: after a future-dated exit takes effect, an access token issued earlier works on ordinary endpoints
   for up to one sweep interval (60 s) unless the user signs in again or refreshes.
5. Consent prerequisites: nobody can acknowledge until a platform admin publishes a `dlp-monitoring-policy` legal
   document (its text needs legal review: owner decision). Until then content capture is off for everyone who has it
   enabled. Tenants relying on window titles must opt in again.
6. The workflow backfill and privacy migration are edited/created before any shared environment applied them; the
   edit to `20261125120000` was made after it reached `develop` but before any deployment.

## Rollback

- Privacy defaults: SQL in the migration header restores each tenant from the `AGENT_PRIVACY_DEFAULTS_APPLIED` audit rows.
- Sweeper: `ACCESS_REVOCATION_SWEEPER_ENABLED=false` (immediate revocation stays; see the runbook for the effect).
- Workflow versioning: additive columns/table, ignored by older code.
