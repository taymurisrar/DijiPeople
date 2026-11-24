# DP-MASTER R1 release manifest (window 2026-12-01 to 2026-12-07)

Status: **R1 CANDIDATE - G4 NOT CLAIMED.** Integrated into `develop` at `bdca89a2` with
exact-SHA CI green (run 45490638428). No deployment, no `main` change, no production data
touched. The gate table below says exactly what was and was not proven.

## Included (integrated)

| Slice | What shipped | Evidence |
|---|---|---|
| WP-01.S1/S2 | Baseline, traceability (53/53), DAG, estimates, benchmark, budgets | `docs/programs/dp-master/*`, `node scripts/dp-master.mjs check` |
| WP-03.S1 | Workflow conditions fail closed; PARTIALLY_FAILED run status | `workflow-conditions.spec.ts`, `workflow-runtime.service.spec.ts` |
| WP-03.S2 | Stable `workflowKey`, immutable `WorkflowVersion`, runs record the version | migration `20261125120000`, `workflows.service.versioning.spec.ts` |
| WP-04.S1 | `recruitment.application.stage.changed` event; `CANDIDATE` recipient mode | `recruitment-stage-event.spec.ts`, runtime spec |
| WP-08.S0/S0b | Terminate revokes web and agent access; default-ON sweeper for future dates; BUG-4774 FIXED (REG-730, QA-AUTH-031) | `employee-terminate-access.spec.ts`, `access-revocation-sweeper.worker.spec.ts`; mutation: 5 of 7 fail without the fix |
| WP-17.S2 | Window titles off and DLP consent required by default, all tenants, audited and reversible; read-time override removed; tray "What this app collects" | migration `20261125090000` applied, re-run and rolled back on an isolated database; `agent-privacy-defaults.spec.ts`, `collection-disclosure.spec.ts` |
| WP-35.S0 / WP-02.S0 | ADR-0030 (PROPOSED) | `docs/decisions/ADR-0030-*` |

## Gate evidence

| Gate item | Result | How |
|---|---|---|
| Supported Node | PASS | Node 22.23.4 for every local run; preflight 9/9 |
| API unit | PASS | 528 suites / 9,148 tests |
| Desktop agent unit | PASS | 9 suites / 136 tests |
| API typecheck, web typecheck | PASS | `tsc --noEmit` (web run before the final one-line type edit, re-covered by CI Typecheck) |
| Migration on a fresh database | PASS | 247 migrations, 32 s |
| Migration with legacy data | PASS | workflow backfill and privacy defaults verified with seeded rows |
| Rollback rehearsal | PARTIAL | privacy defaults: rolled back from the audit rows and re-checked. Workflow migration is additive and not rolled back |
| Entitlement regression | PASS | `plan-entitlement-matrix`, `agent-entitlement`, `custom-plan-entitlement` in the full suite |
| Targeted database e2e | PASS | 4 suites / 231 tests (AppModule boot, permissions, tenant lifecycle, payroll cross-tenant) |
| CI exact SHA | PASS | run 45490638428 on `bdca89a2`, all required jobs including Browser e2e and Database e2e |
| Lint budget | PASS | 737 warnings, 0 errors (ceiling 787) |

## Not proven (G4 open items)

- Browser verification of the new UI: the PARTIALLY_FAILED row in workflow run history, the
  CANDIDATE recipient option, and the agent tray disclosure (the tray is Electron; unit-tested only).
- No database-level test of the sweeper query or of `revokeLinkedUserAccess` against real rows
  (unit mocks only; the Database e2e job does not cover it).
- Full local database e2e was started but stopped (one suite took 80 s); only the four targeted
  suites were run locally. CI's Database e2e job passed.
- Independent review: none. The same agent wrote and tested the change.
- No operational runbook for the sweeper beyond `docs/environment-variables.md`.
- Consent enforcement needs a published `dlp-monitoring-policy` legal document and employee
  acknowledgement; none is seeded, so consent-required tenants that had capture on now capture
  nothing until their admin publishes it. That is the approved intent, but it is a visible change.
- Existing tenants that relied on window-title capture lose it until they opt in again.
- Terminate still does not cancel pending approvals or hand off work (WP-08 proper).
- Rate and latency budgets (T-SCALE) are unmeasured.

## Rollback

- Privacy defaults: SQL in the migration header restores each tenant from `AGENT_PRIVACY_DEFAULTS_APPLIED` audit rows.
- Sweeper: set `ACCESS_REVOCATION_SWEEPER_ENABLED=false` (disables future-dated revocation; immediate revocation stays).
- Workflow versioning: columns and table are additive and ignored by older code.
