---
SCENARIO_ID: QA-ONBOARD-006
aliases: [QA-ONBOARD-006]
TITLE: Market configuration determines sellable currency
AREA: commercial-onboarding
MODULE: services/api/src/modules/billing
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/billing/commercial-offer.resolver.spec.ts
RELATED_BUGS: [BUG-0028]
RELATED_REGRESSIONS: [REG-018]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-ONBOARD-006 — Market configuration determines sellable currency

## Preconditions

Published markets with explicit country and currency configuration.

## Steps

1. Resolve an offer for a configured visitor country.
2. Resolve an unknown country through the published default market.
3. Attempt to buy in an unsupported or unscoped currency.

## Expected Result

The server selects a sellable configured currency. Unsupported and unscoped
prices are refused rather than treated as global defaults.

## Notes

Reusable coverage for `REG-018`. The named API spec passed in GitHub Actions
run `32009837400`.
