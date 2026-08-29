---
ID: BUG-1958
aliases: [BUG-1958]
Title: Deleting a department never releases its name, so it can never be recreated
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/organization]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1958 — Deleting a department never releases its name, so it can never be recreated

## Summary

Deleting a department is a soft delete: it sets `isActive = false` and leaves the
row in place. The uniqueness constraint on the department name does not include
`isActive`, so the name stays reserved for ever. A tenant that deletes a
department can never create another one with the same name, and the error they
get names a record they believe they deleted.

## Expected Behavior

Either the name is released when the department is deleted, or the product says
plainly that departments are archived rather than deleted and offers a way to
restore or rename the archived one. What must not happen is a delete that reports
success and then blocks the name with an error blaming a record the user cannot
see as existing.

## Actual Behavior

After deleting, the row is still returned by the list endpoint with
`isActive: false`, and recreating the name fails with
"Department name or code is already in use for this tenant."

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. `POST /api/departments {"name":"ZZ Delete Reuse Probe", "businessUnitId":"e8dda19a-cd14-412a-a221-4e80b7a3f955"}` -> `201`
   (id `23fc7d8d-d14d-41c0-8dcb-4f1d0582bd54`).
2. `DELETE /api/departments/23fc7d8d-d14d-41c0-8dcb-4f1d0582bd54` -> `200`.
3. `GET /api/departments/23fc7d8d-d14d-41c0-8dcb-4f1d0582bd54` -> `200` — the
   record is still there.
4. `GET /api/departments` -> the row is still listed, with `isActive: false`.
5. `POST /api/departments {"name":"ZZ Delete Reuse Probe", …}` -> `409`
   **"Department name or code is already in use for this tenant."**

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/organization/organization.service.ts:658-679` —
  `deleteDepartment` sets `isActive = false`; the row is not removed.
- `services/api/prisma/schema.prisma`, `Department` line 38 —
  `@@unique([tenantId, name])`, with no `isActive` component and no partial-index
  equivalent.

Live probe output as quoted in Reproduction, on the production demo tenant.

## Root Cause

Established: a soft delete under a unique constraint that does not know about the
soft-delete flag. `AGENTS.md` already warns that soft delete is not universal in
this schema and that adding it obliges you to update every query that reads it;
the uniqueness constraint is one of those readers and was not updated.

## Impact

A tenant that deletes a department by mistake, or reorganises and wants the name
back, cannot have it — through any route the product offers. The deleted row also
stays in the list response, so the list and the delete disagree about what
happened. Rated MEDIUM: it is recoverable by choosing a different name, and no
data is lost or exposed.

## Affected Areas

`services/api/src/modules/organization` (`deleteDepartment`, the department list
and create paths), `services/api/prisma/schema.prisma` (`Department`), and the
department screens in `apps/web`.

## Proposed Resolution

Decide the product behaviour first, because both directions are defensible:
release the name on delete (scope the uniqueness to active rows, which is a
schema change and needs an ExecPlan and a backfill for existing duplicates), or
keep it reserved and say so — surface archived departments in the UI with a
restore action, and make the 409 message name the archived record.

Separately, and regardless of that decision: the list endpoint should not return
soft-deleted rows to a screen that offers no way to act on them.

## Acceptance Criteria

- Creating a department with the name of a deleted one either succeeds, or fails
  with a message that tells the user an archived department holds the name and
  how to reach it.
- The department list does not silently include soft-deleted rows.
- Whatever is chosen is consistent between the delete response, the list and the
  create error.

## Regression Coverage

None yet. A service test that creates, deletes and recreates a department by the
same name would fail today at step three.

## Dependencies

None identified.

## Related Items

BUG-1957 is the sibling defect on the same model: a department with no business
unit is also unreachable and also keeps its name reserved. A single decision
about department uniqueness should cover both.

## Resolution

Fixed 2026-08-29 on `agent/bugfix-org`. The record left the product decision
open and named both directions; this took the first one — the name is released
when the department is archived.

**The direction, and why.** The alternative was to keep the name reserved and
say so: surface archived departments with a restore action and make the 409 name
the record holding it. That is more product to build and it defends a rule
nobody asked for. A tenant that renames or reorganises expects to reuse a name
it is no longer using, and an archived row is not using its name for anything a
user can see.

**The schema.** Department name uniqueness is now scoped to active rows, by a
partial index:

```sql
CREATE UNIQUE INDEX "Department_active_tenant_name_key"
ON "Department" ("tenantId", "name")
WHERE "isActive" = true;
```

Migration
`services/api/prisma/migrations/20260829150000_department_name_uniqueness_scoped_to_active_rows/migration.sql`.
It creates the new index before dropping `Department_tenantId_name_key`, so
there is no window in which two active departments could take the same name.

Prisma cannot express a partial index, so `@@unique([tenantId, name])` is gone
from the `Department` model in `services/api/prisma/schema.prisma` and a comment
in its place points at the migration. This is the arrangement `PlanPrice`
already uses for its active-price uniqueness (`20260816200000_planprice_market_aware_active_uniqueness`),
not a new pattern.

**No backfill, and no destructive step.** The partial index covers a strict
subset of the rows the old index covered, and every one of those rows already
satisfied the stricter constraint, so its creation cannot fail on existing data.
Nothing is read, moved or deleted. Rollback is *not* symmetric and the migration
says so: once a tenant has taken a name back from an archived department,
recreating the full unique index would fail until those archived rows are
renamed.

**What was deliberately left alone.** `@@unique([tenantId, code])` stays
unique across the whole table. `code` is the key provisioning writes through —
`seedTenantWorkforceReferenceData` in `prisma/seed-config.ts:1222-1239` upserts
the default departments on `tenantId_code`, on every tenant, on every release.
Scoping code uniqueness to active rows would make that upsert miss an archived
row and insert a duplicate department every time the seed ran. The name is the
human label and is what this defect is about; the code is the stable identity
key.

**A 500 the change would otherwise have exposed.** `updateDepartment` called the
repository without the `try`/`catch` the create path has, so a P2002 from
renaming a department onto a name another active department holds surfaced as a
500 rather than the 409 create returns for the same collision. That was already
true; scoping the uniqueness to active rows adds a second way to reach it —
reactivating an archived department whose name has since been taken — so it is
closed here rather than left to be found again.
`organization.service.ts:1125-1139`. This is a widening of an existing guard,
not a new mechanism: it calls the same `handleUniqueError` the create path
calls.

**The list criterion, which was already met.** The record also asked that the
department list not silently include soft-deleted rows. The tenant product does
not: `settingsListApiPath` in
`apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx:506-518`
appends `isActive=true` for any adapter that is `softDelete` and carries an
`isActive` field, which the departments adapter is and does
(`settings-adapter-registry.ts:1896-1970`). The raw API still returns every row,
which is correct for an endpoint whose `isActive` filter is a query parameter —
changing that default would break callers that ask for the whole set. No change
was made there.

Files changed:

- `services/api/prisma/schema.prisma` — `Department`, the unique replaced by a
  comment naming the migration
- `services/api/prisma/migrations/20260829150000_department_name_uniqueness_scoped_to_active_rows/migration.sql`
- `services/api/src/modules/organization/organization.service.ts:1080`,
  `:1125-1139` — the update path routes through `updateDepartmentRow`, which
  maps P2002 to a conflict
- `services/api/src/modules/organization/departments-list-contract.spec.ts:107-186`
  — the conflict mapping, and a guard that reads the schema and the migrations
  from disk so a reverted migration fails here rather than in production

## QA Retest

Not retested against a running system, and for this record that boundary matters
more than usual: the fix is a database constraint, and no database was available
here. What is established is that the schema and the migration agree, that
`prisma validate` accepts the schema, and that the guard reading both from disk
passes. What is not established is that the index applies cleanly to the demo
tenant's data — though it cannot fail there, since it covers a subset of rows
that already satisfied a stricter constraint.

The retest is the record's own reproduction, unchanged: create a department,
delete it, create it again by the same name. Step three should now return 201
rather than 409. Worth also confirming the archived row is still present with
its name intact, and that reactivating it while a new department holds the name
returns a 409 rather than a 500.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — requires a unique-constraint/soft-delete design decision and a migration.
- 2026-08-29 — fixed on `agent/bugfix-org` during the SESSION-0076 burndown. The decision the record left open was taken: the name is released on delete, enforced by a partial unique index over active rows only. `code` uniqueness deliberately stays whole-table, because provisioning upserts through it and would otherwise insert a duplicate department per release once one was archived.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[organization]]

<!-- GRAPH:END -->
