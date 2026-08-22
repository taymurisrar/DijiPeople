---
ID: BUG-0495
aliases: [BUG-0495]
Title: The console painted light on every load before the dark theme arrived
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 098a0e6
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-198
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-commands-monitoring-bulk-delete
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0495 — The console painted light on every load before the dark theme arrived

## Summary

Every operator whose theme is Dark saw a light-themed page on every full load,
until React hydrated and repainted it. The console's own screenshots show one
page dark and the next light on the same session.

## Expected Behavior

The page is painted in the operator's theme the first time it is painted.

## Actual Behavior

`ConsolePreferencesApplier` writes `data-admin-scheme` from a `useEffect`, which
runs after the first paint. The server emitted no theme attribute at all, every
dark rule in `globals.css` keys on one, and `<body>` carried a hardcoded
`bg-slate-100 text-slate-950`.

## Reproduction

1. Set the theme to Dark.
2. Hard-reload any console page and watch the first frame.

## Evidence

- `apps/admin/app/_components/console-preferences-applier.tsx` — the effect, and
  a doc comment claiming the attributes are written "before the first paint an
  operator notices". True of a client navigation, false of every initial load.
- `apps/admin/app/layout.tsx` — no attribute, no bootstrap, hardcoded light body.

## Root Cause

The preference lives in the API, and the layout that renders `<html>` sits
outside the route group that fetches it — so the only element that can be
stamped before paint had no way to learn what to stamp. The effect was the only
place left, and an effect is by definition after the paint.

Compounding it, `SYSTEM` resolution needs `matchMedia`, which does not exist on
the server, so no amount of server-side work resolves that third state alone.

## Impact

Every dark-preference operator, every full page load. Cosmetic, and constant —
and it makes the preference look broken, which is what [[BUG-0420]] already
cost once.

## Affected Areas

`apps/admin` — the root layout, the preferences module.

## Proposed Resolution

A cookie carrying the preference across the boundary the API cannot, read by the
root layout to stamp `data-admin-theme`; plus a small blocking inline script in
`<head>` that resolves SYSTEM against `matchMedia` and sets
`data-admin-scheme` before anything paints. The body's colours come from the
theme tokens.

The cookie is a rendering hint and nothing else — no decision is made from it,
so a forged value costs the forger a wrongly-coloured page.

## Acceptance Criteria

- No light frame on a full load with Dark selected.
- SYSTEM follows the machine, resolved before paint.
- Switching Dark → System removes the pinned attribute rather than leaving it.
- A browser refusing cookies or `matchMedia` still renders the console.

## Regression Coverage

REG-198 — `apps/admin/lib/console-theme-bootstrap.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0420]] — the theme that repainted nothing. This is the same setting
failing one layer earlier.

## Resolution

Fixed on `agent/tenant-commands-monitoring-bulk-delete`.

## QA Retest

Not observed in a browser — and the first frame is precisely what no test here
can see.

## History

- 2026-08-22 — reported as "fix the dark theme issues", with screenshots showing
  one page dark and another light in the same session.
