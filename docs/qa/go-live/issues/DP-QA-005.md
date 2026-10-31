# DP-QA-005 — Entitlement enforcement defaults to REPORT_ONLY: a Starter tenant can use every module until the platform setting is flipped

| Field | Value |
|---|---|
| Category | Observation → potentially Functional / Revenue (plan enforcement) |
| Severity / Priority | High / **P1 if production is in REPORT_ONLY; P3 if ENFORCE is already set** |
| Status | Open — **owner decision required** |
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
