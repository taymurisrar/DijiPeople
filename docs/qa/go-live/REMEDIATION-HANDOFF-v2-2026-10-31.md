# Remediation handoff v2 — Starter go-live (RUN-003 register, 24 issues)

Supersedes nothing: [[REMEDIATION-HANDOFF-2026-10-31]] (v1) stays as written. This is the second pass.

| | |
|---|---|
| Branch | `agent/starter-golive-remediation` (local only; not pushed, not merged, no production access) |
| Base | `origin/develop` @ `214433c1` |
| Code SHA validated | `0d95bc28` (code). This document is committed on top as a docs-only change. Web was last changed at `07773d20`; nothing in `apps/web` changed after that. |
| QA branch | `agent/starter-golive-qa` @ `8c1ee270` — read only; none of its files, evidence or statuses were modified |

**Nothing here is Resolved.** Each row is `FIXED — AWAITING QA` or states why not. Only an independent QA run can resolve an issue.

## 1. Issue-to-fix matrix (all 24)

| ID | Pri | Pass | Commit | State | How it was checked (developer) |
|---|---|---|---|---|---|
| DP-QA-001 plan-gate screen | P2 | v1 | `24a44a7e` | Fixed | QA suite ENT-1001…1005 pass live |
| DP-QA-002 self-context 403 | P1 | v1 | `5fb70db6` | Fixed | live: 4 roles 200; QA RBAC-1-* pass; negative: other employee's profile/compensation/edit refused |
| DP-QA-003 recruitment hub | P3 | v1 | `24a44a7e` | Fixed | ENT-1004 passes |
| DP-QA-004 `/employees/import` | P2 | v1+v2 | `b840fcc0`, `a496e1ac` | Fixed, **by design lands on the plan gate on Starter** | see "Premise changes" |
| DP-QA-005 enforcement default | P1 | v1+v2 | `b19d48ab` | Mechanism shipped; **owner cutover still required** | live: stored REPORT_ONLY → 200; same DB + floor `ENFORCE` → 403 |
| DP-QA-006 empty `src` | P3 | — | — | **Not fixed** — not located (no DevTools trace of the warning) | — |
| DP-QA-007 logout latency | P2 | v2 | `11587c4b` | Fixed (cause), **needs production-like measurement** | unit; removes up to 20 sequential bcrypt compares; AUTH-030 passes |
| DP-QA-008 no-match delete 200 | P3 | v1 | `37ac5804` | Fixed | live: 404 |
| DP-QA-009 manager sees price | P3 | v1 | `c268de9c` | Fixed | live: plan visible, price/cycle absent; admin still sees it |
| DP-QA-010 four ungated features | P1 | v1+v2 | `1d7732da`, `a209b42f` | Fixed; **v2 widened agent gating** | live: 8 routes 403 on Starter; QA ENT-060…065 pass |
| DP-QA-011 leave | P1 | v1+v2 | `2e79ba70`, `e5962208` | Fixed | live: types listed, own request cancel, 4 default types exist on a freshly provisioned tenant with no seed run |
| DP-QA-012 timezone | P1 | v1 | `fea4425a` | Fixed | live: invalid 400, stored bad value resolves usable; SET-003 passes |
| DP-QA-013 contrast / ARIA | P2 | v2 | `4a3e0dc3`, `07773d20` | Fixed for the 5 reported screens (existing tenants keep a stored colour) | QA A11Y-001/003/006/008/009 pass on a tenant using the new default |
| DP-QA-014 sort Full Name | P2 | v1 | `a5f6fc1f` | Fixed | live data API 200; EMP-008 passes |
| DP-QA-015 non-Starter tabs | P2 | v1 | `4f128603` | Fixed | EMP-007 passes |
| DP-QA-016 logo 404 | P2 | v1+v2 | `ce840d7c`, `0d95bc28` | Fixed; **v2 closed a gap: payroll-manager held no documents access at all** and now has the SELF read the employee role has | live: employee, HR, payroll all load it (after `seed:config` on the existing tenant); the logo document record itself is still refused |
| DP-QA-017 mobile overflow | P2 | v2 | `f825f08a` | Fixed | live probe `scrollWidth` 502 → 412; RESP mobile + tablet pass |
| DP-QA-018 manager approves outside reporting line | P1 | v2 | `5cad0567` | Fixed | live: manager 403, same manager 200 once they are the manager; HR 200; employee/payroll 403 |
| DP-QA-019 approved leave cancel | P3 | v2 | `5cad0567` | Implemented | live: owner cancels future approved leave, balance restored, no double credit, started leave refused to owner, HR needs a reason, audited |
| DP-QA-020 concurrent overlap | P2 | v2 | `5cad0567` | Fixed | live: 8 simultaneous → exactly one 201 and one row |
| DP-QA-021 New Employee form | P3 | v2 | `57fa1cd5` | Fixed | unit; route shows access-denied without `employees.create` |
| DP-QA-022 correction request read | P2 | v2 | `f52973e2` | Fixed (was DP-QA-002's root cause) | live: employee reads own; payroll cannot read another's |
| DP-QA-023 FF/WebKit fetch errors | P3 | v2 | `f8448467` | Fixed for Firefox; **WebKit not re-run** (needs the QA local TLS front) | Firefox smoke 16/16 except SMK-004 |
| DP-QA-024 429 → generic crash | P3 | v2 | `f8448467` | Fixed | live: 429 carries `Retry-After`; boundary classifies rate-limited (unit; the RSC digest route is unproven in a browser) |

## 2. Other items requested

| Item | Result |
|---|---|
| `seedTenantLeaveTypes` must keep deactivated types | Insert-only now; release verification checks existence, not activity (it would otherwise have **failed a deploy** after an admin deactivated a default). 4 idempotency tests. |
| False `BASE_ROLE_PERMISSION_KEYS` invariant | Removed from the invariant; map marked deprecated. Making it truthful exposed **10 keys no provisioned role holds**: 2 were real gaps (`timesheets.submit`, `timesheets.withdraw` — no employee could submit a timesheet) and are now granted; 8 are listed admin-only with a reason. `attendance.override` and `customers.delete` were meant for HR in the dead map — **a product decision, not granted**. |
| Hide Import on Starter | Done in the command bar (feature-aware); `/employees/import` redirects to the importer. |
| HR leave-type / approval permissions | Pinned by test against the shipped role definition: HR approves/rejects, reads and creates leave types; employees and managers cannot configure types. |
| `dashboard.view` exposure | Enumerated all 43 handlers that require it. Roles newly reach them at controller level only; the services still scope by record (employee profile, compensation, personal-info writes, approvals). Live negative checks pass. One side finding: dashboard links to a non-existent `/documents` page (fixed, with a test that every dashboard route is served). |
| Gateway/device routes, paid-feature bypass | **Found one**: only agent *settings* were gated, so a plan without the agent could enrol devices and open sessions. The whole authenticated agent controller is now gated (public login/refresh/logout stay open). Gateway runtime/service stay open: they authenticate with a gateway credential minted only by the gated admin routes, so a new Starter tenant cannot obtain one; a *downgraded* tenant's existing gateway keeps syncing (accepted, recorded in ADR-0009). |
| ENFORCE cannot be weakened | Tenant settings reject the platform category (400) and cannot enable a module; a stored `OFF`, a malformed value, or a read fault cannot lower the floor (tests + live). Only the platform admin can change the stored mode, and the env floor still holds against that. |

## 3. Validation

| Check | Result |
|---|---|
| Clean install | `npm ci` in this worktree (no linked/stale dependencies) |
| API unit, full | **465 / 465 suites, 8,604 / 8,604 tests** on the clean install at `0d95bc28` |
| The 12 failures seen earlier | **Root cause verified**: stale `@repo/config` and missing `qrcode` in the linked `node_modules`; all pass on the clean install |
| Web unit, full | **131 / 131 suites, 2,328 / 2,328 tests**; `npm run check-types` exit 0 (at `07773d20`, the last web change) |
| API lint | 0 errors, **787 warnings = the CI budget exactly** (no new warnings) |
| Web production build | `next build --webpack` succeeds (rebuilt after each web change) |
| Live API checks | `e2e/remediation/live-check.mjs`: **56 / 56** on the final API code (55 + the 429 burst; includes concurrency, balance, tenant isolation, negative checks, payroll-manager logo) |
| `seed:config` on an existing tenant | Run live: completes release verification with a deliberately deactivated `SICK` type, which stays deactivated; payroll-manager receives the documents grant |
| QA Playwright suite (their tests, my stack, throwaway DB) | Full chromium+firefox+mobile+tablet run: 220 passed / 36 failed (16 of them Firefox, all caused by an invalid PNG my own live-check uploaded as a logo; fixed). Targeted re-runs after fixes: all LV, ATT-001, EMP-009, PERF-001, AUTH-030, A11Y-001/003/006/008/009, RESP, EMP-007 and Firefox smoke pass. **Not repeated as one clean full run after the last fixes** — QA should do that |
| Not run | WebKit (needs the QA TLS front); Firefox/WebKit visual baselines; the e2e `landing/admin` suite; a boot against a production-like Neon |

### Premise changes QA must decide (tests that assert the pre-fix behaviour)
- **SMK-004** expects `/employees/import` to render with no plan-gate text. It now lands on the Data Management plan gate because bulk import is a Growth feature. Either accept the gate for Starter or declare Import a Starter feature (then un-gate `data-management` import).
- **RBAC-2-MANAGER-03** expects `GET /tenant-settings/features` to be 403 for a manager. The module list needs that read, so it answers 200 **without price or cycle** (the issue's own recommendation). Assert absence of `finalPrice`/`billingCycle`.
- **LV-023** asserts an approved request *cannot* be cancelled; DP-QA-019 intentionally makes it possible. Replace with the cases in the live check.
- **VIS-008 (approvals) and other visual baselines** differ because the default accent and some muted/pill colours changed; re-baseline after review.
- **LV fixtures** (`ensureType`) assume a fresh tenant has no leave types and read through the per-user read limit; they pass when run in a quiet window, and fail with 409 after a 429. Real defaults now exist, so the fixture should look up `ANNUAL`.

### Known failures, honestly
- Still failing by design or premise: SMK-004, RBAC-2-MANAGER-03, LV-023, VIS-008 (see above). WebKit not run. The final web build was verified live before the documents-grant change; the change itself is API-only.
- A flake source I did **not** change: the shared per-user read limit (600/min) and login throttle (20/10 min) make long serial runs fail with 429 unless cooled down (DP-QA-024 is the user-facing half).

## 4. Genuine blockers (need a person)
1. **DP-QA-005 cutover is the owner's**: run `entitlement:grandfather` (dry run, review, `--apply`), set `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` in the Render dashboard (`render.yaml` is not synced to the service), deploy, verify gates A1–A5. Nothing in this branch touches production.
2. **Confirm the widened agent gating** (DP-QA-010): with ENFORCE, a tenant whose plan lacks `desktop-agent` and has no grandfather override loses agent enrolment/sync. The grandfather probe covers tenants that already have agent tokens.
3. **Product decisions**: Import on Starter (above); `attendance.override` / `customers.delete` for HR; whether `compliance` (audit history) needs an explicit grant for existing Growth tenants (no usage probe is possible).
4. **Existing tenants** keep their stored brand colour and need `seed:config` (role grants, default leave types) to receive the RBAC and leave fixes — it already runs in the pre-deploy command.
5. **DP-QA-006** needs a DevTools trace; **DP-QA-007** needs a measurement on production-like infrastructure.

## 5. QA retest instructions

Environment: local only. Use a **throwaway database** whose name ends `_test`; never production. Either run `npm run seed:config` on your QA database or provision a **fresh** tenant (recommended, exercises the provisioning change).

```
git switch agent/starter-golive-remediation        # or use the worktree D:\My Work\hrm-dijipeople\dijipeople-starter-fix
npm ci
cd services/api && npx prisma migrate deploy --config prisma.config.ts && npm run seed:config
# API (PowerShell):  $env:TS_NODE_TRANSPILE_ONLY='true'; npx ts-node -r tsconfig-paths/register src/main.ts
# Web:               cd apps/web && npx next build --webpack && npx next start -p <port>
# put the tenant on Starter and entitlementEnforcement = ENFORCE (see QA-RUNBOOK steps 3-4)
node e2e/remediation/live-check.mjs               # developer smoke; then run your own suites
cd e2e && npx playwright test -c playwright.golive.config.ts --project=chromium
```
Retest in this order: DPQA-RBAC-1-*, LV-001/008/023(new)/026, CONC-003, ATT-009, CMD-011, ENT-060…065 and ENT-1001…1005, SET-003, EMP-007/008, LV-010, A11Y-*, RESP-001 (mobile), SMK-011/015 (Firefox + WebKit), AUTH-030, then a fresh-tenant provisioning (default leave types).

Fixtures I used (untracked, never committed): `.env.qa.local`, a copy of `e2e/golive` from your branch (guard regex widened locally to accept `dijipeople_remediation_test`).
