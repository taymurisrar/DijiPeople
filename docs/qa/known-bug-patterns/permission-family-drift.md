# Bug Pattern — Permission Family Drift

## Pattern
An endpoint declares one of the two permission families and not the other, so
one authorization axis silently does not apply.

## Why it happens in DijiPeople
Two systems run at once: legacy string keys (`@Permissions`, checked against
`user.permissionKeys`) and the entity/privilege matrix (`@RequirePermission`,
checked against `user.rolePrivileges`). `PermissionsGuard` requires **all**
declared legacy keys **and at least one** matrix privilege — but it treats an
*absent* family as satisfied. Declaring one family is therefore silently
partial, never an error.

The matrix axis is the one carrying `SecurityAccessLevel`, which row-level
scoping consumes. An endpoint with no matrix privilege has no endpoint-level
counterpart to its row scoping.

## Example architecture area
Measured across the 88 controllers at this baseline: **10 declare both
families, 51 declare the legacy family only, 1 declares the matrix only, and 26
declare neither** while still mounting the guard. `dashboard.controller.ts` and
`approvals.controller.ts` mount `PermissionsGuard` with no metadata at all.

The "both decorators are normally required" rule in `AGENTS.md` is therefore
**TARGET, not CURRENT** — treat it as the standard for new work, not a
description of the codebase.

## Detection checklist
- Does the handler declare both families?
- If only one, is that deliberate and is the reason recorded?
- Does a matrix entity for this resource even exist? Several resources have
  none, and inventing one is not the fix.
- Would adding the missing family **tighten** access and 403 users who work
  today? Run the dry-run before assuming it is safe.

## Required regression test
Extend the dual-permission invariant in
`services/api/src/common/constants/wiring-invariants.spec.ts` rather than
writing a bespoke test.

## Agent responsible
Backend/API, using the `authorization-dry-run` Skill.

## Reviewer check
"The permission key exists" is not enough — check both families, and check the
key is actually granted to a role.

## QA check
Exercise a role holding the legacy key but lacking the matrix privilege, and
confirm the intended outcome.

## Prevention rule
Declare both families where the model supports it. Where no matrix entity
exists, declare the strongest supported authorization and **report the gap**
rather than inventing an entity to satisfy a checker.
