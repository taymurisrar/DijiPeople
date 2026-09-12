---
ID: BUG-3345
aliases: [BUG-3345]
Title: Subscription screens paint every primary action in body-text black instead of the tenant brand colour
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-416
RelatedBacklogItem: ITEM-0159
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3345 — Subscription screens paint every primary action in body-text black instead of the tenant brand colour

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Reported by the owner from the
> live demo tenant: "a lot of the components were black colour and not using the
> theme colour." Verified, and the cause is larger than the colour — the screen
> does not use the design system at all.

## Summary

`BillingSettingsClient` fills every primary action with `bg-foreground`. In this
theme `--foreground` resolves to `--brand-text`, the near-black used for body
copy. The tenant's brand colour lives in `--accent`, which resolves to
`--brand-primary` — teal `#0f766e` on the demo tenant. The component references
`accent` **zero** times.

So the active tab pill, the selected billing-cycle segment, the plan card's
action button, "Manage in Stripe" and "Manage billing" are all painted in the
text colour rather than the brand colour, on a tenant whose entire workspace is
otherwise teal. The one place the brand does appear on this screen is the
sidebar, which uses its own tokens.

The colour is a symptom. The component imports nothing from the shared UI kit and
hand-rolls local copies of components that already exist: its own `EmptyState`,
`StatusChip`, `SegmentedControl`, `BillingAlert`, `InfoTile`, `ManageButton` and
`FeatureBadge`, plus two raw tables. `apps/web/app/components/ui/` already
provides `button.tsx`, `empty-state.tsx`, `status-pill.tsx`, `section-card.tsx`
and `form-control.tsx`. `AGENTS.md` names a hand-rolled table, form control or
empty state in either app a review failure, and requires that tenant theme
tokens be respected rather than colours hardcoded.

## Expected Behavior

A primary action uses the shared `Button` with `variant="primary"`, which is
`bg-accent text-white hover:bg-accent-strong` and therefore follows the tenant's
branding. Status and feedback colours come from the shared `StatusPill` and the
theme's semantic tokens, not from Tailwind palette literals.

## Actual Behavior

Five primary surfaces filled with the body-text colour, and twenty-five
hardcoded palette utilities that ignore the theme entirely.

## Reproduction

1. Open `/settings/subscription/plans` on a tenant with non-default branding.
   `dijipeople-demo` is branded teal `#0f766e`.
2. The "Plans & Features" tab pill, the "Monthly" segment and the "Current plan"
   button all render near-black `#0f172a`.
3. Compare with any other settings screen, where the primary action is teal.

## Evidence

`apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`,
all five `bg-foreground` fills:

| Line | Surface |
|---|---|
| 229 | active sub-tab pill |
| 306 | "Manage in Stripe" |
| 486 | plan card action button |
| 860 | "Manage billing" |
| 927 | selected billing-cycle segment |

The token definitions, `apps/web/app/globals.css:4` and `:33-38`:

```css
--brand-primary: #0f766e;
--foreground: var(--brand-text);     /* #0f172a — body copy */
--accent: var(--brand-primary);      /* the tenant's brand */
--accent-strong: var(--brand-secondary);
```

The convention this screen departs from,
`apps/web/app/components/ui/button.tsx`:

```tsx
primary:
  "bg-accent text-white shadow-sm hover:bg-accent-strong disabled:opacity-70 …",
```

Hardcoded palette utilities in the component, counted by family: emerald 10,
amber 7, rose 3, slate 3. None of them is a theme token.

Measured across `apps/web/app` on 2026-09-11:

| Measure | Count |
|---|---|
| Files importing the shared UI kit | 116 |
| Files using `bg-accent` | 120 |
| Files using `bg-foreground` as a fill | 3 |
| Uses of `accent` in this component | 0 |

Two of those three outlier files are subscription screens — this component and
`settings/subscription/cancel/page.tsx`. The third is
`app/components/data-table/data-table-toolbar.tsx` and should be checked
separately rather than assumed to be the same defect.

## Root Cause

The screen was written without reaching for the shared kit, at a point when
`bg-foreground` read as "the strong neutral". It is a plausible reading of the
token name, and it is wrong: `--foreground` is defined as the tenant's text
colour, so using it as a fill silently ties every button to whatever the tenant
sets their body copy to. A tenant who brands their text dark blue gets dark blue
buttons; a tenant who brands it black gets this screen.

## Impact

Reachable in production on every tenant. Cosmetic in the narrow sense, but this
is the billing and upgrade surface, and it is the one screen where looking
unfinished costs money. White-labelling is a sold feature — Branding appears in
the plan comparison on this very screen as included in all three plans — and this
screen does not honour it.

## Affected Areas

- `/settings/subscription/{overview,plans,billing-history}`
- `/settings/subscription/cancel`
- `BillingSettingsClient` and its seven local component duplicates

## Proposed Resolution

No ExecPlan needed, but do it as one pass rather than a find-and-replace.

1. Replace the five `bg-foreground` fills with the shared `Button`,
   `variant="primary"`.
2. Replace the local `EmptyState` and `StatusChip` with the shared
   `empty-state.tsx` and `status-pill.tsx`, and delete the duplicates.
3. Move the segmented control into the shared kit, since no shared equivalent
   exists yet, and give it the radiogroup semantics [[ITEM-0159]] asks for at the
   same time.
4. Replace the palette literals with the theme's semantic tokens. Where a
   semantic token does not exist for a state, add one rather than hardcoding.
5. Check `data-table-toolbar.tsx` separately.

## Acceptance Criteria

- No primary action on a subscription screen uses `bg-foreground`.
- Changing a tenant's `--brand-primary` changes the colour of every primary
  action on these screens.
- The component imports its buttons, empty states and status pills from
  `apps/web/app/components/ui/` rather than defining its own.

## Regression Coverage

Needs a REG entry: a check that no file under
`apps/web/app/(authenticated)/settings/subscription` or `settings/billing`
uses `bg-foreground` as a fill. That is cheap to assert statically and is what
would have caught this.

## Dependencies

Overlaps [[ITEM-0159]] item 2 and [[BUG-3335]], which both rewrite the same
markup. Sequence them together.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]],
[[BUG-3335]], [[BUG-3336]], [[ITEM-0159]], [[ITEM-0161]]

## Resolution

Fixed. **There were six `bg-foreground` fills, not the five this record's
Evidence table counted** — the Architect verified this against the base
branch during the task and flagged it mid-flight. The sixth was
`apps/web/app/(authenticated)/settings/subscription/cancel/page.tsx` (the
"Back to plans" link on the checkout-cancelled screen), outside the file this
record named. Both are fixed:

- The five instances in
  `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`
  (active sub-tab pill, "Manage in Stripe", the plan card action button,
  "Manage billing", the selected billing-cycle segment) are replaced with the
  shared `Button` (`variant="primary"`, which is `bg-accent`) or, for the tab
  pill, an inline `bg-accent` class kept as a plain `Link` (not worth a
  `Button` wrapper for a nav pill).
- `settings/subscription/cancel/page.tsx`'s "Back to plans" link now uses the
  shared `Button` with `href`.
- The local `EmptyState` and `StatusChip` are deleted; the component now
  imports the shared `EmptyState` and `StatusPill` from
  `apps/web/app/components/ui/`. `StatusChip`'s tone logic moved to a small
  `resolveStatusTone` mapping function feeding `StatusPill`'s `tone` prop.
- `FeatureBadge` (the comparison table's inclusion badge) was not named in
  this record's Evidence but is the same pattern — hardcoded emerald/amber
  palette literals — and was touched anyway while rebuilding the table for
  BUG-3335, so it is now `StatusPill` too.
- The local `SegmentedControl` is extracted to
  `apps/web/app/components/ui/segmented-control.tsx` with radiogroup
  semantics (also closes ITEM-0159 item 2), and the billing-cycle control uses
  `bg-accent` for the selected option.
- `Refresh status` (not `bg-foreground`, but also a hand-rolled button) was
  converted to the shared `Button` in the same pass, consistent with "the
  component imports its buttons ... from ui/ rather than defining its own."
- `data-table-toolbar.tsx`, the third file the record's measurement named, was
  **not** checked or changed — the record explicitly asks for it to be
  checked separately, and it is outside `apps/web/settings/subscription`
  and `settings/billing`.

## QA Retest

Pending — needs a visual check on a non-default-branded tenant (e.g.
`dijipeople-demo`, teal `#0f766e`) that every primary action across
`/settings/subscription/{overview,plans,billing-history,cancel}` renders in
the brand accent colour, not black.

## History

- 2026-09-11 — reported by the owner while reviewing the live Plans screen.
- 2026-09-11 — created from user report at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.
- 2026-09-12 — fixed in `apps/web` (SESSION-0103, `agent/r-s1-billing-web`);
  a sixth `bg-foreground` instance was found outside the file this record
  named (`settings/subscription/cancel/page.tsx`) and fixed alongside the
  five the record counted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0159]]
- Modules — [[tenant-application]]
- Regression — REG-416 (see the regression register)

<!-- GRAPH:END -->
