# Bug Pattern — Defined But Unwired Permission

## Pattern
A permission key exists in the catalog, is seeded to roles, appears in the
admin UI — and is referenced by **no endpoint anywhere**. The intended control
was specified and never connected.

## Why it happens in DijiPeople
Permission keys are declared centrally, seeded by
`PermissionBootstrapService` and surfaced in role-management screens. All of
that works without a single controller referencing the key. The permission looks
real from every direction except the one that matters.

## Example architecture area
Three verified instances:

- **`organization.manage`** — labelled "Manage organizations and business units",
  described as "Maintain organization and business-unit hierarchy", seeded to
  HR. **Zero call sites.** Meanwhile the organization and business-unit
  controllers had no authorization at all.
- **`tenant-settings.resolved.read`** — seeded to employee, manager, hr and
  recruiter, and a foundation permission. **Zero call sites**, while the route it
  was evidently written for declared nothing.
- **`business-units.read`** — defined, described, and granted to **no role at
  all**.

In two of the three, the fix was not to invent anything — it was to wire up the
key that had been sitting there.

## Detection checklist
- Before inventing a permission, grep the catalog for one that already fits —
  match on the **description**, not just the key name.
- Grep the candidate key across `services/api/src`: does anything enforce it?
- Is it granted to any role? A key granted to nobody cannot be used as-is.
- Is it a foundation permission (implicitly granted to elevated roles/owner)?

## Required regression test
Assert the endpoint declares the key, so the wiring cannot silently regress.
Extending the dual-permission invariant covers the general case.

## Agent responsible
Architect (discovery), Backend/API (wiring).

## Reviewer check
When a new permission key is proposed, ask what was grepped before concluding
none existed.

## QA check
Confirm the roles the catalog says hold the key can actually use the endpoint,
and that roles without it cannot.

## Prevention rule
Search the catalog by description before creating a key. An unused key is
usually an unfinished control, not a spare.
