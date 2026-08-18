---
SCENARIO_ID: QA-LANDING-005
aliases: [QA-LANDING-005]
TITLE: Public commercial config returns one shape on every branch
AREA: landing
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-c-landing-public-surface.spec.ts
RELATED_BUGS: [BUG-0065]
RELATED_REGRESSIONS: [REG-061]
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-LANDING-005 — Public commercial config returns one shape on every branch

## Preconditions

The API is running. The scenario is exercised twice: once with no market published, and once with a market and plans seeded via `npm run seed:config`.

## Steps

1. With no market published, request `/api/public/commercial-config` and record the top-level keys.
2. Seed a market and request it again.
3. Load the landing routes that read the config and watch the browser console.

## Expected Result

Both responses carry the same key set, `featureCatalog` included and always an array. No landing route logs a `[commercial-config]` error.

Guards BUG-0065. The two branches previously returned different shapes, and both
were structurally valid objects, so nothing caught it — it surfaced only as a
console error on six public routes, on exactly the path a freshly deployed
environment takes before markets are published. The handler's declared return
type now makes a future divergence a compile error instead.

## Notes

Created 2026-08-18 at `c332992`.
