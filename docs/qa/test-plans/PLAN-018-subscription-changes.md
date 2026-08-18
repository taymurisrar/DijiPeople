---
PLAN_ID: PLAN-018
aliases: [PLAN-018]
TITLE: Seat and plan change lifecycle
AREA: subscription-changes
STATUS: CURRENT
MODULES: [billing]
RISK: CRITICAL
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: GOOD
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: []
RELATED_REGRESSIONS: []
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
VERIFIED_AGAINST_SHA: ce9bb56
---

# PLAN-018 — Seat and plan change lifecycle

## Scope

`SeatChangeService` and `PlanChangeService` — capacity and plan moves, their
timing, and the entitlement consequences of a downgrade.

**Deliberately excludes** provider proration. What Stripe charges for a
mid-period increase is WP-09 reconciliation territory.

## Risks

1. **A decrease applied immediately**, taking away capacity the customer paid
   for, or handing out an unapproved refund.
2. **A decrease that locks working people out** at renewal, long after anyone
   remembers requesting it.
3. **A stale pending decrease undoing a later increase** at renewal.
4. **A downgrade that deletes data** rather than reducing entitlement. This is
   the one that is not recoverable and the one customers actually fear.
5. **Direction decided from deprecated pricing.** `Plan.monthlyBasePrice` is
   legacy and must never decide what a customer pays — the BUG-0027 class.
6. **Two pending plan changes**, making the outcome depend on scheduler order.

## Preconditions

Real PostgreSQL with migrations through
`20260818190000_seat_plan_changes_and_tenant_readiness`. Two plans that each
have an active `PlanPrice` in the same currency and billing cycle — without
those the direction cannot be resolved and the service refuses by design.

## Test Types

| Type | Status | Note |
|---|---|---|
| DATABASE | **GOOD** | `services/api/test/seat-plan-change.e2e-spec.ts` — 9 tests |
| INTEGRATION | GAP | Stripe quantity and plan sync need test credentials — `BLOCKED_EXTERNAL` |
| API / BROWSER / E2E | GAP | The tenant-facing capacity and plan screens are WP-11 |
| SECURITY | GAP | Must prove a tenant cannot change another tenant capacity once a route exists |

## Data Requirements

Fixtures and the tenants they belong to. Never a credential.

## Security Cases

Authorization negatives, cross-tenant reads and writes, sensitive-field exposure. Mandatory where the area touches tenant data.

## Negative Cases

Invalid input, wrong state, missing permission, absent record.

## State Transitions

The legal transitions, and the illegal ones that must be rejected.

## Integration Cases

External boundaries — timeout, 5xx, malformed payload, replay, idempotency.

## Browser Cases

What a real browser would have to prove. State the tooling status honestly.

## Regression Links

REG-nnn entries this area owns, and the scenarios that implement them.
