---
ID: BUG-1958
aliases: [BUG-1958]
Title: Deleting a department never releases its name, so it can never be recreated
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/organization]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — requires a unique-constraint/soft-delete design decision and a migration.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[organization]]

<!-- GRAPH:END -->
