---
ID: BUG-0792
aliases: [BUG-0792]
Title: Qatar market resolves to GCC because its country row is never repaired, so Doha visitors are quoted USD
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-08-22
DetectedInSha: 8c56006
AffectedModules: [services/api/src/modules/super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-230
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0792 — Qatar market resolves to GCC because its country row is never repaired, so Doha visitors are quoted USD

## Summary

`MarketCountry.countryCode` is unique **globally**, not per market. The `GCC`
market was seeded first and claimed `QA` among its six countries. When Qatar was
later given its own market priced in QAR, the seed created the market but could
not claim the country code, swallowed the resulting unique violation as benign,
and then skipped that market on every subsequent run because it now existed. The
migration written to repair exactly this is guarded on the Qatar market existing
and runs *before* the seed that creates it.

The result in production is a `LAUNCHED`, published, QAR-priced Qatar market
holding **no country rows at all**, so `resolveMarketForCountry('QA')` falls
through to `resolveDefaultMarket()` and returns `GCC` — which is `PLANNED`, has
`selfServiceEnabled: false`, and defaults to USD.

## Expected Behavior

A visitor in Qatar resolves to the `QA` market, is quoted in QAR, and can buy
online, per `markets.catalog.ts` which declares Qatar `LAUNCHED`, `isEnabled`,
`selfServiceEnabled`, `defaultCurrency: 'QAR'`.

## Actual Behavior

They resolve to `GCC`, are quoted in USD, and every plan offer comes back
`available: false, reason: UNAVAILABLE` because GCC is `PLANNED` with
self-service disabled.

## Reproduction

1. `curl -s -H "x-vercel-ip-country: QA" https://api.dijipeople.com/api/public/commercial-config`
2. Observe `"market": {"code": "GCC", ..., "selfServiceEnabled": false, "launchStatus": "PLANNED"}` and `"currency": "USD"`.
3. Repeat with `x-vercel-ip-country: US` — identical response, confirming `QA` is not resolving to a market of its own but falling through to the default.

## Evidence

Live production response, 2026-08-22, API commit `35f263c`:

```
market   {'code': 'GCC', 'name': 'Gulf Cooperation Council',
          'selfServiceEnabled': False, 'launchStatus': 'PLANNED'}
currency USD
plans    starter/growth/enterprise — every offer available=False, reason=UNAVAILABLE
```

`/api/public/plans` at the same moment does publish QAR prices
(`availableCurrencies: ['QAR', 'USD']`, Growth QAR 25/month), so the prices exist
and the market that would select them does not resolve.

- `services/api/src/modules/super-admin/commercial-bootstrap.ts` — `ensureMarkets` returned early on any existing market, and its `catch` treated `isUniqueViolation` as benign for a nested `countries.create`.
- `services/api/src/modules/super-admin/markets.catalog.ts` — the `GCC` entry's own comment describes this failure mode and names the migration meant to prevent it.
- `services/api/prisma/migrations/20260820140000_planprice_billing_model_uniqueness_and_overage/migration.sql:77-82` — the repair `UPDATE`, guarded on `qa."code" = 'QA'` existing.
- `services/api/package.json` — `release` is `prisma:migrate:deploy && seed:config && ...`; `seed:commercial` is not in the chain at all.

## Root Cause

Three separate decisions, each defensible alone, combining into a state that
cannot repair itself:

1. `ensureMarkets` skipped existing markets entirely, so a market whose country
   rows were wrong was never revisited.
2. Country rows were written nested inside `market.create`, so one already-claimed
   code failed the whole statement — and the `catch` treated a unique violation
   as "someone else already wrote what I wanted", which was false here.
3. The repair migration runs during `migrate deploy`, before the seed that
   creates the market it is guarded on. On exactly the databases needing repair
   it matched nothing.

## Impact

Every visitor in Qatar — the market the owner priced in QAR on 2026-08-20 — sees
USD prices on `/` and `/plans`, no purchasable offer, and a checkout page that
disagreed with both (see [[BUG-0793]]). Reachable in production and observed
there. Self-perpetuating: re-running the seed never repaired it.

## Affected Areas

`super-admin` commercial bootstrap, `billing` commercial-config resolution, the
landing site's home, plans and subscribe pages.

## Proposed Resolution

Make `ensureMarkets` reconcile country claims rather than skip existing markets;
write countries after the market rather than nested; move a country to the market
the catalog assigns it to, and report every move. No ExecPlan needed — the change
is confined to the bootstrap and is idempotent.

## Acceptance Criteria

- A database where `GCC` holds `QA` converges to `QA` holding it after one bootstrap run.
- A market created while another holds its country code ends up with both the market row and the country row.
- A database already correct produces no writes and no warnings.
- Every country move appears in `CommercialBootstrapResult.warnings`.

## Regression Coverage

`services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts`,
`describe('commercial bootstrap reconciles market country claims')` — four cases.
Mutation-tested: restoring the `if (existing) continue;` early return fails two
of them.

## Dependencies

The code fix does not repair live data on its own. `npm run seed:commercial`
must be run once against production, and it is **not** in the `release` chain —
adding it there would also start reconciling plan prices on every deploy, which
is a commercial decision rather than a defect fix and is left for the owner.

## Related Items

[[BUG-0793]] — the checkout half of the same user report.

## Resolution

`ensureMarkets` now calls `ensureMarketCountries` for existing markets as well as
new ones, creates the market before its countries, moves a country from whichever
market currently holds it to the one the catalog names, and pushes a warning for
every move instead of swallowing the unique violation. Branch
`agent/site-ux-and-admin-fixes`, commit `5465697`.

## QA Retest

Pending: re-run step 1 of the reproduction after `seed:commercial` has been run
against production, and confirm `market.code == "QA"` and `currency == "QAR"`.

## History

- 2026-08-22 — created from user report at `8c56006`.
- 2026-08-22 — fixed in `5465697`; live data repair still outstanding.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]]
- Regression — REG-230 (see the regression register)

<!-- GRAPH:END -->
