---
ID: ITEM-0164
aliases: [ITEM-0164]
Title: An organization hierarchy viewer reachable from the employee record
Type: UX
Status: DONE
Priority: P2
Severity: 
AffectedModules: [apps/web, employees, organization]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3450
RelatedQA: QA-EMPLOYEE-001
RelatedADR: ADR-0012
RelatedImplementation: services/api/src/modules/employees/employees.service.ts, apps/web/app/components/runtime/module-widget-renderer.tsx, apps/web/lib/runtime/modules/employee-data.adapter.ts
TargetMilestone: 
BlockedBy: 
---

# ITEM-0164 — An organization hierarchy viewer reachable from the employee record

## Summary

The Reporting Hierarchy section of an employee record shows three flat cards:
the reporting line, the current employee, and direct reports. It shows one level
up and one level down, as text, with no sense of the shape of the organization.

The product owner asked for a **View hierarchy** button that opens a proper
visual tree with branches showing who reports to whom. In that view an employee
node should carry only an avatar and a name, with the detail — work email, work
site or office location, and related fields — revealed on hover.

## Why It Matters

Reporting structure is the one thing on an employee record that is inherently a
shape rather than a list, and it is currently rendered as neither. Managers and
HR use the hierarchy to answer questions the three cards cannot: how deep a
branch runs, who sits between two people, whether a team has a gap. Today that
requires opening records one at a time and holding the tree in your head.

It also leaves the seeded reporting structure invisible. The demo workspace has
eleven employees arranged in a real hierarchy and nothing in the product draws
it.

## Evidence

- `apps/web/lib/runtime/modules/employee-metadata.adapter.ts:932-949` — the
  Reporting Hierarchy section is declared in `fallbackEmployeeForm()` with
  `widgetKey: "system.reportingHierarchy"`.
- `apps/web/lib/runtime/modules/employee-metadata.adapter.ts:1017-1099` —
  `ensureDefaultSystemWidgets()` injects that section into any main form
  lacking it, including a form customised in the database. The section is
  code-owned, so extending it is a code change rather than a data migration.
- `apps/web/app/components/runtime/module-widget-renderer.tsx:2047-2144` —
  `ModuleReportingHierarchyWidget` renders the three cards.
- `services/api/src/modules/employees/employees.controller.ts:273-275` — the
  data comes from `GET /employees/{id}/reporting-structure`, which returns one
  level in each direction.

**No hierarchy visualisation exists anywhere.** Searching `apps/web` and
`apps/admin` for an org chart, tree or hierarchy component returns nothing.

**No charting or tree library is installed.** Checked every `package.json` in
the workspace for `d3`, `reactflow`, `dagre`, `react-org*`, `treant`,
`vis-network`, `cytoscape`, `recharts` and `visx`. Zero matches. `AGENTS.md`
says to prefer what is already installed and not to add a dependency without
justification, so this choice has to be made deliberately rather than in
passing.

## Proposed Approach

Needs an ExecPlan under `PLANS.md`. Three decisions come before code:

1. **Dependency or hand-rolled.** A reporting tree is a constrained shape, one
   parent per node and moderate breadth, and renders acceptably as nested flex
   or CSS grid with SVG connectors and no library. That keeps the dependency
   count flat, which `AGENTS.md` prefers, at the cost of writing the layout. A
   graph library buys pan, zoom and auto-layout and costs a new runtime
   dependency in the tenant bundle. Record the choice as an ADR, because it is
   the kind of decision the next person will otherwise relitigate.

2. **API shape.** `GET /employees/{id}/reporting-structure` returns one level up
   and one down. A tree needs ancestors to the root and descendants to a bounded
   depth in one round trip, with the hover fields included: display name,
   avatar, work email, and work site or office location. It must be tenant-
   scoped from `request.user.tenantId` like every other employee read, and the
   hover fields must respect field-level security rather than assuming everyone
   may see everyone's email.

3. **Placement.** A full-page or dialog view opened from a **View hierarchy**
   button on the existing section, rather than replacing the three cards. The
   cards answer the common question quickly; the tree answers the rarer one.

Hover detail needs a keyboard and touch equivalent, focus and tap, or the detail
is unreachable for part of the audience.

## Acceptance Criteria

- A **View hierarchy** control appears on the employee record's Reporting
  Hierarchy section.
- It opens a view drawing the reporting structure as connected branches, with
  the current employee identifiable within it.
- A node shows only avatar and name at rest.
- Hovering, focusing or tapping a node reveals work email, work site or office
  location, and the agreed related fields.
- The view is tenant-scoped and honours field-level security on the detail
  fields.
- The tree renders usably at tablet and mobile widths.
- If a dependency is added, an ADR records why.

## Dependencies

Extending `GET /employees/{id}/reporting-structure`, or a new endpoint beside
it. No blocking records.

## Related Items

[[ITEM-0165]] and [[ITEM-0166]] are the other two employee record page changes
from the same review. [[ITEM-0167]] concerns the record shell those sections sit
in.

## Resolution

Implemented per `EXECPLAN-0043` and ADR-0012 (hand-rolled tree, no
graph/tree library dependency — indent-and-rule connectors, chosen directly
over drawn SVG lines once implemented, since it needs no DOM-position
measurement code).

**Backend.** Extended the existing `GET /employees/{id}/reporting-structure`
rather than adding a new endpoint — same `@Permissions('hierarchy.read')` /
`@RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')` guard, same tenant-scoped
query. Its dead `fullTree` field (every org root in the tenant, unbounded
depth, zero consumers — see [[BUG-3450]], found and fixed in the same
change) was replaced with a `tree` field scoped to the queried employee's own
ancestor-to-root and descendant subtree, capped at 8 additional depth levels
and 500 total nodes with a `hierarchyTruncated` flag. Hover fields (work
email, work site) added to the node shape.

**Frontend.** `ModuleReportingHierarchyWidget` gained a "View hierarchy"
button opening a dialog (the shared `Dialog` primitive — focus trap, Escape,
`aria-modal`) that renders the tree as nested lists. A node shows only an
avatar and a name at rest; hover, keyboard focus, or a tap (`onClick` toggle)
reveals job title, department, and — gated by
`canReadField(runtime.security, "employee", "workEmail" | "locationId")`,
the same field-level-security check every other field on the form already
uses — work email and work site.

**Not done in this session, and why:** no browser was available (Playwright
MCP failed to connect) to visually verify the dialog, its focus trap, or the
hover/focus/tap interaction live. `PLAN-040` / `QA-EMPLOYEE-001` record this
explicitly as `BLOCKED_INFRASTRUCTURE` for the browser-level cases and name
exactly what a future QA pass should check before this reaches `main`.
Automated coverage (unit-level tree scoping/bounding/tenant isolation) is in
place and passing.

## History

- 2026-09-11 — created at `cbd9b812` from a user report on the employee record
  page; existing hierarchy support and installed dependencies checked before
  filing.
- 2026-09-12 — implemented for SESSION-0103. See Resolution. [[BUG-3450]] /
  REG-480 / QA-EMPLOYEE-001 filed alongside it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3450]]
- Modules — [[tenant-application]], [[employees]], [[organization]]

<!-- GRAPH:END -->
