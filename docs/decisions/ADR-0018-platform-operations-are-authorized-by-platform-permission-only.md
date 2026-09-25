---
ID: ADR-0018
aliases: [ADR-0018]
Title: Platform operations are authorized by platform permission only, and the platform role list is consolidated
Status: ACCEPTED
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
---
# ADR-0018 — Platform operations are authorized by platform permission only, and the platform role list is consolidated

## Status

Accepted — 2026-09-25, by the Architect under the owner's TASK-0032 instruction to
"implement a clearly defined platform-level privilege model" and to remove
meaningless duplicate roles without breaking existing access.

## Context

A platform operator's request passes through two different authorization models
that disagree:

- **Platform permissions** — `platformAccessForRole(role)`
  (`services/api/src/modules/platform-auth/platform-permissions.ts`) turns a
  `PlatformUserRole` into permission keys such as `tenants.update`, checked by
  `PlatformPermissionsGuard` and by `userHasPlatformPermission`.
- **Tenant role keys** — `system-admin` and `system-customizer`
  (`common/constants/rbac-matrix.ts`) are *tenant* roles. `platformAccessForRole`
  injects them into `roleKeys` as an alias for `SUPER_ADMIN` and
  `PLATFORM_OWNER` only, and several platform paths then test for them:
  `SuperAdminService.updateTenant` (`roleKeys.includes('system-admin')`) and
  `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, …)` on `SuperAdminController`.

The result, reproduced live on 2026-09-25: a `PLATFORM_ADMIN` who holds
`tenants.*` passes every permission check, gets an enabled Edit/Save, and is
refused on save with "Only System Admin can edit tenant profile fields". The
admin session heartbeat (`POST /auth/activity`) requires the tenant permission
`user-preferences.write`, so most platform roles also get a blocking
"no permission" dialog while working.

The role picker shows `SUPER_ADMIN` as "Platform Owner (legacy Super Admin)"
beside `PLATFORM_OWNER`. The two have identical permissions (`platform.*`).
`MEMBER` carries a permission set literally named `LEGACY_MEMBER_PERMISSIONS`.

## Decision

1. **A platform subject is authorized by platform permission, never by a tenant
   role key.** Every platform code path decides with `userHasPlatformPermission`
   (or `PlatformPermissionsGuard` at the route). `roleKeys.includes(<tenant key>)`
   and `@RequireRoles(<tenant key>)` must not be the deciding check for a
   platform subject. Where an operation is deliberately narrower than its
   module's general write permission, it gets an explicit platform permission
   key that expresses that narrowing.
2. **Super Admin is the widest permission set, not a bypass.** `SUPER_ADMIN`
   holds `platform.*`, which satisfies every permission check. Authentication,
   validation, protected-record invariants and auditing still run for it; no
   code path may skip them because the actor is a Super Admin.
3. **Self-scoped endpoints need authentication only.** An endpoint that acts
   solely on the caller's own session or preferences (e.g. `POST /auth/activity`)
   does not require a business permission.
4. **Tenant profile vs. tenant lifecycle.** The generic tenant edit changes
   profile fields (`name`, `displayName`, `legalName`) under `tenants.update`.
   Status changes go only through the governed lifecycle actions, which carry a
   reason and are audited; the generic edit refuses `status`/`subStatus` with a
   400 naming the governed action to use.
5. **The platform role list is consolidated:**

   | Role | Label | Assignable |
   |---|---|---|
   | `SUPER_ADMIN` | Platform Super Admin | yes — the single top role |
   | `PLATFORM_ADMIN` | Platform Admin | yes — full day-to-day administration short of platform-user management and destructive platform operations |
   | `PLATFORM_OPERATIONS` | Platform Operations | yes |
   | functional roles (Presales Manager/User, Partner Manager, Contract Manager, Legal Reviewer, Finance Manager, Billing User, Support Manager/Agent, Monitoring Operator, Read-only Auditor) | unchanged | yes |
   | `PLATFORM_OWNER` | — | **no** — existing assignments migrate to `SUPER_ADMIN` (identical permissions, so no access changes); the enum value stays as an alias until a later contract step |
   | `MEMBER` | Legacy Member (deprecated) | **no** — existing assignments keep working unchanged; new assignments are refused |

   Tenant roles are a separate catalog and are not merged with platform roles.

## Reasons

- One model means the UI's enabled actions, the route guard and the service
  agree; the defect class is two models answering the same question differently.
- Migrating `PLATFORM_OWNER` to `SUPER_ADMIN` removes a visible duplicate
  without changing anyone's access. `SUPER_ADMIN` is kept because the seed,
  `RolesGuard` and every emergency-recovery procedure already name it.
- Keeping `MEMBER` assignments avoids silently widening or narrowing access for
  existing accounts; blocking new ones stops the population growing.

## Alternatives Considered

- **Grant `system-admin` to every platform role with `tenants.update`.** Rejected:
  it deepens the dependency on a tenant role key in platform code.
- **Make Super Admin skip checks.** Rejected by the owner's instruction and by
  principle 2.
- **Delete `PLATFORM_OWNER`/`MEMBER` enum values now.** Rejected: destructive
  enum changes need expand/contract; the alias costs nothing.

## Consequences

- `PLATFORM_ADMIN`, `PLATFORM_OPERATIONS` and `MEMBER` can edit tenant profiles.
- A data migration updates `PlatformUser.role` from `PLATFORM_OWNER` to
  `SUPER_ADMIN`, audited.
- Tests pin the per-role outcome for tenant edit and for the heartbeat.

## Migration / Compatibility Impact

Additive for permissions. The `PLATFORM_OWNER` → `SUPER_ADMIN` update is
access-preserving. API clients that sent `status` through the generic tenant edit
receive a 400; the admin UI never did (those fields are read-only there).
