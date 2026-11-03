# DP-QA-052 — `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` in Render does nothing on release `2a473785`; production enforcement rests on one database row with no audit trail

| Field | Value |
|---|---|
| Category | Configuration / misleading control |
| Severity / Priority | Medium / **P2** (enforcement is correct today; the control is easy to misread) |
| Status | Open (resolved by shipping DP-QA-051, plus an audit trail) |
| Found | Post-deploy verification 2026-11-03 |
| Evidence | [[PRODUCTION-VERIFICATION-2026-11-03]] sections 1 and 2 |

**Observed.** The deployed `TenantEntitlementService.mode()` reads only `PlatformSetting module-settings.entitlementEnforcement`; the variable is read nowhere in the production API source, `render.yaml` does not declare it, and `/api/health` does not report the mode. The Render service has the variable set to `ENFORCE`, the database row is `ENFORCE` (updated `2026-11-03T12:44:14Z`), and **no `PlatformAuditLog` or `AuditLog` row records who or what set it**. If the row were reset (a restore from an older backup, a manual edit, a seed that ever stopped merging stored values), production would silently return to `REPORT_ONLY` while the Render variable still said `ENFORCE`.

**Impact.** The owner's action in Render gives a false sense of a second safeguard. Today production is protected by the row alone.

**Resolution.** Ship the RUN-007 remediation (the variable becomes a floor that is never weaker than itself, the release gate refuses an unenforced production release, `/api/health` reports the effective mode); write an audit row whenever `module-settings` changes; until then treat the database row as the only control and check it after any restore.

| Run | Result |
|---|---|
| Post-deploy verification 2026-11-03 | **OPEN** |
