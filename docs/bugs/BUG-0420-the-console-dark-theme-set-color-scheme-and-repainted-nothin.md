---
ID: BUG-0420
aliases: [BUG-0420]
Title: The console dark theme set color-scheme and repainted nothing
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: fb7c771
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-187
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0420 — The console dark theme set color-scheme and repainted nothing

## Summary

The console's dark theme consisted of two rules setting `color-scheme: dark`.
That repaints what the browser draws — scrollbars, the date picker, a select's
dropdown, the canvas — and repaints nothing the console draws, because every
surface is a hardcoded light utility: 348 `bg-white`, 450 `border-slate-200`,
338 `text-slate-500`.

## Expected Behavior

Choosing Dark makes the console dark. Choosing "follow the system" follows it,
including when the system changes while the console is open.

## Actual Behavior

Dark scrollbars and dark form-control internals on a white application, with
inputs rendering light text on their own light backgrounds. `SYSTEM` resolved
once at load and never again.

## Reproduction

1. Open Platform Admin → preferences → theme → Dark.
2. Every card, table and page stays white; form controls invert.
3. Set the preference to System, then switch the machine to dark. Nothing
   changes until the page is reloaded.

## Evidence

- `apps/admin/app/globals.css` — `html[data-admin-theme="dark"] { color-scheme:
  dark; }` and the matching media query were the whole theme.
- `grep -rho "bg-white|border-slate-200|text-slate-500" apps/admin` — 1,136
  hardcoded light utilities across the app.

## Root Cause

`color-scheme` was mistaken for a theme. It is a declaration to the browser
about widgets the browser owns; it has no effect on author-styled surfaces.

A setting that exists, persists and does nothing is worse than an absent one: it
is believed, and the failure is attributed to the display rather than the code.

## Impact

Every operator who chooses Dark. Not data-affecting; badly legibility-affecting,
and it discredits the preferences screen.

## Affected Areas

`apps/admin` — `app/globals.css`, `lib/console-preferences.ts`,
`app/_components/console-preferences-applier.tsx`.

## Proposed Resolution

Resolve the three-value preference to a two-value `data-admin-scheme` attribute
so the stylesheet has one selector to key on, subscribe to
`prefers-color-scheme` so SYSTEM keeps following, and remap the palette at its
source using the attribute-selector technique the file already establishes.

Remapping rather than tokenising ~1,900 call sites is a deliberate trade, stated
on the record: it is one file and no component edited. Arbitrary colour values
and the tinted status pills are **not** covered — the pills stay legible because
each pairs a light tint with dark text of the same hue.

The contract document sheet stays white. A contract is paper; what an author
sees must be what the counterparty receives.

## Acceptance Criteria

- Every shell surface, card, table, border and text level repaints in dark.
- SYSTEM follows a machine that changes theme while the console is open.
- LIGHT pins light on a dark machine and DARK pins dark on a light one.
- The contract document sheet remains white in every theme.

## Regression Coverage

REG-187 — `apps/admin/lib/console-theme.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0315]] — the preference that was stored and never applied. This is the
same failure one layer down: applied, and applying nothing.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Not opened in a browser. The stylesheet is asserted structurally; contrast on
each surface is unobserved.

## History

- 2026-08-22 — reported as "Fix the light/dark theme issue".
