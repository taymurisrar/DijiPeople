---
ID: BUG-2007
aliases: [BUG-2007]
Title: Projects and customers can be created but never deleted
Status: FIXED
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/projects, apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-397
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-2007 — Projects and customers can be created but never deleted

## Summary

Neither the projects module nor the customers module exposes a delete route.
`DELETE /api/projects/:projectId` returns 405; the customers controller has no
`DELETE` handler at all. Records can be created and patched but never removed,
so the only way to retire one is `PATCH {status: 'CANCELLED'}` and the row stays
in every list, lookup and report forever. Whether that is the intended model or
an omission is the question this record needs answered, which is why it is
recorded as a product decision rather than as work to schedule.

## Expected Behavior

Either the product deletes projects and customers, or retire-by-status is the
deliberate model and is documented and consistent — with the UI offering no
delete affordance, the API answering with a reasoned refusal rather than a bare
405, and cancelled records excluded from the surfaces where they are noise.

## Actual Behavior

```
DELETE /api/projects/<id>  -> 405 Method Not Allowed
```

and the customers module has no delete route at all, so there is nothing to call.
The only retirement path is:

```
PATCH /api/projects/<id> {"status": "CANCELLED"}
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Create a project: `POST /api/projects {"name": "...", "code": "..."}` returns
   201.
2. Attempt to delete it: `DELETE /api/projects/<projectId>` returns
   `405 Method Not Allowed`.
3. Read `services/api/src/modules/projects/projects.controller.ts` — the only
   `DELETE` route is `:projectId/assignments/:assignmentId`. There is no project
   delete.
4. Read `customers.controller.ts` — no `DELETE` handler exists.
5. The only way to retire the project is `PATCH {"status": "CANCELLED"}`.

## Evidence

The 405 above, plus the two controllers at `eb457d9d`:

- `services/api/src/modules/projects/projects.controller.ts` — the sole `DELETE`
  is `:projectId/assignments/:assignmentId`.
- `services/api/src/modules/customers/customers.controller.ts` — no `DELETE`.

The probe project `a6e5e357-55fe-4330-8e75-4b89fd33a501` ("QA Entitlement Probe
Project") is still on the demo tenant, set to `CANCELLED`, because this defect is
why it cannot be removed. It was created by the entitlement probe recorded in
BUG-1952.

## Root Cause

Not applicable — nothing is failing. The routes were never written. What is not
established is whether that was deliberate.

## Impact

Data hygiene, and it is cumulative. A tenant that creates a project or customer
in error carries it permanently; a tenant used for prospect demonstrations
accumulates test records that can never be cleared, which is exactly what
happened during this run. Cancelled records continue to appear wherever the code
does not filter on status, and nothing forces that filter to be applied
consistently.

Rated LOW: nothing breaks, nothing is wrong, and a retirement path exists. The
cost is untidiness that grows and cannot be reversed through the product.

## Affected Areas

`services/api/src/modules/projects` and `services/api/src/modules/customers` (the
controllers and any UI delete affordance that would follow); every list, lookup
and report that does not filter cancelled records.

## Proposed Resolution

Answer the product question first: **is retire-by-status the intended model for
these two entities?**

- **If yes** — document it, make the UI say "Cancel" rather than implying
  deletion, ensure `CANCELLED` records are filtered out of lookups and default
  list views, and consider answering `DELETE` with a reasoned 405 or 403 rather
  than the framework's bare one.
- **If no** — add delete routes with the usual tenant-scoped delete rules
  (`deleteMany` with `{ id, tenantId }`), and decide what happens to a project
  with assignments, timesheet entries or cost allocations attached. That
  cascade decision is the real work here, not the route.

Check the other commercial entities for the same asymmetry before deciding; this
record establishes it on two.

## Acceptance Criteria

- The intended model is written down for both entities.
- The UI's affordances match it.
- If delete is added, it is tenant-scoped and its cascade behaviour is specified
  and tested.
- If retire-by-status stands, cancelled records are excluded from lookups and
  default list views.

## Regression Coverage

None yet, and none is meaningful until the model is chosen. Once it is, the test
is either "delete removes the record and its dependants behave as specified" or
"delete is refused with the documented code and cancelled records do not appear
in lookups".

## Dependencies

None technically. Blocked on the product answer, which is why the status is
`PRODUCT_DECISION`.

## Related Items

BUG-1952 created the undeletable probe project this record uses as evidence.
BUG-1757 (promotions cannot be deleted) and BUG-1958 (a deleted department never
releases its name) are the same family of missing or incomplete deletion
semantics elsewhere in the product.

## Resolution

**Decided by the repository owner, 2026-09-11: add real delete.** Not
retire-by-status. Both the projects and customers modules now expose a
tenant-scoped `DELETE`, refused with a reasoned `AppError` when the record has
dependent data rather than cascading silently or being answered with a bare
405/404.

Backend, `services/api/src/modules/projects`:

- `ProjectsService.remove` (new) — looks the project up tenant-scoped, counts
  `ProjectAssignment`, `TimesheetEntry` and `PayrollCostAllocationLine` rows
  against it via `ProjectsRepository.countDependents` (new), and refuses with
  `AppError('PROJECT_DELETE_HAS_DEPENDENTS')` (409, naming the counts) if any
  exist. The check exists because the database would not have refused on its
  own: `ProjectAssignment.project` cascades on delete, and the timesheet /
  payroll-line relations merely `SetNull` their `projectId` — an unchecked
  delete would have silently erased assignment history or silently orphaned
  payroll cost lines. With nothing dependent, `ProjectsRepository.delete`
  (`deleteMany({ tenantId, id })`) removes it and `AuditService.log()` records
  a `PROJECT_DELETED` row with a `beforeSnapshot` and a `null`
  `afterSnapshot`.
- `CustomersService.remove` (new) — same shape: counts `Project` rows against
  the customer and refuses with `AppError('CUSTOMER_DELETE_HAS_DEPENDENTS')`
  if any exist, otherwise deletes and audits `CUSTOMER_DELETED`.
  `Customer.projects` **is** `onDelete: Restrict` at the database level, so
  without this check the same refusal would have surfaced as a raw Postgres
  foreign-key violation instead of a catalog error naming the cause.
- Both controllers gained a `@Delete` route (`projects.delete` /
  `customers.delete`, both already-defined legacy permission keys —
  `customers.delete` existed with no route or guard mapping consuming it —
  plus `@RequirePermission(ENTITY_KEYS.PROJECTS, 'delete')`). `projects.delete`
  is a new permission key; both are granted to `hr` and, via
  `NON_CUSTOMIZATION_PERMISSION_KEYS`, to `system-admin`.
- Two new `ERROR_CATALOG` entries (`PROJECT_DELETE_HAS_DEPENDENTS`,
  `CUSTOMER_DELETE_HAS_DEPENDENTS`, category `project`, added to
  `ErrorCategory`) and two new `AUDIT_ACTIONS` (`PROJECT_DELETED`,
  `CUSTOMER_DELETED`).

Frontend, `apps/web`: the delete affordance is the existing runtime "Delete"
command (`system.delete` / `selection.delete` in
`standard-module-runtime.ts`), not a bespoke button. It already existed as
disabled/hidden infrastructure — `customerRuntimeSpec.permissions.delete` was
already set with nothing to arm it, since the command is disabled whenever
`spec.adapterCapabilities?.softDelete` is not `true`. Wiring it was: adding
`delete: PERMISSION_KEYS.PROJECTS_DELETE` to `projectRuntimeSpec.permissions`
(new key, `apps/web/lib/security-keys.ts`), adding
`adapterCapabilities: { softDelete: true }` to both `projectRuntimeSpec` and
`customerRuntimeSpec`, and adding a `DELETE` handler to the two thin proxy
routes (`app/api/projects/[projectId]/route.ts`,
`app/api/customers/[customerId]/route.ts`) that were missing one, matching the
existing `GET`/`PATCH` handlers alongside them. The standard module data
adapter's `softDelete` already issues a genuine `DELETE` request to the
record's API path despite the generic name (see
`standard-module-data.adapter.ts`) — no new adapter code was needed once the
spec declared the capability.

**Deliberately out of scope.** The record's "if yes" branch (document
retire-by-status, filter cancelled records from lookups) does not apply — the
owner chose delete. The "if no" branch's acceptance criteria are met: delete is
tenant-scoped and its cascade behaviour (refuse rather than cascade) is
specified and tested. Filtering `CANCELLED` projects/customers out of lookups
was not touched — status-based retirement remains available alongside delete
and is unaffected by this change. The other commercial entities the record
asked to be checked for the same asymmetry (BUG-1757 promotions, BUG-1958
departments) were not re-audited here; they remain their own records.

### Regression coverage

REG-397. `services/api/src/modules/projects/projects.service.spec.ts`
(`ProjectsService.remove`, new describe block) and
`services/api/src/modules/projects/customers.service.spec.ts` (new file,
`CustomersService.remove`) — not-found refuses, dependent data refuses with
the catalog error and neither deletes nor audits, and the clean case deletes
and audits with the exact before/after snapshot shape. `QA-RUNTIME-041` is the
reusable scenario, covering both the API and (for step 4) the frontend route
that previously did not exist at all.

## QA Retest

Not performed live — this task did not reach a live tenant. `npm --workspace
api run test -- projects.service customers.service` passes (8/8), and
`npm --workspace web run check-types` passes with the new route handlers and
spec fields in place. The retest is `QA-RUNTIME-041`'s steps against a real
tenant: a project with an assignment refuses 409, one without deletes 200 with
an audit row, the same pair for a customer and its projects, and an id from
another tenant (or a nonexistent one) 404s rather than 409 or 200.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition PRODUCT_DECISION per the SESSION-0070 Architect triage: is retire-by-status the intended model?
- 2026-09-11 — **decided and fixed.** The repository owner chose real delete over retire-by-status. `ProjectsService.remove` / `CustomersService.remove` added, tenant-scoped, refusing with a catalog `AppError` when dependent data exists; both permission decorators and `AuditService.log()` wired; the existing runtime "Delete" command enabled for both modules in `apps/web` rather than a bespoke button. Guarded by REG-397 and QA-RUNTIME-041. Status PRODUCT_DECISION to FIXED.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-397 (see the regression register)

<!-- GRAPH:END -->
