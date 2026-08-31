---
ID: BUG-2648
aliases: [BUG-2648]
Title: Reports pages scroll sideways at 1440 because grid items cannot shrink below their content
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: e5258e80
AffectedModules: [apps/web/app/(authenticated)/reports]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-383
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2648 — Reports pages scroll sideways at 1440 because grid items cannot shrink below their content

## Summary

Every page of the reporting workspace scrolled sideways in a 1440px-wide browser. The page content measured 1646px against a 1440px viewport, so the browser showed a horizontal scrollbar and 206px of the layout sat off-screen until the reader scrolled to it. No other screen in the product does this: `/employees` at the same width measures exactly 1440.

## Expected Behavior

The document never scrolls horizontally. Content wider than the viewport — a wide records table, for instance — scrolls inside its own `overflow-x: auto` container, which `DataTable` already provides.

## Actual Behavior

`document.documentElement.scrollWidth` was 1646 at a 1440 viewport, with 120 elements extending past the right edge. The outermost offender was the workspace header `section`, measured at 1326px inside a parent that was correctly 1104px.

## Reproduction

1. Sign in to a tenant workspace and open `/reports` at a viewport width of 1440.
2. Observe the horizontal scrollbar; scroll right to see the layout continue past the fold.
3. In the console: `document.documentElement.scrollWidth` → `1646`, `document.documentElement.clientWidth` → `1440`.
4. Repeat on `/reports/analytics/workforce` and `/reports/library?target=std:workforce.directory` — same result.
5. Open `/employees` at the same width for contrast: `scrollWidth === clientWidth === 1440`.

## Evidence

Measured in a real browser against production at commit `cace6cdb`:

```
/reports/library   viewport 1440  scrollWidth 1646  offenders 120
/employees         viewport 1440  scrollWidth 1440  offenders 0
```

The ancestor chain of the widest offender, which is what identifies the mechanism:

```
section.rounded-[24px]...p-6      width 1326  right 1646  min-width: auto   <- overflows
div.grid.gap-5                    width 1104  right 1424                    <- parent, correct
main.flex.min-w-0.flex-col        width 1104  right 1424  min-width: 0px
```

A child measuring 1326 inside a parent measuring 1104 is the whole finding.

## Root Cause

A grid item's `min-width` defaults to `auto`, which refuses to shrink the item below its content's min-content width. The workspace header becomes a row at the `xl` breakpoint (`xl:flex-row`), placing a title block whose paragraph carries `max-w-3xl` (768px) beside a navigation of five tab links (416px). Their combined min-content width exceeds the 1104px available, and because the section may not shrink below it, the section grew instead — pushing the document, not itself, past the viewport.

This is why it is invisible at 1920 (there is room) and why it appears only at and above `xl` (below it, the header stacks and nothing competes for width).

## Impact

Cosmetic but on every page of the feature, at one of the most common laptop widths, for every tenant. Nothing is unreachable or incorrect — the layout is simply 206px wider than the window, and the reader has to scroll horizontally to see the right edge of a screen that was designed to fit.

## Affected Areas

`apps/web/app/(authenticated)/reports/_components/` — the layout shell and all six page-level views. No API surface.

## Proposed Resolution

Allow the affected grid items to shrink. No ExecPlan: it is a CSS constraint, not a design change.

## Acceptance Criteria

- At viewport widths 1024, 1280, 1440 and 1920, `document.documentElement.scrollWidth <= clientWidth` on every reports page.
- A wide records table still scrolls inside its own container rather than being truncated.

## Regression Coverage

REG-383.

## Dependencies

None.

## Related Items

Found during post-deploy validation of [[TASK-0028]], alongside [[BUG-2647]].

## Resolution

Fixed on `agent/reports-analytics-platform-fixes`. `[&>*]:min-w-0` applied to the layout shell's grid and to the seven page-level wrappers, so every direct child may shrink; `min-w-0` also on the header section and its title block.

Applied to every direct child rather than to the one section that happened to overflow, so a page later dropped into `children` cannot reintroduce it.

Verified before shipping by applying the same constraint to the live production DOM and re-measuring: `scrollWidth` 1646 -> 1440, `fixed: true`, with the remaining wide `<table>` correctly scrolling inside its own `overflow-x: auto` container. The generated CSS was confirmed present in the production build (`.\[\&\>\*\]\:min-w-0>*{min-width:calc(var(--spacing) * 0)}`) — Tailwind v4 emits `calc(var(--spacing) * 0)` rather than a literal `0`, which is worth knowing before concluding the utility was not generated.

## QA Retest

Post-deploy validation of the fix, in production, at four viewport widths.

## History

- 2026-08-31 — created from post-deploy validation at `cace6cdb`.
- 2026-08-31 — fixed and verified in production.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-383 (see the regression register)

<!-- GRAPH:END -->
