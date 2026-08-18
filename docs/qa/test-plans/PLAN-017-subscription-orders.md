---
PLAN_ID: PLAN-017
aliases: [PLAN-017]
TITLE: Pre-payment orders, customer deduplication and checkout authority
AREA: subscription-orders
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
VERIFIED_AGAINST_SHA: 2051133
---

# PLAN-017 — Pre-payment orders, customer deduplication and checkout authority

## Scope

`SubscriptionOrder` and the three services behind it — `CustomerIdentityService`
(deduplication), `TaxBasisService` (tax chain), `SubscriptionOrderService`
(the order and money snapshot) — plus the public subscribe path that opens one.

**Deliberately excludes** what happens after payment. Provisioning, tenant
creation and subscription activation are WP-07 and PLAN-007.

## Risks

1. **A wrong merge.** Putting one company under another company deduplication is
   the worst outcome in this area and is not recoverable by the customer.
2. **Duplicate commercial records** from a refresh or double submit — the defect
   this package was written to fix.
3. **A client-supplied price, currency or total** being trusted.
4. **A permanently held submission hash**, which would make a company and plan
   unbuyable forever after one abandoned checkout. Caught by a DB-backed test
   during implementation.
5. **A false tax position** — recording NOT_APPLICABLE when nothing has been
   determined, or inventing a rate.
6. **A money figure that cannot be explained later** because the configuration
   it was priced against has since been republished.

## Preconditions

Real PostgreSQL with migrations through `20260818171000_subscription_order_plan_setnull`.
At least one `PlanPrice` (`seed:config`). No Stripe credential is required — the
order is opened before any provider call.

## Test Types

| Type | Status | Note |
|---|---|---|
| DATABASE | **GOOD** | `services/api/test/subscription-order.e2e-spec.ts` — 10 tests |
| SECURITY | GAP | Server-authoritative money is asserted; a tampering test that posts price/currency/total fields belongs here and is not written yet |
| INTEGRATION | GAP | Stripe session creation and reuse need test credentials — `BLOCKED_EXTERNAL` |
| E2E / BROWSER | GAP | The `/subscribe` journey is WP-10 |
| UNIT | GAP | The behaviours worth pinning are constraint- and Decimal-shaped and live in the DB suite |

## Data Requirements

Fixtures and the tenants they belong to. Never a credential.

## Security Cases

- A submission that posts `unitAmount`, `currency`, `totalAmount` or a Stripe
  price id must have those fields ignored; the DTO does not declare them and
  `forbidNonWhitelisted` rejects unknown fields with a 400.
- The public endpoint is rate-limited.
- An order must never be readable by a customer other than its owner. No read
  route exists yet, which is why this row is PARTIAL rather than GOOD.

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
