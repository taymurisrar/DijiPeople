---
ID: BUG-1960
aliases: [BUG-1960]
Title: The departments table overflows its settings panel by 111px at 1440px
Status: DEFERRED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1960 — The departments table overflows its settings panel by 111px at 1440px

## Summary

On the departments settings screen at a 1440px viewport with the settings sidebar
expanded, the table is 111px wider than the panel that contains it. The table is
not scrolling inside its own container; it is escaping it.

## Expected Behavior

`AGENTS.md`: wide content "must scroll inside its own `overflow-x: auto`
container". At a desktop width, a table with more columns than fit either scrolls
within its panel or reflows — it does not extend past the panel's edge.

## Actual Behavior

Measured on `/settings/general-setup/organization/departments` at 1440px with the
settings sidebar expanded:

| Element | x | width | right edge |
|---|---|---|---|
| `table` | 646 | 874 | 1520 |
| containing panel | 646 | 763 | 1409 |

111px of the table lies outside its container.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace.
2. Set the viewport to 1440px wide, with the settings sidebar expanded.
3. Open `/settings/general-setup/organization/departments`.
4. Compare the bounding rectangles of the `table` and of the panel that contains
   it: `x=646 w=874` against `x=646 w=763`.

## Evidence

The bounding-box measurements above, taken live on the production tenant
workspace. No file:line evidence was collected — the panel and table components
were not identified during the run.

### Why this is not BUG-1668

BUG-1668 (`DEFERRED`, MEDIUM) is a different measurement of a different thing, and
it explicitly excludes this case:

- BUG-1668 is measured at **390px**, and is about `document.body.scrollWidth`
  exceeding the viewport — the whole page sliding sideways.
- Its two identified causes are page chrome that does not reflow on
  `/payroll/cycles`, and an absolutely-positioned column-resize handle on
  `/employees`.
- Its own Evidence section certifies tables as **correct** at desktop width:
  "Verified separately on `/payroll/cycles` at 1440px: the grid is 2049px inside a
  1102px container with `overflow-x: auto`, it scrolls internally, and the body
  stays at 1440. **The tables are not at fault.**"

This record is a table at **1440px** overflowing **its panel** on a settings
screen — the exact case BUG-1668 measured as working elsewhere. If the fix for
BUG-1668 turns out to cover this too, this record should be closed as a duplicate
at that point; on the evidence available today they are distinct.

## Root Cause

Not established. Likely the settings panel does not constrain its child's width
(a missing `min-width: 0` on a flex or grid child is the usual cause of exactly
this shape), but this was not confirmed.

## Impact

Cosmetic on a desktop viewport: the rightmost part of the table sits over or past
the panel edge. No data is unreachable, and no action is blocked. Rated LOW for
that reason, and deliberately below BUG-1668's MEDIUM, which costs whole-page
scrolling on the size of screen most likely to be used one-handed.

## Affected Areas

`apps/web` settings panel layout and the departments table; likely any settings
screen that renders a table inside the same panel.

## Proposed Resolution

Constrain the table to its panel and let it scroll inside its own
`overflow-x: auto` container, as the runtime tables elsewhere already do. Check
the other settings screens that render tables in the same panel before calling it
fixed.

## Acceptance Criteria

- At 1440px with the sidebar expanded, the departments table's right edge is
  within its containing panel.
- Columns that do not fit are reachable by scrolling inside the panel.
- The page body does not scroll horizontally at that width.

## Regression Coverage

None yet. A layout assertion comparing the table's bounding box with its panel's
would fail today.

## Dependencies

None identified.

## Related Items

BUG-1668 — tenant workspace pages scroll horizontally at mobile width. Distinct,
for the reasons set out under Evidence; the two may be worth fixing in the same
pass over the workspace layout.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition DEFER — cosmetic; re-check after the BUG-1668 responsive work lands, which may absorb it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
