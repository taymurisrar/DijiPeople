---
ID: BUG-3544
aliases: [BUG-3544]
Title: A Platform Admin can open and edit a tenant but every save is refused as not System Admin
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/super-admin, services/api/src/modules/platform-runtime]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3544 — A Platform Admin can open and edit a tenant but every save is refused as not System Admin

## Summary

A platform user holding the `PLATFORM_ADMIN` role (or `PLATFORM_OPERATIONS`, or
the legacy `MEMBER` role) can open a tenant record in `apps/admin`, see the
Edit/Save actions enabled, change `name`/`displayName`/`legalName`, and click
Save — and every one of those saves is refused with a 403 that names a role
("System Admin") the platform user has never heard of, because it is a
tenant-side role key, not a platform one. Only `SUPER_ADMIN` and
`PLATFORM_OWNER` can actually save.

## Expected Behavior

Any platform user whose role holds the `tenants.update` permission — which the
UI's own `assertModuleWrite` gate, the enabled Edit/Save command bar, and the
role's `ROLE_PERMISSIONS` entry all already agree should include
`PLATFORM_ADMIN`, `PLATFORM_OPERATIONS` and `MEMBER` — should be able to save
the tenant profile fields the UI lets them edit. Whichever policy is intended
(any `tenants.update` holder, or a narrower "full platform admin" tier), the
same permission model that gated the button should gate the save.

## Actual Behavior

`PATCH /api/platform-runtime/tenants/:id` returns `200` for `SUPER_ADMIN` and
`PLATFORM_OWNER`, and `403 ACCESS_DENIED "Only System Admin can edit tenant
profile fields."` for `PLATFORM_ADMIN` and `PLATFORM_OPERATIONS` — roles the
UI itself groups with `SUPER_ADMIN`/`PLATFORM_OWNER` as the top operator tier
(`PLATFORM_OPERATORS`) and which pass every check upstream of this one.

## Reproduction

1. Sign in to `apps/admin` as a `PLATFORM_ADMIN` (or `PLATFORM_OPERATIONS`)
   platform user.
2. Open any tenant record (`/tenants/:tenantId`), switch to the Configuration
   tab, click Edit — the command bar shows Edit/Save, both enabled.
3. Change `Display Name` (or `Name`/`Legal Name`) and click Save.
4. Observe `403 FORBIDDEN`, `errorCode: ACCESS_DENIED`, message `"Only System
   Admin can edit tenant profile fields."`
5. Repeat as `SUPER_ADMIN` or `PLATFORM_OWNER`: the identical PATCH returns
   `200`.

**Live reproduction, throwaway stack, 2026-09-25**: `PATCH
/api/platform-runtime/tenants/:id` returned `200` for `SUPER_ADMIN` and
`PLATFORM_OWNER`, and `403 ACCESS_DENIED "Only System Admin can edit tenant
profile fields."` for `PLATFORM_ADMIN` and `PLATFORM_OPERATIONS`.

## Evidence

- `services/api/src/modules/super-admin/super-admin.service.ts:1614-1672`
  (`updateTenant`) — the actual gate:
  ```ts
  const isSystemAdmin = actor.roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);   // 1628
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
  is the **tenant-side** role key `'system-admin'` — an ordinary tenant role
  seeded by `seed-demo.ts`, not a platform concept.
- `services/api/src/modules/platform-auth/platform-permissions.ts:261-279`
  (`platformAccessForRole`) — only `SUPER_ADMIN` and `PLATFORM_OWNER`
  ("elevated") get the literal string `'system-admin'` injected into
  `roleKeys` as a guard alias. Every other platform role's `roleKeys` is just
  `[roleEnumValue, kebab-case-alias]`.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts:474-519`
  (`update()`) → `assertModuleWrite(user, 'tenants')` (lines 1259-1267) →
  `runtimePermission('tenants', true) = 'tenants.update'` (line 1303) —
  this passes for `PLATFORM_ADMIN` (`'tenants.*'`), `PLATFORM_OPERATIONS`
  (`'tenants.*'`) and `MEMBER` (`LEGACY_MEMBER_PERMISSIONS`), then delegates
  to `this.superAdmin.updateTenant(user, id, dto)` (lines 512-519) where the
  second, undocumented check above reverses the decision.
- `apps/admin/lib/runtime/platform-module-registry.ts:185-216,409-498` —
  neither `ACTION.edit` nor `ACTION.save` carries a `roles` restriction, so
  the command bar renders enabled for every role that can open the record,
  regardless of which of the 16 `PlatformUserRole` values it is.
- A second, independent instance of the same idiom:
  `services/api/src/modules/super-admin/super-admin.controller.ts:73-74,264-271`
  guards the whole controller and the direct REST route
  (`PATCH /super-admin/tenants/:tenantId`, unused by the admin UI, which calls
  the runtime route instead) with
  `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.SYSTEM_CUSTOMIZER)` — the
  same tenant-role-key-as-platform-gate pattern, one layer up.
- No automated test covers `updateTenant`'s profile-field path:
  `services/api/src/modules/super-admin/super-admin.service.spec.ts` only
  exercises `updateTenantSlug`.

## Root Cause

`SuperAdminService.updateTenant()` gates writes to
`name`/`displayName`/`legalName`/`status`/`subStatus` on
`actor.roleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN)` — a tenant-side role-key
constant — instead of on the platform permission (`tenants.update`) that
`PlatformRuntimeService.assertModuleWrite` already checked one call frame
earlier. For a platform actor, `roleKeys` only contains `'system-admin'` when
`platformAccessForRole` injects it as a guard alias for the two "elevated"
roles. Every other platform role that legitimately holds
`tenants.update`/`tenants.*` — `PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`,
`MEMBER` — passes the real permission check, sees a fully enabled Edit/Save
command bar, fills in the form, and only then discovers the save was never
possible. The check appears to be a second, ad hoc authorization layer copied
from the same idiom on `super-admin.controller.ts`'s direct REST route, into a
service both entry points share, rather than a deliberate narrowing decision.

## Impact

Every `PLATFORM_ADMIN` and `PLATFORM_OPERATIONS` platform user — the roles
`apps/admin`'s own UI treats as full/near-full operators — cannot actually
edit a tenant's name, display name or legal name despite the UI offering the
action as available. This is a primary tenant-management journey blocked for
the majority of the platform's own administrative staff, reachable in
production today (not behind a feature flag or dev-only code path).

## Affected Areas

- `services/api/src/modules/super-admin/super-admin.service.ts` (`updateTenant`)
- `services/api/src/modules/super-admin/super-admin.controller.ts` (direct REST route, same idiom)
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` (the call path that reaches the gate)
- `apps/admin` tenant record Edit/Save UI (`/tenants/:tenantId`)
- `services/api/src/common/guards/roles.guard.ts` (`PLATFORM_OWNER`'s bypass relies on the same alias, see Proposed Resolution)

## Proposed Resolution

Replace the `isSystemAdmin` check with the platform permission model the rest
of the call path already trusts, rather than a tenant role-key string:

1. Decide the intended policy: any platform user holding `tenants.update`
   (`PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`, `MEMBER`, `SUPER_ADMIN`,
   `PLATFORM_OWNER`), or a narrower "full platform admin" tier for
   `status`/`subStatus` (already UI-locked behind the Actions menu).
2. If the former, delete the `isSystemAdmin` check — `assertModuleWrite` (and,
   on the direct REST route, `PlatformPermissionsGuard`) already enforce it
   correctly.
3. If the latter, replace the check with an explicit platform-role check
   (`actor.platform?.role` in `['SUPER_ADMIN', 'PLATFORM_OWNER',
   'PLATFORM_ADMIN']`, matching the UI's own `PLATFORM_OPERATORS` constant),
   not a tenant role-key string.
4. Fix the identical idiom on `super-admin.controller.ts`'s direct REST route
   so the two entry points to `updateTenant` agree, and add `PLATFORM_OWNER`
   to `RolesGuard`'s explicit literal-role bypass
   (`services/api/src/common/guards/roles.guard.ts:26-28`) rather than
   depending on the `platformAccessForRole` alias to carry it.
5. Add the missing unit coverage: one case per role in `super-admin.service.spec.ts`
   for `updateTenant`'s profile-field path.
No ExecPlan needed — this is an authorization-logic fix inside existing
modules, not a schema or contract change.

## Acceptance Criteria

- A `PLATFORM_ADMIN` (and `PLATFORM_OPERATIONS`) platform user can save
  `name`/`displayName`/`legalName` on a tenant record and receives `200`.
- The decided policy is enforced consistently on both
  `PATCH /platform-runtime/tenants/:id` and the direct
  `PATCH /super-admin/tenants/:tenantId` route.
- No role that lacks `tenants.update` can save these fields.
- `super-admin.service.spec.ts` has a passing case per role in this record's
  Evidence table.

## Regression Coverage

A unit test asserting `updateTenant` succeeds for `PLATFORM_ADMIN`/
`PLATFORM_OPERATIONS` and fails for a role with no `tenants.update`, failing
against the unfixed code. No `REG-nnn` entry yet — to be added once the fix
lands and QA verifies it.

## Dependencies

None.

## Related Items

- [[BUG-0071]] — a related but distinct platform-authorization defect (tenant
  users reaching platform routes); this is the inverse shape (a legitimate
  platform user refused a route their permission model says they should have).
- [[BUG-3547]] — the platform role/label confusion this same discovery pass
  found in the same area.
- TASK-0032 — the program that found and will fix this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D1.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]]

<!-- GRAPH:END -->
