# Test matrix — Starter plan, tenant web

Part of [[README]]. Scope: [[STARTER-SCOPE]]. Specs: `e2e/golive/tests/`. IDs are permanent (`[DPQA-<SUITE>-<nnn>]` in the title).
Status = **latest run [[RUN-002-2026-10-30]]** (full per-test rows there; history in [[INDEX]]). PASS only when a run recorded it.
Environment for every row: local, `next dev --webpack`, throwaway DB, enforcement `ENFORCE`; tenants **S** (seed-demo), **A** and **B** (provisioned through the real workflow).

## Suite status (RUN-002)

| Suite | Covers | Spec | Pass | Fail | Notes |
|---|---|---|---|---|---|
| SMK | every Starter route renders clean (16 routes × Chromium/Firefox/WebKit/mobile/tablet) | 01 | 72 | 9 | SMK-004 ×5 engines = [[DP-QA-004]]; Firefox/WebKit SMK-011/015 = dev-server chunk/MIME artefact (environment, not product) |
| AUTH | login failure, empty submit, unauth redirect, API 401, forged token, employee boundary, logout | 02 | 11 | 0 | |
| ENT | exclusions: nav, API 403, direct URL, feature resolution, plan-gate screen, self-enable bypass, 4 ungated features | 03, 03b, 08 | 10 | 11 | ENT-1001…1005 → [[DP-QA-001]]/[[DP-QA-003]]; ENT-060…065 → [[DP-QA-010]] |
| ISO | two provisioned tenants: lists, read/update/delete by id, mass-assign tenantId, login, browser cookie scope | 04 | 12 | 0 | isolation holds; side finding [[DP-QA-008]] |
| RBAC | self-context per role; employee/manager refusals; scope | 04 | 9 | 5 | RBAC-1-* ×4 → [[DP-QA-002]]; RBAC-2-MANAGER-03 → [[DP-QA-009]] |
| EMP | list, validation, create via UI, duplicate, boundaries, edit, record tabs, sort/filter | 05 | 4 | 5 | EMP-007 → [[DP-QA-015]]; EMP-008 → [[DP-QA-014]]; **EMP-003/004/006 unresolved test-side — see below** |
| LV | leave type fixture, self-service list, submit, invalid, overlap, self-approve, isolation, cancel, UI | 06 | 7 | 3 | LV-001/008 → [[DP-QA-011]]; LV-010 → [[DP-QA-016]] |
| DOC | upload (type allowlist, 10 MB limit), round trip, exe/html/svg, traversal, isolation, unauth, delete | 07 | 10 | 0 | strong controls; see note on file-type allowlist |
| SET | features self-enable, setting validation, branding upload, settings UI | 08 | 9 | 1 | SET-003 → [[DP-QA-012]] |
| NOT | in-app notifications, isolation, bell UI | 08 | 3 | 0 | email delivery **Not Run** (SMTP intentionally empty) |
| ATT | manual entry, duplicate day, validation, role, self check-in, isolation, correction, UI | 09 | 8 | 1 | run on tenant S (fresh tenants ship no shifts/sites, OBS-008); **ATT-008 unresolved test-side** |
| A11Y | axe WCAG 2.1 A/AA ×10 screens, keyboard, labels, dialogs | 10 | 8 | 5 | colour contrast → [[DP-QA-013]] (Overview, Employees, New Employee, Approvals, Settings, Branding) |
| RESP | overflow at mobile/tablet/desktop | 10 | 20 | 1 | RESP-001 mobile → [[DP-QA-017]] |
| PERF | warm page loads, API outliers, 25-way concurrent reads | 10 | 5 | 0 | thresholds are sanity ceilings only (local dev server) — see below |

## The six tests that failed in RUN-001, mapped
| Test | RUN-001 | Issue | RUN-002 |
|---|---|---|---|
| SMK-004 `/employees/import` | FAIL | [[DP-QA-004]] | FAIL (still open) |
| ENT-1001 `/projects` | FAIL | [[DP-QA-001]] | FAIL |
| ENT-1002 `/payroll` | FAIL | [[DP-QA-001]] | FAIL |
| ENT-1003 `/timesheets` | FAIL | [[DP-QA-001]] | FAIL |
| ENT-1004 `/recruitment` | FAIL | [[DP-QA-003]] | FAIL |
| ENT-1005 `/onboarding` | FAIL | [[DP-QA-001]] | FAIL |
All remain **Open**; nothing was changed in the application.

## Unresolved test-side items (not product verdicts)
- **EMP-003** (create through the UI): the custom *Emergency Contact Relation Type* combobox sometimes does not expose its options to automation (passed in two earlier runs, failed in RUN-002). **EMP-004** (duplicate email) depends on EMP-003's record and therefore proves nothing in RUN-002; the duplicate rule is **Not verified**.
- **EMP-006** (edit persists): *Preferred Name* stays `disabled` after clicking **Edit** on a fixture record. Could be field-security, a state machine (needs the full Edit→enable cycle) or an automation fault. **Not verified**; needs manual MCP/visual confirmation.
- **ATT-008** (correction request cancel): the create/cancel call returns 400; body shape not yet matched. **Not verified**.
- Firefox SMK-011/015 and every Firefox/WebKit CSP notice: `next dev` artefacts. Re-run against `next build && next start` before treating cross-browser as signed off.

## Not covered yet (status NOT RUN — do not read as passed)
Leave: approval chain by manager/HR, balances/accrual, reject path; Attendance: real check-in on a working day, geofence/work-site rules, overtime; Employees: import/export (Data Transfer), bulk delete, org/department/designation CRUD, reporting-line effects, user provisioning + invitation flow; Documents UI (upload/download from the Documents tab, expiry); Settings UI forms beyond "loads"; Branding visual result (logo in login page / emails); Notifications email; visual-regression baselines; session expiry / refresh / concurrent edit; password reset flow; MFA. Playwright **MCP** interactive inspection (blocked, DEC-007).

## Performance (local, dev server — not production evidence)
Thresholds proposed (need approval, OBS-006): warm page ≤ 3 s, API p95 ≤ 500 ms, no request > 2 s. The suite only asserts a loose sanity ceiling (page ≤ 15 s, request ≤ 5 s, 25 concurrent reads ≤ 8 s) because `next dev` compiles on demand; RUN-002 observed warm loads of roughly 7–11 s and a worst concurrent read of ~4 s, i.e. **above the proposed thresholds**. Re-measure on a production build (gate C2/C3).
