---
ID: BUG-2007
aliases: [BUG-2007]
Title: Projects and customers can be created but never deleted
Status: PRODUCT_DECISION
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/projects]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written; the model has not been chosen.

## QA Retest

Awaiting a decision and then a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition PRODUCT_DECISION per the SESSION-0070 Architect triage: is retire-by-status the intended model?

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
