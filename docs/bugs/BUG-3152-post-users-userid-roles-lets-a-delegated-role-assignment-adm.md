---
ID: BUG-3152
aliases: [BUG-3152]
Title: POST /users/:userId/roles lets a delegated role-assignment admin self-grant GLOBAL_ADMIN
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: ef3d13e8
AffectedModules: [services/api/src/modules/users/users.service.ts, services/api/src/modules/users/users.controller.ts]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-398
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt: 2026-09-11
---

# BUG-3152 — POST /users/:userId/roles lets a delegated role-assignment admin self-grant GLOBAL_ADMIN

## Summary

`POST /users/:userId/roles` (`UsersService.addRole`) granted any role,
including `GLOBAL_ADMIN`, to any user in the tenant with no check on who may
hold that permission safely — no comparison of the actor's own roles, no
`isSystem` check, no `GLOBAL_ADMIN` special case, no self-target check. Its
sibling bulk-replace endpoint, `PUT /users/:userId/roles`
(`UsersService.assignRoles`), required the identical permission pair
(`users.assign-roles` + `USERS:assign`) and *did* enforce all of that. Audit
finding AUTHZ-01 (CRITICAL/P0, CONFIRMED end to end).

## Expected Behavior

A role that legitimately needs to assign ordinary roles to new hires (holds
`users.assign-roles` + `USERS:assign`, but was never meant to touch system
roles) must not be able to grant `GLOBAL_ADMIN`, or any `isSystem` role,
through either endpoint that shares this permission pair. `GLOBAL_ADMIN` may
only be assigned to the tenant owner, and only a tenant owner or a
`SYSTEM_ADMIN` may assign a system role at all — the rule `assignRoles`
already enforced.

## Actual Behavior

`addRole`'s complete body was: verify the target belongs to the tenant,
verify the role belongs to the tenant and is active, then call
`usersRepository.addUserRole` unconditionally. Any actor holding
`users.assign-roles` + `USERS:assign` (at any RBAC access level, since the
privilege was not itself scoped to a role tier) could call
`POST /users/<any-userId-in-tenant>/roles` with
`{"roleId": "<tenant's GLOBAL_ADMIN role id>"}` and succeed unconditionally,
including against their own user id.

## Reproduction

1. As a tenant user holding only `users.assign-roles` + `USERS:assign` (e.g. a
   "People Ops" role scoped to onboarding new hires, not to system
   administration), call
   `POST /api/users/<own-user-id>/roles` with body `{"roleId": "<tenant's
   GLOBAL_ADMIN role id>"}`.
2. Pre-fix: `200 OK`, the actor now holds `GLOBAL_ADMIN` — `hasElevatedTenantRole`
   (AUTHZ-05) then bypasses every other guard and row-scope check in the
   tenant.
3. Post-fix: `403 Forbidden`, `'Global Administrator can only be assigned to
   the tenant owner.'`

## Evidence

- `services/api/src/modules/users/users.controller.ts:168-181` (`addRole`)
  required the same `@Permissions('users.assign-roles')` +
  `@RequirePermission(ENTITY_KEYS.USERS, 'assign')` pair as
  `:142-156` (`assignRoles`), so `PermissionsGuard` treated them as equally
  sensitive.
- `services/api/src/modules/users/users.service.ts` (pre-fix, `addRole`
  ~L603-624): no ownership lookup, no call to any escalation check.
- `services/api/src/modules/users/users.service.ts` (`assignRoles`
  ~L308-321, pre-fix): the escalation checks — `canAssignPrivilegedRoles`,
  the `isSystem` rejection, the `GLOBAL_ADMIN`-requires-owner rejection —
  existed only here.

## Root Cause

The two endpoints were implemented independently, at different times, against
the same permission pair. The escalation rule was written once, on the
richer "replace all roles" endpoint, and never factored out — so when the
simpler "add one role" endpoint was added later, nothing forced it to reuse
the same rule, and nothing detected that it hadn't.

## Impact

Reachable today, in-tenant (not cross-tenant): complete privilege escalation
for any actor holding a common, non-owner administrative permission pair.
CRITICAL/P0 per the audit; the highest-priority action in the executive
report after the two SUP-01 credential-leak items.

## Affected Areas

`services/api/src/modules/users/users.service.ts` (`addRole`, `assignRoles`,
new `assertRoleGrantWithinActorAuthority`), `users.controller.ts` (unchanged
— the fix is entirely in the service layer, by design: both routes already
declared the identical permission pair, so the gap was never in routing).

## Proposed Resolution

Extract the escalation rule from `assignRoles` into one private method,
`assertRoleGrantWithinActorAuthority(actorId, ownership, roles)`, covering:
system-role assignment requires tenant-owner or `SYSTEM_ADMIN` standing, and
`GLOBAL_ADMIN` may only be assigned to the tenant owner. Call it from both
`addRole` and `assignRoles` before either touches the database. Deliberately
excludes `assignRoles`'s separate "tenant owner cannot be downgraded from
Global Administrator" check, which is specific to a full role-set replace and
has no equivalent when only adding one role.

## Acceptance Criteria

- An actor without owner or `SYSTEM_ADMIN` standing cannot grant a system
  role, or `GLOBAL_ADMIN` to a non-owner, through either `POST` or `PUT`
  `/users/:userId/roles`.
- An actor with that standing can still grant ordinary and system roles as
  before (no regression to legitimate admin flows).
- `GLOBAL_ADMIN` can still be granted to the tenant owner via `addRole` by an
  actor with `SYSTEM_ADMIN` standing.

## Regression Coverage

`services/api/src/modules/users/users.service.spec.ts` (new). See REG-398.

## Dependencies

None.

## Related Items

Audit finding AUTHZ-01. Amplified by AUTHZ-05
(`hasElevatedTenantRole`/`buildScopedAccessWhere` bypass everything once a
user holds `GLOBAL_ADMIN`) — documented as a known-by-design bypass in
AGENTS.md, not itself changed here. See
`docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`.

## Resolution

Fixed on branch `agent/cs-s5-security`. Added
`UsersService.assertRoleGrantWithinActorAuthority` and call it from both
`addRole` and `assignRoles`; `assignRoles`'s call site now delegates to it
instead of inlining the same three checks.

## QA Retest

Not yet retested by QA; verified locally via
`users.service.spec.ts` (6/6 passing), including a spy-based assertion that
both `addRole` and `assignRoles` invoke the shared method.

## History

- 2026-09-10 — created from security review at `ef3d13e8`.
- 2026-09-11 — fixed on `agent/cs-s5-security`; status FIXED.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-398 (see the regression register)

<!-- GRAPH:END -->
