---
ID: BUG-2149
aliases: [BUG-2149]
Title: Every dashboard metric card offers a link named only Open
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: USER_REPORT
DetectedDate: 2026-08-29
DetectedInSha: 48273a47
AffectedModules: [views, dashboard]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem: ITEM-0114
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2149 — Every dashboard metric card offers a link named only Open

> **Architect triage, 2026-08-29 — `DEFER`, batched with [[BUG-2148]].** Same
> screen, same file, same class of defect, and the lower severity of the two. It
> should not be done alone; it should not be left behind when 2148 is done.

## Summary

Every metric card on a dashboard ends with a link whose entire text is "Open".
Six cards on the Admin overview means six links with the same accessible name on
one screen. Anyone navigating by links — a screen reader's link list, or a
keyboard user tabbing through — gets "Open, Open, Open, Open, Open, Open" and no
way to tell which card each belongs to.

## Expected Behavior

A link's purpose is determinable from its name, or from its name together with a
programmatically associated context. Six links that differ only by position
satisfy neither.

## Actual Behavior

`dashboard.service.ts` sets the label to the literal string `Open` for every
metric card that has an `href`. The card's own title is a sibling element, not
an accessible name or description of the link.

## Reproduction

1. Sign in to the tenant product and open the dashboard.
2. Ask a screen reader for the list of links on the page, or tab through the
   "Operational overview" section.

Observed 2026-08-29 on `dijipeople-demo.ws.dijipeople.com`: "Active employees",
"Draft employees", "Added this month", "Active users", "Pending invitations" and
"Pending process items", each ending in "Open".

## Evidence

- `services/api/src/modules/dashboard/dashboard.service.ts:2598` — the action
  object is built with `label: 'Open'` whenever an `href` is present. The label
  is a constant; nothing derives it from the metric.

## Root Cause

The label is written once, in a shared card builder, and the builder has the
metric's title in scope at that point — so the constant is a convenience rather
than a constraint.

## Impact

Lower severity than [[BUG-2148]]: the information is present on screen and the
visual grouping is clear, so this affects assistive-technology and
keyboard-first users specifically rather than everyone. Reachable in production.

## Affected Areas

`services/api/src/modules/dashboard/dashboard.service.ts` and every dashboard
that renders metric cards in `apps/web`.

## Proposed Resolution

Either derive the label from the metric — "Open active employees" — or keep the
visible text "Open" and give the link an `aria-label` built from the card title,
which preserves the design. The second is preferable: six cards reading "Open"
is a deliberate visual rhythm, and the defect is in the accessible name, not the
visible one. The label is produced server-side, so the fix belongs either in the
API builder or in the renderer that already knows the title — deciding which is
part of the work, and putting it in the renderer keeps the API contract free of
presentation strings.

## Acceptance Criteria

- No two links on a dashboard share an accessible name unless they lead to the
  same place.
- The visible card design is unchanged, or changed deliberately.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

Raised from the same screenshot review as [[BUG-2148]] and [[ITEM-0102]].

## Resolution

Fixed, batched with BUG-2148 as the triage note on both records directed.

Fixed in the renderer, not in `dashboard.service.ts:2598`. The record left that
choice open and argued for the renderer; the argument holds — the renderer
already has the card's title in scope, and moving the string there keeps a
presentation decision out of the API contract three other clients also read.

`WidgetAction` in
`apps/web/app/components/dashboard/dashboard-widget-renderer.tsx:345` takes a
`context` prop and builds `aria-label={`${action.label} ${context}`}`, so the
six links on the overview read "Open Active employees", "Open Draft
employees", and so on. All four call sites pass `widget.title`; the visible
text is untouched, because six cards reading "Open" is a deliberate visual
rhythm and the defect was only ever the accessible name.

Covered by
`apps/web/app/components/dashboard/dashboard-widget-accessibility.spec.ts`,
which asserts the name is built from the card's own title, that no call site
is left without it — one renderer passing the title and three not would restore
the defect on three quarters of the screen — and that the visible label is
still `{action.label}`.

## QA Retest

Not yet retested.

## History

- 2026-08-29 — created from user report at `48273a47`, during a screenshot
  review of the tenant dashboard. Verified against the source before filing.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0114]]

<!-- GRAPH:END -->
