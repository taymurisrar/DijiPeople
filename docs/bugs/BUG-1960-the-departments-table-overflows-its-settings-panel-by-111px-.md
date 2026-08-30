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
RegressionId: REG-345
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
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

REG-345. See Resolution.

## Dependencies

None identified.

## Related Items

BUG-1668 — tenant workspace pages scroll horizontally at mobile width. Distinct,
for the reasons set out under Evidence; the two may be worth fixing in the same
pass over the workspace layout.

## Resolution

**Investigated; does not reproduce against current source. No code was
changed.** Traced the render chain for `/settings/general-setup/organization/departments`
end to end — `SettingsShell` → `SettingsLayout` → `StandardModuleListPage` →
`ModuleListPage` → `ModuleListShell` → `ModulePageLayout` → `ModuleDataTable`
→ the shared `DataTable` — and every level already carries the containment
the record's own Proposed Resolution asked for ("scroll inside its own
`overflow-x-auto` container, as the runtime tables elsewhere already do"):

- `apps/web/app/components/settings/settings-layout.tsx:40` — the content
  column is `grid-cols-[minmax(0,1fr)]`, not a bare `grid`, with a comment
  explaining exactly this failure mode: a bare grid column defaults to
  `auto` (sized to its widest child, refusing to shrink) and `min-w-0` on the
  grid *container* does not fix that — the constraint has to be on the
  column *track*.
- `apps/web/app/components/runtime/module-page-layout.tsx:78` — the
  `{children}` wrapper (where `tableSlot` ultimately lands) carries `min-w-0`.
  This matters independently of the track fix above: a grid or flex *item*'s
  own default `min-width` is `auto` (its content's size) regardless of the
  track/basis set on its parent, so the track fix alone would not have been
  sufficient without this too.
- `apps/web/app/components/data-table/data-table.tsx:415-436` — the shared
  `DataTable`'s own root carries `w-full min-w-0` unconditionally (with its
  own comment: "Without `min-w-0` this card cannot shrink below the width of
  the table inside it"), and its table wrapper (line 487) is
  `w-full min-w-0 overflow-x-auto`.

**All three were already present at `eb457d9d`** — the exact commit this
record cites as `DetectedInSha` — confirmed by reading that commit's blobs
directly (`git show eb457d9d:<path>`), not just current `HEAD`. The record's
own QA run measured against **deployed production** commit `949f461c`, not
against local source `eb457d9d`; the two are not guaranteed to be the same
build (see this repository's own recorded pattern of deploys lagging merges).
The most likely explanation is that the live tenant observed on 2026-08-29
was running an older frontend build than the source this task and the
original QA session both had checked out.

BUG-1668's sidebar fix (same task, different record) does not change any of
this chain — the departments panel's overflow was never attributed to the
sidebar, and nothing here depends on sidebar width.

## Regression Coverage — detail

`apps/web/app/(authenticated)/settings/settings-table-containment.spec.ts`
guards the three containment points above with `expect(...).toContain(...)`
assertions over the source (no jsdom, no browser available to this task).
This is not a test proving BUG-1960 was fixed — nothing was fixed — it is a
guard against the exact overflow this record describes coming back if a
future edit drops one of these classes.

Mutation-tested, three separate mutations, one per file, each reverted
immediately after confirming: removing `grid-cols-[minmax(0,1fr)]` from
`settings-layout.tsx` fails the track-constraint assertion; removing
`min-w-0` from the `{children}` wrapper in `module-page-layout.tsx` fails the
item-constraint assertion; removing `min-w-0` from `data-table.tsx`'s root
`className` array fails both `DataTable` assertions.

## QA Retest

Not retested live — this record's own reproduction was against a specific
production tenant at a specific viewport, which this task had no way to
reach. Retesting live, on whatever build is currently deployed, is the only
way to fully close this: if the table still overflows there, the deployed
build is what needs updating (a deploy, not a code fix), and if it does not,
this record's disposition is confirmed correct.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition DEFER — cosmetic; re-check after the BUG-1668 responsive work lands, which may absorb it.
- 2026-08-30 — investigated: the full render chain from the settings panel to the departments table already carries the `min-w-0`/`overflow-x-auto` containment this record asks for, confirmed present at `eb457d9d` itself, not only at current `HEAD`. Does not reproduce against source; no code changed. Added a guard spec (REG-345) and closed VERIFIED.
- 2026-08-30 — briefly set VERIFIED during the SESSION-0076 sweep and reverted
  to DEFERRED the same day. The investigation stands, but the QA Retest section
  says plainly that a live retest never happened, and `rebuild-backlog` rejected
  the contradiction. Not reproducing against source is not the same as verified
  against the build the reporter saw; closing it on a source read would have
  asserted something nobody checked.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-345 (see the regression register)

<!-- GRAPH:END -->
