---
PLAN_ID: PLAN-006
aliases: [PLAN-006]
TITLE: Partner Lifecycle
AREA: partner-lifecycle
STATUS: CURRENT
MODULES: [services/api/src/modules/partners, services/api/src/modules/partner-experience]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: GOOD
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0016, BUG-0019, BUG-0025]
RELATED_REGRESSIONS: [REG-014, REG-015, REG-022]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-006 — Partner Lifecycle

## Scope

Partner enquiry, onboarding review, activation, and the guards that protect a live partner from being edited back out of that state.

## Risks

- A review step implemented as a setter rather than a state machine
  (`BUG-0016`).
- A generic update route reaching the same field the state machine protects, so
  a live partner can be demoted (`BUG-0025`) — the same shape as `BUG-0011`.
- Screens with no route to reach them (`BUG-0019`).
- An enum overloaded to mean two things (`REG-022`), so partnership model and
  contracting entity type cannot be distinguished.

## Preconditions

A partner enquiry in each review state, and one activated partner.

## Test Types

`API` runs today and covers the state machine and its guards.

## Data Requirements

Synthetic partner details.

## Security Cases

Partner review is a platform-path operation. A tenant role must not reach it.

## Negative Cases

Approve twice · demote a live partner through the generic update · skip a review step · submit an enquiry with an unknown partnership model.

## State Transitions

`ENQUIRY → UNDER_REVIEW → APPROVED → ACTIVE`, plus rejection from any pre-active state. `ACTIVE` is terminal for demotion purposes.

## Integration Cases

Partner referral codes link to `lead-management`; the two areas share the attribution contract.

## Browser Cases

The partner inquiry and onboarding review screens — `BUG-0019` was that they were unreachable, which only a route-level check catches.

## Regression Links

`REG-014` · `REG-015` · `REG-022`
