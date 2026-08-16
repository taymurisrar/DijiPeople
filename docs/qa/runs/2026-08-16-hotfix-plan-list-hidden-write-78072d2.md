# QA Run — Hotfix: Plan list GET mutates commercial pricing (BUG-0030)

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `78072d2` |
| **Branch** | `agent/hotfix-plan-list-hidden-write` |
| **Scope** | `SuperAdminService` plan read/write paths, commercial bootstrap, `PlanPrice` uniqueness, `seed:config` |
| **Records** | BUG-0030 (CRITICAL/P0), ITEM-0025 |
| **Result** | PASS |

---

## Root cause analysis

| Candidate cause | Verdict |
|---|---|
| **A. Check-then-create race** | **CONTRIBUTING, not primary.** Real — two readers could both insert — but it would fail intermittently. Production failed reliably. |
| **B. Wrong uniqueness semantics after Wave 1** | **CONFIRMED.** The index predates markets and cannot tell them apart. All three seeded markets default to `USD`, so pricing a second market collides with a legitimate configuration. |
| **C. Version conflict** | **REFUTED.** The index is partial on `isActive`, so drafts, archived and future-effective versions already coexist freely. Versioning was never the constraint. |
| **D. Migration/backfill interaction** | **CONTRIBUTING.** The Wave 1 backfill created unscoped rows, but as `isActive = false`, so they do not trip a partial index. They do, however, make the unscoped-active case realistic. |
| **E. Existing production data conflict** | **CONFIRMED as the trigger.** Any pre-existing *active* price for the plan/cycle/currency with a different or null market defeats the market-scoped check while violating the index. |
| **F. Check/constraint divergence** | **PRIMARY.** The check named `{ planId, marketId, currency, billingInterval }`; the index enforces `(planId, billingCycle, currency) WHERE isActive`. Disagreement on three axes at once — deterministic, not a race. |

**Read-path mutation is what made any of this reachable.** `listPlans` and
`getPlanDetail` both called the initializer.

---

## `ensure*` audit on read paths

| Location | Classification | Action |
|---|---|---|
| `SuperAdminService.listPlans` → `ensureDefaultPlans` | `UNSAFE_HIDDEN_WRITE` | **Removed** |
| `SuperAdminService.getPlanDetail` → `ensureDefaultPlans` | `UNSAFE_HIDDEN_WRITE` | **Removed** |
| `SuperAdminService.createPlan` / `updatePlan` → `ensureDefaultPlans` | `UNSAFE_HIDDEN_WRITE` | **Removed** — keeping it would move the write one layer along |
| `LookupsService.listCurrencies` → `ensureCurrencyDefaults` | `UNSAFE_HIDDEN_WRITE` | Deferred — ITEM-0025 |
| `LookupsService.listRelationTypes` / `listDocumentTypes` / `listDocumentCategories` | `UNSAFE_HIDDEN_WRITE` | Deferred — ITEM-0025 |
| `OnboardingService.findTemplates` → `ensurePredefinedTemplates` | `UNSAFE_HIDDEN_WRITE` | Deferred — ITEM-0025 |
| `ensureEmployeeBelongsToTenant`, `ensureLeavePolicyExists`, `ensureLeaveTypeExists` | `SAFE_READ_ONLY` | None — assertions that throw, not initializers |
| `payroll-defaults.service` `ensure*`, `customization.ensureDefaultSolution` | `ADMIN_ACTION_ONLY` | None — reached from explicit actions |

---

## PlanPrice identity — the final model

A distinct **active** price is:

```
plan + market + billing cycle + currency
```

Enforced by `PlanPrice_active_plan_market_cycle_currency_key`, partial on
`isActive = true`, with `NULLS NOT DISTINCT`.

- **Version history is unconstrained.** Any number of `DRAFT`, `ARCHIVED`,
  superseded and future-effective rows coexist for the same slot; only the row
  currently serving checkout is unique.
- **Two markets may share a currency.** Required — every seeded market defaults
  to USD.
- **Two active prices in one market remain impossible.** The guarantee that
  matters for deterministic resolution.
- **`NULLS NOT DISTINCT` is load-bearing.** With default SQL NULL semantics every
  unscoped legacy row would be mutually distinct, silently *removing* the
  protection the old index gave them.

---

## Scenarios

| id | Scenario | Result |
|---|---|---|
| A | `listPlans` performs zero commercial writes | **PASS** — read-path purity spec; verified to fail when the call is restored |
| B | Repeated bootstrap runs create nothing after the first | **PASS** — real PostgreSQL, 3 sequential runs |
| C | 8 concurrent bootstraps: all succeed, no P2002, row count unchanged | **PASS** — real PostgreSQL |
| D | Explicit bootstrap is deterministic and verifies the winner | **PASS** — a unique violation re-reads the winning row and compares the amount |
| E | Two markets, same plan/cycle/currency, both active | **PASS** — real PostgreSQL |
| E2 | Two active prices in one market still rejected | **PASS** — P2002, as intended |
| E3 | Two active unscoped (null-market) rows still rejected | **PASS** — `NULLS NOT DISTINCT` |
| F | Active + archived + future draft coexist | **PASS** — 3 rows, 1 active |
| G | Bootstrap does not publish or activate a draft | **PASS** |

## Local validation

| Command | Result |
|---|---|
| `npm run prisma:validate` | **PASS** |
| `npm run typecheck` | **PASS** — 8/8 workspaces |
| `npm --workspace api run test` (CI pattern) | **PASS** — 151 suites, 1060 tests |
| `npm --workspace landing run test` | **PASS** — 38 |
| Wave 1/2 non-regression (`commercial-offer`, `billing.legacy-pricing`, `public-feature-catalog`) | **PASS** — 3 suites, 38 tests |
| `npm run test:app-urls` | **PASS** — 16, no BUG-0026 regression |
| `npm run check:no-hardcoded-urls` | **PASS** |
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks |

## Real PostgreSQL evidence

`REAL_POSTGRES = VIA_CI_GATE`. No Docker or local PostgreSQL is available in this
environment, so `commercial-bootstrap.e2e-spec.ts` was **promoted into the
`database-migration` required gate** rather than left in the report-only e2e job.
That job applies the full migration history to an empty PostgreSQL 16, runs
`seed:config` and `seed:verify`, and now runs this spec.

That is deliberate: the entire fix rests on partial-index behaviour and a
concurrency race, neither of which a mocked Prisma can demonstrate — which is
precisely how the defect reached production.

## Wave 1 non-regression

| Check | Result |
|---|---|
| BUG-0027 still fixed — no legacy `Plan.monthlyBasePrice` pricing fallback | **PASS** |
| BUG-0028 still fixed — no hardcoded country/currency map | **PASS** |
| Market remains authoritative for currency | **PASS** |
| Drafts remain non-public | **PASS** |
| `resolveCommercialOffer` still fails closed | **PASS** — 26 assertions |

## Wave 2 non-regression

| Check | Result |
|---|---|
| `/plans` consumes authoritative config | **PASS** |
| `/features` consumes the real catalogue | **PASS** |
| No FX map returned | **PASS** |
| Enterprise CTA config-driven | **PASS** |
| Subscribe handoff intact | **PASS** — 12 assertions |
| No localhost regression | **PASS** |

---

## Findings

### F1 — BUG-0030 — **FIXED**

Root-caused to check/constraint divergence plus read-path mutation, with the
market-blind index as the structural third cause. All three addressed.

### F2 — Five more hidden writes on read paths — **DEFERRED (ITEM-0025)**

Same pattern in `lookups` and `onboarding`. Deferred deliberately: a P0 hotfix
changes what it must. Recorded with per-method classifications.

### F3 — Error mapping presents an internal write failure as a caller error — **ACCEPTED_RISK**

A P2002 raised by an internal bootstrap surfaced as
`DATABASE_DUPLICATE_RECORD` / 409, implying the caller submitted a duplicate on
a `GET`. Misleading, but the mapping is correct for genuine create/update
requests, and remapping globally would degrade real conflict reporting.

With the hidden write removed there is no longer an internal writer on this path
to be misreported. Not changed.

## Finding classification

| Finding | Disposition | Record |
|---|---|---|
| F1 — BUG-0030 | `FIXED` | BUG-0030, REG-020 |
| F2 — remaining hidden writes | `DEFERRED` | ITEM-0025 |
| F3 — P2002 error mapping | `ACCEPTED_RISK` | This run |

## Not observed

`PRODUCTION_DATA_STATE = NOT_OBSERVED` — no access to the production database
from this environment. `scripts/report-planprice-conflicts.mjs` was written for
exactly this question and can be run by an operator who has access; it is
read-only and changes nothing.

`PRODUCTION_DEPLOYMENT = NOT_OBSERVED` — nothing was deployed by this task.
