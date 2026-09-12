---
ID: ITEM-0159
aliases: [ITEM-0159]
Title: Plans and Features screen fails several accessibility basics for a data-comparison surface
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3335
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0159 — Plans and Features screen fails several accessibility basics for a data-comparison surface

## Summary

`/settings/subscription/plans` is a comparison table plus a set of stateful
controls, which is precisely the shape that depends on correct semantics. Five
measured gaps, all in `BillingSettingsClient`:

- **The sub-tab nav carries no `aria-current`.** Overview, Plans & Features and
  Billing History are `next/link` elements styled by class only; the active one
  is not announced. The surrounding app does set `aria-current` — the main nav
  and the settings nav both report `page` — so this screen is the outlier.
- **The Monthly/Annual control is two plain buttons** with no `role="radiogroup"`,
  no `role="radio"` and no `aria-pressed`. Its state is conveyed only by
  background colour. Its label is a `<p>`, not associated with the group.
- **The six comparison tables have no `scope` on any header cell**, and the
  feature name is a `<td>` rather than `<th scope="row">`. In a four-column table
  with 16 rows, a screen reader cannot say which plan a badge belongs to.
- **The error banner is a plain `div`** with no `role="alert"`, so a failed
  checkout is never announced. It is also rendered far from the control that
  caused it — tracked as part of [[BUG-3331]].
- **The check icons are unlabelled decorative SVGs** with no `aria-hidden`, so
  they are announced as images in the card feature lists.

## Why It Matters

Subscription and billing are exactly the screens an organisation is most likely
to be asked to make accessible, and a four-column comparison table without row
and column scope is not usable non-visually at all. The repository already
requires this: `AGENTS.md` states that every control is labelled, tables stay
navigable by keyboard, and meaning is never encoded in colour alone.

## Evidence

All in `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`:

- sub-tab nav, lines 206-233 — `<Link>` with conditional classes, no `aria-current`
- error banner, lines 238-241 — `<div className="rounded-[18px] border …">`
- `SegmentedControl`, lines 905-935 — `<p>` label, `<button>` children, no roles
- comparison header cells, line 652 — `<th className="px-5 py-3 font-semibold">`
  with no `scope`
- feature name cell, line 661 — `<td>`
- `CheckCircle2`, line 469 — no `aria-hidden`

Measured live on 2026-09-11: every `aria-current` on the page belongs to the app
nav or the settings nav; none of the three subscription tabs carries one. Both
segmented buttons report `role: null, aria-pressed: null`. All 24 header cells
across the six tables report `scope: null`.

## Proposed Approach

No ExecPlan needed.

1. Set `aria-current="page"` on the active subscription tab.
2. Convert `SegmentedControl` to a radiogroup, or at minimum add `aria-pressed`
   and associate the label with `aria-labelledby`.
3. Add `scope="col"` to the plan headers and promote the feature-name cell to
   `<th scope="row">`. Best done together with the single-table restructure in
   [[BUG-3335]], which touches the same markup.
4. Give the error banner `role="alert"`.
5. Mark the decorative icons `aria-hidden="true"`.

## Acceptance Criteria

- The active subscription tab is announced as the current page.
- The billing cycle control announces which option is selected.
- Every badge in the comparison table is announced with both its feature and its
  plan.
- A checkout error is announced when it appears.

## Dependencies

Item 3 overlaps [[BUG-3335]]; do them in one change to avoid touching the table
markup twice.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]],
[[BUG-3335]], [[BUG-3336]], [[ITEM-0160]], [[ITEM-0161]]

## History

- 2026-09-11 — created at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.
- 2026-09-12 — Resolved, in
  `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`
  and `apps/web/app/components/ui/segmented-control.tsx` (SESSION-0103,
  `agent/r-s1-billing-web`). All five items: `aria-current="page"` on the
  active subscription sub-tab; the Monthly/Annual control moved to the shared
  `SegmentedControl` with `role="radiogroup"` / `role="radio"` /
  `aria-checked` and a labelled group (`aria-labelledby`); `scope="col"` on
  the (now single, per BUG-3335) comparison table's plan headers and
  `<th scope="row">` for feature names, done together with that restructure
  as this item asked; `role="alert"` on the checkout/portal error banner
  (also moved next to the control that produced it, per BUG-3331's UI half);
  `aria-hidden="true"` on the decorative `CheckCircle2` check icons in the
  card feature lists (and on other purely-decorative icons touched by the
  same pass, e.g. the buttons' leading icons). Not independently verified
  with a screen reader or an axe run — Playwright MCP was unavailable this
  session; verification is source-level plus the existing `check-types` /
  `test` / `eslint` passes.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3335]]
- Referenced by — [[BUG-3345]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
