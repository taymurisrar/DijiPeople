---
SCENARIO_ID: QA-RUNTIME-005
aliases: [QA-RUNTIME-005]
TITLE: A runtime module renders in a real browser for each access level
AREA: runtime-modules
MODULE: apps/web/lib/runtime
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: MANUAL
TEST_REFERENCE: 
RELATED_BUGS: []
RELATED_REGRESSIONS: [REG-028]
LAST_RUN: 
LAST_RESULT: NOT_RUN
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-RUNTIME-005 — A runtime module renders in a real browser for each access level

## Preconditions

Playwright, installed in the `e2e` workspace, and a running web app.

## Steps

1. Sign in at each access level.
2. Open each runtime module's list and record pages.
3. Exercise loading, empty, error and access-denied states.

## Expected Result

Every declared module renders, and each state renders rather than throwing.

## Notes

Playwright **is** installed — `e2e/`, run in CI as the required `browser-e2e`
job. No spec covers a runtime module yet, so this is a manual check
rather than a blocked one: the blocker is an unwritten test, not missing
tooling. Web and admin jest still run in a node environment with no jsdom, so
component rendering remains untestable there.
`scripts/admin-runtime-smoke.mjs` is the nearest automated substitute.
