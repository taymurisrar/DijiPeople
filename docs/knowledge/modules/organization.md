# Organization

> Generated from repository evidence at `ad8f77f`.

## Purpose

The tenant's structure: organizations and business units. Looks like reference
data; **behaves like a security control**.

## Main API / services

`services/api/src/modules/organization/` — `OrganizationsController` and
`BusinessUnitsController`, with six mutating service methods between them.

## Authorization

Structural changes require `organization.manage`. A coverage test fails when a
**new** mutating route arrives without a permission declaration, which is what
generalises the fix beyond the six routes originally found.

## Important business rules

**Business-unit membership feeds `accessContext.accessibleBusinessUnitIds`,
which feeds `buildScopedAccessWhere()`.**

That single sentence is why this module matters more than its size suggests:
editing the org chart changes *who can see what*, everywhere. When the six
mutating routes were unguarded, an ordinary employee could widen their own data
scope by editing structure — privilege escalation, not merely unauthorized
writes.

Treat any change here as a [[rbac]] change.

## Known bugs

[[BUG-0006-organization-structure-mutable-by-any-authenticated-user]] —
VERIFIED, was CRITICAL.

## Regressions

REG-006 — `organization-structure-authorization.spec.ts` and
`organization-structure-tenant-scope.spec.ts`.

## Related

[[rbac]] · [[multi-tenancy]] · [[employees]] ·
pattern [[authorization-missing]]
