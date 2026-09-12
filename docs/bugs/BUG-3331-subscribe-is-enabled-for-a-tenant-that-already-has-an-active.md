---
ID: BUG-3331
aliases: [BUG-3331]
Title: Subscribe is enabled for a tenant that already has an active subscription and can only ever return 409
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web, services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: EXECPLAN-0037
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3331 — Subscribe is enabled for a tenant that already has an active subscription and can only ever return 409

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** The dead button is a small
> fix. What it is hiding is not: there is no upgrade, downgrade, cycle-change or
> seat-change path in the product at all, and closing that needs proration,
> webhook reconciliation and an ExecPlan.

## Summary

The Plans screen presents three outcomes to a tenant on an active subscription,
and none of them is a working upgrade:

- the current plan shows a **disabled** button reading "Current plan";
- any other plan whose selected price is checkout-ready shows an **enabled**
  "Subscribe" button — which the API refuses with `409 Conflict` every single
  time, because `resolveCheckoutState` rejects a tenant that already has an
  `ACTIVE` or `TRIALING` subscription;
- any other plan whose price is not checkout-ready shows a dashed panel reading
  "This plan is not available for online checkout yet.", with no contact route.

The server behaviour is correct and deliberate — it refuses rather than opening a
second Stripe subscription on the same customer. The defect is that the screen
offers the action anyway, and that there is no endpoint behind which a real plan
change could happen: the tenant billing controller exposes `checkout-sessions`,
`portal-sessions` and `subscription/reconcile`, and nothing else.

## Expected Behavior

A tenant on an active subscription sees, for each other plan, either an action
that can succeed (change plan, with the proration consequence stated) or a clearly
non-actionable state with a route to a human. A button that cannot succeed is not
offered.

## Actual Behavior

Clicking Subscribe posts to `/api/billing/checkout-sessions`, receives
`409 Conflict` with "This tenant already has an active subscription. Use billing
management to change it.", and renders that message in a banner at the very top
of the component. On this screen that banner is roughly 1,400px above the button
that was clicked at desktop width, and about 4,000px above it at phone width, so
the failure is invisible without scrolling back up. The banner is a plain `div`
with no `role="alert"`, so assistive technology is not told either.

"Use billing management to change it" points at a capability the tenant product
does not have. The Stripe Customer Portal on the Overview tab is the only place a
change can be made, and the message does not say so.

## Reproduction

1. Sign in to a tenant with an `ACTIVE` subscription — `dijipeople-demo` is on
   Starter / Active / Monthly.
2. Open `/settings/subscription/plans`.
3. Set Currency to `QAR` (the only schedule whose Growth and Enterprise prices are
   checkout-ready — see [[BUG-3333]]).
4. Growth and Enterprise now render enabled "Subscribe" buttons.
5. Click one. The request fails with 409 and the message appears far above the
   viewport.

A second reproduction, needing no currency change: on any currency, switch Billing
cycle to **Annual**. The Starter card still reads "Current plan" and stays
disabled even though the tenant's subscription is Monthly, so a monthly customer
cannot move to annual billing from this screen at all.

## Evidence

The gate is on plan identity only, not on whether the action can succeed —
`apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx:417-421`:

```tsx
const isCurrentPlan = subscription?.plan.id === plan.id;
const blocksCheckout =
  isCurrentPlan &&
  ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID"].includes(subscriptionState);
```

`billingCycle` and `currency` are absent from that comparison, which is why the
Annual view of a monthly plan reports itself as current.

The server's refusal —
`services/api/src/modules/billing/services/billing.service.ts:1242-1245`:

```ts
throw new ConflictException(
  'This tenant already has an active subscription. Use billing management to change it.',
);
```

The tenant billing surface, `services/api/src/modules/billing/controllers/billing.controller.ts` —
`GET plans`, `GET health`, `GET subscription`, `GET invoices`,
`GET invoices/:invoiceId`, `POST checkout-sessions`, `POST portal-sessions`,
`POST subscription/reconcile`. There is no plan-change or seat-change route, even
though `plan-change.service.ts` and `seat-change.service.ts` exist in the module.

Those two services are not merely unexposed — they are unreachable. Searching
the whole API for `PlanChangeService` and `SeatChangeService` outside their own
files returns only `billing.module.ts:24-25` and `:71-72`, where they are
imported and registered as providers. No controller injects them and no other
service does either. Two fully written services sit in the dependency graph with
zero call sites, which is the clearest available statement that the capability
was built and never wired up.

Error banner placement and markup, same component, lines 238-241 — rendered above
the tab nav, before the plans section, as a `div` with no `role`.

One related inconsistency in the same branch: under `USD` + `Annual`, Starter
renders the `Current` chip **and** the "not available for online checkout"
panel at once, because the checkout-ready branch is tested before the
current-plan branch. The plan you are on is presented as a plan you cannot buy.

## Root Cause

The screen was built for first-time subscription, where "no subscription yet" is
the only state that matters, and was reused unchanged for an existing subscriber.
Checkout readiness and current-plan identity are conflated into one branch, and
neither is compared against the selected cycle or currency.

## Impact

Reachable in production. Every existing customer who tries to upgrade from this
screen gets an error with no explanation in view, and every customer who wants
annual billing is blocked outright. This is the revenue-expansion path for the
whole product, and it does not work. No money is lost or double-charged — the
server refuses correctly — but no upgrade can be completed either.

## Affected Areas

- `/settings/subscription/plans`, `/settings/subscription/overview`
- `POST /api/billing/checkout-sessions`
- `BillingController` — missing plan-change and seat-change routes
- `plan-change.service.ts`, `seat-change.service.ts` — built, unreachable from the
  tenant product

## Proposed Resolution

Needs an ExecPlan; it changes money movement.

Short term, and separable:

1. Derive the button state from whether the action can succeed, not from plan
   identity: with a live subscription, no plan offers "Subscribe".
2. Include `billingCycle` and `currency` in the current-plan comparison so the
   Annual view of a monthly subscription is not labelled "Current plan".
3. Test the current-plan branch before the checkout-readiness branch so the
   current plan is never rendered as unavailable.
4. Move the error banner next to the control that produced it and give it
   `role="alert"`.

The substantive work, for the plan:

5. Expose a tenant plan-change endpoint over the existing `PlanChangeService`,
   with proration quoted before confirmation, or
6. If plan changes are to stay in the Stripe Customer Portal, say so on the card
   and link to the portal from it, rather than offering a button that cannot work.

## Acceptance Criteria

- No control on this screen produces a 409 from
  `POST /billing/checkout-sessions` under any combination of plan, cycle and
  currency.
- A tenant on Monthly can reach Annual billing for the same plan by a path the
  screen offers.
- An error raised by a card's action is visible without scrolling and is
  announced to assistive technology.
- The current plan is never simultaneously chipped `Current` and shown as
  unavailable.

## Regression Coverage

Needs a REG entry: a test asserting that with an `ACTIVE` subscription, no plan
card renders an enabled checkout button, and that a cycle switch does not mark a
differently-cycled price as the current plan.

## Dependencies

[[BUG-3333]] determines which prices are checkout-ready and therefore which cards
currently show the dead button.

## Related Items

[[BUG-3330]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3335]], [[BUG-3336]], [[BUG-3345]]

## Resolution

**API half fixed, per [[EXECPLAN-0037]]. The UI half (items 1-4: button
state, banner placement, current-plan-vs-cycle comparison) is `apps/web` and
out of this record's scope — owned by a concurrent stream.** This record
cannot be closed as fully `FIXED` in the product sense until that lands; the
status here reflects that the substantive, money-moving work (item 5) is
done and reviewable independently.

`services/api` now exposes the plan-change path item 5 asked for:

- `GET /billing/plan-changes/preview?toPlanId=&toPlanPriceId=` — the
  consequences screen's data, including a real money quote (`quote.prorationNow`,
  `quote.newRecurringAmount`, `quote.currency`, `quote.estimated`) computed via
  Stripe's own `invoices.createPreview` for a Stripe-backed subscription, or a
  clearly-labelled (`estimated: true`) local estimate for one that is not
  (e.g. a demo tenant). Never a second proration formula pretending to be
  Stripe's.
- `POST /billing/plan-changes` — `PlanChangeService.requestChange()`, now
  actually reachable, and now actually pushing the change to Stripe
  (`stripe.subscriptions.update` with the new price and
  `proration_behavior: 'create_prorations'`) for an immediate UPGRADE. A
  Stripe failure after the local write commits is reported as
  `stripeSyncPending: true` rather than thrown, since rolling back a
  confirmed, recorded change because Stripe was briefly unreachable would be
  worse than a reconcilable gap.
- `PlanChangeService.applyDueChanges()` — which had **zero callers anywhere
  in the running application**, the same shape of defect as BUG-2618 — is now
  run by a new `SubscriptionChangeSweeperWorker`
  (`SUBSCRIPTION_CHANGE_SWEEPER_ENABLED`, off by default), which also pushes
  the scheduled DOWNGRADE to Stripe (`proration_behavior: 'none'`) at the
  renewal boundary it fires on.
- Same-plan, different-cycle changes (item 6, "a tenant on Monthly can reach
  Annual billing for the same plan") now resolve: `load()`'s same-plan
  refusal only fires when the named price is also unchanged, and
  `resolveDirection()` accepts an explicit `toPlanPriceId` naming a price on
  the target plan, verified against the tenant's own market the same way
  `createCheckoutSession` is (BUG-3334).
- `createCheckoutSession`'s 409 for an existing subscription is **unchanged
  and correct** — it is not this record's defect. The record's acceptance
  criterion ("no control... can produce a 409") is a frontend routing
  question: the plans screen must call the new endpoints instead of
  `checkout-sessions` once a subscription exists, which is the concurrent
  `apps/web` stream's work against this exact contract.

**Residual finding, not fixed here**: `SeatChangeService.applyDueChanges()`
has the identical zero-caller defect and was deliberately **not** wired into
the new sweeper, because doing so would activate a separate, pre-existing gap
— a scheduled seat DECREASE reduces `Subscription.purchasedSeats` locally
with no matching Stripe quantity update, so running it unattended would start
silently under-billing a tenant. Documented in
`docs/environment-variables.md`'s `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` entry
and in the sweeper worker's own comment. Worth its own backlog item.

Full design and reasoning: [[EXECPLAN-0037]],
`docs/plans/EXECPLAN-0037-tenant-plan-change-endpoint.md`.

Specs: `services/api/src/modules/billing/services/plan-change.service.spec.ts`
(new — this service had none before), `subscription-change-sweeper.worker.spec.ts`
(new, modelled on `subscription-order-sweeper.worker.spec.ts`), and
`billing-authorization.spec.ts` (extended for the two new endpoints).

## QA Retest

Pending — needs a QA pass against a Stripe test-mode tenant: request an
UPGRADE and confirm the Stripe subscription's price actually changed in the
Stripe dashboard; request a same-plan cycle change and confirm it is treated
as UPGRADE/DOWNGRADE correctly by amount; enable the sweeper against a
DOWNGRADE scheduled in the past and confirm it applies. The full UI
acceptance criteria (no 409 reachable from the plans screen, banner
placement, `role="alert"`) needs the `apps/web` half to land first.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `PLAN_REQUIRED`.
- 2026-09-12 — [[EXECPLAN-0037]] written and implemented: plan-change preview
  and confirm endpoints, Stripe-facing sync on both the immediate and
  scheduled paths, the dead `applyDueChanges` sweeper, and same-plan cycle
  changes. UI half (items 1-4) remains open, owned by a concurrent stream.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[billing]]

<!-- GRAPH:END -->
