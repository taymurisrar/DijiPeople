# D1 — Platform Super Admin RBAC and the tenant-edit failure

Discovery report of [[TASK-0032]].

Read-only discovery. Worktree: `D:/My Work/hrm-dijipeople/dp-partner-admin`.
Scope: platform authentication/authorization, the Tenant record edit path in
`apps/admin`, the platform role inventory, and related open bug records.

---

## 1. How platform admins authenticate and are authorized

- **Login**: `services/api/src/modules/platform-auth` contains only
  `platform-permissions.ts` (+ spec) — there is no separate `platform-auth`
  controller/service pair; platform sign-in is issued through the ordinary
  `auth` module using the `admin` app-client id and
  `authSubjectType: 'platform-user'` in the JWT payload. Sessions are rows in
  `PlatformRefreshToken` (`services/api/src/common/guards/jwt-auth.guard.ts:288-293`).
- **Per-request identity**: `JwtAuthGuard.canActivate`
  (`services/api/src/common/guards/jwt-auth.guard.ts:102-108`) — when
  `clientId === 'admin' && payload.authSubjectType === 'platform-user'`, calls
  `AuthAccessService.loadPlatformAccessContext(payload.sub)`
  (`services/api/src/modules/auth/auth-access.service.ts:14-42`), which reads
  `PlatformUser`, requires `status === 'ACTIVE'`, and builds
  `AuthenticatedUser` with `roleIds: [user.role]`, `roleKeys`, `permissionKeys`
  (both from `platformAccessForRole(user.role)`), and
  `platform: { id, role, status }`. `request.user = authUser` verbatim
  (`jwt-auth.guard.ts:132`).
- **Role enum**: `PlatformUserRole` — 16 members —
  `services/api/prisma/schema.prisma:399-416`: `SUPER_ADMIN`, `MEMBER`,
  `PLATFORM_OWNER`, `PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`,
  `PRESALES_MANAGER`, `PRESALES_USER`, `PARTNER_MANAGER`, `CONTRACT_MANAGER`,
  `LEGAL_REVIEWER`, `FINANCE_MANAGER`, `BILLING_USER`, `SUPPORT_MANAGER`,
  `SUPPORT_AGENT`, `MONITORING_OPERATOR`, `READ_ONLY_AUDITOR`.
- **Permission model**: `services/api/src/modules/platform-auth/platform-permissions.ts`.
  `ROLE_PERMISSIONS` (lines 90-241) maps each role to a list of
  `domain.action` / `domain.*` keys. `userHasPlatformPermission`
  (lines 307-319) requires `user.platform?.id` first (the BUG-0071 fix), then
  checks `hasPlatformPermission(role, permission)` or a `permissionKeys`
  fallback. `resolvePlatformPermission` (lines 391-470) is a path/method
  matcher used by `PlatformPermissionsGuard` (lines 340-370) — this guard is
  applied to `super-admin`-style controllers via `@UseGuards(...,
  PlatformPermissionsGuard)`, **not** to `platform-runtime` (see §2).
- **`platformAccessForRole`** (lines 261-279) additionally returns `roleKeys`
  — guard-alias strings, not "roles a person holds" (its own doc-comment,
  lines 243-260). For `SUPER_ADMIN` and `PLATFORM_OWNER` only
  (`elevated`, line 263-265), it injects the literal string `'system-admin'`
  (and `'SUPER_ADMIN'`) into `roleKeys`. Every other platform role's
  `roleKeys` is just `[roleEnumValue, kebab-case-alias]` (plus
  `'system-customizer'` for `MEMBER`).
- **Frontend mirror**: `apps/admin/lib/platform-rbac.ts` — `PLATFORM_ROLES`
  (16, matching the enum) and `isPlatformSuperAdmin(role)` (line 22-24) =
  `role === "SUPER_ADMIN" || role === "PLATFORM_OWNER"`. `formatPlatformRole`
  (line 26-32) **relabels `SUPER_ADMIN` as "Platform Owner (legacy Super
  Admin)" in the UI** — the product's own naming already treats `SUPER_ADMIN`
  as a legacy alias for `PLATFORM_OWNER`, and neither name is `PLATFORM_ADMIN`.
  `apps/admin/lib/platform-rbac.spec.ts` covers this file per
  `apps/admin/AGENTS.md:107-111`.
- **`PLATFORM_OPERATORS`** (`apps/admin/lib/runtime/platform-module-registry.ts:23`)
  = `["PLATFORM_OWNER", "PLATFORM_ADMIN", "SUPER_ADMIN"]` — the three roles
  the admin console itself treats as the top operator tier (used to gate the
  "platform-administration" dashboard view, whose own description is
  "Tenants, users, security, integrations, and configuration",
  `platform-module-registry.ts:786-790`).

## 2. Tenant record edit path — traced end to end

### Screen

- List: `apps/admin/app/(internal)/tenants/page.tsx` →
  `RuntimeModulePage moduleKey="tenants"`.
- Detail: `apps/admin/app/(internal)/tenants/[tenantId]/page.tsx:25-32` →
  `RuntimeRecordRoute moduleKey="tenants"` → `RuntimeRecordPage`.

### Module definition (client)

`apps/admin/lib/runtime/platform-module-registry.ts`:

- `MODULE_CAPABILITIES.tenants = { create: false, update: true, delete: false }`
  (line 389) — **update is declared allowed**.
- `defaultActionsFor`/`withDefaultActions` (lines 409-498) add `ACTION.edit`,
  `ACTION.save`, `ACTION.saveClose` whenever `capabilities.update` is true.
  `TENANT_RECORD_ACTIONS` (lines 571-712) also declares `ACTION.edit`,
  `ACTION.save`, `ACTION.saveClose` explicitly (lines 583-586). **Neither
  `ACTION.edit` nor `ACTION.save`
  (`platform-module-registry.ts:185-216`) carries a `roles` restriction**, and
  `module-action-bar.tsx:341-342` is the only place that filters an action by
  `action.roles` — so Edit/Save render, enabled, for **every** platform role
  that can open the tenant record, regardless of which of the 16 roles it is.
- Of the 26 form fields declared for `tenants`
  (`platform-module-registry.ts:2686-2853`), only **`name`, `displayName`,
  `legalName`** are writable; `status`, `subStatus`, `environmentType`,
  `customerAccountId`, `tenantCode`, `slug`, and everything under
  Identifiers/Record history/Provenance are `readOnly: true`. This matches
  `UpdateTenantDto` (see below) for the first three plus `status`/`subStatus`,
  which the DTO accepts but the UI locks behind the header Actions menu
  (comment at lines 2711-2724: "Changed through the Actions menu so every
  transition carries a reason and is audited").
- `RECORD_HEADER_READ_ONLY_REASON.tenants`
  (`platform-module-registry.ts:302-303`) only disables the header **status**
  slot, not the form or the Edit/Save actions.

### Submit path (client)

- `apps/admin/app/_components/runtime/runtime-record-page.tsx:301-324` (`save`)
  filters to non-`readOnly` fields, then calls
  `buildWritePayload(moduleKey, fields, form.values, isCreate)`
  (`apps/admin/lib/runtime/runtime-write-payload.ts:73-92`), which drops any
  field the **generated** runtime schema
  (`packages/config/platform-runtime-schema.generated.json`) does not mark
  `editable` for that module. Verified live in this worktree: `tenants.name`,
  `.displayName`, `.legalName`, `.status`, `.subStatus` are all
  `editable: true` in the generated schema — the payload the UI actually
  sends is `{ name, displayName, legalName }` (whichever changed) and is
  **not** silently stripped.
- `apps/admin/lib/runtime/http-module-runtime-adapter.ts:64-69`
  (`updateRecord`) issues `PATCH /api/platform-runtime/tenants/{id}` with
  `{ values, version }`. The Next.js route under `app/api/platform-runtime/`
  is a thin proxy per `apps/admin/AGENTS.md:125-126` — confirmed no
  authorization logic there beyond forwarding.

### API (server)

- `services/api/src/modules/platform-runtime/platform-runtime.controller.ts:20-21,122-123`:
  `@UseGuards(JwtAuthGuard) @Controller('platform-runtime')`, `@Patch(':moduleKey/:id')`.
  **No `PermissionsGuard`/`PlatformPermissionsGuard`/`RolesGuard` here** —
  authorization is done entirely inside the service.
- `PlatformRuntimeService.update()` (`platform-runtime.service.ts:474-519`)
  → `this.assertModuleWrite(user, 'tenants')`
  (lines 1259-1267) → `runtimePermission('tenants', true)` = `'tenants.update'`
  (line 1303) → `userHasPlatformPermission(user, 'tenants.update')`. This
  passes for every role whose `ROLE_PERMISSIONS` entry grants `tenants.*` or
  `tenants.update`: `SUPER_ADMIN`, `PLATFORM_OWNER` (`platform.*`),
  `PLATFORM_ADMIN` (`'tenants.*'`, line 97), `PLATFORM_OPERATIONS`
  (`'tenants.*'`, line 123), and `MEMBER` (`LEGACY_MEMBER_PERMISSIONS`
  includes `'tenants.update'`, line 79).
- On success, `case 'tenants':` (lines 512-519) calls
  `this.superAdmin.updateTenant(user, id, dto)` with
  `UpdateTenantDto` (`services/api/src/modules/super-admin/dto/update-tenant.dto.ts`
  — `name`, `displayName`, `legalName`, `status`, `subStatus`, all optional,
  `class-validator`-decorated, no extra fields).

### The actual gate — `SuperAdminService.updateTenant`

`services/api/src/modules/super-admin/super-admin.service.ts:1614-1672`:

```ts
const isSystemAdmin = actor.roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);   // line 1628
const updatesNonSlugField =
  dto.name !== undefined || dto.displayName !== undefined ||
  dto.legalName !== undefined || dto.status !== undefined ||
  dto.subStatus !== undefined;                                          // 1629-1634

if (updatesNonSlugField && !isSystemAdmin) {
  throw new ForbiddenException(
    'Only System Admin can edit tenant profile fields.',                // 1636-1639
  );
}
```

`ROLE_KEYS.SYSTEM_ADMIN` (`services/api/src/common/constants/rbac-matrix.ts:33`)
is the **tenant-side** role key `'system-admin'` — the same constant
`AGENTS.md`'s Backend section and `BUG-0071` both discuss as an ordinary
tenant role, seeded onto tenant users by `seed-demo.ts`. `updateTenant` is
reachable only from two places, both platform-only
(`platform-runtime.service.ts:514`, `super-admin.controller.ts:266-271`), so
`actor` here is always a `PlatformUser`, never a tenant user — but the check
still asks whether that platform actor's `roleKeys` happens to contain the
tenant role-key string `'system-admin'`.

Because `platformAccessForRole` (§1) only injects `'system-admin'` into
`roleKeys` for `SUPER_ADMIN` and `PLATFORM_OWNER`, this second, undocumented
gate silently narrows who may save **any** of the five DTO-accepted tenant
fields to exactly those two roles — even though `assertModuleWrite` (the
guard everything upstream, including the UI's Edit/Save buttons and command
bar, treats as the authority) already passed for `PLATFORM_ADMIN`,
`PLATFORM_OPERATIONS`, and `MEMBER`.

**Confirmed by static trace, not yet exercised live in this worktree**
(no DB/API server was started; this is a read-only discovery task). No
automated test covers `updateTenant`'s profile-field path —
`services/api/src/modules/super-admin/super-admin.service.spec.ts` only
exercises `updateTenantSlug` (lines 61, 90); grep for
`isSystemAdmin`/`ROLE_KEYS.SYSTEM_ADMIN` across `super-admin.service.ts`
returns only this one call site (line 1628) plus one unrelated tenant-scoped
lookup at line 1783 (finding *the tenant's own* System Admin role when
transferring ownership — a different, legitimate use of the same constant).

### Result per role

| Role | `tenants.update` permission (assertModuleWrite) | `roleKeys` includes `'system-admin'` | Can save name/displayName/legalName/status/subStatus |
|---|---|---|---|
| `SUPER_ADMIN` | yes (`platform.*`) | **yes** (explicit alias) | **Yes** |
| `PLATFORM_OWNER` | yes (`platform.*`) | **yes** (explicit alias) | **Yes** |
| `PLATFORM_ADMIN` | yes (`'tenants.*'`) | no | **No — 403** |
| `PLATFORM_OPERATIONS` | yes (`'tenants.*'`) | no | **No — 403** |
| `MEMBER` | yes (legacy) | no | **No — 403** |
| everyone else (10 roles) | mostly `tenants.read` only | no | blocked earlier at `assertModuleWrite` anyway |

### A second, independent instance of the same pattern

`services/api/src/modules/super-admin/super-admin.controller.ts:73-74`
guards the **whole class** with
`@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)` and
`@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)`; the
direct REST route `PATCH tenants/:tenantId` (lines 264-271, calling the same
`updateTenant`) repeats `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN,
ROLE_KEYS.SYSTEM_CUSTOMIZER)`. `RolesGuard`
(`services/api/src/common/guards/roles.guard.ts:26-34`) hard-codes a bypass
for `request.user?.platform?.role === 'SUPER_ADMIN'` (and a narrower one for
`'MEMBER'`) and otherwise requires `roleKeys` to contain one of the required
tenant-style role keys. **`PLATFORM_OWNER` is not in the hard-coded bypass
list** — it only passes because of the same `platformAccessForRole` alias
noted in §1; if that alias were ever narrowed to `SUPER_ADMIN` only (a very
plausible future cleanup, since the UI already calls `SUPER_ADMIN` legacy),
`PLATFORM_OWNER` would silently lose this route too. This route is **not**
the one `apps/admin`'s tenant screen calls (confirmed: the UI goes through
`/api/platform-runtime/tenants/{id}`, not `/api/super-admin/tenants/{id}`),
but it shows the `SYSTEM_ADMIN`-tenant-key-as-a-platform-gate pattern is not
a one-off typo — it recurs at both the guard layer and the service layer.

### Frontend/backend key drift check

`apps/admin` has no `security-keys.ts` equivalent for platform permissions;
the closest analogue, `apps/admin/lib/runtime/runtime-permissions.ts`, was
inspected — it exists but the tenant Edit/Save buttons do not consult it (no
`roles`/permission field on `ACTION.edit`/`ACTION.save`, confirmed above), so
there is no separate frontend permission key to drift from the backend's
`tenants.update` — the drift here is entirely server-side, between
`assertModuleWrite`'s permission model and `updateTenant`'s ad hoc role-key
check.

## 3. Role inventory

16 `PlatformUserRole` values. "Files" = grep count across
`services/api/src` + `apps/admin` for the literal role string (rough reuse
signal, not authoritative).

| Role | Scope | Key permissions (`ROLE_PERMISSIONS`) | Files | Notes / overlap | Recommendation |
|---|---|---|---|---|---|
| `SUPER_ADMIN` | Platform | `platform.*` | 24 | Seeded root account (`seed-admin.ts:38,95,102` — the **only** role any seed creates). UI relabels it "Platform Owner (legacy Super Admin)" (`platform-rbac.ts:27`). Hard-coded bypass in `RolesGuard` (line 26-28) and `assertAdmin` (`platform-runtime.service.ts:1268-1277`). | Keep as the emergency/root account; the UI's own label says the product intends `PLATFORM_OWNER` to be primary going forward. |
| `PLATFORM_OWNER` | Platform | `platform.*` | 18 | Functionally identical to `SUPER_ADMIN` (`ROLE_PERMISSIONS`, `platformAccessForRole` elevated list, `isPlatformSuperAdmin`, `PLATFORM_OPERATORS`), but **not** in `RolesGuard`'s hard-coded literal-role bypass (relies on the alias instead — see §2). | Merge conceptually with `SUPER_ADMIN` (already effectively the same); if kept as the "real" one, add it to `RolesGuard`'s explicit bypass rather than relying on the alias. |
| `PLATFORM_ADMIN` | Platform | `dashboard.*`, `leads.*`, `customers.*`, `tenants.*`, `onboarding.*`, `partners.*`, `contracts.*`, `support.*`, `monitoring.*`, `billing.*`, `payments.*`, `subscriptions.*`, `invoices.*`, `plans.*`, `settings.*` — everything except the raw `platform.*` wildcard | 20 | One of the 3 `PLATFORM_OPERATORS` (with `SUPER_ADMIN`/`PLATFORM_OWNER`) — treated as top-tier everywhere in the UI, **but blocked from tenant profile edits** by the `isSystemAdmin` gate (§2). This is the concrete bug. | Fix the gate (§ Root cause) rather than the role; `PLATFORM_ADMIN` is the intended "full platform administrator short of the root account" role and should not need a second, undocumented check. |
| `PLATFORM_OPERATIONS` | Platform | `dashboard.read`, `customers.read/update`, `tenants.*`, `onboarding.*`, `partners.read`, `contracts.read`, `support.*`, `monitoring.*` | 4 | Also has `tenants.*` and is also blocked by the same gate. Its permission set overlaps heavily with a narrower slice of `PLATFORM_ADMIN`. | Keep — it is the "tenant/customer operations" role distinct from full admin — but same fix required. |
| `MEMBER` | Platform | `LEGACY_MEMBER_PERMISSIONS` (dashboard, leads, customers, tenants, onboarding, payments/billing/subscriptions/invoices/plans **read-only** for the commercial set) | 12 | Named `LEGACY_...` in source (`platform-permissions.ts:69`); `RolesGuard` and `platformAccessForRole` both special-case it (`'system-customizer'` alias). Reads as a pre-role-expansion catch-all. | Candidate to deprecate in favour of assigning `PLATFORM_ADMIN`/`PLATFORM_OPERATIONS`/a narrower role explicitly — confirm no seed/live account still depends on it before removing. |
| `PRESALES_MANAGER` | Platform | leads/customers/onboarding, `customers.create` | 5 | Distinct from `PRESALES_USER` by create rights. | Keep. |
| `PRESALES_USER` | Platform | leads/customers/onboarding, read-heavy | 4 | Subset of `PRESALES_MANAGER`. | Keep. |
| `PARTNER_MANAGER` | Platform | `partners.*`, `contracts.read/manage`, `leads.read/update` | 5 | Overlaps `CONTRACT_MANAGER` on contracts. | Keep — partner-specific scope beyond contracts. |
| `CONTRACT_MANAGER` | Platform | `contracts.*`, read-only customers/partners/onboarding | 4 | Narrower than `PARTNER_MANAGER` on contracts, no partner-write. | Keep. |
| `LEGAL_REVIEWER` | Platform | `contracts.read/approve`, `legal.read/manage` | 5 | Only role with `legal.manage`. | Keep — distinct approval gate. |
| `FINANCE_MANAGER` | Platform | `billing.*`, payments/subscriptions/invoices/plans read, `contracts.read/approve` | 5 | Overlaps `BILLING_USER` (superset). | Keep — approval rights `BILLING_USER` lacks. |
| `BILLING_USER` | Platform | `billing.read`, payments/subscriptions/invoices/plans read | 4 | Strict subset of `FINANCE_MANAGER`. | Keep as the read-only billing seat, or fold into `FINANCE_MANAGER` with a scope flag if headcount never needs the distinction. |
| `SUPPORT_MANAGER` | Platform | `support.*`, `monitoring.*`, tenant/partner/subscription/invoice read | 6 | Superset of `SUPPORT_AGENT` plus monitoring. | Keep. |
| `SUPPORT_AGENT` | Platform | `support.read/manage`, `monitoring.read`, read-heavy | 8 | Subset of `SUPPORT_MANAGER`. | Keep. |
| `MONITORING_OPERATOR` | Platform | `monitoring.*`, `support.read/manage`, read-only customers/tenants | 6 | Overlaps `SUPPORT_MANAGER` significantly (both get `monitoring.*` + `support.*`-ish). | Consider whether `SUPPORT_MANAGER` should simply subsume this, or keep separate if org chart genuinely splits NOC from support leadership. |
| `READ_ONLY_AUDITOR` | Platform | read-only across every domain including `settings.read` | 4 | Only role with broad read + no write anywhere — matches BUG-0072's fix (it must never get a `.manage`/`.update` fallback). | Keep — genuinely distinct (compliance/audit seat). |

No tenant-level "admin-ish" role duplication was found to be exposed through
this platform surface — tenant roles (`system-admin`, `system-customizer`,
etc., `rbac-matrix.ts:20-41`) are a completely separate catalog seeded
per-tenant; the only place they leak into platform code is the `roleKeys`
alias and the `isSystemAdmin`/`RequireRoles` checks documented in §2, which
is itself the defect.

Role picker: `apps/admin/lib/platform-rbac.ts`'s `PLATFORM_ROLES` (16) is the
option list consumed by the platform-user create/edit screens; it matches the
Prisma enum exactly (verified by name, both 16 entries, same casing).

## 4. Generic admin CRUD permission patterns (`super-admin` controllers)

`super-admin.controller.ts` class-level:
`@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)` +
`@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)`
(lines 73-74). Per-route, 17 handlers repeat a narrower
`@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN)` (single key, dropping
`SYSTEM_CUSTOMIZER`) — e.g. lines 297, 309, 315, 325, 333, 341, 351, 367,
381, 395, 401, 426, 446, 455, 465 — layered on top of
`PlatformPermissionsGuard`'s own per-path permission resolution
(`resolvePlatformPermission`, §1). This is a third, redundant authorization
layer specific to this controller (`platform-runtime` has no equivalent —
compare §2), and it is where the `SYSTEM_ADMIN` tenant-role-key idiom
originates; `updateTenant`'s in-service `isSystemAdmin` check appears to be
the same idiom copied one layer deeper, into the service both controllers
that call `updateTenant` share.

**Route that looks unintentionally SUPER_ADMIN-narrow beyond `updateTenant`**:
none found with the same shape — every other `@RequireRoles(...)` on this
controller requires only `ROLE_KEYS.SYSTEM_ADMIN`, and `RolesGuard` bypasses
that requirement outright for the literal `SUPER_ADMIN` platform role and
(via the alias) for `PLATFORM_OWNER`; those routes are consistently
SUPER_ADMIN/PLATFORM_OWNER-only **by design** (not a service-level surprise
sitting under a route the guard already approved), which is a different,
smaller problem than `updateTenant`'s — there the guard layer (`RolesGuard`
on the direct REST route) and the service layer (`assertModuleWrite` on the
runtime route) both say "approved" for `PLATFORM_ADMIN`, and only the
service's second check reverses that.

## 5. Related open bug records

- **BUG-0071** (`docs/bugs/BUG-0071-tenant-users-reach-every-platform-super-admin-endpoint.md`)
  — Status `VERIFIED`, `ArchitectDisposition: DONE`, fixed 2026-08-18. Still
  accurate: the fix it describes (platform-identity-first in
  `PlatformPermissionsGuard`, tenant-key fallback scoped to `platform.id`
  subjects) matches the current code exactly (`platform-permissions.ts:307-319,340-370`).
  Not the same defect as this record's finding — BUG-0071 was tenant users
  reaching platform routes; this is a legitimate platform user being refused
  a route their permission model says they should have.
- **BUG-3156** (`docs/bugs/BUG-3156-a-tenant-admin-can-create-rename-or-deactivate-the-platform-.md`)
  — Status `OPEN`, `FIX_NOW`, about `lookups` (geography reference data), not
  `super-admin`/tenants. Unrelated to this finding; still open and still
  accurate per its own evidence (not re-verified live here, out of scope).
- **BUG-2463** (`docs/bugs/BUG-2463-raw-prisma-constraint-failures-reach-operators-as-database-c.md`)
  — Status `DEFERRED`, about generic Prisma-error messages on four unrelated
  endpoints (`customer-onboarding`, `leads` bulk-delete, tenant
  `reset-activation`, `plans` list). Unrelated to this finding.

None of the three existing records documents the tenant-profile-edit
authorization gap found here; it appears to be previously unrecorded.

---

## Root cause (tenant edit)

`SuperAdminService.updateTenant()`
(`services/api/src/modules/super-admin/super-admin.service.ts:1614-1672`)
gates writes to `name`/`displayName`/`legalName`/`status`/`subStatus` on
`actor.roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN)` — a **tenant**-side role-key
constant (`'system-admin'`, `rbac-matrix.ts:33`) — instead of on the platform
permission (`tenants.update`) that `PlatformRuntimeService.assertModuleWrite`
already checked one call frame earlier
(`platform-runtime.service.ts:481,1259-1267,1303`). For a platform actor,
`roleKeys` only contains `'system-admin'` when `platformAccessForRole`
(`platform-permissions.ts:261-279`) injects it as a guard alias for the two
"elevated" roles, `SUPER_ADMIN` and `PLATFORM_OWNER`. Every other platform
role that legitimately holds `tenants.update`/`tenants.*` —
**`PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`, `MEMBER`** — passes the real
permission check, sees a fully enabled Edit/Save command bar (the UI's
`ACTION.edit`/`ACTION.save` carry no role restriction), fills in the form,
and then receives `403 FORBIDDEN "Only System Admin can edit tenant profile
fields."` on save — a message that names a tenant role, in a platform-only
code path, to a platform operator who has no tenant role at all.

If the account being described as "Platform Super Admin" in the field is a
`PLATFORM_ADMIN` (the role the UI itself groups with `SUPER_ADMIN`/
`PLATFORM_OWNER` as `PLATFORM_OPERATORS`, and the role name most likely to be
read as "the admin of the platform"), this reproduces exactly: full-looking
access, a working Edit screen, a save that always fails. The literal
`PlatformUserRole.SUPER_ADMIN` DB value (the seeded root account) and
`PLATFORM_OWNER` are **not** blocked by this path per static trace — that
should be confirmed live against the actual reporting account's `role` value
before closing.

## Recommended fix

Replace the `isSystemAdmin` check with the same permission model the rest of
the call path already trusts — do not introduce a second source of truth:

```ts
// services/api/src/modules/super-admin/super-admin.service.ts, updateTenant()
// Delete the roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN) check entirely, or
// replace it with an explicit platform check if some subset of fields
// (e.g. status/subStatus) is meant to stay narrower than plain tenants.update:
if (updatesLifecycleField && !userHasPlatformPermission(actor, 'tenants.update')) { ... }
```

Concretely:

1. Decide the actual intended policy: is *any* platform user holding
   `tenants.update` (`PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`, `MEMBER`,
   `SUPER_ADMIN`, `PLATFORM_OWNER`) meant to edit `name`/`displayName`/
   `legalName`/`status`/`subStatus`, or should `status`/`subStatus` (already
   UI-locked behind the Actions menu, per `RECORD_HEADER_READ_ONLY_REASON`)
   require a stricter platform check? Either answer is defensible; the
   current code accidentally implements neither — it implements "only
   whichever roles happen to carry a tenant-role-key alias".
2. If the policy is "any `tenants.update` holder", delete the `isSystemAdmin`
   check — `PlatformRuntimeService.assertModuleWrite` (and, on the direct
   REST route, `PlatformPermissionsGuard`) already enforce it correctly.
3. If the policy is "only the full-platform-admin tier", replace the check
   with `PLATFORM_OPERATORS`-equivalent logic on the server
   (`actor.platform?.role` in `['SUPER_ADMIN', 'PLATFORM_OWNER',
   'PLATFORM_ADMIN']`, matching the UI's own `PLATFORM_OPERATORS` constant),
   not a tenant role-key string.
4. Fix the same idiom on the direct REST route
   (`super-admin.controller.ts:264-265`, `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN,
   ROLE_KEYS.SYSTEM_CUSTOMIZER)`) so the two entry points to `updateTenant`
   agree, and add `PLATFORM_OWNER` to `RolesGuard`'s explicit literal-role
   bypass (`services/api/src/common/guards/roles.guard.ts:26-28`) rather than
   depending on the `platformAccessForRole` alias to carry it — the alias's
   own doc-comment says it must never be read as a role list, so a permission
   decision quietly depending on it is exactly the kind of drift that
   comment warns about.
5. Add the missing test: `super-admin.service.spec.ts` has no case for
   `updateTenant`'s profile-field path at all (only `updateTenantSlug` is
   covered) — add one per role in the table in §2's "Result per role" so this
   class of regression fails a unit test instead of reaching an operator.
6. This is an authorization narrowing/widening change to a shared platform
   surface — treat it as requiring the same rigor `AGENTS.md` asks for
   permission changes generally (both decorators kept in sync, row-level
   scope unaffected since this is platform-only, `wiring-invariants`/
   `platform-permissions.spec.ts` extended), and file it as a `BUG` record
   before fixing per the repository's own contract (`AGENTS.md` "No finding
   may exist only in a report").
