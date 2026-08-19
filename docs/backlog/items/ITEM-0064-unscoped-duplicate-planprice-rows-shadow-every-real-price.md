---
ID: ITEM-0064
aliases: [ITEM-0064]
Title: Unscoped duplicate PlanPrice rows shadow every real price
Type: TECH_DEBT
Status: NEW
Priority: P3
Severity: LOW
AffectedModules: [billing, super-admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0064 — Unscoped duplicate PlanPrice rows shadow every real price

## Summary

Every plan/cycle combination has **two** active `PUBLISHED` prices: one scoped to
the Pakistan market, and one with `marketId = NULL`. Six of each in both the
development database and a freshly seeded one.

**Nothing can be bought at the unscoped price.**
`commercial-offer.resolver.ts:274` filters `price.marketId === sellableMarket.id`,
so a null-market row is never a candidate. It is detected only at :284, to return
`PRICE_NOT_MARKET_SCOPED` instead of `NO_PUBLISHED_PRICE` — a better error, which
is the whole reason the branch exists.

## Why It Matters

Low severity, filed as such: no customer can be quoted or charged from these
rows. The costs are all operator-facing.

1. **`bootstrapCommercialDefaults` warns on every run.** Its own comment says an
   unscoped active price "makes the slot look occupied while nothing is actually
   purchasable". Six warnings that are always present are six warnings nobody
   reads, which is how a real one gets missed.
2. **They mask a genuine misconfiguration.** If a market-scoped price were ever
   deleted, the resolver would report `PRICE_NOT_MARKET_SCOPED` — pointing the
   operator at these rows rather than at the missing one.
3. **They are visible in Platform Admin** as duplicate prices with no market,
   which invites somebody to "fix" the wrong row.

## Evidence

Verified 2026-08-20 against two databases.

| database | scoped PUBLISHED | unscoped PUBLISHED | unscoped amounts |
|---|---|---|---|
| `dijipeople` (development) | 6 | 6 | 199.00 – 8990.00, i.e. the real figures |
| `dijipeople_t8_test` (fresh) | 6 | 6 | all `0.00` |

The zero amounts in the fresh database are an artefact of seed ordering in that
throwaway, not a general fact — worth stating because a zero-amount published
price looks alarming and is the first thing a reader will latch onto.

Provenance is not established. They predate this session's work and were not
created by `bootstrapCommercialDefaults`, which always sets `marketId`. The
likely source is the legacy path removed by BUG-0030, where
`SuperAdminService.listPlans()` created prices as a side effect of a read.

## Proposed Approach

No ExecPlan. A short script that deactivates active `PlanPrice` rows with
`marketId = NULL`, run per environment after confirming no scoped equivalent is
missing.

Deactivate rather than delete: a price is a commercial record, and a
`SubscriptionOrder` may carry `planPriceId` pointing at one. `PlanPrice` uses
`SetNull` from orders, so a delete would silently detach a paid order from what
it was priced against.

Worth pairing with a guard in `bootstrapCommercialDefaults` that promotes the
existing warning to a hard failure once the known rows are cleared, so the next
one cannot accumulate silently.

## Acceptance Criteria

- No active `PlanPrice` row has `marketId = NULL` in any environment.
- `bootstrapCommercialDefaults` emits zero warnings on a fresh seed.
- No `SubscriptionOrder.planPriceId` is orphaned by the cleanup.

## Dependencies

None. Found while adding the placeholder PKR schedule under TASK-0008.

## Related Items

[[TASK-0008]] · [[BUG-0030]]

## History

- 2026-08-20 — found while verifying that draft PKR prices could not be sold. The
  check that proved the PKR drafts safe is the same one that revealed these:
  both hinge on the resolver only ever selecting a market-scoped price.
