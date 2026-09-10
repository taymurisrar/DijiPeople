---
ID: BUG-3132
aliases: [BUG-3132]
Title: Self-service privilege escalation to GLOBAL_ADMIN via POST /users/:userId/roles
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/users]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3132 — Self-service privilege escalation to GLOBAL_ADMIN via POST /users/:userId/roles

## Summary

Self-service privilege escalation to GLOBAL_ADMIN via POST /users/:userId/roles

Identified by the 2026-09-10 full technical audit as AUTHZ-01 (confidence: AUTHZ-01=CONFIRMED).

## Expected Behavior

Same checks as `assignRoles` — system roles require tenant-owner or `SYSTEM_ADMIN`; `GLOBAL_ADMIN` may only be assigned to the tenant owner.

## Actual Behavior

Any actor holding `users.assign-roles` + `USERS:assign` (at any RBAC access level ≠ `NONE` — the privilege is not itself scoped to a role tier) can call `POST /users/<any-userId-in-tenant>/roles` with `{"roleId": "<tenant's GLOBAL_ADMIN role id>"}` and succeed unconditionally, including against their own user id.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTHZ-01** (services/api/src/modules/users/users.controller.ts:168-181, users.service.ts:603-641):

`users.controller.ts:168-181` —
```
@Post(':userId/roles')
@Permissions('users.assign-roles')
@RequirePermission(ENTITY_KEYS.USERS, 'assign')
addRole(@CurrentUser() currentUser, @Param('userId') targetUserId, @Body('roleId') roleId) {
  return this.usersService.addRole(...)
```
`users.service.ts:603-624` — the entire method body:
```
async addRole(tenantId, userId, roleId, actorId) {
  await this.assertUserBelongsToTenant(tenantId, userId);
  const role = await this.rolesRepository.findByIds(tenantId, [roleId]);
  if (role.length !== 1) throw new BadRequestException(...);
  if (!role[0].isActive) throw new BadRequestException(...);
  const row = await this.usersRepository.addUserRole(tenantId, userId, roleId, actorId);
  return { ... };
}
```
That is the complete method — no comparison of the actor's own roles/privileges to the role being granted, no check on `role.isSystem`, no special case for `ROLE_KEYS.GLOBAL_ADMIN`, no self-target check.

Compare the sibling bulk-replace endpoint, same controller, `users.controller.ts:141-154` (`PUT :userId/roles` → `usersService.assignRoles`), whose service method (`users.service.ts:277-370`) does all of the above:
```
313  const canAssignPrivilegedRoles = ownership.isActorOwner || actorEffectiveRoleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);
317  if (!canAssignPrivilegedRoles && roles.some((role) => role.isSystem)) {
       throw new ForbiddenException('Only tenant owners and system administrators can assign system roles.');
323  const includesGlobalAdministrator = roles.some((role) => role.key === ROLE_KEYS.GLOBAL_ADMIN);
327  if (includesGlobalAdministrator && !ownership.isTargetOwner) {
       throw new ForbiddenException('Global Administrator can only be assigned to the tenant owner.');
333  if (ownership.isTargetOwner) { ... 339 if (globalAdministrator && !roleIds.includes(globalAdministrator.id))
       throw new ForbiddenException('The tenant owner cannot be downgraded from Global Administrator.');
```
Both controller methods require the identical permission pair (`users.assign-roles` legacy key + `USERS:assign` RBAC privilege), so `PermissionsGuard` treats them as equally sensitive — but only one of the two services enforces the escalation rules that make that permission pair safe to grant to a delegated "assign roles" admin in the first place.

---


Full finding text: AUTHZ-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Complete privilege escalation. Scenario: a tenant-scoped role that legitimately needs to assign ordinary roles to new hires (holds `users.assign-roles` + `USERS:assign`, e.g. a delegated "People Ops" role that was never meant to touch system roles) calls `POST /api/users/<own-id>/roles` with body `{"roleId": "<GLOBAL_ADMIN-role-id>"}`. `addUserRole` inserts the row; the actor's `roleKeys` now include `GLOBAL_ADMIN`. Every subsequent request from that user hits `hasElevatedTenantRole` (§1) and bypasses **every** `PermissionsGuard` check and **every** row-level scope check (`resolveEffectiveAccessLevel`, `buildScopedAccessWhere`, `canAccessRecord` all return unconditional tenant access for an elevated role) tenant-wide — payroll, compensation, role management, billing, everything gated by the standard mechanism in this tenant.

## Affected Areas

services/api/src/modules/users

## Proposed Resolution

Move the escalation checks out of `assignRoles` into a shared private method (e.g. `assertRoleGrantAllowed(currentUser, ownership, roles)`) and call it from both `assignRoles` and `addRole` in `users.service.ts`.

(Difficulty: LOW (the logic to reuse already exists and is tested for the `PUT` path); Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/users/users.controller.ts:168-181, users.service.ts:603-641 (audit id AUTHZ-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTHZ-01=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTHZ-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTHZ-01) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
