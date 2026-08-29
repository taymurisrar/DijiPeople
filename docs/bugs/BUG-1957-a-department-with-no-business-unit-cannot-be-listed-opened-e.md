---
ID: BUG-1957
aliases: [BUG-1957]
Title: A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/organization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1957 — A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name

## Summary

`OrganizationService.findDepartmentsForUser` drops every department whose
`businessUnitId` is null. Every other read path goes through it, including the
one `deleteDepartment` uses to find its target. A department row with no business
unit is therefore invisible and immortal: it cannot be listed, fetched by id,
edited or deleted — while it continues to occupy the tenant's unique department
name, so nobody can create a department by that name either. On the production
demo tenant this blocks four of the most common HR department names.

## Expected Behavior

Every department row belonging to the tenant is reachable by someone with
permission to manage the organization. A row that cannot be shown to a user is
either repaired, or excluded from the uniqueness constraint that keeps its name
reserved — it is never both hidden and blocking.

## Actual Behavior

`GET /api/departments` returns 10 rows for the demo tenant, and Finance,
Operations, Human Resources and Information Technology are not among them.
Creating a department with any of those four names fails with 409 "name already
in use", which proves the rows exist in this tenant.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`
(`91ab031f-8fa2-48b9-b346-7cdf326571ef`), production API commit `949f461c`,
observed 2026-08-29. The tenant has exactly one business unit and it **is**
visible to the caller, so the business-unit-visibility branch of the filter is
ruled out.

1. Sign in to the tenant workspace as a tenant administrator.
2. `GET /api/departments` — 10 rows, none named Finance, Operations, Human
   Resources or Information Technology.
3. Attempt to create each of those four:

```
POST /api/departments {"name":"Finance"}                -> 409 name already in use
POST /api/departments {"name":"Operations"}             -> 409
POST /api/departments {"name":"Human Resources"}        -> 409
POST /api/departments {"name":"Information Technology"} -> 409
```

4. Control: create names that are genuinely free —

```
POST /api/departments {"name":"Marketing"}      -> 201
POST /api/departments {"name":"Administration"} -> 201
POST /api/departments {"name":"Legal"}          -> 201
```

The 409s are raised by `@@unique([tenantId, name])`, so the four rows exist in
this tenant and no read path can reach them.

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/organization/organization.service.ts:868-885` —
  `findDepartmentsForUser` ends with

```ts
return departments.filter(
  (d) => d.businessUnitId !== null && visibleBusinessUnitIds.has(d.businessUnitId),
);
```

- `organization.service.ts:887-902` — `findDepartmentForUser` (fetch by id) reads
  through that same function, so a null-business-unit row is a 404 by id too.
- `organization.service.ts:658-659` — `deleteDepartment` calls
  `findDepartmentForUser` first, so the row cannot be deleted either.
- `services/api/prisma/schema.prisma`, `Department` line 38 —
  `@@unique([tenantId, name])`, which is what keeps the name reserved.

Origin of the rows: `CreateDepartmentDto.businessUnitId` is `@IsUUID()` and
required, so the public API cannot create one today. The rows come from a seed or
provisioning path that writes them directly.

## Root Cause

Established for the symptom: the visibility filter conflates "the caller cannot
see this row's business unit" with "this row has no business unit", and returns
false for both. What is **not** established is which writer creates
null-business-unit departments; that needs finding before the data can be
repaired.

## Impact

Unreachable master data on a tenant used for customer demos, and the four names
blocked are the four an HR administrator reaches for first. There is no route out
through the product: not the list, not a direct id, not delete, and not creating
a replacement. Rated HIGH — it is a primary journey (organization setup) blocked
with no workaround, on live data.

## Affected Areas

`services/api/src/modules/organization` (`organization.service.ts`
`findDepartmentsForUser`, `findDepartmentForUser`, `deleteDepartment`), the
department screens in `apps/web` that consume them, and whichever seed or
provisioning path writes departments without a business unit.

## Proposed Resolution

Two parts, and they are separable:

1. Stop the filter hiding rows for a reason it was not written to express. A
   department with no business unit should be visible to a caller whose scope is
   tenant-wide, and repairable — at minimum reachable by id so it can be assigned
   a business unit or deleted.
2. Find and fix the writer that produces null-business-unit departments, and
   decide whether the column should be non-nullable. Making it non-nullable is a
   destructive schema change and needs an ExecPlan with a backfill.

The existing rows on the demo tenant need a data repair either way.

## Acceptance Criteria

- A department with `businessUnitId = null` appears in `GET /api/departments` for
  a tenant-scoped caller, or is otherwise reachable for repair.
- Such a department can be deleted, or assigned a business unit.
- Creating "Finance" on the demo tenant either succeeds or fails with a message
  naming a department the user can actually see.
- The filter still hides departments whose business unit is outside the caller's
  scope — that part of the behaviour is correct and must not regress.

## Regression Coverage

None yet. A service test that seeds a department with a null business unit and
asserts it is reachable by a tenant-scoped caller would fail today.

## Dependencies

None identified.

## Related Items

BUG-1958 is the sibling defect on the same model: a soft-deleted department also
keeps its name reserved. Both surface through the same 409.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — live data is stranded on the demo tenant now and four common names are blocked.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[organization]]

<!-- GRAPH:END -->
