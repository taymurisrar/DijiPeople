# Remediation handoff — Starter go-live defects (for QA verification)

Branch `agent/starter-golive-remediation`, cut from `origin/develop` @ `214433c1`.
Worktree `D:\My Work\hrm-dijipeople\dijipeople-starter-fix`. The QA branch
`agent/starter-golive-qa` was read, never modified. Nothing was merged to `develop` or `main`,
nothing was pushed, deployed, or written to production.

**No defect below is Resolved.** Each is `FIXED — AWAITING QA VERIFICATION`. A developer
test is not a retest; QA owns the transition to Resolved.

## Before QA retests: refresh the tenants

Two fixes reach an *existing* tenant only through `seed:config`, which calls
`bootstrapTenantRbac` and `seedTenantLeaveTypes` for every tenant (it runs in the
pre-deploy command). The QA tenants `qa-starter`, `qa-prov-a`, `qa-prov-b` were
provisioned before these fixes. Either run `npm run seed:config` against the isolated
QA database, or provision a **fresh** tenant through the real workflow (recommended: it
also exercises the provisioning change for DP-QA-011).

## Summary

| ID | Pri | Commit | Status |
|---|---|---|---|
| DP-QA-002 | P1 | `5fb70db6` | Fixed, awaiting QA |
| DP-QA-010 | P1 | `1d7732da` | Fixed, awaiting QA |
| DP-QA-011 | P1 | `2e79ba70` | Fixed (see note on `/leave-types`), awaiting QA |
| DP-QA-012 | P1 | `fea4425a` | Fixed, awaiting QA |
| DP-QA-005 | P1 | `b19d48ab` | Mechanism shipped; **owner cutover still required** |
| DP-QA-016 | P2 | `ce840d7c` | Fixed, awaiting QA |
| DP-QA-014 | P2 | `a5f6fc1f` | Fixed, awaiting QA |
| DP-QA-004 | P2 | `b840fcc0` | Fixed, awaiting QA |
| DP-QA-001 | P2 | `24a44a7e` | Fixed, awaiting QA (UI, not visually verified) |
| DP-QA-015 | P2 | `4f128603` | Fixed, awaiting QA (UI, not visually verified) |
| DP-QA-003 | P3 | `24a44a7e` | Fixed with DP-QA-001, awaiting QA |
| DP-QA-009 | P3 | `c268de9c` | Fixed, awaiting QA |
| DP-QA-008 | P3 | `37ac5804` | Fixed, awaiting QA |
| DP-QA-006 | P3 | — | **Not fixed** — could not locate the cause statically |
| DP-QA-007 | P2 | — | **Not addressed** — needs a production-like measurement |
| DP-QA-013 | P2 | — | **Not addressed** — design decision across 6 screens |
| DP-QA-017 | P2 | — | **Not addressed** — needs a browser to find the selector |

## Per-defect detail

### DP-QA-002 — self-context 403 for non-admin roles
- **Reproduced from evidence:** `GET /employees/me/context` and `/dashboard/summary` demand legacy key `dashboard.view`.
- **Root cause:** `dashboard.view` is listed in `BASE_ROLE_PERMISSION_KEYS`, but nothing in production code reads that map
  (only `wiring-invariants.spec.ts`, whose comment wrongly says "seeding also writes these"). Provisioning writes only
  `SYSTEM_ROLE_PRIVILEGES` + `SYSTEM_ROLE_MISC_PERMISSIONS`, so no non-admin role ever held the key. Every system role already had
  `user-preferences:READ`; the bridge is one-directional.
- **Fix:** `dashboard.view` added to the misc grants of CEO, manager, HR, payroll-manager, recruiter, employee (not the customizer).
  Authorization is not weakened: both guards still apply and row scope is untouched. Web: a 403 is no longer shown as
  "Employee profile not linked" — `getCurrentEmployee()` sets `accessDenied` and `/my-profile` says so.
- **Files:** `rbac-matrix.ts`, `rbac-matrix.self-service-grants.spec.ts`, `current-employee.ts`, `current-employee.spec.ts`, `my-profile/page.tsx`.
- **Tests:** api `src/common/constants` 86/86 (incl. wiring invariants); web `current-employee` 3/3.
- **QA verify:** RBAC-1-EMPLOYEE/MANAGER/HR/PAYROLL; Overview for payroll; `/my-profile` as employee.
- **Residual:** `wiring-invariants.spec.ts` still believes `BASE_ROLE_PERMISSION_KEYS` is granted. That map is dead for provisioning; it
  should be removed or wired — left alone (out of scope, and removing it changes what the invariant proves).

### DP-QA-011 — leave
- **Root causes:** (a) `available-types` needs `dashboard.view` → fixed by DP-QA-002. (b) `POST /leave-requests/:id/cancel` demanded
  the `DELETE` privilege on `leave-requests`, which no non-admin role holds. (c) Provisioning never created leave types; only
  `seed:config` did, so a tenant created between deploys had none.
- **Fix:** cancel accepts `CREATE` **or** `DELETE` (the service still restricts to own or administered requests; the legacy
  `leave-requests.cancel` key is still required). Default leave types are created by provisioning and its retry, **insert-only**
  (`createMany skipDuplicates`) so an admin's rename or deactivation survives. List shared with `seed-config`.
- **Files:** `leave-requests.controller.ts`, `default-leave-types.ts`(+spec), `leave-self-service-permissions.spec.ts`,
  `platform-lifecycle.service.ts`, `tenant-operations.service.ts`, `seed-config.ts`, `tenant-provisioning-retry.spec.ts`.
- **Tests:** leave/super-admin/tenant-control-plane suites green (54 suites, one stub fix in the retry spec).
- **QA verify:** LV-001, LV-008 on a fresh tenant.
- **Needs your eye:** `GET /leave-types` (the *configuration* list) stays 403 for employees on purpose — the employee UI uses
  `available-types`. If LV-001 asserts on `/leave-types`, the test premise should change, not the permission.
- **Observation, not changed:** `seedTenantLeaveTypes` *updates* existing rows and sets `isActive: true` on every deploy, so it
  silently re-activates a type an admin deactivated. Pre-existing; worth its own ticket.

### DP-QA-012 — invalid timezone
- **Fix:** `isValidTimeZone` (probes `Intl.DateTimeFormat`, not `supportedValuesOf`, which omits `UTC`/aliases on some runtimes).
  `organization.timezone` and `defaultTimezone` are validated on `PATCH /tenant-settings` (400, nothing stored); the user-preference
  timezone now returns 400 instead of an unhandled `RangeError`; the resolver degrades a previously stored bad value to `UTC`;
  web `resolveTimezone` falls back instead of throwing.
- **Not validated:** `organization.businessDateTimezone` — the catalog marks it inert and a reader-coverage test forbids code that
  names it. Validate it when something starts reading it.
- **Files:** `common/utils/time-zone.ts`(+spec), `tenant-settings.service.ts`, `tenant-settings-resolver.service.ts`,
  `settings-context.service.ts`, `tenant-settings-timezone.spec.ts`, web `formatting-context.ts`, `formatting-context-timezone.spec.ts`.
- **Tests:** tenant-settings 107/107; web formatting 3/3. **QA verify:** SET-003; console clean afterwards on A11Y-002/003/020/021, RESP-002/003.
- **Other keys (date format, language, currency, week start):** not swept. Currency/locale are validated elsewhere only by shape; recommend a follow-up sweep.

### DP-QA-010 — backend guards for four paid features
- **Decision taken (the QA record flagged it as a product decision):** guard them. ADR-0009 had parked this because of fielded agents
  and on-prem gateways, so the guard is applied only to the **tenant-admin** surface:
  `data-management` (whole module); `attendance-integrations` admin controllers (connectors, devices, gateway-admin, integrations,
  operations, work-sites); `GET/PATCH /agent/settings`; `AuditController` (the two reads). Gateway runtime/service controllers, agent
  device routes and audit *writes* stay open — pinned by tests.
- **Files:** 8 controllers + `agent.controller.ts`, `tenant-features.ts` (new registers), both entitlement specs, grandfather script (probes
  for data-management, attendance-integrations, desktop-agent), ADR-0009 addendum.
- **Tests:** 24 suites / 275 tests across audit, agent, data-management, attendance-integrations, entitlement. A mutation (removing the audit
  gate) fails the new invariant, as intended.
- **QA verify:** ENT-060…065 under ENFORCE; also re-run ENT-001…005 and attendance/agent device flows (gateway + desktop agent) to prove
  nothing machine-facing broke.
- **Operational consequence — read before cutover:** with ENFORCE, a tenant whose plan lacks these keys loses these screens unless it has a
  CUSTOM override. Run `npm run entitlement:grandfather` (dry run) first. `compliance` has no usage probe (every tenant has audit rows), so an
  Enterprise-only audit history needs an explicit grant.

### DP-QA-005 — enforcement configuration
- **Not done, deliberately:** changing the default to ENFORCE. It would enforce on the next deploy, before grandfathering, and cut off tenants.
- **Done:** `ENTITLEMENT_ENFORCEMENT_MODE` is a **release floor** (effective = stricter of floor and stored setting). Unset = no change anywhere.
  Malformed value fails closed to ENFORCE and logs. A database read fault keeps the last known mode instead of dropping to REPORT_ONLY.
  Production boot logs `ENTITLEMENT_NOT_ENFORCED` when not enforcing. Declared in `render.yaml` with `sync: false` (no value) and documented.
  `entitlement:set-mode` reports the floor and warns when asked to write a weaker mode.
- **Owner steps (not performed):** grandfather dry run → review → `--apply` → set the variable to `ENFORCE` in the Render dashboard → deploy →
  gates A1–A5 in `PRODUCTION-RELEASE-GATES.md`. **Rollback:** change the variable (the stored row alone can no longer relax a floor).
- **Tests:** 51/51 in `src/common/security/tenant-entitlement*`. **Gate status:** A1–A5 remain ☐ — this branch cannot satisfy them.
- **Caveat:** `render.yaml` is not synced to the live service (memory: 13 of 16 declared keys absent); the variable must be set by hand.

### P2/P3 fixes
- **DP-QA-016 logo 404:** bytes of an image referenced by the tenant's current `branding.*DocumentId` settings are readable by any
  `documents.read` user of that tenant; the document record/list/metadata keep the normal object check. Tests in
  `documents-object-authorization.spec.ts`. Verify LV-010.
- **DP-QA-014 sort:** entity data API gets `sortAliases` (`fullName` → `firstName`, `lastName`); not selectable or filterable. Verify EMP-008.
  Other modules' computed columns were not swept.
- **DP-QA-004 import:** `system.import` opened a `/employees/import` page that does not exist; it now opens `/settings/data-management`.
  Note that page is itself the Growth-gated feature, so on Starter the Import command now lands on the plan-gate screen (DP-QA-010). Consider
  hiding the command on Starter. Verify SMK-004.
- **DP-QA-001/003 plan gate:** a `layout.tsx` per gated module (projects, payroll, timesheets, onboarding, recruitment) renders the
  plan-gate state when the feature is not in `enabledKeys`; fails open if the plan cannot be read (API still refuses). Verify ENT-1001…1005.
  `/customers` (also `projects`) was not given a layout.
- **DP-QA-015 tabs:** pure `filterEmployeeFormTabsByPlan` on the record page; the edit page was not changed. Verify EMP-007.
- **DP-QA-009 price:** `GET /tenant-settings/features` drops price/cycle/currency unless the caller could also change settings. Verify RBAC-2-MANAGER-03.
- **DP-QA-008 delete:** single-id `DELETE /employees/:id` that matches nothing → 404 `EMPLOYEE_NOT_FOUND` (bulk keeps its partial shape; the web
  app does not call the single route). Verify ISO-004 (it asserts the 200 body today and will need updating).

### Not addressed
- **DP-QA-006** (empty `src`): every `<img>` in the reachable tree is guarded; the cause was not found without DevTools.
- **DP-QA-007** (logout latency) is a measurement on production-like infrastructure (gate C1), not a code defect I can establish locally.
- **DP-QA-013** (contrast): six screens; needs a token/design decision, not a patch.
- **DP-QA-017** (mobile overflow): needs the offending selector from a browser run.

## Validation honestly reported

| Check | Result |
|---|---|
| API jest, touched areas | pass (counts above) |
| API jest, full suite | see end of this file |
| Web jest, touched specs | pass (current-employee, formatting, import, module-plan-gate, employee-plan-tabs) |
| ESLint, changed files | clean after fixes (the CI warning budget was kept: no new warnings in changed files) |
| Prettier `--end-of-line auto` | clean (plain `--check` reports CRLF on checkout, including untouched files) |
| `tsc` API | no errors in changed files; pre-existing environment errors only (missing `qrcode`, `@aws-sdk/*`, stale `@repo/config`) |
| `tsc` web | one pre-existing error (`SINK_EMAIL_PROVIDER_TYPES`, stale `@repo/config` in the shared junction) |
| `next build`, API boot, e2e, Playwright | **not run** — no database or stack here; UI fixes (001/003/015/004) are not visually verified |

Environment notes: worktree used junctions to the primary checkout's `node_modules` (stale `@repo/config`, no `qrcode`); the
`qrcode` module was stubbed through jest `--moduleNameMapper` for local runs only (CI installs it).

## Risks
1. Granting `dashboard.view` also lets those roles open `GET /employees/:id`, `custom-fields`, lookups and navigation routes that
   require it; each still applies row scope. QA should include an OWN-scope check on `GET /employees/:id` for another employee (RBAC-3/4 cover part).
2. DP-QA-010 changes behaviour only under ENFORCE/REPORT_ONLY-turned-ENFORCE; in REPORT_ONLY it logs `ENTITLEMENT_WOULD_REFUSE`.
3. The module layouts add one extra `features/availability` call per module page load.

## Full API suite result

447 of 459 suites passed (8,433 of 8,535 tests). The 12 failing suites are all partner/contracts/email-sink/MFA specs
(`partnerPhaseOf`, `isPartnerPostActivation`, `sinkEmailProvidersRetired` "is not a function"; `mfa.service` needs the real `qrcode`).
Cause: the worktree junctions to a primary checkout whose `node_modules/@repo/config` is stale. None touch a file changed here.
**Not proven on a clean install** — CI is the authority; run it before anyone treats this branch as green.
