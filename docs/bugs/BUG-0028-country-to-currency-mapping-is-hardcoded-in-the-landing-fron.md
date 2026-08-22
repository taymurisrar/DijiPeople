---
ID: BUG-0028
aliases: [BUG-0028]
Title: Country to currency mapping is hardcoded in the landing frontend
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: REVIEWER
DetectedDate: 2026-08-16
DetectedInSha: 45d00cf
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-commercial-config-wave1-a525896.md
RegressionId: REG-018
RelatedBacklogItem: ITEM-0019
RelatedDecision:
RelatedImplementation: agent/commercial-config-wave1
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
---

# BUG-0028 — Country to currency mapping is hardcoded in the landing frontend

## Summary

Which currency a visitor is quoted is decided by a hardcoded lookup table
compiled into the public site, not by backend configuration. Adding a market,
correcting a currency, or disabling a country requires a code change and a
redeploy of `apps/landing`, and the mapping cannot be inspected or altered from
Platform Admin.

## Expected Behavior

Commercial truth — which markets are open, in which currency, on which plans —
is backend configuration that Admin governs. The public site renders what the
backend resolves.

## Actual Behavior

`detectRegionCurrency()` in the landing bundle maps country codes to currencies
from a literal table, and a 19-country hardcoded set defines "Europe". The
public site is the source of truth for a commercial decision.

## Reproduction

1. Open `apps/landing/lib/plans.ts`.
2. `detectRegionCurrency("PK")` returns `"PKR"` from a literal branch.
3. There is no backend record or Admin screen that produced that mapping, and
   no configuration that can change it.

## Evidence

- `apps/landing/lib/plans.ts:70-80` — `detectRegionCurrency()`:
  `QA→QAR`, `US→USD`, `AE→AED`, `SA→SAR`, `GB→GBP`, `PK→PKR`, else `EUR`/`USD`.
- `apps/landing/lib/plans.ts:48-68` — `europeanCountries`, a hardcoded 19-entry
  set. It omits several eurozone members, so the "Europe → EUR" rule is also
  incomplete on its own terms.
- `apps/landing/lib/plans.ts:92-101` — `resolveDefaultCurrency()` falls back to
  `USD`, then to whatever currency happens to appear first in the plan list.
- No `Market`, `MarketConfiguration` or country-to-currency model exists in
  `services/api/prisma/schema.prisma` — see [[ITEM-0019]].

## Root Cause

No market/region configuration model exists, so the frontend supplied the
mapping. This is the same shape as [[BUG-0026]]: a decision that belongs in
configuration was inlined into a shipped bundle, where it cannot be changed
without a deploy and cannot be audited.

## Impact

Operational rather than immediately customer-breaking. Launching or correcting a
market requires a frontend code change; a wrong mapping quotes the wrong
currency to a whole country until someone redeploys. Directly blocks the
Pakistan-first, US/GCC-next market plan, since each new market is a code change.

The **charged** currency is not affected: checkout resolves a `PlanPrice`, and
`findPlanPrice()` falls back to the `USD` price when the detected currency has
none (`plans.ts:113-119`). The defect is in what is *quoted* and how markets are
governed.

## Affected Areas

Public plans page, subscribe flow, any future market gating. Interacts with
[[ITEM-0019]] (no market model) and the requirement to resolve currency
server-side without flicker.

## Proposed Resolution

Was blocked on [[ITEM-0019]]; both landed together in Wave 1.

## Acceptance Criteria

- `detectRegionCurrency` and `europeanCountries` no longer exist.
- Adding or changing a market is a configuration change with no frontend deploy.
- Currency is resolved server-side, so no flicker between an initial and a
  corrected currency.
- A market with no configured currency falls back to a **configured** default,
  not a literal `"USD"`.

## Regression Coverage

`services/api/src/modules/billing/commercial-offer.resolver.spec.ts` — REG-018.
Covers market gating, the market default currency always being sellable, refusal
of an unsupported currency, and refusal of an unscoped price rather than treating
a null market as a wildcard.

`scripts/check-no-hardcoded-urls.mjs` is the analogous guard for BUG-0026; an
equivalent mechanical check for country/currency literals in the frontend is
recorded as [[ITEM-0021]].

## Dependencies

[[ITEM-0019]] — the market/region model this mapping should move into.

## Related Items

[[ITEM-0019]] · [[BUG-0027]] · [[BUG-0026]] — same class: a decision that
belongs in configuration compiled into a shipped bundle.

## Resolution

Fixed on `agent/commercial-config-wave1`, together with [[ITEM-0019]].

- `detectRegionCurrency` and the hardcoded `europeanCountries` set are **deleted**
  from `apps/landing/lib/plans.ts`, with a comment at the site recording why they
  must not come back.
- Currency now comes from published `Market` configuration. The API resolves the
  visitor's market from edge country headers via `CommercialConfigService` and
  returns it from `GET /api/public/commercial-config`.
- Resolution happens **server-side**, so there is no flicker between an initial
  guessed currency and a corrected one — the flicker was the visible symptom of
  the decision being made in the wrong place.
- `resolveDefaultCurrency` is replaced by `resolveDisplayCurrency`, which takes
  the market's currency as authoritative and never re-derives one from a country.
- `findPlanPrice` no longer falls back to a USD price when the market currency
  has none. Quoting a plan in a currency the visitor's market does not use is a
  wrong number presented as a right one; the plan now shows no public price.
- The public currency dropdown is not rendered (multi-currency support is
  intact underneath), so a visitor cannot select a currency their market has no
  price in and then be shown a fallback.

## QA Retest

`docs/qa/runs/2026-08-16-commercial-config-wave1-a525896.md` — scenario E.

Retested at the merged SHA `d1768cb` during the open-bug closure wave.

The linked regression suite runs green: 7 API suites / 85 assertions across
REG-013 – REG-021, `npm run test:app-urls` 16/16, and REG-020's
`commercial-bootstrap.e2e-spec.ts` in the `Database migration gate` against a
real PostgreSQL 16. Each of these tests was proven to fail without its fix when
it was written; re-running them is what confirms the fix still holds.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-16 — found during commercial-configuration discovery at `45d00cf`.

- 2026-08-16 — fixed in Wave 1 alongside the market model.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0019]]
- Referenced by — [[ITEM-0021]]
- Modules — [[landing-architecture]]
- Regression — REG-018 (see the regression register)

<!-- GRAPH:END -->
