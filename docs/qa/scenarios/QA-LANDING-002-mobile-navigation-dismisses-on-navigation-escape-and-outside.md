---
SCENARIO_ID: QA-LANDING-002
aliases: [QA-LANDING-002]
TITLE: Mobile navigation dismisses on navigation escape and outside click
AREA: landing
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-c-landing-public-surface.spec.ts
RELATED_BUGS: [BUG-0062]
RELATED_REGRESSIONS: [REG-058]
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-LANDING-002 — Mobile navigation dismisses on navigation escape and outside click

## Preconditions

The landing app is running. Viewport is below the `lg` breakpoint, where the header menu is the only navigation.

## Steps

1. At 390x844, open the header menu and confirm `aria-expanded` becomes `true`.
2. Select a destination and wait for navigation to complete.
3. Re-open the menu and press Escape.
4. Re-open the menu and click outside the panel.
5. Repeat the whole sequence at 768x1024.

## Expected Result

The panel is gone after navigation — not merely visually, but absent from the DOM. Escape closes it and returns focus to the trigger. An outside click closes it. No viewport gains horizontal overflow.

Guards BUG-0062. The panel previously survived navigation because the header
lives in the root layout, which App Router never remounts, so nothing existed to
close it.

## Notes

Created 2026-08-18 at `c332992`.
