---
ID: BUG-3335
aliases: [BUG-3335]
Title: Subscription plans screen overflows horizontally on phones and loses its comparison layout below 1280px
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-415
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3335 — Subscription plans screen overflows horizontally on phones and loses its comparison layout below 1280px

## Summary

Three measured layout failures on one screen whose entire purpose is side-by-side
comparison:

1. At 390px the page scrolls horizontally to 634px — 244px of overflow, which
   `AGENTS.md` forbids.
2. The plan cards are `xl:grid-cols-3`, so below 1280px all three stack into one
   column. At 1180px each card is 670px wide and the three span about 1,400px of
   vertical scroll. Two columns would fit comfortably; nothing tries.
3. The feature comparison is six independent `<table>` elements, each in its own
   `overflow-x-auto` container at `min-w-[760px]`. Their columns are auto-sized
   per table, so the plan columns do not line up with each other, and each table
   scrolls separately.

## Expected Behavior

Per `AGENTS.md`: screens work at tablet and mobile widths, and only tables,
diagrams and code blocks may exceed the viewport, each inside its own horizontal
scroller — the page body must never scroll horizontally. A comparison table's
columns line up down the page.

## Actual Behavior

Measured live on 2026-09-11:

| Viewport | `document.scrollWidth` | Plan card layout | Page height |
|---|---|---|---|
| 390px | 634px (overflows) | 1 column | 5,548px |
| 1180px | 1,165px (fits) | 1 column, 670px cards | — |
| 1440px | fits | 3 columns | — |

Comparison-column left offsets, in CSS pixels at 1440px, per category block:

| Block | Starter | Growth | Enterprise |
|---|---|---|---|
| Core HR | 1077 | 1190 | 1303 |
| Workforce Operations | 1040 | 1199 | 1308 |
| Work Management | 1010 | 1199 | 1308 |
| Talent | 1019 | 1199 | 1308 |
| Platform | 991 | 1149 | 1308 |
| Payroll & Finance | 971 | 1140 | 1308 |

The Starter column wanders 106px down the page. Reading down a plan's column
means re-finding it in every block.

At 390px all six scrollers report `clientWidth: 0` with `scrollWidth: 760`,
which is what produces the body overflow.

## Reproduction

1. Open `/settings/subscription/plans` at a 390px viewport. Scroll right; the
   page moves.
2. Resize to 1180px. The three plan cards stack into one column.
3. At any width, compare the horizontal position of the "Starter" header in the
   Core HR block against the Payroll & Finance block.

## Evidence

Plan card grid, `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx:410`:

```tsx
<div className="mt-6 grid gap-4 xl:grid-cols-3">
```

No `sm:`, `md:` or `lg:` step, so the jump is one column to three at 1280px.

Comparison tables, same file, lines 645-655 — one `<table className="min-w-[760px] w-full">`
per category inside `overflow-hidden` / `overflow-x-auto`, built by mapping over
`Object.entries(grouped)`. Column widths are auto and content-driven, so each
block sizes independently.

## Root Cause

The comparison was modelled as one card per category rather than as one table
with category header rows, which is what makes the columns independent. The card
grid was given only the largest breakpoint.

## Impact

Reachable in production. A tenant administrator on a laptop below 1280px — which
is most laptops — cannot see the three plans together, on the screen whose job is
to let them choose between three plans. The mobile overflow is a stated
repository rule violation.

## Affected Areas

- `/settings/subscription/plans`
- `FeatureComparison` in `BillingSettingsClient`

## Proposed Resolution

No ExecPlan needed.

1. Add `sm:grid-cols-2 lg:grid-cols-3` (or equivalent) to the plan card grid so
   the comparison survives below 1280px.
2. Render the comparison as **one** table with category rows spanning all
   columns, inside a single horizontal scroller, with explicit column widths.
   That fixes alignment and the six independent scrollbars together.
3. Give the single scroller a sticky header row so plan names stay visible over
   16 feature rows.
4. Re-measure `document.scrollWidth` at 390px; it must equal the viewport.

## Acceptance Criteria

- `document.scrollWidth` equals the viewport width at 390px, 768px and 1024px.
- Plan cards render in more than one column at 1180px.
- Every plan column in the comparison has the same left offset in every category.

## Regression Coverage

Needs a REG entry: a Playwright assertion that the page does not scroll
horizontally at 390px on this route.

## Dependencies

None.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3336]]

## Resolution

Fixed in `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`.

1. Plan card grid: `xl:grid-cols-3` -> `sm:grid-cols-2 lg:grid-cols-3`, so two
   columns render from 640px and three from 1024px instead of jumping
   straight from one to three at 1280px.
2. The six independent per-category `<table>` elements are replaced by one
   table (`FeatureComparison`) with an explicit `colgroup` (a fixed 40% for
   the feature-name column, an equal share of the remaining 60% per plan) and
   category rows as full-width `<th scope="colgroup">` header rows inside the
   body. Because there is now exactly one set of columns, a plan's column has
   the same horizontal offset in every category, and there is one scroller
   instead of six.
3. That one scroller is `w-full min-w-0 max-h-[560px] overflow-auto`, matching
   the containment pattern this repository already established for
   `data-table.tsx` (BUG-1960 / `settings-table-containment.spec.ts`): `w-full
   min-w-0` on the wrapping element, not only `overflow-x-auto` on the table's
   own container. The root cause this record measured (`clientWidth: 0` on
   the scrollers at 390px) matches that pattern exactly — the outer content
   div (`billing-settings-client.tsx`'s top-level `<div className="space-y-6">`)
   was a grid item of `SettingsLayout`'s `grid-cols-[minmax(0,1fr)]` track
   with no `min-w-0` of its own, and per `settings-table-containment.spec.ts`'s
   own comment, `minmax(0,1fr)` on the track alone does not constrain a grid
   item that itself has no `min-w-0` — the item's automatic minimum size is
   still its content's size. Added `min-w-0` there too.
4. The header row is sticky (`sticky top-0 z-10 bg-white`) within that
   scroller, so plan names stay visible over 16 feature rows.
5. `scope="col"` on the plan headers and `<th scope="row">` for feature names
   were added at the same time as this restructure, since they touch the same
   markup — see ITEM-0159, fixed together.

The `.slice(planIndex + 1)` "available in a higher plan" logic that ITEM-0160
(deferred, out of scope) depends on is preserved unchanged inside the new
single table.

Not independently re-measured in a real browser at 390px/768px/1024px —
Playwright MCP was unavailable in this session. The fix follows the exact
`w-full min-w-0 overflow-x-auto` / `grid-cols-[minmax(0,1fr)]` containment
chain this repository already has a passing regression test for
(`settings-table-containment.spec.ts`), but QA should still verify
`document.scrollWidth` against the viewport directly per the Acceptance
Criteria before this is closed out.

## QA Retest

Pending — needs a live-browser check of `document.scrollWidth` at 390px,
768px and 1024px on `/settings/subscription/plans`, and confirmation that a
plan's column lines up across every category in the comparison table.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.
- 2026-09-12 — fixed in `apps/web` (SESSION-0103, `agent/r-s1-billing-web`);
  not independently re-measured in a browser, see Resolution.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0159]]
- Modules — [[tenant-application]]
- Regression — REG-415 (see the regression register)

<!-- GRAPH:END -->
