---
PLAN_ID: PLAN-020
aliases: [PLAN-020]
TITLE: The commercial catalogue: plans, markets and prices
AREA: billing
STATUS: CURRENT
MODULES: [super-admin, billing, landing]
RISK: CRITICAL
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-0531, BUG-0533, BUG-0534, BUG-0027, BUG-0030]
RELATED_REGRESSIONS: [REG-201, REG-202]
CREATED_AT: 2026-08-22
UPDATED_AT: 2026-08-22
VERIFIED_AGAINST_SHA: 99dc70a
---

# PLAN-020 — The commercial catalogue: plans, markets and prices

## Scope

What DijiPeople sells and for how much: `Plan`, `Market`, `PlanPrice`, and the
three files that are authoritative for them —
`super-admin/plans.catalog.ts`, `markets.catalog.ts` and `pricing.catalog.ts` —
together with `commercial-bootstrap.ts`, which is the only thing that writes
them, and the plan record form in Platform Admin, which is where an operator
sees them.

**Deliberately excluded:** what a customer is *charged*. Counting billable
employees, usage periods and overage episodes belong to PLAN-016; invoicing and
payment capture belong elsewhere. The boundary is the one this area keeps
getting wrong, so it is stated first: a plan is a set of modules and a name, a
price is what one market pays for it, and a subscription is what somebody
actually bought. Those are three different records with three different owners.

## Risks

Ranked, and drawn from what has actually happened here.

1. **The catalogue and the database disagree, silently.** [[BUG-0533]] — the
   bootstrap was create-only, so a price decided in a file could never reach a
   database that already held one. The seed reported success throughout.
2. **A price sellable on the wrong channel.** [[BUG-0531]] — every active price
   was FLAT and marked `SELF_SERVICE`, putting a negotiated instrument on the
   public site. Flat is ~60% more than per-seat at the small end and ~69% less
   at the large end; that spread is why a person quotes it.
3. **A price sellable in the wrong currency.** Markets support more than one
   currency, so a USD row scoped to Pakistan genuinely resolves.
4. **Money read from a deprecated column.** [[BUG-0027]] — `Plan.monthlyBasePrice`
   was once the fallback when no `PlanPrice` resolved, writing an invented
   number into `Subscription.basePrice`. The read is gone; [[BUG-0534]] removed
   the invitation to keep writing it.
5. **A read that initialises state.** [[BUG-0030]] — opening the Admin plans
   list created rows and hit a unique constraint in production.
6. **A number that looks synced and charges something else.** A superseded price
   inheriting the old row's `stripePriceId` would be exactly this.
7. **A reconcile that is not idempotent.** `seed:config` runs on every
   deployment through `release:api`. Re-stamping `publishedAt` or re-superseding
   correct rows would detach every price from Stripe once per deploy.

## Preconditions

`seed:config` (or `seed:commercial`) applied. Markets PK, QA and INTL enabled
and self-service. Platform Admin access. `STRIPE_MODE=test` for anything that
touches Stripe.

For a reconcile: a database backup. Nothing is deleted, but rows are
deactivated, and that is not the same as nothing changing.

## Test Types

- **UNIT** — the jest specs are substantial: `commercial-bootstrap.reconcile.spec.ts`
  (7), `pricing.catalog.spec.ts`, `plan-read-path-purity.spec.ts`,
  `subscription-terms-immutability.spec.ts`, and `plan-record-form.spec.ts` on
  the admin side. Recorded as GAP nonetheless, because the coverage matrix
  counts **scenarios**, and no UNIT-typed scenario indexes those files. The
  distinction is worth keeping rather than papering over: a spec nobody can find
  from the plan is not re-run when this area changes, which is the whole purpose
  of the matrix.
- **API** — GAP. Nothing exercises the offer resolver across all three markets
  through a request.
- **DATABASE** — GAP, and the one that matters most. Every assertion about
  convergence currently runs against a hand-written fake, which proves the
  decision and not the query. The partial unique index
  `PlanPrice_active_plan_market_cycle_currency_model_key` is precisely what a
  fake cannot enforce, and disagreeing with it is the root cause of [[BUG-0030]].
- **INTEGRATION** — GAP. Stripe product and price creation is never exercised.
- **BROWSER_E2E** — GAP for the public pricing page per market.
- **SECURITY** — the relevant negative is a channel one: a `SALES_ASSISTED`
  price must be unreachable on the self-service channel.

## Data Requirements

The seeded catalogue only: three plans, three priced markets, 36 prices, plus
`enterprise-plus` with none. No customer data, no credentials, no Stripe keys in
any fixture.

A stale-catalogue fixture is worth building: a plan with a drifted name, a price
in a combination the catalogue never mentions, and a dropped plan carrying a
subscription. All three occurred together in the development database.

## Security Cases

- A `SALES_ASSISTED` price is refused on the `SELF_SERVICE` channel, per plan,
  per market, per currency.
- `narrowestSalesModel` holds: a permissive price cannot widen a `CUSTOM_ONLY`
  plan.
- A price with no market resolves for **no** market — failing closed, not open.
- The plan form exposes no field `UpdatePlanDto` will not accept.
- No Stripe secret appears in any response, log or record.

## Negative Cases

- A plan key not in the catalogue: withdrawn, never deleted.
- A plan with subscriptions: never deactivated.
- `enterprise-plus`: no price, and the resolver answers `CUSTOM_CONTRACT_ONLY`
  rather than quoting zero.
- A price amount of zero or less: no `PlanPrice` row and no Stripe price.
- A market named in the schedule but absent from the database: reported, and its
  prices are not invented.

## State Transitions

Legal: `DRAFT -> PUBLISHED -> ARCHIVED` on both `Plan` and `PlanPrice`; a price
superseded by a successor carrying `supersedesPriceId` and `version + 1`; a plan
republished after archive, losing `archivedAt`.

Illegal, and to be rejected: an active price edited in place while a
subscription points at it; a superseded price inheriting the old row's Stripe
identifiers; a plan deactivated while it carries subscriptions; a price active
with a null market.

## Integration Cases

Stripe: product resolution when `stripeProductId` names a deleted product; price
creation refused for a non-positive amount; verification failing on currency,
amount, interval, usage type or livemode mismatch; a `TEST` price in a `LIVE`
environment. Each must leave `stripeSyncStatus: FAILED` with the reason
recorded, never a silent `SYNCED`.

## Browser Cases

The public pricing page for a Qatar visitor and for a Pakistan visitor: per-seat
prices only, in the market's own currency, no flat price reachable. Currently
manual — QA-PLATFORM-018 steps 7 to 9.

## Regression Links

- REG-201 — a catalogue the database could never reach.
  QA-PLATFORM-018 steps 3 to 6, 10.
- REG-202 — deleting a form field does not remove it.
  QA-PLATFORM-018 steps 7 to 8.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-BILLING-013]], [[QA-BILLING-014]], [[QA-BILLING-015]], [[QA-BILLING-017]], [[QA-BILLING-018]], [[QA-BILLING-019]], [[QA-BILLING-020]], [[QA-BILLING-021]], [[QA-BILLING-022]], [[QA-BILLING-023]], [[QA-BILLING-024]], [[QA-BILLING-025]], [[QA-BILLING-026]], [[QA-BILLING-027]], [[QA-INTEGRATION-001]], [[QA-PLATFORM-018]], [[QA-TENANT-051]], [[QA-TENANT-052]]
- Module — [[billing]]
- Bugs — [[BUG-0531]], [[BUG-0533]], [[BUG-0534]], [[BUG-0027]], [[BUG-0030]]
- Regressions — REG-201, REG-202 (see the regression register)

<!-- GRAPH:END -->
