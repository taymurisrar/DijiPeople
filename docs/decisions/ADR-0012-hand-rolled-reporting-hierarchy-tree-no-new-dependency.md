---
ID: ADR-0012
aliases: [ADR-0012]
Title: Render the reporting hierarchy tree by hand — no graph/tree library dependency
Status: ACCEPTED
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
---
# ADR-0012 — Render the reporting hierarchy tree by hand, no graph/tree library dependency

## Status

Accepted — 2026-09-12, resolving the dependency question [[ITEM-0164]] asked to
be decided and recorded before code.

## Context

[[ITEM-0164]] asks for a "View hierarchy" control on the employee record's
Reporting Hierarchy section that opens a real tree — branches, one node per
employee, an avatar and a name at rest, detail on hover/focus/tap. Today the
section shows three flat cards (reporting line, current employee, direct
reports), one level in each direction, via `ModuleReportingHierarchyWidget`
(`apps/web/app/components/runtime/module-widget-renderer.tsx`).

Checked before filing (per the record's own Evidence section, re-verified
here): no tree, org-chart or graph component exists anywhere in `apps/web` or
`apps/admin`, and no charting/tree/graph library appears in any
`package.json` in the workspace — `d3`, `reactflow`, `dagre`, `react-org*`,
`treant`, `vis-network`, `cytoscape`, `recharts`, `visx` all checked, zero
matches.

The shape to render is constrained: one parent per node (a tree, not a general
graph), moderate breadth per level (the seeded demo tenant has eleven
employees; production tenants are not expected to run tens of thousands of
direct reports under one manager on a single screen), and a bounded depth
(ancestors to the root, descendants to a depth limit — see the accompanying
ExecPlan, `EXECPLAN-0043`). Interaction requirements are limited to hover,
focus and tap revealing a small detail popover, and the tree scrolling inside
a dialog — not pan/zoom/drag, not editing, not auto-layout of an arbitrary
graph.

## Decision

**Hand-rolled, no new dependency.** The tree renders as nested `<ul>`/`<li>`
lists, one per depth level, connected by an indent-and-rule pattern — a
`border-l` on each child list plus left padding — rather than drawn SVG lines
between measured DOM positions. Detail-on-interaction is a plain popover/
tooltip component keyed off hover/focus/press state, not a library feature.

(This is the fallback this ADR originally described alongside an SVG-drawn
alternative; implementing it, indent-and-rule was simply the better default —
it needs no DOM-position measurement code at all, degrades correctly under
text reflow and narrow widths with zero extra logic, and is indistinguishable
in effect from a drawn line for a tree this shape. SVG connectors remain an
option if a future revision wants literal diagonal branch lines; nothing here
forecloses it.)

Reasons, weighed against a library (`reactflow` was the closest fit
considered — auto-layout, pan/zoom, and a maintained React API):

- **The shape does not need what a graph library buys.** `reactflow` and
  similar libraries earn their weight on arbitrary graphs needing force-layout,
  free pan/zoom canvases, and drag-to-rewire editing. A one-parent-per-node
  tree with a bounded depth lays out correctly with ordinary flexbox/grid; the
  connectors are the only genuinely custom-drawing part, and SVG lines between
  known DOM positions are a well-understood, small amount of code.
- **`AGENTS.md` prefers what is already installed and asks for justification
  before adding a dependency.** None of the eight libraries checked are
  installed; every one is either abandoned relative to this stack (`treant`),
  heavier than the problem (`cytoscape`, `vis-network` — general graph
  visualization engines), or aimed at a chart/plot shape this is not
  (`recharts`, `visx`, `d3` as a whole library rather than a specific
  primitive).
  Pulling in a full graph-rendering runtime into the `apps/web` tenant bundle
  for one dialog on one record type is a cost with no reuse in sight elsewhere
  in the product today.
- **Accessibility and responsiveness are easier to own directly.** The record
  requires a keyboard/touch equivalent to hover (focus and tap) and usable
  rendering at tablet and mobile widths. A hand-rolled tree keeps every
  interactive element a plain, labelled DOM node the existing accessibility
  conventions in this codebase already know how to handle (see
  `responsive-runtime-tabs.tsx`'s roving-tabindex pattern, reused here for
  node-to-node arrow navigation); a canvas- or SVG-graph-library tree would
  need its own accessibility layer built on top regardless, since none of the
  eight candidates render an accessible DOM tree by default.
- **The existing pattern in this codebase already favours this.** The
  Organization Hierarchy widget (`OrganizationHierarchyWidget` in
  `module-widget-renderer.tsx`) already renders a multi-level tree
  (organizations → business units → departments → teams) as nested
  disclosure sections with no library. The reporting-hierarchy tree extends
  that precedent rather than introducing a second, inconsistent rendering
  technique for "a tree" in the same file.

**This gets relitigated if the shape changes.** If a future requirement adds
free-form pan/zoom, drag-to-reassign-manager editing, or renders hundreds of
nodes on screen at once (auto-layout becomes load-bearing rather than
cosmetic), the calculus changes and a library becomes the better trade — this
decision is scoped to the shape described above, not a permanent ban on ever
adding one.

## Consequences

- No new runtime dependency in `apps/web`'s `package.json`.
- The tree component (`ReportingHierarchyTreeDialog` /
  `ReportingHierarchyTreeNodeItem` in
  `apps/web/app/components/runtime/module-widget-renderer.tsx`, see
  `EXECPLAN-0043`) is bespoke, hand-maintained code rather than a library
  upgrade path — the team owns its bug fixes.
- No DOM-position measurement code exists anywhere in the tree — the
  indent-and-rule connectors are pure CSS on the nested list structure, so
  there is nothing here that can go wrong under text reflow, a translated
  label of different length, or a resize, the way measured SVG lines could
  have.

## Related

- [[ITEM-0164]] — the record this decision resolves.
- `EXECPLAN-0043` — the implementation plan built on this decision.
- `apps/web/app/components/runtime/module-widget-renderer.tsx` —
  `OrganizationHierarchyWidget`, the existing no-library precedent.
