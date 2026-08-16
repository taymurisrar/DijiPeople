---
SCENARIO_ID: QA-RUNTIME-005
aliases: [QA-RUNTIME-005]
TITLE: A runtime module renders in a real browser for each access level
AREA: runtime-modules
MODULE: apps/web/lib/runtime
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: []
RELATED_REGRESSIONS: [REG-028]
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-RUNTIME-005 — A runtime module renders in a real browser for each access level

## Preconditions

Browser automation, which does not exist in this repository.

## Steps

1. Sign in at each access level.
2. Open each runtime module's list and record pages.
3. Exercise loading, empty, error and access-denied states.

## Expected Result

Every declared module renders, and each state renders rather than throwing.

## Notes

**No browser tooling exists in any workspace** — no Playwright, Cypress or
Puppeteer — and web/admin jest run in a node environment with no jsdom, so
component rendering is not testable either. This scenario is recorded so the
gap is visible and so it becomes runnable the day tooling lands.
`scripts/admin-runtime-smoke.mjs` is the nearest available substitute.
