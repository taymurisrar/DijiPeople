# ExecPlan — Per-seat public pricing, with flat as a sales-assisted instrument

> Written for [[BUG-0080]] under [[TASK-0010]] WP-08. Required by
> [`PLANS.md`](../../PLANS.md) on three triggers: **database migration with
> meaningful impact** (a uniqueness rule changes), **integrations** (Stripe
> prices, two new presentment currencies), and **large refactor** (more than ten
> files).

CONTEXT_FILES_REQUIRED:
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/branch-model.md`
  - `services/api/prisma/AGENTS.md`
  - `docs/architecture/settings-and-branding.md` — currency formatting

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — the resolver's channel filtering, the catalog restructure.
  - Database — a uniqueness rule changes; a country row must move between markets.
  - Integration — Stripe price objects, PKR and QAR presentment.
  - Security — none of this is tenant-owned, but the public resolver decides
    what a stranger can buy and at what price.
  - QA — arithmetic invariants, and proof that a flat price cannot be bought
    self-service.
  - Frontend — the landing pricing page and wizard estimate change shape.
DELIBERATELY_NOT_USED:
  - Release/DevOps — `develop` only. The owner has held the merge to `main`.

SINGLE_WRITER_FILES:
  - `services/api/prisma/schema.prisma` — lease held by SESSION-0022.

---

## Objective

DijiPeople sells **per active employee** on the public site and through
self-service checkout, and **flat per plan** only when a salesperson arranges
it. Both models exist simultaneously for the same plan, market, cycle and
currency; the channel decides which one a caller can see. Three markets are
priced in their own currencies — Pakistan in PKR, Qatar in QAR, International in
USD — and a fourth plan, Enterprise+, exists as custom-contract only.

When this is done, a visitor to the landing site is quoted a per-seat price with
a minimum seat commitment, an operator in Platform Admin can quote either model,
and no combination of the two can be reached by the wrong channel.

## Business requirement

Supplied by the owner on 2026-08-20 as a complete price schedule, with three
decisions recorded through `AskUserQuestion`:

1. **Markets** — Pakistan's default currency moves to PKR; Qatar becomes its own
   launched market in QAR; International becomes a launched USD market. `US` and
   `GCC` stay planned and disabled, so nothing that was closed silently opens.
2. **Flat access** — flat prices are seeded, published and visible in Platform
   Admin, carrying `salesModel: SALES_ASSISTED`. The public offer resolver
   already refuses those with `SALES_ASSISTED_ONLY`.
3. **The spread** — flat is a ~60% premium at the top of the Starter band and a
   ~69% discount at the top of the Enterprise band. Confirmed intended: flat is
   an enterprise instrument bought for predictability.

### Flat model — included employees, and the price

| Plan | Included | PKR / mo | PKR / yr | USD / mo | USD / yr | QAR / mo | QAR / yr |
|---|---:|---:|---:|---:|---:|---:|---:|
| Starter | 25 | 12,000 | 120,000 | 69 | 690 | 249 | 2,490 |
| Growth | 100 | 30,000 | 300,000 | 165 | 1,650 | 599 | 5,990 |
| Enterprise | 250 | 70,000 | 700,000 | 385 | 3,850 | 1,399 | 13,990 |
| Enterprise+ | 250+ | custom | custom | custom | custom | custom | custom |

### Per-seat model — the public one

| Plan | Min seats | PKR / seat / mo | PKR / yr | USD / seat / mo | USD / yr | QAR / seat / mo | QAR / yr |
|---|---:|---:|---:|---:|---:|---:|---:|
| Starter | 10 | 300 | 3,000 | 2.20 | 22 | 8 | 80 |
| Growth | 25 | 550 | 5,500 | 3.85 | 38.50 | 14 | 140 |
| Enterprise | 50 | 900 | 9,000 | 6.05 | 60.50 | 22 | 220 |

### Flat overage — charged per employee above the included count

| Plan | PKR | QAR | USD |
|---|---:|---:|---:|
| Starter | 350 | 9 | 2.50 |
| Growth | 350 | 9 | 2.50 |
| Enterprise | 500 | 12 | 3.50 |

### Rules

- Annual price is exactly **monthly × 10** — a 16.67% discount, two months free.
- Per-seat plans bill at least `minimumSeats`, even below that headcount.
- Flat plans bill overage per employee above `includedSeats`.
- Enterprise+ is custom; it carries no price row.

**Verified arithmetic.** Every annual figure is exactly ten times its monthly
figure, and every stated minimum charge equals `minimumSeats × seat price`, in
all three currencies and both cycles. Checked before any code was written; the
schedule is internally consistent.

## Existing behavior

- `services/api/src/modules/super-admin/commercial-bootstrap.ts:352` seeds every
  price `BillingModel.FLAT`, at the USD amounts in `plans.catalog.ts`
  (199 / 399 / 899 monthly). Those figures were chosen for testing.
- `markets.catalog.ts` defines three markets: `PK` (**default USD**, supporting
  PKR), `US` (planned, disabled), `GCC` (planned, disabled, listing QAR among
  supported currencies and `QA` among its countries).
- `commercial-offer.resolver.ts:271` filters candidate prices by plan, market,
  currency and interval — **not by billing model and not by sales model** —
  then `selectEffectivePrice` (line ~198) picks one by `effectiveFrom` DESC,
  `version` DESC, and only then is the sales model checked at line 313.
- `billing-seat-pricing.ts:52` already multiplies by seat count for `PER_SEAT`
  and sends `quantity` to Stripe accordingly. The per-seat path is complete and
  dormant.
- `PlanPrice` already carries `minimumSeats`, `maximumSeats`, `includedSeats`
  and `salesModel`. Only `billingModel` disagreed with the intent.

**What must keep working.** `deriveCheckoutReadiness` must continue to refuse
any price that is not a verified, synced, active Stripe price — that is the
guard which makes a seeded price unbuyable, and it is what has kept the invented
figures safe. See `billing-seat-pricing.ts:70`.

## Existing architecture

| Concern | Home |
|---|---|
| Plan definitions | `super-admin/plans.catalog.ts` |
| Market definitions and placeholder prices | `super-admin/markets.catalog.ts` |
| Idempotent seeding | `super-admin/commercial-bootstrap.ts` |
| Offer resolution, one set of rules for every channel | `billing/commercial-offer.resolver.ts` |
| Seat arithmetic and Stripe quantity | `billing/billing-seat-pricing.ts` |
| Checkout readiness | `billing/billing-seat-pricing.ts` — `deriveCheckoutReadiness` |
| Public plan listing | `billing/services/commercial-config.service.ts` |
| Landing presentation | `apps/landing/lib/plans.ts` |

The pattern to follow: **one resolver, every channel**, stated at
`commercial-config.service.ts:27`. This change must not add a second resolution
path for operators.

## Requirements

1. Seeded public prices are `PER_SEAT`, at the per-seat schedule above, carrying
   the stated `minimumSeats` and `salesModel: SELF_SERVICE`.
2. Seeded flat prices exist for the same plan, market, cycle and currency,
   carrying `includedSeats`, an overage rate, and `salesModel: SALES_ASSISTED`.
3. A self-service caller can never be quoted or sold a flat price.
4. An operator can request either model explicitly and get the one requested.
5. Where both exist, self-service resolution is **deterministic** — it must not
   depend on which row was written first.
6. Pakistan resolves in PKR, Qatar in QAR, International in USD.
7. Qatar's country code belongs to the Qatar market, not to GCC.
8. Enterprise+ exists, is `CUSTOM_ONLY`, and carries no price.
9. Annual price equals monthly × 10 for every seeded price — asserted, not
   assumed.
10. The Terms of Service describe per-seat self-service billing and the
    availability of flat terms, and are published by `npm run release:api`.

## Dependencies

- **Stripe presentment support for PKR and QAR must be confirmed on the account
  before any price is synced.** Nothing in this repository can establish it.
  Blocking for *selling* in those currencies; not blocking for seeding, because
  `deriveCheckoutReadiness` refuses an unsynced price.
- The owner's merge hold on `main` remains; this lands on `develop`.

## Files / modules affected

**services/api**
- `prisma/schema.prisma` — **SINGLE-WRITER**, lease held
- `prisma/migrations/<ts>_planprice_billing_model_uniqueness_and_overage/`
- `src/modules/super-admin/plans.catalog.ts`
- `src/modules/super-admin/markets.catalog.ts`
- `src/modules/super-admin/pricing.catalog.ts` — new
- `src/modules/super-admin/commercial-bootstrap.ts`
- `src/modules/billing/commercial-offer.resolver.ts`
- `src/modules/billing/services/commercial-config.service.ts`
- `prisma/seed-legal.ts` — Terms wording
- new specs alongside each

**apps/landing**
- `lib/plans.ts` — per-seat presentation, minimum seats

**docs**
- `docs/bugs/BUG-0080-*.md`, this plan, TASK-0010, the regression register

## Database impact

Two changes, both additive in effect.

**1. `PlanPrice.overageUnitAmount Decimal? @db.Decimal(12, 2)`**

Nullable. The schema measures overage today (`SeatUsage.overage:12954`,
`SeatOverageEvent.peakOverage:13067`) but has nowhere to price it. Null means
"this price does not charge overage", which is correct for every per-seat row.

**2. The active-price uniqueness rule gains `billingModel`.**

Today, from `20260816200000_planprice_market_aware_active_uniqueness`:

```sql
CREATE UNIQUE INDEX "PlanPrice_active_plan_market_cycle_currency_key"
ON "PlanPrice" ("planId", "marketId", "billingCycle", "currency")
NULLS NOT DISTINCT WHERE "isActive" = true;
```

That permits exactly one active price per plan/market/cycle/currency, so a plan
cannot hold a per-seat and a flat price at once — which requirement 2 needs.
The replacement adds `billingModel` to the key.

**This is strictly more permissive**: every row satisfying the old index
satisfies the new one, so no existing data can be rejected. Created before the
old one is dropped, so there is no window without an active-price guarantee —
the same shape the 2026-08-16 migration used, and for the same reason.

**3. Qatar's country row moves from GCC to the Qatar market.**

`MarketCountry.countryCode` is `@unique` **globally**
(`schema.prisma:4079`), and `GCC` already claims `'QA'`
(`markets.catalog.ts:77`). `ensureMarkets` catches unique violations and treats
them as benign (`commercial-bootstrap.ts:172`), so on a database where GCC
already exists, seeding a Qatar market would create the market **with no country
row at all** — silently, and permanently, because `ensureMarkets` skips markets
that already exist.

So the migration must move the row rather than the seed racing it:

```sql
UPDATE "MarketCountry" mc
SET "marketId" = (SELECT id FROM "Market" WHERE code = 'QA')
WHERE mc."countryCode" = 'QA'
  AND EXISTS (SELECT 1 FROM "Market" WHERE code = 'QA');
```

Guarded so it is a no-op on a database that has no Qatar market yet — a fresh
deploy seeds it correctly from the catalog and the `UPDATE` matches nothing.
`'QA'` is removed from GCC's catalog country list in the same change.

**Idempotency.** Re-running changes nothing: the index creation is
`IF NOT EXISTS`, the column addition `IF NOT EXISTS`, and the `UPDATE` is
already-satisfied on a second run.

No destructive change. No expand/backfill/contract staging needed.

## Backend impact

**`commercial-offer.resolver.ts` — the defect this plan exists to prevent.**

`resolveCommercialOffer` filters candidates without regard to sales model, picks
one by recency, and only then refuses if that one is `SALES_ASSISTED`. Seeding a
flat `SALES_ASSISTED` price beside a per-seat `SELF_SERVICE` price would
therefore make self-service availability depend on which row happened to be
written first — the two are seeded milliseconds apart, so it is effectively a
coin flip per plan, and a lost flip removes the plan from public sale.

The fix is to narrow by channel **before** selecting:

- `SELF_SERVICE` — discard candidates whose narrowed sales model is not
  `SELF_SERVICE`, then select. Requirement 5's determinism follows.
- `OPERATOR` — accept a new optional `billingModel` on the input and narrow to
  it when present; otherwise keep today's behaviour.

`narrowestSalesModel` already exists and is reused; the plan's model still
narrows the price's, so a `CUSTOM_ONLY` plan cannot be widened by a permissive
row.

**`pricing.catalog.ts` (new)** — one table, plan × market × cycle × model,
carrying `unitAmount`, `minimumSeats`, `includedSeats`, `overageUnitAmount` and
`salesModel`. Separate from `plans.catalog.ts` because a plan is not a price:
the same plan now carries eighteen prices.

**`commercial-bootstrap.ts`** — seeds from the new table. `createPlanPriceIfAbsent`
gains `billingModel` in its slot key so the "is this slot occupied" query
matches the new index. That query is `findActiveForSlot`; leaving it unchanged
would make the seed believe a flat slot was occupied by a per-seat price.

No new endpoints. No new module.

## Frontend impact

`apps/landing` only. The pricing page and wizard estimate move from a flat total
to `seats × unit`, with the minimum seat commitment stated — a visitor choosing
5 seats on Starter must see that 10 are billed, before paying. `apps/landing/lib/plans.ts`
already has `seatUnitDescription` gated on `billingModel === "PER_SEAT"`
(line 145), currently dead; it becomes live.

Loading, error and empty states are unchanged — the existing
`checkoutBlockedReason` already covers "no published price for your region",
which is what Enterprise+ will produce.

`apps/admin` — no change in this package. Operators see prices through the
existing runtime screens, and both models now appear.

## Permission / RBAC impact

None. No new permission key, no `rbac-matrix.ts` entry, no change to any
decorator. Commercial configuration is platform-scoped and already sits behind
the existing platform guards on `super-admin`; the public read path is
`@Public()` and unchanged.

## Tenant-isolation impact

None of `Plan`, `Market`, `PlanPrice` or `MarketCountry` is tenant-owned; they
carry no `tenantId` and are platform commercial configuration. No query in this
change reads or writes a tenant-owned model.

The one public path — plan listing and offer resolution — is deliberately
cross-tenant because it serves anonymous visitors who have no tenant. It exposes
plan and price configuration only, never a tenant record. A reviewer can confirm
this by checking that no file in "Files affected" queries a model carrying
`tenantId`.

## Audit / event / logging impact

Seeding is not an audited user action and does not call `AuditService.log()` —
consistent with `seed-config`'s existing behaviour. Bootstrap already surfaces
its outcome through `CommercialBootstrapResult.warnings`, which
`seed-config.ts:454` prints.

Never logged: nothing sensitive is involved. Prices are public by design.

## Integration impact

**Stripe.** Per-seat prices need `recurring.usage_type = 'licensed'` with
`quantity` sent per subscription item — which `buildStripeLineItem`
(`billing-seat-pricing.ts:108`) already does for `PER_SEAT`.
`deriveCheckoutReadiness` already asserts `stripeUsageType === 'licensed'`, so a
mis-created Stripe price fails closed rather than mis-charging.

**Two new presentment currencies, PKR and QAR.** Unverified against the live
account and flagged as a dependency. If either is unsupported, that market
cannot take self-service payment and its prices stay unsynced — which
`deriveCheckoutReadiness` already renders as "checkout not available", not as a
wrong charge.

No change to the .NET gateway or the desktop agent; neither reads pricing.

## Migration / data compatibility

**Already-stored data.** Any `PlanPrice` an operator created by hand keeps its
`billingModel`, and `overageUnitAmount` is null, meaning no overage — the
behaviour it has today. The bootstrap never overwrites an existing active price
(`commercial-bootstrap.ts:326`), so nothing an operator set is disturbed.

**Already-deployed clients.** The public plan payload gains fields; it loses
none. A landing build that predates this change ignores `minimumSeats` and
renders the unit amount, which is wrong-looking but not wrong-charging, because
checkout readiness is server-side.

**Running old and new together.** Safe. The API without the migration fails to
seed the second price and logs it; the migration without the API is inert.

## Parallel-safe tasks

- `PARALLEL_SAFE` — write `pricing.catalog.ts` and its arithmetic spec.
- `PARALLEL_SAFE` — the Terms rewrite in `seed-legal.ts`.
- `PARALLEL_SAFE` — the landing per-seat presentation.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — the bootstrap rewrite; needs the migration, because the
  second price cannot be inserted under the old index. Unblocked by the
  migration applying.
- `DEPENDENCY_BLOCKED` — Stripe price creation; needs PKR/QAR confirmation.

## Integration tasks

- `INTEGRATION` — the resolver's channel narrowing, verified against a database
  holding **both** models, which only exists after seeding runs.

## Testing strategy

Commands from `AGENTS.md`:

```bash
npm --workspace api run test
npm --workspace api run test:e2e
npm --workspace api run check-types
npm run test:runtime-schema
npm run prisma:validate
npm run validate:framework
```

Extended: `commercial-offer.resolver.spec.ts`, `commercial-bootstrap.e2e-spec.ts`,
`legal-seed.e2e-spec.ts`.

New specs assert:

1. **The schedule's arithmetic**, from the catalog rather than from restated
   literals: annual equals monthly × 10 for all 18 prices, and the minimum
   charge equals `minimumSeats × unitAmount`. A test that restates the numbers
   proves only that they were copied twice.
2. **A flat price is never self-service.** With both models present, a
   `SELF_SERVICE` resolution returns the per-seat price — asserted for every
   plan and market, not one.
3. **Determinism**, the requirement-5 case: seeding in either order yields the
   same self-service answer. This is the regression for the defect described
   under Backend impact, and it must be proven to fail without the channel
   narrowing.
4. **An operator can reach both**, and gets the model requested.
5. **Enterprise+ is unbuyable self-service** — `CUSTOM_CONTRACT_ONLY`.
6. **Qatar owns `QA`** after the migration, on a database where GCC seeded first.

Manual: none required.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | The resolver picks a flat price for a public visitor, removing a plan from sale or quoting a sales-only price | **High** without the fix — it is a millisecond race | Severe: a plan silently unbuyable, or a visitor quoted the wrong model | Channel narrowing before selection; regression 3 proves it fails without |
| 2 | Qatar market seeded with no country row because GCC holds `QA` | High on any existing database | Qatar unreachable by country lookup, silently | Migration moves the row; GCC's list loses `QA`; regression 6 |
| 3 | Stripe does not support PKR or QAR presentment | Unknown — unverified | Those markets cannot take payment | Flagged as a blocking dependency; `deriveCheckoutReadiness` fails closed rather than mis-charging |
| 4 | A seeded figure is wrong | Low — arithmetic verified | Severe: real money | Catalog is the single source; specs assert relationships, not restated literals |
| 5 | Terms describe the wrong model again | Medium — this is the third rewrite | Published legal text contradicting billing | REG-075's wording guard extended to per-seat; `legal:publish` runs on deploy |
| 6 | The bootstrap treats a per-seat slot as occupying the flat slot | High without the fix | Flat prices never seeded, silently | `findActiveForSlot` gains `billingModel`; asserted by the bootstrap e2e |

## Rollback considerations

**Reversible.** The column is nullable and additive; dropping it loses only
overage rates. The index change is reversible by recreating the narrower index —
but only after deleting the second price per slot, because rows now exist that
the old index would reject. That ordering matters and must not be reversed.

If the frontend ships without the API: the landing page renders per-seat fields
that are absent and falls back to its existing "no published price" state.
If the API ships without the migration: seeding the second price fails on the
unique index, the bootstrap records it as a warning, and the system continues
with per-seat only — degraded, not broken.

Nothing here is irreversible and no data is destroyed.

## Definition of Done

- [x] Migration applies from empty and on a database seeded at the previous state
- [x] `npm run prisma:validate` and `prisma migrate diff` show no new drift
- [x] **36** prices seeded (the plan said 18 — 3 plans x 3 markets x 2 cycles x
      2 models is 36, and the seed confirms it); re-running creates zero
- [x] Self-service resolution returns per-seat for every plan and market
- [x] Operator resolution can reach both models
- [x] Enterprise+ refuses self-service with `CUSTOM_CONTRACT_ONLY`
- [x] Qatar owns country `QA`; GCC does not
- [x] Arithmetic specs pass and are derived from the catalog
- [x] Regression 3 proven to fail without the channel narrowing
- [x] Terms describe per-seat and are published by the release command
- [x] `npm --workspace api run test`, `test:e2e`, `check-types` pass
- [x] `npm run validate:framework` passes
- [x] BUG-0080 updated; no unrelated changes in the diff
