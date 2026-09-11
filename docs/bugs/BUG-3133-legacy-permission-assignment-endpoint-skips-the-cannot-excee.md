---
ID: BUG-3133
aliases: [BUG-3133]
Title: Legacy permission-assignment endpoint skips the cannot-exceed-own-access check its matrix sibling applies
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/roles]
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

# BUG-3133 — Legacy permission-assignment endpoint skips the cannot-exceed-own-access check its matrix sibling applies

## Summary

Legacy permission-assignment endpoint skips the cannot-exceed-own-access check its matrix sibling applies

Identified by the 2026-09-10 full technical audit as AUTHZ-02 (confidence: AUTHZ-02=CONFIRMED).

## Expected Behavior

Same "cannot exceed own effective access" rule applied to legacy permission keys as is applied to RBAC matrix privileges.

## Actual Behavior

An actor holding `roles.assign-permissions` + `SETTINGS:configure` can, via the legacy-keys endpoint, grant any editable role **any legacy permission key that exists in the tenant** (e.g. `payslips.read-all`, `employees.delete`, `billing.manage` if tenant-scoped) regardless of whether the actor holds that key themselves — the RBAC-matrix sibling endpoint blocks exactly this, the legacy endpoint does not.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTHZ-02** (services/api/src/modules/roles/roles.controller.ts:92-117, roles.service.ts:123-155,270-330,580-624):

`roles.controller.ts:92-106` and `:108-117` — both `PUT :roleId/permissions` (`updatePermissions`) and `PUT :roleId/matrix` (`updateMatrix`) require the identical pair: `@Permissions('roles.assign-permissions')` + `@RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')`.

`roles.service.ts:270-294` (`updateMatrix`) —
```
290  this.assertValidMatrix(dto);
292  if (!this.canEscalateBeyondOwnAccess(currentUser)) {
293    await this.assertMatrixWithinActorAccess(currentUser, dto);
294  }
```
`roles.service.ts:580-617` (`assertMatrixWithinActorAccess`) computes the actor's own max `SecurityAccessLevel` per `entityKey:privilege` from their own roles' `rolePrivileges`, and throws `ForbiddenException('Custom roles cannot exceed your own effective access.')` if any requested privilege in the matrix exceeds it.

`roles.service.ts:123-155` (`updatePermissions`) — the complete method:
```
123  async updatePermissions(tenantId, roleId, permissionIds, actorId) {
       const role = await this.rolesRepository.findByIdAndTenant(tenantId, roleId);
       if (!role) throw new NotFoundException(...);
       if (role.isSystem || !role.isEditable) throw new ForbiddenException(...);
       const permissions = await this.permissionsService.findByIds(tenantId, permissionIds);
       if (permissions.length !== permissionIds.length) throw new BadRequestException(...);
       return this.rolesRepository.replacePermissions(tenantId, roleId, permissionIds, actorId);
     }
```
No call to `assertMatrixWithinActorAccess` or any equivalent — only that the requested permission ids belong to the tenant.

---


Full finding text: AUTHZ-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Scenario: a role holding `roles.assign-permissions` but not `payslips.read-all` calls `PUT /api/roles/<own-role-id>/permissions` with a `permissionIds` array that includes the id for `payslips.read-all`, then either already holds that role or self-assigns it (subject to AUTHZ-01/the `assignRoles` checks, which do not gate on *legacy key* content, only on `isSystem`/`GLOBAL_ADMIN`) — the role now carries a legacy key none of its original grantors intended, tenant-wide.

## Affected Areas

services/api/src/modules/roles

## Proposed Resolution

In `roles.service.ts:updatePermissions`, resolve the permission keys for `permissionIds`, and reuse (or adapt) `assertMatrixWithinActorAccess`'s pattern: reject any key not in `currentUser.permissionKeys` unless `canEscalateBeyondOwnAccess(currentUser)`.

(Difficulty: LOW; Regression risk: MEDIUM (will reject some currently-successful admin actions if any tenant relies on granting keys the granter doesn't hold — worth an audit-log query before shipping, per AGENTS.md's backward-compat rule); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/roles/roles.controller.ts:92-117, roles.service.ts:123-155,270-330,580-624 (audit id AUTHZ-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTHZ-02=MEDIUM (will reject some currently-successful admin actions if any tenant relies on granting keys the granter doesn't hold — worth an audit-log query before shipping, per AGENTS.md's backward-compat rule). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTHZ-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTHZ-02) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
