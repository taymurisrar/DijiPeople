# DP-QA-051 — The QA-verified Starter go-live remediation (60 commits, application `4dd29d3a`) is not in production release `2a473785`

| Field | Value |
|---|---|
| Category | Release process / deployment gap |
| Severity / Priority | High / **P1 release blocker** for Starter go-live to real customers |
| Status | Open |
| Found | Post-deploy verification 2026-11-03, `git merge-base --is-ancestor`, `git cherry`, marker greps, live `/api/health` |
| Evidence | [[PRODUCTION-VERIFICATION-2026-11-03]] sections 1 and 4 |

**Observed.** Production serves `2a473785` (health `commit 2a47378…`). `4dd29d3a`, the candidate RUN-001..RUN-008 tested, is **not an ancestor** of it; the merge base is `214433c1` (2026-10-29); `git cherry 2a473785 4dd29d3a` lists **60 commits, none patch-equivalent in production**. Until the verification pushed a branch containing it, no remote branch held the work: it existed only on a local branch (`agent/starter-golive-remediation`, "local only: not pushed, merged or deployed" in the handoff). Production lacks `assertPlanAssignableToTenant`, `describeEnforcement`, `setPlanPricePublication`, the plain-anchor rule for `/api/` links, `PlanKind` and the migration `20261102090000_plan_kind_and_custom_plan_metadata`; `enterprise-plus` is still a published, publicly listed plan.

**Impact.** Every RUN-008 verdict ("READY for Starter") applies to code that has not shipped. Defects QA closed remain live in production, among them single-use invitation and reset tokens (DP-QA-027/031), soft-deleted rows in the entity data API (030), exports with deleted employees and sensitive identifiers (037/038), `/auth/me` ignoring the idle window (040), approval routing and `seed:config` overwriting tenant mail configuration (036/039), leave-balance atomicity (029), and the entitlement floor, release gate and health reporting (005). Exposure today is low (two Starter tenants with no employees, one demo tenant) and rises with the first real onboarding.

**Resolution (owner's, not performed).** Reconcile `main` into `develop`, PR the remediation (a dry-run merge conflicts only in two generated indexes), CI, rehearse the migration on a restored production copy, release by PR. QA retests production afterwards.

| Run | Result |
|---|---|
| Post-deploy verification 2026-11-03 | **OPEN** — remediation preserved on the pushed branch `agent/smoke-tenant-login`; nothing cherry-picked or deployed |
