# Bug Pattern — Search Filter Overwrites Access Scope

## Pattern
Two `where` fragments that both use `OR` are merged with object spread, so the
later one silently replaces the earlier — dropping the access scope entirely.

## Why it happens in DijiPeople
List queries are assembled by spreading optional fragments into a single object
literal. Access scope and free-text search both naturally render as `OR`. In
JavaScript the later key wins: no error, no type failure, no warning. The defect
only appears when the optional filter is actually supplied, so it survives
casual testing.

## Example architecture area
`ApprovalsService.buildWhere` spread `relevantScope(user)` and then the search
filter. Any caller passing `?search=` lost their scope restriction entirely and
the query fell back to `tenantId` alone — every approval in the tenant.

The neighbouring attendance builder has the same shape but the opposite order,
so the scope wins there — safe **by accident, not by design**, which is why the
pattern is worth recording rather than the single fix.

## Detection checklist
- Does the `where` literal spread more than one fragment that can emit `OR`?
- Which fragment comes last?
- Is the access scope combined under `AND`, or merged by spread?
- Which optional query parameters trigger the collision?

## Required regression test
Emit the `where` **with the optional filter supplied** and assert the access
scope predicate is still present.

## Agent responsible
Backend/API.

## Reviewer check
Any list query assembling multiple fragments — check the composition, not just
the presence of a scope call.

## QA check
Run every list scenario twice: once plain, once with search and filter
parameters supplied.

## Prevention rule
Compose access scope under `AND`, never by spread. Scope is not an optional
fragment.
