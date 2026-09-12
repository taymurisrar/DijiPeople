CONTEXT_FILES_REQUIRED:
  - .agent/context/agent-handoffs.md
  - docs/decisions/ADR-0012-hand-rolled-reporting-hierarchy-tree-no-new-dependency.md

SPECIALIST_AGENTS_REQUIRED:
  - frontend                            — tree dialog, hover/focus/tap detail, responsive layout
  - backend-api                         — bounded/scoped reporting-structure response, hover fields
DELIBERATELY_NOT_USED:
  - database                            — no schema change; existing `Employee.managerEmployeeId`
                                           self-relation is the only data this reads
  - security                            — reuses the existing field-security-rules mechanism the
                                           employee form already fetches and applies; no new
                                           enforcement mechanism introduced

SINGLE_WRITER_FILES:
  - none (this plan touches no file in the root SINGLE_WRITER_FILES list)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none found under docs/qa/known-bug-patterns/ naming a hierarchy/tree/org-chart pattern.

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-480 — reporting hierarchy tree renders the current employee's branch with no invisible
    focusable nodes and no cross-tenant leakage (filed alongside this plan).

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web (the widget tolerates the old response shape; see Migration
                           / data compatibility)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0103 runs several agents in parallel against the same develop
                          lineage. `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`'s
                          LOOKUP CONSTRUCTION and LOOKUP_REFERENCE_ROUTES map are owned by a
                          concurrent agent and are not touched here.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — Employee reporting hierarchy tree viewer

## Objective

A "View hierarchy" control on the employee record's Reporting Hierarchy
section opens a dialog drawing the reporting structure as a connected tree —
the current employee's full lineage from the topmost ancestor down through
their own subtree — with each node showing only an avatar and a name at rest,
and work email / work site revealed on hover, keyboard focus, or tap, subject
to the viewer's existing field-level security.

## Business requirement

[[ITEM-0164]] — the product owner asked for a real hierarchy visualisation
because the existing three flat cards (reporting line, current employee,
direct reports) do not show the shape of the organization, and the seeded
demo tenant's eleven-employee hierarchy is invisible in the product today.

## Existing behavior

`GET /employees/{id}/reporting-structure`
(`services/api/src/modules/employees/employees.controller.ts:273-284`,
service at `employees.service.ts:648-708`) already computes more than the
widget uses:

- `reportingLine` — the **full** ancestor chain to the root (not one level;
  the `while (managerId)` loop at `employees.service.ts:663-670` walks to the
  root or a cycle, whichever comes first).
- `directReports` — one level down.
- `fullTree` — **every** employee in the tenant with no manager, and their
  entire descendant subtree, unbounded depth, computed and serialized on
  **every** employee record view, for **every** root in the tenant, not just
  the queried employee's own branch (`childrenByManagerId.get(null)` at
  `employees.service.ts:704`, keyed by `null` — i.e. "has no manager",
  independent of `employeeId`).

`fullTree` has **zero consumers**, frontend or backend — confirmed by
`grep -rn "fullTree" apps/web services/api/src`, one hit, the line that
produces it. It is dead, unbounded, tenant-wide overfetch on every employee
page load, not a feature anyone reads. This plan turns it into the bounded,
scoped payload the tree viewer needs, rather than leaving it as waste and
adding a second endpoint beside it.

`reportingNodeSelect` (`employees.service.ts:4023-4032`) selects
`id, firstName, lastName, preferredName, managerEmployeeId, designation.name,
department.name, profileImageDocumentId` — no `workEmail`, no location. The
frontend widget (`ModuleReportingHierarchyWidget`,
`apps/web/app/components/runtime/module-widget-renderer.tsx:2066-2144`) reads
`currentEmployee`, `reportingLine`, `directReports` via
`mapReportingHierarchy` (`apps/web/lib/runtime/modules/employee-data.adapter.ts:503-524`)
and ignores `fullTree` entirely today.

Field-level security in this codebase is enforced **client-side**: the
employee record page fetches
`/field-security-policies/runtime-rules?entityKey=employees`
(`employees/[employeeId]/page.tsx`) into `fieldSecurityRules`, threaded into
`runtime.security`, and `canReadField(context, entityLogicalName,
fieldLogicalName)` (`apps/web/lib/runtime/security-runtime.resolver.ts:162-169`)
answers whether the viewer's role may read a given field. There is no
server-side field masking for this concern anywhere in `services/api` —
confirmed by grep for `FieldSecurityService` / `applyFieldSecurity` /
`resolveSafeFieldMetadata`, zero hits outside `apps/web`. This plan follows
that existing, established pattern rather than inventing server-side masking
as a one-off for this feature: the API returns the hover fields
unconditionally (same as it already does for `workEmail` on the plain
employee record fetch), and the tree dialog decides whether to render them
using the same `canReadField` check the rest of the form already relies on.
**This is a pre-existing architectural choice this plan does not change or
paper over** — see Risks.

`OrganizationHierarchyWidget` (`module-widget-renderer.tsx:2200+`) is the only
existing tree-shaped rendering in this app, as nested disclosure sections with
no library — the precedent [[ADR-0012]] builds on.

## Existing architecture

- `services/api/src/modules/employees/employees.service.ts` —
  `getReportingStructure`, `reportingNodeSelect`, `mapReportingNode`.
- `services/api/src/modules/employees/employees.controller.ts` —
  `GET :employeeId/reporting-structure`, already
  `@Permissions('hierarchy.read')` + `@RequirePermission(ENTITY_KEYS.HIERARCHY,
  'read')`, tenant-scoped via `where: { tenantId }` in the repository query.
- `apps/web/lib/runtime/modules/employee-data.adapter.ts` —
  `getWidgetData` branch for `system.reportingHierarchy`, `mapReportingHierarchy`.
- `apps/web/app/components/runtime/module-widget-renderer.tsx` —
  `ModuleReportingHierarchyWidget`, `HierarchyGroup`,
  `OrganizationHierarchyWidget` (the no-library precedent).
- `apps/web/lib/runtime/security-runtime.resolver.ts` — `canReadField`.
- [[ADR-0012]] — the rendering-approach decision this plan implements.

## Requirements

1. `GET /employees/{id}/reporting-structure` additionally returns a `tree`
   field: the ancestor chain from the tenant-forest root down to `employeeId`,
   then the full descendant subtree beneath `employeeId`, each node carrying
   `employeeId, displayName, jobTitle, department, profilePhotoUrl, workEmail,
   workSiteName, managerId`, capped at `MAX_HIERARCHY_DEPTH = 8` additional
   levels below the deepest point already reached and `MAX_HIERARCHY_NODES =
   500` total nodes, with a `hierarchyTruncated: boolean` flag when a cap was
   hit.
2. `fullTree` is removed from the response (dead, unbounded, replaced by
   `tree`) — safe because it has no consumer (Requirement verified by grep,
   see Existing behavior).
3. The existing `reportingLine`, `directReports`, `currentEmployee` fields are
   unchanged in shape, so the three-card view keeps working with no frontend
   change required for them.
4. A "View hierarchy" button appears on the Reporting Hierarchy section
   (inside `ModuleReportingHierarchyWidget`), disabled with an explanatory
   `title` when `hierarchy.read` was not returned as `available` by the
   widget's own registry check (i.e. never rendered in a state the surrounding
   widget already decided not to show).
5. The button opens a dialog rendering `tree` as nested branches (per
   [[ADR-0012]]): one card per node, avatar + name only, with the current
   employee visually distinguished (e.g. a highlighted border/ring).
6. Hovering, focusing (keyboard `Tab`, or arrow-key roving focus between
   nodes — see Frontend impact), or tapping a node reveals a popover with job
   title, department, and — **only if** `canReadField(runtime.security,
   "employee", "workEmail")` / `"locationId"` are each `true` for the viewer —
   work email and work site. A node the viewer may not see either extra field
   for still shows job title and department; nothing is ever fully hidden
   because of this check, only the two named fields.
7. The dialog is keyboard-dismissible (`Escape`), focus-trapped, and usable at
   390px width — the tree scrolls inside the dialog (`overflow: auto` on the
   tree container, not the page) rather than the dialog itself overflowing the
   viewport.
8. If `hierarchyTruncated` is `true`, the dialog shows a small notice rather
   than silently rendering an incomplete tree as if it were complete.

## Dependencies

[[ADR-0012]] (dependency decision, resolved). No blocking records.

## Files / modules affected

**Backend**
- `services/api/src/modules/employees/employees.service.ts` — `getReportingStructure`,
  `reportingNodeSelect`, `mapReportingNode`, new bounded-tree builder.
- `services/api/src/modules/employees/employees.service.spec.ts` — new cases.

**Frontend**
- `apps/web/lib/runtime/modules/employee-data.adapter.ts` — `mapReportingHierarchy`
  to also map `tree` / `hierarchyTruncated`.
- `apps/web/app/components/runtime/module-widget-renderer.tsx` —
  `ModuleReportingHierarchyWidget` gets the button; new `ReportingHierarchyTreeDialog`
  and `ReportingHierarchyTreeNode` components in the same file (consistent with
  where every other widget in this file lives).

**Docs**
- `docs/decisions/ADR-0012-...` (already written).
- This plan.

## Database impact

None. No model, column, index or migration change. Reads only
`Employee.managerEmployeeId` (existing self-relation), `designation.name`,
`department.name`, `profileImageDocumentId`, `workEmail`, and the `location`
relation's `name` — all existing columns.

## Backend impact

`getReportingStructure` keeps its existing tenant-scoped `findMany({ where:
{ tenantId, isDeleted: false, deletedAt: null } })` — no new query pattern,
same guard against soft-deleted employees. The bounded-tree builder is pure
in-memory recursion over the already-fetched employee list (no additional
queries), same as the `fullTree` builder it replaces. `workEmail` and
`location.name` are added to `reportingNodeSelect`; `mapReportingNode` reuses
the field values already read for the plain employee GET's own `workEmail`
column, so no new sensitive-field exposure pattern is introduced, only a
second read site for a field the API already returns elsewhere. The
`@Permissions('hierarchy.read')` / `@RequirePermission(ENTITY_KEYS.HIERARCHY,
'read')` guard on the endpoint is unchanged — the same permission that gated
`reportingLine`/`directReports` now also gates the richer `tree` field,
because it is the same endpoint and the same response object, not a new
route.

## Frontend impact

`apps/web`, module runtime. The tree renders as nested flex/grid rows with
SVG connectors per [[ADR-0012]] — no new dependency. Loading / error / empty
states: the dialog reuses the widget's own loading/error state (it cannot
open until the widget's data has loaded, since the button lives inside the
already-loaded widget) and shows `definition.emptyState` text if `tree` is
absent. Keyboard: roving `tabIndex` between nodes (`0` on the focused node,
`-1` on the rest) with arrow-key movement between parent/children/siblings,
the same pattern `responsive-runtime-tabs.tsx` already established and
`resolveNextTabIndex` demonstrates for this codebase — reused conceptually,
not imported (a tree's adjacency is not a tab strip's linear order, so the
exact function does not apply, but the roving-tabindex mechanism does).
Responsive: the dialog's tree pane scrolls in both axes at 390px rather than
forcing the page to scroll horizontally; nodes stack their connectors
vertically below a configurable width rather than assuming desktop space.

## Permission / RBAC impact

No new permission key. `hierarchy.read` / `ENTITY_KEYS.HIERARCHY` already
gates the endpoint and already gates whether `ModuleReportingHierarchyWidget`
mounts at all (via the System Widget Registry's `requiredPermissions:
["hierarchy.read"]`). No key needs mirroring into `apps/web/lib/security-keys.ts`
because the frontend does not re-decide this gate — the widget already not
rendering is sufter than any button-level check.

## Tenant-isolation impact

Unchanged from the existing endpoint: `tenantId` comes from
`request.user.tenantId` via `@CurrentUser()`, the query filters
`where: { tenantId, ... }`, and the bounded-tree builder only ever traverses
the in-memory list produced by that already-tenant-scoped query — it cannot
reach another tenant's employees because they were never fetched. No
`findUnique` by bare id is used or introduced. No platform-path access is
involved.

## Audit / event / logging impact

None. This is a read of already-readable data (reporting structure, name,
job title, department, profile photo, work email, work site — all already
independently readable by anyone with `hierarchy.read` / `employees.read`
through existing endpoints); viewing an org chart is not currently an
audited action anywhere in this codebase (unlike DLP capture content), and
this plan does not introduce a new audit surface for it.

## Integration impact

None. No gateway, agent-desktop, Stripe, email or storage contract touched.

## Migration / data compatibility

`fullTree` is replaced by `tree` in the same response object. Because
`fullTree` has zero consumers (verified above), no already-deployed client
reads it, so removing it is not a breaking change in practice, only in
theory. Deploying the API first is still the safer order (Requirement 3
keeps `reportingLine`/`directReports`/`currentEmployee` byte-compatible, so
the old widget code works unchanged against the new API during any rollout
gap); deploying the frontend first would render a "View hierarchy" button
whose data request 404s on nothing (same endpoint, additive field) — so
either order is actually safe, api-then-web is recorded as the sequence for
predictability, not because the reverse breaks anything.

## Parallel-safe tasks

- `PARALLEL_SAFE` — backend `getReportingStructure` change (no other current
  work reads or writes this file per session records at the time this plan
  was written).
- `PARALLEL_SAFE` — frontend tree dialog component (additive to
  `module-widget-renderer.tsx`, outside the concurrently-owned lookup
  construction region of the *other* file, `runtime-metadata-form-renderer.tsx`).

## Dependency-blocked tasks

- Frontend `mapReportingHierarchy` mapping of `tree` is `DEPENDENCY_BLOCKED`
  on the backend field shape landing first (or being implemented in the same
  change, as done here).

## Integration tasks

- `INTEGRATION` — wiring the button into `ModuleReportingHierarchyWidget` and
  verifying the dialog against the seeded demo tenant's eleven-employee
  hierarchy end to end.

## Testing strategy

- `npm --workspace api run test -- employees.service` (extended spec: bounded
  depth, node cap, `hierarchyTruncated`, tenant isolation — a second tenant's
  employees never appear in the tree even when `managerEmployeeId` values
  collide across tenants).
- `npm --workspace api run check-types`.
- `npm --workspace web run check-types` and `test` (existing suites; this
  app's jest cannot render components, so the tree's rendering itself is not
  unit-testable here — manual verification substitutes, see below).
- Manual verification (no browser automation available in this session):
  read the built component against the seeded demo tenant's hierarchy
  structure; confirm via source inspection that every interactive node is a
  real, labelled, focusable element and that the popover content is gated by
  `canReadField` before commit. A QA pass with live browser tooling should
  re-run this as REG-480 / a durable QA scenario before this ships to `main`.

## Risks

1. **Field-level security for the hover fields is enforced client-side only**
   (existing, pre-existing architectural pattern, not introduced by this
   plan) — a viewer could read the raw API response outside the UI and see
   `workEmail` regardless of the `canReadField` gate. Likelihood: same as
   every other field this pattern already covers (existing exposure, not a
   new one). Impact: same class as the existing single-employee GET, which
   already returns `workEmail` unconditionally. Mitigation: none added here
   without a larger, separate initiative to move field security enforcement
   server-side across the whole app — flagged explicitly rather than quietly
   accepted; see the note on repeat-defect risk in the record itself.
2. **Connector drawing at narrow widths.** Likelihood: medium (SVG lines
   between measured DOM positions are fiddly under reflow). Impact: cosmetic
   only. Mitigation: [[ADR-0012]]'s stated fallback — indent-and-rule
   connectors instead of drawn lines — if per-node measurement proves
   unreliable.
3. **Depth/node caps hide part of a very large or deep org.** Likelihood: low
   for now (demo tenant has 11 employees). Impact: an incomplete tree
   presented without the `hierarchyTruncated` notice would look wrong.
   Mitigation: Requirement 8 makes truncation visible rather than silent.

## Rollback considerations

`CODE_ONLY`. Revert the two commits; `fullTree`'s removal is reversible by
re-adding the old builder (nothing else depended on the new `tree` field
existing). No data written, no migration to unwind.

## Definition of Done

- [ ] `npm --workspace api run check-types` and `test` pass, including new
      `getReportingStructure` cases.
- [ ] `npm --workspace web run check-types` and `test` pass.
- [ ] `eslint --fix` clean on all changed files.
- [ ] Tenant scoping verified by a test asserting cross-tenant employees never
      appear in the tree.
- [ ] `hierarchy.read` / `ENTITY_KEYS.HIERARCHY` guard unchanged and verified
      still present.
- [ ] Field-level security gate on work email / work site verified by
      reading the component against both a `canReadField: true` and `false`
      case.
- [ ] No unrelated changes in the diff.
- [ ] ADR-0012 referenced from this plan and from ITEM-0164's Resolution.
