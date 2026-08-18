---
SCENARIO_ID: QA-LANDING-004
aliases: [QA-LANDING-004]
TITLE: Public pages expose a skip link and readable muted text
AREA: landing
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-c-landing-public-surface.spec.ts
RELATED_BUGS: [BUG-0064]
RELATED_REGRESSIONS: [REG-060]
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-LANDING-004 — Public pages expose a skip link and readable muted text

## Preconditions

The landing app is running. axe-core is available to the browser session.

## Steps

1. Load any public route and press Tab once.
2. Activate the focused element.
3. Run axe-core across the public routes at 1440x900, 768x1024 and 390x844.
4. Confirm existing focus indicators are unchanged.

## Expected Result

The first Tab focuses a visible "Skip to main content" link; activating it moves focus to `main#main-content`. axe reports no `color-contrast` violation — `--muted-soft` clears 4.5:1 against white, `--surface-muted` and `--accent-soft`, the three backgrounds it is actually used on.

Guards BUG-0064. Both failures lived in shared code — the site shell and one
design token — so they applied to every public route rather than one screen.

## Notes

Created 2026-08-18 at `c332992`.
