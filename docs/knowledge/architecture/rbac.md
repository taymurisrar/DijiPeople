# RBAC

> Generated from repository evidence at `ad8f77f`.

**DijiPeople runs two permission systems at once**, and authorization is three
layers, not one. Every layer has failed here at least once.

## Layer 1 — endpoint permission

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('employees.read')                      // common/constants/permissions.ts
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')   // common/constants/rbac-matrix.ts
```

`PermissionsGuard` requires **all** declared legacy keys **and at least one**
matrix privilege. Both decorators are normally required.

**The trap:** the guard **returns `true` outright when neither family is
declared.** A controller carrying the guard and no decorators secures nothing
while looking secured. That is
[[BUG-0006-organization-structure-mutable-by-any-authenticated-user]] and
[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]].

Patterns: [[authorization-missing]], [[duplicate-route-bypass]],
[[permission-family-drift]], [[defined-but-unwired-permission]].

## Layer 2 — row-level scope

Applied inside the service via `buildScopedAccessWhere()` /
`resolveEffectiveAccessLevel()` in `common/security/rbac-query-scope.ts`.

**Holding a permission is not owning the record.** `OWN`, `TEAM` and
`BUSINESS_UNIT` roles must not reach other people's records.

Two failures:

- [[BUG-0003-readteam-granted-tenant-wide-visibility]] — a scope branch
  returning `{}`, an unrestricted `where`, in two modules independently. That
  independence is what made it a shared-abstraction defect rather than two local
  ones.
- [[BUG-0004-search-filter-overwrote-the-access-scope]] — the scope predicate
  and a search filter spread into one object literal. Both render as `OR`, so
  the later key won and searching *widened* results.

Patterns: [[fail-open-scope]], [[search-filter-scope-overwrite]].

## Layer 3 — data sensitivity

**The right permission for the entity is not automatically the right permission
for the data returned.** Salary and bank details behind an employee-record read
is [[BUG-0001-compensation-and-bank-data-behind-employee-record-read]]; a
`subscription.finalPrice` on a feature-availability payload is part of
[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]].

Use explicit `select`, never `include` everything.

Pattern: [[sensitive-field-overexposure]].

## Elevated roles

`hasElevatedTenantRole` **bypasses the guard entirely**. Nothing is added to
that list without an explicit, recorded decision.

## Service-side authorization

The platform control plane authorizes **inside services**, not through
decorators — the controller carries `JwtAuthGuard` alone. That is deliberate for
a cross-tenant surface, and it means "every reachable method asserts" is the
entire security model. A method that asserts only as a side effect of what it
calls is one refactor from asserting nothing: [[ITEM-0015]].

Pattern: [[service-authorization-hidden]].

## The frontend is cosmetic

UI gating exists for usability. Every gated action is independently enforced
server-side. Two traps: the frontend permission helper is a **literal key check
with no elevated-role bypass**, unlike the backend guard; and tightening a
backend permission leaves screens gated on a *different* key rendering, with
actions that 403.

Pattern: [[ui-permission-backend-mismatch]].

## Before changing a permission

Run the dry-run in `.agent/skills/authorization-dry-run.md`. **Adding a matrix
privilege where none was declared tightens access** and can 403 users who work
today.

## Related

[[multi-tenancy]] · [[authentication]] · [[api-architecture]] ·
[[employees]] · [[organization]] · [[approvals]] · [[attendance]] ·
[[tenant-control-plane]]

Source: root `AGENTS.md`, `.agent/context/auth-rbac.md`,
`docs/architecture/rbac.md`, `docs/qa/regressions/index.md`.
