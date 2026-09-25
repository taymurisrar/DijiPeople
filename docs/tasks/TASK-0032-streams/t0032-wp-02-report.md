# WP-02 report — Platform RBAC under ADR-0018

Stream report of [[TASK-0032]].

TASK-0032 · branch `agent/pah-wp02-rbac` (from `10d5d148`) · final commit `3b2dbf6e`
· merged into the task branch at `d5535f0a`. Module notes: [[platform-auth]],
[[super-admin]]. Per-route table: [[platform-route-mapping]].

The specialist returned this report as text (the harness does not let
subagents write report files); the Architect filed it verbatim in substance.

## IMPLEMENTED

**BUG-3544 — tenant profile edit and tenant-role-key gates**
- `SuperAdminService.updateTenant` decides with
  `userHasPlatformPermission(actor, 'tenants.update')` instead of
  `roleKeys.includes('system-admin')`; both entry points
  (`PATCH /platform-runtime/tenants/:id`, `PATCH /super-admin/tenants/:id`) and
  the service now agree.
- A changed `status`/`subStatus` → 400 `TENANT_STATUS_REQUIRES_LIFECYCLE_ACTION`,
  naming the tenant Actions menu (Suspend, Reactivate, Activate, Start
  Decommissioning) and `POST /api/platform/tenants/{tenantId}/status` with a
  reason. An unchanged value is ignored.
- `TENANT_PROFILE_UPDATED` audit row, in-transaction, before/after of `name`,
  `displayName`, `legalName` (no audit existed before).
- A blank `name` → 400 (the DTO trim previously turned it into `undefined` and
  reported a silent success).
- `RolesGuard`/`@RequireRoles` removed from `SuperAdminController`,
  `AdminLeadsController`, `AdminLegalController`, `DemoDataController`. New
  `@RequirePlatformPermission(key)` read by `PlatformPermissionsGuard` before the
  path-derived permission. New narrow keys held only via `platform.*`:
  `platform-users.manage`, `platform.tenants.administer`,
  `platform.billing.administer`, `platform.legal.administer`.
- `updateTenantSlug` checks `platform.tenants.administer` instead of the literal
  `=== 'SUPER_ADMIN'`.

**BUG-3545 — session heartbeat**
- `AuthController.activity` is `@AuthenticationOnly()` (no business
  permission). `PermissionsGuard` honours it explicitly and 401s with no user;
  `JwtAuthGuard` still runs. `wiring-invariants.spec` pins the reviewed list
  `AUTHENTICATION_ONLY_HANDLERS` (only `AuthController.activity`).
- Admin: `lib/background-request.ts`; the `ErrorProvider` fetch interceptor skips
  background-marked requests; `AdminShell` marks the heartbeat; a heartbeat 401
  now takes the refresh-or-expire path.

**BUG-3547 — role list**
- Labels: "Platform Super Admin", "Platform Owner (legacy)", "Legacy Member
  (deprecated)". `NON_ASSIGNABLE_PLATFORM_ROLES`, `platformRoleOptions(current)`,
  default new role `READ_ONLY_AUDITOR`; an existing MEMBER still sees their role.
- API refuses PLATFORM_OWNER/MEMBER on create and on a role change with 400
  `PLATFORM_ROLE_NOT_ASSIGNABLE`. `assertCanManage` checks `platform-users.manage`.

**Super Admin is not a bypass** — `RolesGuard` lost its literal SUPER_ADMIN/MEMBER
bypass and refuses any platform user (`PLATFORM_PERMISSION_DENIED`); tenant users
unchanged. PLATFORM_OWNER remains a permission alias everywhere it appears (no
site removed) until an enum contract step.

## Route mapping (105 routes)

23 unchanged, 82 widened: 80 routes that only had the class-level role gate, the
ADR-0018 tenant profile edit, and the slug route (now also the identical
PLATFORM_OWNER alias).

**Reviewer decision point — the 80 class-level routes.** The old effective set
was {SUPER_ADMIN, PLATFORM_OWNER, MEMBER} ∩ route permission: it admitted legacy
MEMBER while refusing PLATFORM_ADMIN on plans, settings, billing and customers and
every functional role on its own domain. No platform permission can express that
set; the gate dates from when SUPER_ADMIN and MEMBER were the only roles and meant
"is a platform user". Each route now admits exactly the holders of the permission
it already required — the same keys `PlatformRuntimeService` applies to the same
data (BUG-0055 precedent). Narrowing any route again is one
`@RequirePlatformPermission` line. Full table: [[platform-route-mapping]].

Unchanged SUPER_ADMIN-only (24 routes): tenant status (legacy), agent
assignments, tenant audit logs, tenant access users and their resets, tenant
invoices/subscription, invoice PDF/email/status, subscription invoices, legal
administration (5), demo data (3).

## ROLE_MATRIX (derived from `ROLE_PERMISSIONS` via `hasPlatformPermission`)

Codes: SA Super Admin · OWN Platform Owner (alias) · PADM Platform Admin · POPS
Platform Operations · MEM Member · PSM/PSU Presales Manager/User · PTM Partner
Manager · CTM Contract Manager · LGL Legal Reviewer · FIN Finance Manager · BIL
Billing User · SPM/SPA Support Manager/Agent · MON Monitoring Operator · AUD
Read-only Auditor.

| Role | Tenants read | Tenants update/lifecycle | Tenants create/owner resets | Tenant administer | Platform users manage | Leads r/w | Customers r/w | Onboarding r/w | Partners r/manage | Contracts r/manage/approve | Billing r/manage | Plans r/manage | Invoices r/manage | Billing administer | Support r/manage | Monitoring r/manage | Settings r/manage | Email credentials | Legal r/manage (perm) | Legal routes | Demo data |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUPER_ADMIN | Y | Y | Y | Y | Y | Y/Y | Y/Y | Y/Y | Y/Y | Y/Y/Y | Y/Y | Y/Y | Y/Y | Y | Y/Y | Y/Y | Y/Y | Y | Y/Y | Y | Y |
| PLATFORM_OWNER (alias) | Y | Y | Y | Y | Y | Y/Y | Y/Y | Y/Y | Y/Y | Y/Y/Y | Y/Y | Y/Y | Y/Y | Y | Y/Y | Y/Y | Y/Y | Y | Y/Y | Y | Y |
| PLATFORM_ADMIN | Y | Y | Y | — | — | Y/Y | Y/Y | Y/Y | Y/Y | Y/Y/Y | Y/Y | Y/Y | Y/Y | — | Y/Y | Y/Y | Y/Y | — | —/— | — | — |
| PLATFORM_OPERATIONS | Y | Y | Y | — | — | —/— | Y/Y | Y/Y | Y/— | Y/—/— | —/— | —/— | —/— | — | Y/Y | Y/Y | —/— | — | —/— | — | — |
| MEMBER (legacy) | Y | Y | Y | — | — | Y/Y | Y/Y | Y/Y | —/— | —/—/— | Y/— | Y/— | Y/— | — | —/— | —/— | —/— | — | —/— | — | — |
| PRESALES_MANAGER | — | — | — | — | — | Y/Y | Y/Y | Y/— | Y/— | —/—/— | —/— | —/— | —/— | — | —/— | —/— | —/— | — | —/— | — | — |
| PRESALES_USER | — | — | — | — | — | Y/Y | Y/— | Y/— | Y/— | —/—/— | —/— | —/— | —/— | — | —/— | —/— | —/— | — | —/— | — | — |
| PARTNER_MANAGER | — | — | — | — | — | Y/Y | —/— | —/— | Y/Y | Y/Y/— | —/— | —/— | —/— | — | Y/— | —/— | —/— | — | —/— | — | — |
| CONTRACT_MANAGER | — | — | — | — | — | —/— | Y/— | Y/— | Y/— | Y/Y/Y | —/— | —/— | —/— | — | —/— | —/— | —/— | — | —/— | — | — |
| LEGAL_REVIEWER | — | — | — | — | — | —/— | Y/— | —/— | Y/— | Y/—/Y | —/— | —/— | —/— | — | —/— | —/— | —/— | — | Y/Y | — | — |
| FINANCE_MANAGER | — | — | — | — | — | —/— | Y/— | —/— | Y/— | Y/—/Y | Y/Y | Y/— | Y/— | — | —/— | —/— | —/— | — | —/— | — | — |
| BILLING_USER | — | — | — | — | — | —/— | Y/— | —/— | —/— | —/—/— | Y/— | Y/— | Y/— | — | —/— | —/— | —/— | — | —/— | — | — |
| SUPPORT_MANAGER | Y | — | — | — | — | —/— | Y/— | —/— | Y/— | —/—/— | —/— | —/— | Y/— | — | Y/Y | Y/Y | —/— | — | —/— | — | — |
| SUPPORT_AGENT | Y | — | — | — | — | —/— | Y/— | —/— | Y/— | —/—/— | —/— | —/— | Y/— | — | Y/Y | Y/— | —/— | — | —/— | — | — |
| MONITORING_OPERATOR | Y | — | — | — | — | —/— | Y/— | —/— | —/— | —/—/— | —/— | —/— | —/— | — | Y/Y | Y/Y | —/— | — | —/— | — | — |
| READ_ONLY_AUDITOR | Y | — | — | — | — | Y/— | Y/— | Y/— | Y/— | Y/—/— | Y/— | Y/— | Y/— | — | Y/— | Y/— | Y/— | — | —/— | — | — |

## CHANGED_BEHAVIOR

- PLATFORM_ADMIN, PLATFORM_OPERATIONS and MEMBER can edit tenant profiles; a
  tenant user carrying `system-admin` is now refused; a changed status through the
  generic edit → 400.
- 80 class-level `/super-admin/*` routes admit every holder of their permission.
- `POST /auth/activity` → 200 for any authenticated session; its failures never
  open the admin dialog; its 401 goes through refresh/expire.
- New or re-roled platform users cannot be PLATFORM_OWNER or MEMBER; default role
  READ_ONLY_AUDITOR.
- `RolesGuard` refuses platform users (no platform route uses it any more).

## RISK_AREAS

- The 80 widened routes. Destructive REST bulk deletes
  (`DELETE /super-admin/customers`, `/customer-onboarding`) now admit POPS/PSM
  (PADM for customers); the service still limits sub-admin roles to records they
  own, but the runtime path's admin-tier requirement is not applied here.
- `POST /billing/stripe/webhook` and `…/stripe-webhook-events/:id/retry` now admit
  FINANCE_MANAGER.
- The `ErrorProvider` rule depends on the background marker being set.

## KNOWN_MISTAKES_AVOIDED

BUG-0071 (platform identity first, tenant user with `platform.*` still refused —
tested); BUG-0072 (no mutation mapped to a read permission); BUG-0055 (same fix
shape); mention-only specs (every new spec fails on the base code); CRLF-safe
source scans; `@RequireRoles` leftovers pinned by spec.

## TESTS_ADDED

- `super-admin.service.spec.ts` "BUG-3544 tenant profile edit…" (13).
- `platform-permissions.spec.ts` "ADR-0018 platform route authorization" (7):
  every route mapped, no role metadata, guards exactly `[JwtAuthGuard,
  PlatformPermissionsGuard]`, 24 SUPER_ADMIN-only routes pinned, narrow keys SA/OWN
  only, declared permission overrides path.
- `auth-activity-authorization.spec.ts` (20); `wiring-invariants.spec.ts`
  (`AUTHENTICATION_ONLY_HANDLERS`); `apps/admin/lib/background-request.spec.ts` (9);
  `platform-users-rbac.spec.ts` (25); `roles.guard.spec.ts` (6);
  `apps/admin/lib/platform-rbac.spec.ts`.

## TEST_HOOKS

- `PATCH /api/platform-runtime/tenants/:id` `{values:{displayName:"X"}}` as
  PLATFORM_ADMIN/OPERATIONS → 200; `{values:{status:"SUSPENDED"}}` → 400
  `TENANT_STATUS_REQUIRES_LIFECYCLE_ACTION`; audit `TENANT_PROFILE_UPDATED`.
- Non-SA login, navigate: no dialog; `POST /api/auth/activity` → 200.
- Settings › Users › Add user: no Platform Owner/Legacy Member, default Read Only
  Auditor; `POST /api/platform-users` `role:"MEMBER"` → 400.
- As PLATFORM_ADMIN: Plans, Platform settings and Billing screens load.

## RECORD_CLOSURES

| Record | Commits | Regression | Spec | Fails without fix |
|---|---|---|---|---|
| BUG-3544 | `bc2f9592`, `63ebc122`, `d58f1330` | REG-525, REG-526, REG-529 | super-admin.service.spec, platform-permissions.spec, roles.guard.spec | yes — 9/16 fail on base service; base RolesGuard admits SA/MEM |
| BUG-3545 | `01672ca2` | REG-527 | auth-activity-authorization.spec, background-request.spec | yes — 17/20 fail on base (only SA/OWN pass, matching the live repro) |
| BUG-3547 | `63ebc122`, `3b2dbf6e` | REG-528 | platform-users-rbac.spec, platform-rbac.spec | yes — 5 retired-role tests fail; base label is "Platform Owner (legacy Super Admin)" |

## VALIDATION

- `npm --workspace api run check-types` — pass. `npm --workspace admin run
  check-types` — pass. `npm --workspace admin run test` — 48/48 suites, 434/434.
- `npm --workspace api run test` — 350/351 suites, 6992/6993; the failure was
  `tenant-erasure.constants.spec` (WP-01 omitted `UserMfaRecoveryCode` from the
  erasure order) — fixed by the Architect at `10a78518`, spec 30/30.
- `npx eslint --fix` on changed API files — 0 errors, 4 spec warnings.
- Prettier: new admin files formatted; four pre-existing admin pages already
  failed prettier at base and were left alone.

## UNRESOLVED

- **Owner decision:** should LEGAL_REVIEWER publish legal documents? It holds
  `legal.manage`; the routes require `platform.legal.administer`.
- Follow-up: remaining role-literal tier checks for {SA, OWN, PADM} in
  `platform-runtime.assertAdmin`, `tenant-control-plane.guard`,
  `SuperAdminService.updatePlatformSettings`, `LeadsService.correctAttribution`,
  `platform-lifecycle.isPlatformSuperAdmin`, and {SA, OWN} in
  `platform-monitoring.assertSuperAdmin` — not tenant-key gates, not live defects.
- Follow-up: govern or retire `PATCH /super-admin/tenants/:id/status` (no reason,
  no UI caller).
- Follow-up: REST bulk deletes of customers/onboarding lack the runtime path's
  admin-tier requirement.
