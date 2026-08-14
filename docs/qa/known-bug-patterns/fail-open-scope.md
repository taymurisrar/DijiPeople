# Bug Pattern — Fail-Open Scope

## Pattern
A row-scoping helper returns an unrestricted filter (`{}`), or skips the filter
when its inputs are empty, so a narrow permission silently grants tenant-wide
visibility.

## Why it happens in DijiPeople
Scope builders return a Prisma `where` fragment. Returning `{}` is the natural
way to express "no additional restriction" for an administrator, which makes it
easy to place a *narrower* permission in the same branch. The result reads as
intentional and produces no error.

## Example architecture area
`attendance.correction.readTeam` and `approvals.readTeam` were **both** bundled
into a `return {}` branch, making each a synonym for its `manage` permission.
Two independent occurrences of the same misreading in unrelated modules — which
is precisely why this is a pattern and not an incident.

A related variant: applying a business-unit filter only when
`accessibleBusinessUnitIds.length > 0`, so a user with an empty access context
sees **everything** instead of nothing.

## Detection checklist
- Every `return {}` in a scope builder: which permissions reach it?
- Is a `*.readTeam` / `*.readOwn` style key sitting in a tenant-wide branch?
- Does any filter apply *only when* a list is non-empty?
- What does the fallback branch grant — is it wider than the named branch?

## Required regression test
Assert that the emitted `where` for the narrow permission **contains a scope
predicate and is not `{}`**, and that the tenant-wide permission still yields
tenant-wide.

## Agent responsible
Backend/API.

## Reviewer check
Read every branch of the scope builder, not only the one the diff touched.

## QA check
A holder of the narrow permission must not see another team's records. A user
with an empty access context must see nothing, not everything.

## Prevention rule
Never fail open. An undeterminable scope denies. `{}` belongs only to
explicitly tenant-wide permissions.
