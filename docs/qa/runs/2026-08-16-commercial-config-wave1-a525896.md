# QA Run — Wave 1: Commercial Configuration Foundation

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `a525896` |
| **Branch** | `agent/commercial-config-wave1` |
| **Scope** | `Plan` / `PlanPrice` / `Market` models, price resolution, publication lifecycle, currency resolution, public commercial config API, landing consumption, Admin plan surfaces, seeds |
| **Records** | BUG-0027, BUG-0028, ITEM-0018, ITEM-0019 |
| **Result** | PASS — with two findings fixed during the run and four deferred with reasons |

---

## Consumer audit (pre-implementation)

The requirement was explicit that legacy columns must not be dropped before every
consumer is proven. All reads/writes of `Plan.monthlyBasePrice` /
`annualBasePrice` / `currency` were enumerated and classified:

| Consumer | Class | Disposition |
|---|---|---|
| `super-admin/billing.service.ts:73-77` | **AUTHORITATIVE** | **Removed** — was the live money path |
| `super-admin/super-admin.service.ts:3970,3988,4012` | SEED_ONLY / DERIVED_DISPLAY | Retained; seed now also writes `PlanPrice` |
| `super-admin/plans.catalog.ts:9-11,28-30,51-53` | SEED_ONLY | Retained as the source of the authoritative amounts |
| `tenants/tenants.service.ts:154-155` | LEGACY_WRITE | Retained — ITEM-0020 |
| `billing/services/billing.service.ts:103-104` | DERIVED_DISPLAY | Retained in payload — ITEM-0020 |
| `super-admin/dto/{create,update}-plan.dto.ts` | LEGACY_WRITE | Retained — ITEM-0020 |
| `apps/admin/_components/plan-form.tsx` | LEGACY_WRITE | Retained — ITEM-0020 |
| `apps/admin/_components/subscription-form.tsx:187-188` | DERIVED_DISPLAY | Retained — ITEM-0020 |
| `apps/admin/(internal)/plans/[planId]/page.tsx` | DERIVED_DISPLAY | **Switched to `PlanPrice`** |
| `apps/admin/lib/runtime/platform-module-registry.ts:3111,3115` | DERIVED_DISPLAY | **List columns replaced** |
| `packages/config/platform-runtime-schema.generated.json` | GENERATED | Regenerated |

**One consumer was AUTHORITATIVE, and it had been missed by the original
BUG-0027 record.** See finding F1.

---

## Scenarios

### A — Published Pakistan price

| id | Scenario | Result |
|---|---|---|
| A1 | Seeded market resolves, published price returns with correct amount and subtotal | **PASS** — resolver spec |
| A2 | Seed creates published, market-scoped `PlanPrice` for every seeded plan | **PASS** — `ensureAuthoritativePlanPrices`; verified in CI's `database-migration` job which runs `seed:config` + `seed:verify` against an empty PostgreSQL |
| A3 | Admin and checkout resolve the same amount | **PASS** — both read `PlanPrice`; Admin's legacy path switched, and `billing.legacy-pricing.spec.ts` pins that the legacy columns are never read |

### B — Draft price is not purchasable

| id | Scenario | Result |
|---|---|---|
| B1 | `DRAFT` price → refused, reason `NO_PUBLISHED_PRICE` | **PASS** |
| B2 | `ARCHIVED` price → refused for a new purchase | **PASS** |
| B3 | `DRAFT` **plan** with a published price → refused | **PASS** |
| B4 | Draft configuration never leaves the API | **PASS** — `getPublicCommercialConfig` filters on `publicationStatus` in the query, so it is not merely hidden by the UI |

### C — Version and effective dating

| id | Scenario | Result |
|---|---|---|
| C1 | v1 in force before v2's effective date; v2 after | **PASS** |
| C2 | A future v3 does not displace the v2 in force today | **PASS** — selection is by `effectiveFrom`, not `version` |
| C3 | All published prices still in the future → `PRICE_NOT_EFFECTIVE`, not a fallback | **PASS** |
| C4 | `effectiveTo` treated as exclusive | **PASS** |
| C5 | Existing subscription retains its original commercial context | **PASS by construction, NOT_OBSERVED against a database** — `Subscription` snapshots `planPriceId`, `basePrice`, `discountType`, `discountValue`, `finalPrice`, `currency`, and nothing in this change writes to existing subscriptions. The migration touches only `Plan` and `PlanPrice`. A live before/after assertion needs the database harness in ITEM-0002 and is recorded in ITEM-0022. |

### D — Missing price fails safely

| id | Scenario | Result |
|---|---|---|
| D1 | Enabled plan, no valid published price → no legacy amount used | **PASS** |
| D2 | Operator subscription creation with no resolvable price → `BadRequestException` naming plan, cycle and currency | **PASS** |
| D3 | Public page shows a commercial state, not a number | **PASS** — `findPlanPrice` no longer falls back to a USD price |
| D4 | Unscoped price (null market) is refused, not treated as a wildcard | **PASS** |

### E — Currency resolution

| id | Scenario | Result |
|---|---|---|
| E1 | `detectRegionCurrency` / `europeanCountries` no longer exist | **PASS** — deleted |
| E2 | Currency comes from published market configuration | **PASS** |
| E3 | Resolved server-side, so no flicker | **PASS** — resolved in a server component before render |
| E4 | Unsupported currency refused; market default always sellable | **PASS** |
| E5 | Market override refused unless `ALLOW_MARKET_OVERRIDE=true` | **PASS** — a public query parameter cannot select a pricing market |

---

## Local validation

| Command | Result |
|---|---|
| `npm run prisma:validate` | **PASS** |
| `prisma migrate diff` vs canonical | **PASS** — every index, constraint and column matches Prisma's generated SQL exactly, including the truncated `PlanPrice_planId_marketId_currency_billingInterval_publicat_idx`. No schema drift. |
| `npm run typecheck` | **PASS** — 8/8 workspaces |
| `npm --workspace api run test` (CI pattern) | **PASS** — 148 suites, 1043 tests |
| `npm --workspace web run test` | **PASS** — 17 suites, 391 tests |
| `npm --workspace admin run test` | **PASS** — 9 suites, 71 tests |
| `npm run test:runtime-schema` | **PASS** — regenerated after registry + Prisma changes |
| `npm run test:app-urls` | **PASS** — 16, no BUG-0026 regression |
| `npm run check:no-hardcoded-urls` | **PASS** |
| `npx eslint` (web, admin, landing) | **PASS** — 0 errors |
| `node scripts/validate-framework.mjs` | **PASS** — 503 checks |

`REAL_POSTGRES = DELEGATED_TO_CI` — no Docker or local PostgreSQL is available
in this environment. CI's `database-migration` job is a **required gate** that
applies the full migration history to an empty PostgreSQL 16 and then runs
`seed:config` and `seed:verify`. That is the real-database validation for this
change, and it is reported on the exact merged SHA rather than inferred.

---

## Findings

### F1 — BUG-0027 was under-rated; legacy price drove a real money path — **FIXED**

The original record said the legacy columns were a display problem because
Stripe checkout requires a verified `PlanPrice`. True of that one path, wrong
about the system: `calculateSubscriptionPricing` fell back to the legacy columns
and `upsertSubscription` wrote the result into `Subscription.basePrice` and
`finalPrice`. Because the seed created no `PlanPrice` at all, that fallback was
the *normal* path for operator-created subscriptions.

Re-rated **CRITICAL / P0**, fixed, and pinned by REG-017. The record now carries
the correction explicitly rather than being quietly edited.

### F2 — `Subscription.planPriceId` is nullable and was frequently null — **PARTIALLY ADDRESSED**

Follows from F1: subscriptions priced from legacy columns got
`planPriceId: null`, so they carry no reference to any price version and have no
historical commercial context to preserve. New subscriptions always reference a
price now. **Existing rows are not backfilled** — inferring which version a past
subscription was sold under would be inventing commercial history. Recorded in
ITEM-0020's evidence.

### F3 — Publication *transitions* are not governed — **DEFERRED (ITEM-0022)**

The state exists and is enforced at read time. Explicit Publish/Archive actions,
audit events for them, publish-time validation, and create-new-version-on-edit
are not built. Deferred rather than half-built: partial governance that looks
governed is worse than an obvious gap.

### F4 — Legacy columns still writable — **DEFERRED (ITEM-0020)**

Eight consumers still read or write them, all now `LEGACY_WRITE` or
`DERIVED_DISPLAY` rather than authoritative. Dropping columns is irreversible;
the contract phase gets its own plan and its own evidence.

### F5 — No mechanical guard against a new hardcoded currency map — **DEFERRED (ITEM-0021)**

A comment says do not reintroduce it. A comment is not a gate — the same
argument that produced `check-no-hardcoded-urls.mjs` applies here.

---

## Finding classification

| Finding | Disposition | Record |
|---|---|---|
| BUG-0027 (incl. F1) | `FIXED` | BUG-0027, REG-017 |
| BUG-0028 | `FIXED` | BUG-0028, REG-018 |
| ITEM-0018 | `FIXED` (state), transitions deferred | ITEM-0018, ITEM-0022 |
| ITEM-0019 | `FIXED` (model), `Tenant.dataRegion` deferred | ITEM-0019, ITEM-0023 |
| F2 | `OPEN` | ITEM-0020 |
| F3 | `DEFERRED` | ITEM-0022 |
| F4 | `DEFERRED` | ITEM-0020 |
| F5 | `DEFERRED` | ITEM-0021 |

## Owner decisions raised

**Pakistan price schedule and billing unit.** The market is seeded with
`defaultCurrency: USD` and the existing repository amounts (199/399/899 monthly,
flat), because those are the only prices this repository holds evidence for.
Seeding a PKR figure would mean inventing what DijiPeople charges in its launch
market. PKR is listed as a supported currency so the schedule can be added in
Admin without a schema change. Separately, the seeded prices are `FLAT`, not
per-active-employee — converting them is a commercial decision, not a migration.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0026]] · [[BUG-0027]] · [[BUG-0028]] · [[ITEM-0002]] · [[ITEM-0018]] · [[ITEM-0019]] · [[ITEM-0020]] · [[ITEM-0021]] · [[ITEM-0022]] · [[ITEM-0023]]

<!-- GRAPH:END -->
