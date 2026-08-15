# Approvals

> Generated from repository evidence at `ad8f77f`.

## Purpose

The shared approval surface across the tenant product — leave, attendance
corrections, and other governed transitions.

## Main API / services

`services/api/src/modules/approvals/`. `buildWhere` composes the access scope
with request filters; the composition is the load-bearing part.

## Authorization

`approvals.read` (own / assigned), `approvals.readTeam` (own plus direct
reports), `approvals.manage` (tenant-wide). Row-level scope via
`buildScopedAccessWhere()` — see [[rbac]].

## Important business rules

**Searching narrows results; it never widens them.** That sounds obvious and was
violated: the scope predicate and the search filter were spread into one object
literal, and because both render as `OR`, the later key won. Any caller adding
`?search=` lost their scope restriction entirely.

Compose predicates with `AND` so neither clause can displace the other. This is
a structural rule, not a style preference — nothing in the type system notices
a discarded authorization predicate.

## Known bugs

- [[BUG-0004-search-filter-overwrote-the-access-scope]] — VERIFIED, HIGH.
- [[BUG-0003-readteam-granted-tenant-wide-visibility]] — VERIFIED, HIGH. Shared
  root cause with [[attendance]].

## Regressions

REG-003, REG-004 — `approvals.scope.spec.ts`.

## Related

[[rbac]] · [[attendance]] · [[multi-tenancy]] ·
patterns [[search-filter-scope-overwrite]], [[fail-open-scope]]
