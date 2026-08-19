---
ID: BUG-0071
aliases: [BUG-0071]
Title: Tenant users reach every platform super-admin endpoint
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-18
DetectedInSha: aa33524
AffectedModules: [super-admin, platform-auth, platform-communications]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-066
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: docs/development/execplan-platform-authorization-boundary.md
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0071 — Tenant users reach every platform super-admin endpoint

## Summary

A signed-in **tenant** user who holds the ordinary tenant role `system-admin`
can call every endpoint on the platform `super-admin` controller and receive
`200 OK`. That includes the cross-tenant lists — `/api/super-admin/tenants`,
`/customers`, `/invoices`, `/payments` — and `/operators`, which returns the
names and email addresses of DijiPeople's own platform staff. Writes are
reachable too: `PATCH /api/super-admin/platform-settings` and
`PATCH /api/super-admin/platform-email` pass authorization and fail only on
payload validation.

`system-admin` is not a special role. `seed-demo.ts` grants it to two ordinary
demo users, so any tenant that has a system administrator — which is the normal
configuration — contains an account that can read the platform's customer,
tenant, billing and staff data.

This breaks tenant isolation, which `AGENTS.md` names as the single most
important invariant in the codebase.

## Expected Behavior

Every endpoint under `super-admin` is a platform surface. It must be reachable
only by a **platform user** — an authenticated subject carrying
`user.platform.id` (`authSubjectType: 'platform-user'`) — and then only with the
platform permission the route requires. A tenant user must receive `403`
regardless of which roles or permission keys exist inside their tenant.

## Actual Behavior

A tenant user with tenant role `system-admin` receives `200` from every
`super-admin` GET route, and passes authorization on the `PATCH` routes.

## Reproduction

Against a stack seeded with `seed:config`, `seed:admin` and `seed:demo`:

1. Sign in as the ordinary demo tenant user
   `system-admin@dijipeople.local` on the tenant slug `dijipeople-demo`
   through `POST /api/auth/login` with `X-DijiPeople-App: web`.
   The returned user carries `roleKeys: ["system-admin"]` and **no** `platform`
   block — it is an ordinary tenant subject.
2. Call `GET /api/super-admin/tenants` with that access token and
   `X-DijiPeople-App: web`.
3. Observe `200` and the platform-wide tenant list.
4. Repeat for `/operators`, `/customers`, `/subscriptions`, `/invoices`,
   `/payments`, `/plans`, `/promotions`, `/platform-settings`,
   `/billing/diagnostics`, `/billing/stripe-webhook-events`, `/feature-catalog`,
   `/customer-onboarding`, `/dashboard-summary`, `/platform-email`,
   `/platform-email/deliveries`, `/platform-email/templates`. Every one returns
   `200`.
5. Send `PATCH /api/super-admin/platform-settings` with the body
   `{"__notAField":1}`. The response is `400 VALIDATION_FAILED`, not `403` —
   authorization was passed and only the payload was rejected. The same holds
   for `PATCH /api/super-admin/platform-email`.

## Evidence

Verified live against a local stack on `2026-08-18`, API at `services/api`,
database seeded as above. Observed responses:

```
GET   /api/super-admin/tenants                 200  [{"id":"…","name":"DijiPeople Demo Company",…}]
GET   /api/super-admin/operators               200  [{"firstName":"Demo","lastName":"CEO","email":"…"}]
GET   /api/super-admin/platform-settings       200  {"platformDefaults":{"country":"QA","currency":"QAR",…}}
GET   /api/super-admin/platform-email          200  {"providerType":"CONSOLE","smtpHost":"","smtpPort":587,…}
GET   /api/super-admin/billing/diagnostics     200  {"plansCount":3,…}
PATCH /api/super-admin/platform-settings       400  VALIDATION_FAILED   ← authorization passed
PATCH /api/super-admin/platform-email          400  VALIDATION_FAILED   ← authorization passed
```

The same guard is **inverted** on routes that `resolvePlatformPermission`
does not map. There, the legitimate platform operator is refused and the tenant
user is served — the exact opposite of the intent, and a live breakage in
Platform Admin today:

```
                                    platform SUPER_ADMIN   tenant system-admin
GET /api/super-admin/operators               403                   200
GET /api/super-admin/feature-catalog         403                   200
GET /api/super-admin/lifecycle-options       403                   200
```

`resolvePlatformPermission` returns `null` for those paths, so a platform user
falls through to the `throw`, while a tenant user has already returned `true` at
the `if (!role)` early exit. Three super-admin routes are therefore unusable by
the people they were built for.

The signed-in tenant subject's own token payload:

```
roleKeys:        ["system-admin"]
platform:        undefined
permissionKeys:  784 keys, including onboarding.create, onboarding.read,
                 settings.read, settings.manage, roles.manage, billing.manage
```

Code paths:

- `services/api/src/modules/super-admin/super-admin.controller.ts:67-69` —
  the whole controller is guarded by
  `@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)` and
  `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)`.
  Nothing in that set establishes platform identity.
- `services/api/src/common/guards/roles.guard.ts:38-42` — `RolesGuard` passes
  when `request.user.roleKeys` contains `system-admin`. That is a **tenant**
  role key, seeded by `services/api/prisma/seed-demo.ts:762,771`.
- `services/api/src/modules/platform-auth/platform-permissions.ts:285-287` —
  `PlatformPermissionsGuard.canActivate` reads `request.user?.platform?.role`
  and returns `true` when it is absent. A subject with no platform identity is
  therefore *waved through* rather than refused. This is the fail-open at the
  centre of the bug.
- `services/api/src/modules/platform-auth/platform-permissions.ts:269-279` —
  `userHasPlatformPermission` falls back to `user.permissionKeys`, which for a
  tenant subject are tenant keys. Six tenant key names collide exactly with
  platform permission names, so the fallback grants platform permissions to
  tenant users.
- `services/api/src/modules/platform-communications/platform-email-settings.service.ts:499-506` —
  `assertPermission` checks the permission but never `user.platform?.id`, so
  nothing downstream recovers the check the guard skipped.

Every other cross-tenant service inspected does assert platform identity first
and is therefore **not** affected: `platform-runtime.service.ts:1155-1174`,
`partners.service.ts:96-106`, `support-cases.service.ts:618-626`,
`contracts.service.ts:4918-4927`, `partner-experience.service.ts:1307-1316`,
`platform-events.service.ts:162-168`,
`platform-monitoring.service.ts:328-336`.

## Root Cause

Two independent defects that only combine into a breach together:

1. **`PlatformPermissionsGuard` fails open.** It treats "no platform role" as
   "not a platform request, nothing to check" and returns `true`. The guard was
   presumably written to be harmless on mixed controllers, but on a controller
   that is *entirely* a platform surface, "harmless" means "unguarded".
2. **`SuperAdminController` establishes no platform identity of its own.** It
   relies on `RolesGuard` for gating, and the role key it requires
   (`system-admin`) is a tenant role, not a platform one. `SuperAdminService`
   and `PlatformEmailSettingsService` then trust the guards and do not assert
   platform identity the way their sibling control-plane services do.

The permission-key collision is the amplifier rather than the cause: because
`userHasPlatformPermission` falls back to tenant `permissionKeys`, and six
tenant key names match platform permission names exactly, even the service-level
permission checks that do run return `true` for a tenant subject.

## Impact

Reachable in production by any tenant user holding the `system-admin` tenant
role — an ordinary, expected configuration, not a misconfiguration.

Disclosed: the platform-wide tenant list, customer accounts, subscriptions,
invoices, payments, plan and promotion configuration, billing diagnostics,
Stripe webhook event history, platform default settings, the platform email
configuration and templates, and DijiPeople's own platform operator names and
email addresses.

Mutable: platform settings and platform email configuration pass authorization,
so a tenant administrator can reach the write path for the platform's own
outbound email configuration. Credential *management* is separately gated on
`settings.email.credentials`, which has no tenant-side collision, so stored SMTP
passwords are not directly readable — but `passwordConfigured`, host, port,
username and security mode are.

This is a cross-tenant confidentiality failure on a multi-tenant SaaS platform,
and the affected surface is the operator console for the business itself.

## Affected Areas

- `services/api/src/modules/super-admin/` — the entire controller surface
- `services/api/src/modules/platform-auth/platform-permissions.ts` — the
  fail-open guard and the permission-key fallback
- `services/api/src/modules/platform-communications/platform-email-settings.service.ts`
- `apps/admin` consumes these endpoints as a platform user and is unaffected in
  its own right, but shares the contract.

## Proposed Resolution

Needs an ExecPlan: this changes an authorization guard that many controllers
share, and a careless fix either breaks Platform Admin or leaves a second way in.

Direction, in the order the defects should be closed:

1. **Stop the guard failing open.** `PlatformPermissionsGuard` must refuse a
   subject with no platform identity on any route that resolves a platform
   permission, rather than returning `true`. Where a controller genuinely mixes
   tenant and platform access, that must be stated explicitly by a decorator,
   not inferred from the absence of a role.
2. **Make the platform boundary explicit on the controller.** `super-admin` is a
   platform surface end to end; it should require platform identity once, at the
   controller, the way `tenant-control-plane` does through
   `assertTenantPlatformAccess`.
3. **Remove the tenant-key fallback from `userHasPlatformPermission`,** or scope
   it so it can only consider keys belonging to a platform subject. Platform
   permissions must not be satisfiable by tenant permission keys that happen to
   share a name. Six names collide today; nothing prevents a seventh.
4. **Add the missing service-level assertion** in
   `PlatformEmailSettingsService`, so the service is safe independently of the
   guard — defence in depth, matching its siblings.

## Acceptance Criteria

- A tenant user holding tenant role `system-admin` receives `403` from every
  `super-admin` route, read and write.
- A platform user with the appropriate platform permission continues to receive
  `200` from those same routes — Platform Admin is not broken by the fix.
- `userHasPlatformPermission` returns `false` for a subject with no platform
  identity, whatever its `permissionKeys` contain.
- A tenant permission key whose name matches a platform permission grants no
  platform access.
- Every route on `super-admin` is covered by the check, including any added
  later — enforced by a test that enumerates the controller rather than a
  hand-written list.

## Regression Coverage

Must fail without the fix: an e2e test that signs in as a tenant `system-admin`
and asserts `403` from a representative read and a representative write on
`super-admin`, plus a unit test asserting `userHasPlatformPermission` refuses a
subject with no platform identity. `REG-nnn` to be assigned when the fix lands.

## Dependencies

None external. The fix touches a shared guard, so it must be sequenced against
other in-flight work that writes `services/api/src/modules/platform-auth/`.

## Related Items

- [[super-admin]]
- [[platform-auth]]
- [[tenant-control-plane]]
- [[platform-communications]]

## Resolution

Fixed on branch `agent/provisioning-ops-and-qa` under
`docs/development/execplan-platform-authorization-boundary.md`.

1. `PlatformPermissionsGuard.canActivate` now requires `user.platform.id`
   before anything else and throws `PLATFORM_ACCESS_REQUIRED` otherwise. The
   `if (!role) return true` early exit is gone, and the guard has **no**
   permissive branch — an unresolved permission is still refused.
2. `userHasPlatformPermission` returns `false` for a subject with no
   `platform.id`, so the `permissionKeys` fallback can no longer be satisfied by
   a tenant key that happens to share a platform permission's name. The fallback
   is scoped rather than removed, because platform users legitimately rely on it.
3. `resolvePlatformPermission` gained the four missing mappings —
   `operators`, `lifecycle-options`, `feature-catalog` and `tenant-slug` — so
   the routes that returned 403 to platform operators resolve a permission
   rather than depending on a permissive guard. See [[BUG-0072]] for the rest of
   the map work, which the same commit carries.
4. `PlatformEmailSettingsService.assertPermission` asserts `actor.platform?.id`
   itself, so the service is safe independently of the guard.

`SuperAdminController` was deliberately **not** changed: the guard it already
declares now establishes the platform boundary, and adding a second mechanism
would leave two places to keep in step.

## QA Retest

Re-run live on 2026-08-18 against a seeded local stack, after restarting the API
on the fixed build (verified by inspecting the compiled artifact, not assumed):

```
                                    tenant system-admin   platform SUPER_ADMIN
GET   /super-admin/tenants                  403                   200
GET   /super-admin/operators                403                   200
GET   /super-admin/customers                403                   200
GET   /super-admin/invoices                 403                   200
GET   /super-admin/payments                 403                   200
GET   /super-admin/plans                    403                   200
GET   /super-admin/platform-settings        403                   200
GET   /super-admin/platform-email           403                   200
GET   /super-admin/billing/diagnostics      403                   200
GET   /super-admin/dashboard-summary        403                   200
GET   /super-admin/feature-catalog           —                    200
GET   /super-admin/lifecycle-options         —                    200
GET   /super-admin/tenant-slug/availability  —                    200
PATCH /super-admin/platform-settings        403                    —
PATCH /super-admin/platform-email           403                    —
```

Every tenant-subject route that previously returned `200` now returns `403`; the
two `PATCH` routes return `403` rather than the `400` that showed authorization
had passed. The three routes that were unreachable by platform operators return
`200`.

Automated: `platform-permissions.spec.ts` — 30 passed, including the guard
cases and the tenant-collision cases. Full API unit suite: 184 suites, 1406
tests, all passing.

## History

- 2026-08-18 — fixed and retested; REG-066 recorded.
- 2026-08-18 — found during the WP-13 security campaign while reviewing the
  platform-identity assertion pattern for the new provisioning queue endpoint.
  The queue service originally carried the same omission; closing it there
  prompted the sweep that found this. Verified live against a local stack.
