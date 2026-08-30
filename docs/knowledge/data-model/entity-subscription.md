---
aliases: [Subscription]
type: entity
model: Subscription
last_verified: 2026-08-30
---

# Subscription

## Purpose

What a tenant is entitled to, and what it is billed. `Subscription` is the join
between the commercial side ([[entity-customer-account|CustomerAccount]], `Plan`,
`PlanPrice`) and the operational side ([[entity-tenant|Tenant]]) — and it is the
model Stripe writes into.

## One per tenant, enforced by the schema

`tenantId` carries a **field-level `@unique`**, not the usual
`@@index([tenantId])`. That makes it strictly one subscription per tenant, and it
is why [[entity-tenant|Tenant]] declares `subscription` as a singular relation
rather than a list.

Consequences worth knowing before designing anything around it: there is no
subscription history on this model — a plan change mutates the row — and a tenant
cannot hold two concurrent subscriptions. History lives in
`PlanChangeRequest`, `SeatChangeRequest` and `SubscriptionCancellation`.

## Stripe is a second writer

Eleven fields exist only to mirror Stripe: `stripeCustomerId`,
`stripeSubscriptionId`, `stripeSubscriptionItemId`, `stripeQuantity`,
`stripeCheckoutSessionId`, `stripeLatestInvoiceId`, `stripeStatus`,
`currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`,
`lastStripeEventCreatedAt`.

`lastStripeEventCreatedAt` is the one that matters operationally: webhooks
arrive out of order, and it is what lets a late event be discarded instead of
overwriting a newer state. `seatsLastReconciledAt` plays the same role for the
seat count.

**`stripeStatus` and `status` are not the same field.** `stripeStatus` is
whatever Stripe last said, unmapped. `status` is the platform's own
`SubscriptionStatus`. Read `status`.

## `CANCELLED` and `CANCELED` are both real values

`SubscriptionStatus` contains **both spellings**, and both are written:

- `billing` — the Stripe path (`cancellation.service.ts`,
  `webhook.service.ts:1414`) — writes **`CANCELED`**, mirroring Stripe.
- `tenant-control-plane` (`tenant-control-plane.service.ts:509`) writes
  **`CANCELLED`**.

`SubscriptionStatus` is the only enum in the schema that does this; every other
cancelled state in the codebase uses the double-L spelling.

Nothing is currently broken by it, because almost every reader filters
*positively* on `ACTIVE` or `TRIALING`, and the one place that tests for
cancellation — `tenant-control-plane.service.ts:489-490` — already checks both.
That is a trap sitting one careless equality check away from a live defect: a
query for `status: 'CANCELLED'` silently returns none of the Stripe-cancelled
subscriptions. See [[contradictions]].

**Any new code that compares against a cancelled state must handle both, or
filter positively instead.**

## Seats

`purchasedSeats` is what is paid for. `scheduledSeats` and
`scheduledSeatsEffectiveAt` hold a change that has not taken effect yet — a
downgrade at period end, typically. `stripeQuantity` is Stripe's view, which
`seatsLastReconciledAt` records the last agreement with.

Four numbers describing seat count is a lot, and the distinction between
"purchased", "scheduled" and "what Stripe thinks" is exactly where an
off-by-one becomes an incorrect invoice.

## Pricing

`basePrice`, `discountType`, `discountValue` and `finalPrice` are all stored.
`finalPrice` is **computed and persisted**, not derived at read time, so a
discount change must recompute it.

All are `Decimal`. Never accept any of them from a client, and never recompute a
price from a value the client sent — the server is the only authority on what
something costs.

## Security

Tenant-scoped, but the interesting reads are platform-side: `super-admin` and
`billing` list subscriptions across tenants and must be platform-guarded.
`stripeCustomerId` and `stripeSubscriptionId` are integration identifiers — they
are not secrets, but they identify a paying customer and do not belong in a
tenant-facing response.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.subscription` |
| Owning module | `services/api/src/modules/billing` |
| Domain | Commercial |
| Also touched by | `super-admin`, `tenant-control-plane`, `tenants`, `platform-runtime` (reads), `lookups` (reads), `tenant-settings` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `planId` | `String` | yes | — |
| `planPriceId` | `String` | no | — |
| `billingCycle` | `BillingCycle` (enum) | yes | default `MONTHLY` |
| `basePrice` | `Decimal` | yes | default `0`, decimal(12,2) |
| `discountType` | `DiscountType` (enum) | yes | default `NONE` |
| `discountValue` | `Decimal` | yes | default `0`, decimal(12,2) |
| `discountReason` | `String` | no | — |
| `finalPrice` | `Decimal` | yes | default `0`, decimal(12,2) |
| `currency` | `String` | yes | default `"USD"` |
| `status` | `SubscriptionStatus` (enum) | yes | default `TRIALING` |
| `startDate` | `DateTime` | yes | — |
| `endDate` | `DateTime` | no | — |
| `renewalDate` | `DateTime` | no | — |
| `autoRenew` | `Boolean` | yes | default `true` |
| `stripeCustomerId` | `String` | no | — |
| `stripeSubscriptionId` | `String` | no | unique |
| `stripeSubscriptionItemId` | `String` | no | — |
| `purchasedSeats` | `Int` | yes | default `1` |
| `scheduledSeats` | `Int` | no | — |
| `scheduledSeatsEffectiveAt` | `DateTime` | no | — |
| `stripeQuantity` | `Int` | no | — |
| `seatsLastReconciledAt` | `DateTime` | no | — |
| `lastStripeEventCreatedAt` | `DateTime` | no | — |
| `stripeCheckoutSessionId` | `String` | no | — |
| `stripeLatestInvoiceId` | `String` | no | — |
| `stripeStatus` | `String` | no | — |
| `currentPeriodStart` | `DateTime` | no | — |
| `currentPeriodEnd` | `DateTime` | no | — |
| `cancelAtPeriodEnd` | `Boolean` | yes | default `false` |
| `canceledAt` | `DateTime` | no | — |
| `trialStart` | `DateTime` | no | — |
| `trialEnd` | `DateTime` | no | — |

### States

- `billingCycle` — `BillingCycle`: `MONTHLY`, `ANNUAL`
- `discountType` — `DiscountType`: `NONE`, `PERCENTAGE`, `FLAT`
- `status` — `SubscriptionStatus`: `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `CANCELED`, `UNPAID`, `INCOMPLETE`, `EXPIRED`, `PAUSED`

### Relationships

**Belongs to** — this model holds the foreign key

- `Plan` via `plan` — `onDelete: Restrict`
- `PlanPrice` via `planPrice` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `Invoice` via `invoices`[]
- `Payment` via `payments`[]
- `SupportCase` via `supportCases`[]
- `Contract` via `contracts`[]
- `Promotion` via `promotions`[]
- `SubscriptionPromotion` via `promotionApplications`[]
- `SeatUsageSample` via `seatUsageSamples`[]
- `SeatUsagePeriod` via `seatUsagePeriods`[]
- `SeatOverageEvent` via `seatOverageEvents`[]
- `SeatChangeRequest` via `seatChangeRequests`[]
- `PlanChangeRequest` via `planChangeRequests`[]
- `SubscriptionCancellation` via `cancellations`[]
- `SubscriptionOrder` via `subscriptionOrders`[]

### Constraints and indexes

- Unique: `tenantId`, `stripeSubscriptionId`
- Indexes: 6
<!-- /GENERATED:schema-facts -->

## Related

[[entity-tenant|Tenant]] · [[entity-customer-account|CustomerAccount]] ·
[[billing]] · [[contradictions]] · [[tenant-lifecycle]] ·
[[data-model-overview]] · [[domain-map]]
