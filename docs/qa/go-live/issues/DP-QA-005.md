# DP-QA-005 — Entitlement enforcement defaults to REPORT_ONLY: a Starter tenant can use every module until the platform setting is flipped

| Field | Value |
|---|---|
| Category | Observation → potentially Functional / Revenue (plan enforcement) |
| Severity / Priority | High / **P1 if production is in REPORT_ONLY; P3 if ENFORCE is already set** |
| Status | Open (owner gate) — the candidate's release gate is verified; production still needs `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` |
| Evidence | probe output in [[DECISIONS-AND-OBSERVATIONS]] OBS-001; code `common/security/tenant-entitlement.service.ts` |

## Facts (CONFIRMED locally)
- `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE = 'REPORT_ONLY'`. A fresh `seed:config` leaves `module-settings.entitlementEnforcement` unset.
- On the QA Starter tenant in default mode: `GET /api/projects` 200, `GET /api/payroll/runs` 200, `GET /api/claims` 200,
  `/projects` renders data. After setting `ENFORCE` (60 s cache): 403 on all non-Starter modules.
- seed-demo gives the tenant **no subscription**; absent a live subscription entitlement is `NO_LIVE_SUBSCRIPTION`.

## Not verifiable here
What mode production currently runs. QA must not read production. **Action for owner:** confirm the production
`module-settings.entitlementEnforcement` value (admin console → platform settings) before go-live; a Starter customer
could otherwise use Growth/Enterprise modules for the Starter price.

## Retest history
| Run | Result |
|---|---|
| RUN-001 | OBSERVED |
| RUN-005 (f47e504c) | **OPEN** - Mechanism verified locally: ENFORCE env floor with NO PlatformSetting row -> Starter-excluded routes 403 (ENT-*, ENT-060..065, GRW-*); a malformed floor value fails closed to ENFORCE (second API :4196: /data-management/modules 403, /job-openings 403, /employees 200). Production state and grandfathering are the owner gate (PRODUCTION-RELEASE-GATES A1-A5); ENTITLEMENT_NOT_ENFORCED boot warning Blocked(environment) |
| RUN-006 (`17d0dcaf`) | **OPEN (OWNER GATE)** - mechanism re-verified locally on `17d0dcaf` (ENFORCE environment floor, no PlatformSetting row: ENT-*, MTX-001, AGT-*, IMX-* pass); production `ENFORCE`/grandfathering remains a separately authorised deployment gate (A1..A5) |
| RUN-007 (`98f9b025`) | **OPEN (owner gate)** — unchanged by the candidate: every RUN-007 result is under the `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` environment floor; with no floor and no `PlatformSetting` row the code default is still REPORT_ONLY. Production must set the variable and the deploy must be checked |
| RUN-008 (`4dd29d3a`) | **GATE MECHANISM VERIFIED; PRODUCTION CUTOVER STILL THE OWNER'S** — GATE-001 the candidate's own gate tests pass; GATE-002 the release gate exits 1 in production for unset / REPORT_ONLY / OFF / empty / lower-case / `ENFORCED`, 0 for `ENFORCE`, 0 with a loud `ACKNOWLEDGED_UNENFORCED` warning only for `ENTITLEMENT_ALLOW_UNENFORCED=true` (not `1`, `yes`, `TRUE`), and does not gate non-production; GATE-003 `npm --workspace api run release` stops at the gate before any Prisma/seed step when unenforced and moves on to migrations only with the exception; GATE-004 the gate is the first step of `release` and `render.yaml` runs it as `preDeployCommand`; GATE-005 `/api/health`, `/api` and `/` report `{mode:'ENFORCE',enforced:true}` on the running service; out of band (GATE-007, `evidence/RUN008-gate-unenforced.md`) an API started without the variable on a database with no setting row reports `REPORT_ONLY`/`false`, `smoke:deployment` fails with the explicit message, and `SMOKE_ALLOW_UNENFORCED=1` prints a warning and passes only that check. The behavioural Starter probe inside the smoke script cannot sign in — DP-QA-048. QA cannot set the production variable. |
