---
SCENARIO_ID: QA-LANDING-007
aliases: [QA-LANDING-007]
TITLE: The public site meets WCAG 2.1 AA on critical and serious rules
AREA: landing
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-e-accessibility-and-layout.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-19
LAST_RESULT: PASS
CREATED_AT: 2026-08-19
UPDATED_AT: 2026-08-19
---

# QA-LANDING-007 — The public site meets WCAG 2.1 AA on critical and serious rules

## Preconditions

The landing app running. **No database and no session** — these pages are served
to anonymous visitors, and the suite is gated on `probePublicSurface` rather
than `probeEnvironment` for exactly that reason. Demanding more than a suite
uses turns a green run into an unnoticed skip.

## Steps

1. Load each of `/`, `/plans`, `/contact`, `/about` and `/partners`.
2. Run axe with the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` rule sets.
3. Collect violations and filter to `critical` and `serious` impact.
4. At 390, 768 and 1366 pixels wide, check whether
   `document.documentElement.scrollWidth` exceeds `clientWidth`.

## Expected Result

No critical or serious violation on any page, and no page scrolls the body
sideways at any of the three widths.

## Notes

**Moderate and minor violations are reported, not gated.** A first audit of a
codebase that never had one surfaces a long tail; failing on all of it at once
produces a red suite nobody can act on, which trains people to ignore CI — the
failure the pipeline exists to prevent. The tail becomes backlog items.

Horizontal body scroll is checked as a layout property rather than against a
screenshot baseline. Baselines generated on Windows do not match CI's Linux
renderer and so cannot gate; this assertion is identical on both. It is also the
defect that actually strands people — when the body scrolls, the navigation
shell slides away with it.

Verified on 2026-08-19 with local PostgreSQL stopped, which is the proof that
the precondition split works: 10 passed, and only the signed-in scenarios
skipped.
