---
ID: ITEM-0019
aliases: [ITEM-0019]
Title: No market or region model maps countries to plans, currencies and legal sets
Type: ARCHITECTURE
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/prisma, api:super-admin, apps/admin, apps/landing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0028
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0019 — No market or region model maps countries to plans, currencies and legal sets

## Summary

There is no entity describing a market. Nothing records which countries
DijiPeople sells in, which currency each is quoted in, which plans are offered
there, whether self-service checkout is permitted, which legal document set
applies, or which data region a tenant belongs to. Every one of those questions
is currently answered by a hardcoded literal or not at all.

## Why It Matters

The stated commercial plan is Pakistan first, then the US and GCC. Without a
market model, each new market is a **frontend code change and a redeploy**, and
there is no place to express the differences that actually distinguish those
markets — currency, tax treatment, applicable legal documents, whether
self-service is allowed, data residency.

It also blocks correctness elsewhere: [[BUG-0028]] cannot be fixed by moving the
currency table anywhere, because there is nowhere to move it to.

There is a live risk of over-claiming. Data residency and market availability are
customer-visible promises; modelling them is what makes it possible to state only
what is actually configured, rather than implying coverage that does not exist.

## Evidence

- No `Market`, `MarketConfiguration`, `Region` or country-to-currency model
  exists in `services/api/prisma/schema.prisma` — the commercial models present
  are `Plan`, `PlanFeature`, `PlanPrice`, `Subscription`, `Promotion`,
  `SubscriptionPromotion` (lines 3635-3860).
- `apps/landing/lib/plans.ts:48-80` — country→currency and the definition of
  "Europe" are literals in the shipped frontend bundle. See [[BUG-0028]].
- `apps/landing/lib/plans.ts:82-101` — the available currency list is derived by
  scanning whatever `PlanPrice` rows happen to exist, so "which currencies do we
  support" is an emergent property of price data rather than a decision.
- `services/api/prisma/schema.prisma:3686-3691` — `PlanPrice` has `currency` but
  no market or country association, so a price cannot be scoped to a market.
- `Tenant` has no `dataRegion` field.

## Proposed Approach

**Needs an ExecPlan.** New models, and a contract three surfaces read.

Direction — a `Market` record keyed by market code, carrying at minimum:
country code(s), enabled state, currency, offered plans, self-service
permitted, tax profile reference, legal document set reference, data region.
Published through the same lifecycle as [[ITEM-0018]] so a market can be
configured before it is opened.

Then:

- Resolve the visitor's market server-side and quote from it, deleting
  `detectRegionCurrency`.
- Scope `PlanPrice` to a market so a plan can be sold at different prices in
  different markets.
- Add `Tenant.dataRegion`, populated from the market at provisioning.

**Model Pakistan as the only enabled market**, with US/GCC present but disabled.
Do not enable a market whose tax registration, legal documents and hosting are
not actually in place — the model exists partly to make that distinction
explicit rather than implied.

## Acceptance Criteria

- Opening or closing a market is a configuration change with no code deploy.
- A disabled market is never offered self-service checkout.
- The quoted currency for a country comes from configuration, and a country with
  no configured market gets a configured default rather than a literal `"USD"`.
- `Tenant.dataRegion` is set at provisioning from the market.
- No claim about residency or availability is rendered publicly unless the
  corresponding configuration is present.

## Dependencies

Best sequenced **after** [[BUG-0027]] and [[ITEM-0018]] — those settle what a
price is and when it is live; markets then scope it. Attempting markets first
means scoping a price model that is about to change.

## Related Items

[[BUG-0028]] — hardcoded currency mapping, blocked on this.
[[ITEM-0018]] — publication lifecycle, shares the publish mechanism.
[[BUG-0027]] — duplicate price source of truth.

## History

- 2026-08-16 — created during commercial-configuration discovery at `45d00cf`.
