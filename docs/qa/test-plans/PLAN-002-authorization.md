---
PLAN_ID: PLAN-002
aliases: [PLAN-002]
TITLE: Authorization and RBAC
AREA: authorization
STATUS: CURRENT
MODULES: [services/api/src/common/constants, services/api/src/common/security, services/api/src/common/guards, services/api/src/modules/employees, services/api/src/modules/approvals]
RISK: CRITICAL
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: PARTIAL
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GOOD
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0003, BUG-0004, BUG-0006, BUG-0007, BUG-0047]
RELATED_REGRESSIONS: [REG-003, REG-004, REG-006, REG-007]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-002 — Authorization and RBAC

## Scope

The two permission systems that run at once — legacy keys in
`common/constants/permissions.ts` and the matrix in `rbac-matrix.ts` — the
`PermissionsGuard` that requires *all* declared legacy keys and *at least one*
matrix privilege, and the third, separate step: row-level scoping through
`buildScopedAccessWhere()` and `resolveEffectiveAccessLevel()`.

Holding the right permission is not the same as owning the record. That
distinction is where most of this area's defects live.

## Risks

- A permission declared in one family and not the other, so the guard's
  early-return path leaves a route effectively open.
- `hasElevatedTenantRole` bypassing the guard entirely for roles added to the
  elevated list without a decision.
- A scope that fails open — `readTeam` meaning tenant-wide (`BUG-0003`).
- A search filter replacing rather than intersecting the access scope
  (`BUG-0004`).
- A duplicate route that reaches the same service without the guarded twin's
  decorators (`BUG-0007`).
- Mutations with no authorization at all (`BUG-0006`).
- **Live now:** `BUG-0047` — the fixes for four of the records above are on
  unmerged branches, so this area's declared protection overstates what `main`
  actually has.

## Preconditions

The seeded role set, with at least one user per access level: OWN, TEAM, BUSINESS_UNIT and an elevated tenant role.

## Test Types

`UNIT` and `SECURITY` run today. `E2E` permission propagation needs a live database.

## Data Requirements

Two tenants, a manager with direct reports, a peer outside the subtree, and one elevated-role user.

## Security Cases

Every negative authorization path is mandatory here, never risk-weighted: each
role that should now fail, cross-tenant identifiers, and object-level ownership
for OWN/TEAM/BUSINESS_UNIT.

## Negative Cases

Absent permission · permission in one family only · foreign-tenant id · another user's record at the same access level · a duplicate route.

## State Transitions

Role grant and revoke must take effect on the next request, not on the next sign-in.

## Integration Cases

None external.

## Browser Cases

UI gating is cosmetic and never a substitute; a browser case would only confirm the control is hidden, not that the server refuses.

## Regression Links

`REG-003` · `REG-004` · `REG-006` · `REG-007` — note `REG-003` and `REG-006` name tests absent from `main`, per `BUG-0047`.
