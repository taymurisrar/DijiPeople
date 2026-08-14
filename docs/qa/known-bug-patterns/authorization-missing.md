# Bug Pattern — Authorization Missing

## Pattern
A route is reachable by any authenticated user because neither the controller
nor the service performs an authorization check. Authentication is mistaken for
authorization.

## Why it happens in DijiPeople
`PermissionsGuard` **returns `true` outright when a handler declares neither
permission family**. A controller can therefore carry
`@UseGuards(JwtAuthGuard, PermissionsGuard)`, look guarded in review, and
enforce nothing at all. Controllers carrying `JwtAuthGuard` alone are the same
hazard one step earlier. Nothing errors, nothing warns.

## Example architecture area
`OrganizationsController` and `BusinessUnitsController` — six mutating routes
behind `JwtAuthGuard` only, with zero authorization anywhere in
`OrganizationService`. Because business-unit membership feeds
`accessContext.accessibleBusinessUnitIds` and therefore
`buildScopedAccessWhere()`, any employee could reshape the graph that scopes
everyone else's row access. That made it privilege escalation, not merely
unauthorized writes.

## Detection checklist
- List every `@Post` / `@Patch` / `@Put` / `@Delete` on the controller.
- For each: is a `@Permissions` or `@RequirePermission` declared?
- If not, does the service throw for an unauthorized caller? **Read the body.**
- Is `PermissionsGuard` even present in the controller's `@UseGuards`?
- Does the data written influence access scope for other users?

## Required regression test
Drive the real `PermissionsGuard` against the real controller metadata: an
ordinary employee is refused on every mutating route, an authorized role
succeeds, **and a coverage test fails when a new mutating route is added without
a declaration**.

## Agent responsible
Backend/API.

## Reviewer check
Never accept "the guard is on the controller". Confirm the handler declares a
permission the guard actually reads, or that the service denies — by reading it.

## QA check
For every mutating route, attempt it as an ordinary employee and expect 403.

## Prevention rule
A mutating route is unauthorized until a declared permission or a read service
check proves otherwise. The guard alone secures nothing.
