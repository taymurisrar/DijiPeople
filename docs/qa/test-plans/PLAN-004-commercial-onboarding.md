---
PLAN_ID: PLAN-004
aliases: [PLAN-004]
TITLE: Commercial Onboarding
AREA: commercial-onboarding
STATUS: CURRENT
MODULES: [services/api/src/modules/contracts, services/api/src/modules/onboarding, services/api/src/modules/super-admin]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: PARTIAL
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: PARTIAL
COVERAGE_BROWSER: PARTIAL
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0011, BUG-0012, BUG-0024]
RELATED_REGRESSIONS: [REG-009, REG-010]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-004 — Commercial Onboarding

## Scope

Lead conversion into a signed agreement, the onboarding record it creates, and the bootstrap that turns both into a provisioned customer. Ends where `tenant-provisioning` begins.

## Risks

- A signed agreement remaining editable, which defeats the conversion gate
  (`BUG-0011`).
- An onboarding record created in a state its own rules forbid editing
  (`BUG-0012`) — the `unvalidated-seed-state` pattern.
- A declared step with no caller (`BUG-0024`), so the flow looks complete and
  never runs.

## Preconditions

A lead in a convertible state, a plan with current pricing, and the seeded platform workflows.

## Test Types

`API` runs today. `E2E` bootstrap needs a live database. `BROWSER_E2E` runs — `flow-a-commercial-onboarding.spec.ts`.

## Data Requirements

One lead, one plan, one agreement template. No real customer names.

## Security Cases

Conversion is a platform-path operation; confirm a tenant role cannot reach it.

## Negative Cases

Convert a lead twice · edit a signed agreement · convert with a plan that has no price · advance onboarding out of order.

## State Transitions

`LEAD → CONVERTED → AGREEMENT_SIGNED → ONBOARDING → PROVISIONED`. Backwards transitions are rejected.

## Integration Cases

Stripe is reached during bootstrap; failures there must leave a retryable state rather than a half-created customer.

## Browser Cases

`e2e/tests/flow-a-commercial-onboarding.spec.ts` walks this journey in a real
browser. Playwright is **installed**, in the `e2e` workspace — `@playwright/test` with
two journey specs, run in CI as `browser-e2e-report` (report-only, not a gate).
`npm run test:browser`, and `npm run test:browser:install` first.

It covers the happy path only; the negative cases in this plan — converting a
lead twice, editing a signed agreement through the UI — are not yet scripted,
which is why the dimension is `PARTIAL` rather than `GOOD`.

## Regression Links

`REG-009` · `REG-010`
