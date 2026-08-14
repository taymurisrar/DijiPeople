# Skill — Authorization Dry-Run

Prove that adding or changing a permission declaration will not lock out users
who legitimately work today.

**Status: ready.** This procedure has run across four remediation batches and
has stopped one production-breaking change (see step 6). It is the most mature
Skill in the framework.

---

## Trigger

Invoke **before** adding, changing or removing any `@Permissions(...)` or
`@RequirePermission(...)` declaration, and before gating a previously ungated
route.

Also invoke when a plan proposes a *new* permission key — step 2 frequently
makes the new key unnecessary.

## Inputs

- The endpoint(s): controller, handler, HTTP method, route
- The intended action in business terms ("who should be able to do this?")
- Which frontends and clients call the route

## Steps

### 1. Establish the current state
What does the handler declare today? What does the controller's `@UseGuards`
include? Does the service perform its own check — **read the body**, do not infer
from the method name.

Remember: `PermissionsGuard` returns `true` outright when neither family is
declared, so "has a guard" and "is protected" are different claims.

### 2. Search for an existing key before inventing one
Grep `common/constants/permissions.ts` and `common/constants/rbac-matrix.ts` by
**description**, not just key name. This repository has repeatedly turned out to
contain a purpose-built key with zero call sites — `organization.manage`,
`tenant-settings.resolved.read` and `business-units.read` were all defined,
described and unwired.

If a fitting key exists, use it. If none exists, **stop** and report the gap
rather than inventing one.

### 3. Determine what the guard will actually evaluate
- Legacy family: which keys, checked against `user.permissionKeys`?
- Matrix family: does an `ENTITY_KEYS` entry for this resource even exist? If
  not, the matrix family cannot be declared without inventing an entity — report
  that gap instead.
- Does `hasElevatedTenantRole` bypass apply, and is that acceptable here?

### 4. Map the seeded role grants
For each seeded role bundle, determine whether it holds the proposed key:

- `BASE_ROLE_PERMISSION_KEYS` in `common/constants/permissions.ts`
- `SYSTEM_ROLE_MISC_PERMISSIONS` in `common/constants/rbac-matrix.ts` — misc
  permissions reach `permissionKeys` via `PermissionBootstrapService` writing
  `RoleMiscPermission`, then `loadAccessContext` folding them in
- `FOUNDATION_PERMISSION_DEFINITIONS` — implicitly granted to elevated roles and
  the tenant owner
- `SYSTEM_ROLE_PRIVILEGES` for matrix privileges

Produce this table — it is the deliverable:

| Role | Holds key today? | Reaches endpoint today? | Reaches it after? | Safe? |
|---|---|---|---|---|

### 5. Identify the callers
Grep the frontends for the route. For each caller establish **which roles reach
that screen**, and whether failure is visible or silently swallowed. A
`.catch(() => null)` turns a 403 into a blank feature rather than an error — a
regression nobody reports.

### 6. Decide, and stop if unsafe
If any role that legitimately works today would receive a 403, **stop**. Do not
implement. Report:

- which role loses access
- which caller breaks
- the alternative key, if one exists

> This step has already prevented one outage: gating
> `GET /tenant-settings/features/availability` on `settings.read` would have
> 403'd **every employee on every page load**, because the seeded `employee`
> role does not hold `settings.read` and the authenticated layout fetches that
> route on every render. The dry-run caught it before implementation.

## Expected output

The role-mapping table from step 4, the caller list from step 5, and one of:

- **PROCEED** — with the exact decorators to add
- **STOP** — with the blocking role/caller and the recommended alternative

## Stop conditions

Halt and report rather than proceeding when:

- No existing permission key fits (do not invent one)
- No matrix entity exists for the resource (declare the legacy family only and
  report the gap — do not invent an entity to satisfy the invariant)
- Any legitimate role would lose access
- A frontend caller's failure mode is silent degradation
- The role mappings cannot be determined from the seeds

## Validation

- Every claim in the table traces to a real file and symbol
- The endpoint's declared keys after the change match the table's assumption
- A regression test asserts the declared permission, so the wiring cannot
  silently revert

## Evidence requirements

Record in the ExecPlan or the change report: the table, the grep results that
established which keys exist, the caller list, and the PROCEED/STOP decision
with its reason.
