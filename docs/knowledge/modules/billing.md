# Billing

> Generated from repository evidence at `ad8f77f`; the **Current state** and
> **Two commercial paths** sections re-derived from source at `caad4a56` on
> 2026-09-11.

## Purpose

Plans, subscriptions, invoices and payments for tenant accounts, plus the Stripe
integration.

## Current state

> The line below previously read "**Stripe billing is a stub in code**". That was
> true when this note was generated and has not been true for some time — the
> module now carries roughly thirty services including a seat engine, a market
> and publication model, an order sweeper worker and webhook reconciliation. The
> claim is kept rather than deleted because it is exactly the kind of stale
> assertion an agent would act on: read as current, it invites building a second
> billing integration beside the real one. See the `doc-code-drift` pattern.

- `billing/` is the Stripe integration point and is substantially implemented.
  `services/` holds the seat, plan-change, cancellation, reconciliation,
  webhook, order and tax-basis services; `controllers/` exposes a tenant
  surface, a public surface and the Stripe webhook.
- Prices carry a **billing model**. `PER_SEAT` multiplies `unitAmount` by the
  purchased seat count; `FLAT` bills `unitAmount` once and uses `includedSeats`
  as a capacity statement. `billing-seat-pricing.ts` is the single home of that
  rule, and its header records what happened when two copies of it disagreed.
- `PlanPrice` has **three** independent gates beyond `isActive`: its own
  `publicationStatus` (default `DRAFT`), its `marketId` (null means unavailable,
  not wildcard), and Stripe readiness via `deriveCheckoutReadiness`.
- Smoke helpers exist: `scripts/stripe-test-mode-smoke.mjs`,
  `scripts/stripe-webhook-smoke.mjs`.
- A second health endpoint lives under billing — see
  [[deployment-architecture]].

## Two commercial paths that do not enforce the same rules

There are two ways a price reaches a buyer, and as of 2026-09-11 they disagree.

- **Public / website** — `resolveCommercialOffer` narrows by channel, then by
  market publication, then by price publication. It fails closed.
- **Tenant product** — `BillingService.getPublicPlans` selects prices on
  `isActive` alone, and every tenant-side checkout guard tests the *plan's*
  publication status rather than the *price's*. `marketId` is not read anywhere
  in `billing.service.ts`.

The visible consequence is the currency selector on
`/settings/subscription/plans`, which offers a tenant every currency any plan
has a price in — PKR, QAR and USD — with no market scoping and no server-side
validation that the chosen price belongs to the buyer. The schedules are not at
parity, so the cheapest currency is roughly half price in real terms.
[[BUG-3333]] and [[BUG-3334]].

**The rule that matters for future work:** when adding a commercial gate, add it
to the shared predicate, not to one of the paths. This divergence is what three
independent copies of the publication rule produced.

## The tenant Plans screen quotes a shape the API stopped using

`BillingSettingsClient` was written against `unitAmount` before the seat model
existed and was never revisited. It renders a per-seat price as a flat monthly
charge, ignores the seat field it collects, truncates plan feature lists to
eight, and offers a Subscribe button to tenants whose subscription is already
active — which the server correctly refuses with 409, because there is no
tenant-facing plan-change endpoint at all. [[BUG-3330]], [[BUG-3331]],
[[BUG-3332]].

The pattern is worth naming: the server grew `billingModel`, `includedSeats`,
`minimumSeats`, `pricePerSeat`, `isPopular` and `checkoutReadinessReasons`, the
response type declared them optional, and the component kept compiling while
quoting the old shape. **An optional field on a response type is where a
presentation layer goes stale silently.**

The same screen is also the web app's largest design-system holdout. It imports
nothing from `apps/web/app/components/ui/`, hand-rolls seven local copies of
components that already exist there, and fills every primary action with
`bg-foreground` — the tenant's *body text* colour — rather than `bg-accent`, the
tenant's brand. Measured at `caad4a56`: 116 files import the shared kit, 120 use
`bg-accent`, and 3 use `bg-foreground` as a fill, two of which are subscription
screens. [[BUG-3345]].

`PlanChangeService` and `SeatChangeService` are registered in `billing.module.ts`
and injected nowhere. Before building a plan-change flow, read them — the
capability may already be most of the way there.

## Where billing meets provisioning

The `identities-and-billing` step of tenant provisioning creates the tenant's
**subscription and first invoice** alongside its owner and service account. That
bundling is why the step is non-retryable, and why a tenant that fails before it
is currently unrecoverable:
[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]].

The proposed fix depends on billing supplying an idempotency anchor — invoice
`idempotencyKey` — so the step can be replayed without producing a second
invoice. **That is a billing design question inside a provisioning bug.**

[[BUG-0022-provision-tenant-has-no-confirmation-step]] has the same shape from
the other side: an unconfirmed click that creates a billable subscription and
invoice, with no request-level idempotency.

## Data sensitivity

`subscription.finalPrice` leaked through an unguarded settings alias —
[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]]. Commercial pricing
is not automatically as visible as the feature flags it sits beside.

## Gaps

No QA run covers billing end to end. Anything asserted about Stripe behaviour
here would be inference, so nothing is asserted.

Not measured as of 2026-09-11, and worth measuring before the next commercial
change: how many production `PlanPrice` rows are `DRAFT` or carry a null
`marketId`, and how many live tenants are actively using modules their plan
excludes.

The second number is the one that gates a decision. The plan comparison table
promises module exclusivity that the runtime currently only logs about:
`EntitlementGuard` is wired across payroll, timesheets, projects, recruitment and
onboarding, and the enforcement mode defaults to `REPORT_ONLY`. Verified on the
Starter demo tenant on 2026-09-11 — `/payroll/cycles` and `/recruitment/jobs`
both render in full while the Plans screen offers to sell them. [[BUG-3350]].

### Measured 2026-09-12, and the answer was not what the paragraph above expects

[[SESSION-0103]] ran the count. **A rendering screen is not a used module, and
the difference decides who keeps access.**

Three production subscriptions exist, all Starter, all `ACTIVE`. Grandfathering
would grant exactly two overrides, both to the demo tenant: `projects` and
`timesheets`. It would grant **neither Payroll nor Recruitment** — the two the
paragraph above names as verified in use.

Both observations are correct. The screens render; the tables are empty. There
is no payroll cycle, no job opening and no onboarding case anywhere in that
tenant. "Renders in full" was true of the shell and its empty state, and only a
row count can tell that apart from use.

The consequence is the durable lesson. Grandfathering can only protect what a
tenant has actually *done*, so it cannot protect a module that has been demoed
rather than used — which is precisely the set most likely to be demoed again.
Enforcement would have removed Payroll, Recruitment and Onboarding from the demo
tenant despite the grandfathering step having run, which inverts what running it
was for.

Two further things worth carrying:

- Four feature keys the comparison table sells — desktop agent, compliance, data
  management and attendance integrations — have **no route guard at all**.
  Switching enforcement on cannot make the table's claims about those four true,
  because nothing checks them.
- Deploying does not switch enforcement on, and this is deliberate rather than
  incidental. The default stays `REPORT_ONLY` and the setting is kept out of
  `seed-config` on purpose: `seed:config` runs on every release, and a new field
  in the shipped defaults goes live in every environment that never set it. A
  cutover as a deploy side effect is the failure mode [[ADR-0009]] exists to
  prevent. The mode is re-read on a short TTL, so flipping it is a deliberate act
  that takes effect — and can be reversed — within a minute.

## Related

[[tenant-provisioning]] · [[customers]] · [[settings]] ·
[[integration-architecture]] · [[deployment-architecture]] ·
[[BUG-3330]] · [[BUG-3331]] · [[BUG-3332]] · [[BUG-3333]] · [[BUG-3334]] ·
[[BUG-3335]] · [[BUG-3336]]
