---
ID: BUG-2148
aliases: [BUG-2148]
Title: Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-08-29
DetectedInSha: 48273a47
AffectedModules: [views, dashboard]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-336
RelatedBacklogItem: ITEM-0114
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2148 — Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology

> **Architect triage, 2026-08-29 — `DEFER`.** Real, small and not what the owner
> asked for. It was found while reviewing screenshots supplied alongside
> [[ITEM-0102]], and folding an unrequested dashboard fix into that branch would
> widen a scoped UI move into an accessibility pass on a different module.
>
> Deferred *to be batched with* [[BUG-2149]], not deferred on merit: both live in
> `dashboard-widget-renderer.tsx`, both are accessible-name defects, and doing
> them in one pass costs barely more than doing either. Recommended as the next
> piece of work on this shell.

## Summary

Every dashboard widget carries a small coloured circle in its top-right corner
that reports the widget's state — grey for neutral, amber for a warning, green
for good, red for critical. The circle is the only thing that reports it, and it
is marked `aria-hidden`. A sighted user who cannot distinguish those colours,
and every user of a screen reader, receives no state at all.

The same file already contains the accessible form of the same idea —
`SeverityPill`, which renders the severity as text — and uses it for the rows
inside a list widget. The dot is the older half of the pattern.

## Expected Behavior

A widget's severity is available as text, or as an accessible name, wherever it
is available as colour. AGENTS.md states the rule directly: never encode meaning
in colour alone, and `StatusPill` carries text for exactly this reason.

## Actual Behavior

`SeverityDot` renders a `span` that is `aria-hidden`, whose only distinguishing
property is a background colour class. The severity reaches sighted users as hue
and reaches assistive technology not at all.

## Reproduction

1. Sign in to the tenant product and open the dashboard.
2. Reach a state where a widget is not neutral — an incomplete onboarding
   checklist or an outstanding profile gap will do it; see the API references
   below.
3. Inspect the dot in the widget header, or listen to the widget with a screen
   reader.

Observed 2026-08-29 on `dijipeople-demo.ws.dijipeople.com`, from a screenshot of
the Admin dashboard: six "Operational overview" cards, each with a grey dot and
no other state indicator.

## Evidence

- `apps/web/app/components/dashboard/dashboard-widget-renderer.tsx:395-412` —
  `SeverityDot`; the colour class is the entire output and the span is
  `aria-hidden`.
- Same file, lines 192 and 340 — the two widget kinds that render it.
- Same file, lines 415 onward — `SeverityPill`, which renders a text label for
  the same `DashboardSeverity` union and is used at line 281.
- `services/api/src/modules/dashboard/dashboard.service.ts:2668`, `:2700`,
  `:2714` — the server does emit `warning` and `good`, so the dot is not
  decorative in practice.

## Root Cause

Not established beyond the obvious: the dot was written as decoration beside a
number, and the number was assumed to carry the meaning. It does not — the
number is the metric, the dot is the judgement about it.

## Impact

Every authenticated user of the tenant product sees this on the first screen
after sign-in. It is reachable in production today. It is not a data or
authorization defect; it is a legibility one, on the most-visited screen in the
product.

## Affected Areas

`apps/web/app/components/dashboard/dashboard-widget-renderer.tsx`, every role
dashboard, and the `dashboard` API module that supplies the severities.

## Proposed Resolution

No ExecPlan needed. Give the dot an accessible name rather than replacing it —
the visual design is fine and the pill would be heavier in a card header. A
visually hidden label beside the dot, or `role="img"` with an `aria-label`
derived from the same map `SeverityPill` already owns, resolves both halves.
Deriving the text from one shared map is the point: two maps would drift.

## Acceptance Criteria

- A non-neutral widget announces its severity as text to a screen reader.
- The severity is distinguishable without relying on hue.
- `SeverityDot` and `SeverityPill` take their labels from one source.

## Regression Coverage

None yet. A source-reading assertion that `SeverityDot` is not `aria-hidden`
without a name would hold it, in the style of
`apps/web/app/components/workspace-shell-headings.spec.ts`.

## Dependencies

None.

## Related Items

Raised from the same screenshot review as [[BUG-2149]] and [[ITEM-0102]]. Same
class of defect as [[BUG-1673]], which fixed the shell's headings.

## Resolution

Fixed, batched with BUG-2149 as the triage note directed — same file, same
class of defect, and the second cost almost nothing once the first was open.

`SeverityDot` in
`apps/web/app/components/dashboard/dashboard-widget-renderer.tsx` now renders
`role="img"` with `aria-label={`Status: ${SEVERITY_LABELS[severity]}`}` and no
`aria-hidden`. The dot is named rather than replaced by `SeverityPill`, for the
reason the record gave: the visual design is right and a pill in a card header
would be heavier than the header wants.

`SEVERITY_LABELS` is one map, declared once and read by both the dot and the
pill. That was the more important half. The two were separate copies of an
answer to the same question about the same union, and the dot's copy had
already stopped being a copy — it held colour classes where the pill held
words, which is exactly how the defect existed at all. `SEVERITY_DOT_COLORS`
sits beside it as the presentational half, keyed by the same union so a new
member cannot be added to one and forgotten in the other.

Covered by
`apps/web/app/components/dashboard/dashboard-widget-accessibility.spec.ts`,
which asserts the `aria-hidden` literal is gone, that the dot has a name, that
`SEVERITY_LABELS` is declared exactly once and read at least twice, and that
every member of `DashboardSeverity` has an entry. Source-reading, in the style
this record proposed and for the reason it gave: `apps/web` runs jest with no
jsdom.

## QA Retest

Not yet retested.

## History

- 2026-08-29 — created from user report at `48273a47`, during a screenshot
  review of the tenant dashboard. Verified against the source before filing.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0114]]

<!-- GRAPH:END -->
