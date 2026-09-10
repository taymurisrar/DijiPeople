---
ID: BUG-3241
aliases: [BUG-3241]
Title: Legacy role-permission grant and employee export both skip the sibling endpoint's access check
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 9bc0245b
AffectedModules: [services/api/src/modules/roles/roles.service.ts, services/api/src/modules/employees/employees.service.ts]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-408
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3241 — Legacy role-permission grant and employee export both skip the sibling endpoint's access check

> **Architect triage, 2026-09-11 — `DONE`.** AUTHZ-02 and AUTHZ-03 from the
> 2026-09-10 technical audit, fixed in the same session they were recorded. This
> record was created as an empty template and the session carrying it was
> interrupted before it was filled in, so the body was reconstructed from the
> committed diff rather than from the author's notes — which is why the evidence
> below cites code and tests rather than a live reproduction.

## Summary

Two endpoints each had a sibling that made an authorization decision they did
not. Both pairs are gated by the *identical* permission decorators, so
`PermissionsGuard` treated them as equally sensitive while the service behind one
of each pair enforced strictly less.

**AUTHZ-02.** `PUT /roles/:roleId/permissions` granted any legacy permission key
that exists in the tenant, regardless of whether the acting user held that key
themselves. Its sibling `PUT /roles/:roleId/matrix` enforces "you cannot grant
beyond your own effective access" through `assertMatrixWithinActorAccess`, behind
the same `roles.assign-permissions` + `SETTINGS:configure` pair. So a delegated
role administrator could give an editable role a key such as `payslips.read-all`
that they had no right to, then assume that role's reach.

**AUTHZ-03, a BOLA.** The employee profile CSV export resolved the employee with
`findById`, which only tenant-scopes the lookup. The read path for the same
record, `GET /employees/:employeeId`, additionally applies the
`OWN`/`TEAM`/`BUSINESS_UNIT` row-scope through `canViewEmployeeRecord` before
returning anything. The export skipped it, so any caller holding
`employees.export` at `SELF` or `TEAM` level could export the full profile of any
employee id in the tenant — the whole record, not the row-scoped subset they were
allowed to read one at a time.

## Expected Behavior

Two endpoints requiring the same permissions enforce the same rule. A caller
cannot grant a permission they do not hold, and cannot obtain through an export a
record they are not allowed to read directly.

## Actual Behavior

- `updatePermissions` performed no actor-authority check at all before writing
  the granted keys.
- `exportProfile` returned a complete profile CSV for any tenant-resident
  employee id, with no row-scope applied.

## Reproduction

Reconstructed from the code paths; both were reachable by an ordinary
authenticated caller holding the relevant permission.

1. **AUTHZ-02.** As a user holding `roles.assign-permissions` and
   `SETTINGS:configure` but *not* `payslips.read-all`, call
   `PUT /roles/:roleId/permissions` on an editable role including
   `payslips.read-all`. Before the fix it was granted. The same key sent to
   `PUT /roles/:roleId/matrix` was refused.
2. **AUTHZ-03.** As a user whose effective access level for employees is `SELF`
   or `TEAM`, call the profile CSV export for an employee id outside that scope.
   Before the fix the CSV was returned. `GET /employees/:employeeId` for the same
   id was refused.

## Evidence

- `services/api/src/modules/roles/roles.service.ts` — `updateMatrix` called
  `assertMatrixWithinActorAccess`; `updatePermissions` called nothing
  equivalent, while `create()` carried its own inline copy of the same rule.
  Three call sites, two behaviours, one of them wrong.
- `services/api/src/modules/employees/employees.service.ts` — `exportProfile`
  called `findById` (tenant scope only) and never `canViewEmployeeRecord`, which
  the sibling read path applies.
- Audit findings AUTHZ-02 and AUTHZ-03 in
  `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`.

## Root Cause

The same cause in both cases, and it is structural rather than careless: an
authorization rule lived inside one handler instead of in one shared method both
handlers call. `updatePermissions` was added later against the same permission
pair as `updateMatrix` and simply never learned the rule; `exportProfile` reused
the tenant-scoped lookup and not the row-scoped access check.

Identical permission decorators are what made this hard to see. `PermissionsGuard`
proves the *gate* is the same. Nothing proves the *service behind the gate* is.

## Impact

Within a tenant, not across tenants. AUTHZ-02 is a privilege-escalation path for
a delegated role administrator; AUTHZ-03 discloses full employee profiles — which
on this product means personal and payroll data — to a caller scoped to their own
record or their own team. Both require an authenticated user with a specific
permission, which is what keeps them HIGH rather than CRITICAL.

## Affected Areas

- `services/api/src/modules/roles` — `updatePermissions`, `update`, `create`
- `services/api/src/modules/employees` — `exportProfile`

## Proposed Resolution

Factor each rule into one method and call it from every site, so a future third
endpoint inherits the check by construction rather than by somebody remembering
to copy it.

## Acceptance Criteria

- A caller cannot grant a legacy permission key they do not themselves hold
  through any of the three role-writing paths.
- The profile export applies the same row-scope as the profile read.
- A test fails if either call site stops invoking the shared check, not merely if
  the outcome happens to be wrong today.

## Regression Coverage

REG-408. `roles.service.spec.ts` and `employees.service.spec.ts`.

The assertions deliberately spy on the shared methods rather than only checking
outcomes, because the failure this record documents is a call site drifting away
from a rule while still producing the right answer for the cases a test happens
to cover.

## Dependencies

None. Shares its structural cause with BUG-3152, the `POST /users/:userId/roles`
self-grant, which was fixed in the same stream.

## Related Items

- BUG-3152 — the same "two routes, one permission pair, one enforcement" shape
- AUTHZ-01, AUTHZ-02, AUTHZ-03 in the 2026-09-10 audit

## Resolution

Both fixed on 2026-09-11.

`assertPermissionKeysWithinActorAccess` is a new private method on
`RolesService`, mirroring what `assertMatrixWithinActorAccess` does for matrix
privileges. `create()`, `update()` and `updatePermissions()` all call it, so the
inline copy `create()` used to carry is gone and the three cannot silently stop
matching. `update()` applies it only when `dto.permissionIds` is present, so an
actor renaming a broader role somebody else built is not blocked from an edit
that leaves permissions untouched — the check guards widening, not editing.

`exportProfile` now calls `canViewEmployeeRecord` and throws `ACCESS_DENIED`
when it refuses. The decision is the sibling read path's, called rather than
re-implemented, which is the point: a second copy is how the two drifted apart.

## QA Retest

Covered by the specs above rather than a manual pass. A manual retest would need
a role holder at `SELF`/`TEAM` level and a second employee outside their scope;
the specs assert exactly that shape without provisioning it.

## History

- 2026-09-10 — found by the authorization stream of the full technical audit as
  AUTHZ-02 and AUTHZ-03.
- 2026-09-11 — fixed. Record created as an empty template and reconstructed from
  the committed diff after its session was interrupted; triaged `DONE`; REG-408
  written from the specs that exist.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-408 (see the regression register)

<!-- GRAPH:END -->
