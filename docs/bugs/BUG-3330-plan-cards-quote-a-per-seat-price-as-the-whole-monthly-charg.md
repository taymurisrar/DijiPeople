---
ID: BUG-3330
aliases: [BUG-3330]
Title: Plan cards quote a per-seat price as the whole monthly charge and ignore the seat count entirely
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web, services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-413
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3330 — Plan cards quote a per-seat price as the whole monthly charge and ignore the seat count entirely

> **Architect triage, 2026-09-11 — `FIX_NOW`.** This is the price a buyer reads
> immediately before authorising a card. Everything else on the screen can wait
> behind it.

## Summary

Every price on the tenant Plans screen is a **per-seat** price. The screen renders
it as `PKR 300.00 / month` with no seat qualifier, next to a **Seats to purchase**
field that changes nothing when you type in it. A buyer who enters 25 seats reads
"PKR 300.00 / month" and is charged `300 x 25 = PKR 7,500` per month by Stripe.
The screen never shows a total, and never shows the word "seat".

Only self-service prices reach this screen, and self-service prices are per-seat by
construction — `getPublicPlans` filters to `SELF_SERVICE`, and the flat rates that
would make a bare monthly figure correct are deliberately excluded as internal
(`flat-pricing-is-internal.spec.ts`). So the label is wrong for every price the
screen can ever display, not merely for some of them.

## Expected Behavior

A per-seat price is labelled per seat, and a screen that collects a seat count
shows the total that seat count produces before the buyer commits to it. The API
already returns everything needed to do this: `pricePerSeat`, `includedSeats`,
`minimumSeats`, `maximumSeats` and `billingModel`, and `calculateSeatPricing()`
already computes `billableSeats` and `estimatedMonthlyCharge` from them.

## Actual Behavior

- The unit amount renders with the suffix `/ month` or `/ year` and no seat wording.
- Changing **Seats to purchase** from 1 to 25 leaves all three cards unchanged.
- No order summary, subtotal, total, tax line or currency note exists anywhere on
  the screen.
- `includedSeats` is never shown, so a plan with included capacity cannot be told
  apart from one without it.

## Reproduction

1. Sign in to a tenant with subscription access and open
   `/settings/subscription/plans`.
2. Read the Starter card: `PKR 300.00 / month`.
3. Set **Seats to purchase** to `25`.
4. Read the Starter card again: still `PKR 300.00 / month`.

Verified live on the `dijipeople-demo` tenant on 2026-09-11.

## Evidence

Rendering, `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx:441-449` —
the amount and the interval suffix, with no reference to `seatQuantity` or
`price.billingModel`:

```tsx
{formatMoney(price.unitAmount, price.currency)}
<span className="text-sm font-medium text-muted">
  {" "}
  / {billingCycle === "MONTHLY" ? "month" : "year"}
</span>
```

`seatQuantity` is read in exactly one place, and it is the checkout call rather
than the display — same file, lines 151-159.

What Stripe is actually asked to charge,
`services/api/src/modules/billing/billing-seat-pricing.ts:144-147`:

```ts
return {
  price: stripePriceId,
  quantity: billingModel === BillingModel.PER_SEAT ? purchasedSeats : 1,
};
```

The API sends the fields the screen would need,
`services/api/src/modules/billing/services/billing.service.ts:200-224`:
`billingModel`, `billingInterval`, `pricePerSeat`, `minimumSeats`,
`maximumSeats`, `includedSeats`. The frontend type declares four of them optional
and reads none.

Live values read from the rendered DOM at 25 seats:

| Plan | Rendered | Charged at 25 seats |
|---|---|---|
| Starter | PKR 300.00 / month | PKR 7,500 / month |
| Growth | PKR 550.00 / month | PKR 13,750 / month |
| Enterprise | PKR 900.00 / month | PKR 22,500 / month |

## Root Cause

The seat model was built on the server and never given a presentation layer. The
card was written against `unitAmount` alone, before `billingModel` and
`includedSeats` existed, and was not revisited when they were added.

## Impact

Reachable in production by every tenant administrator who can see the screen. A
buyer is quoted one figure and billed a multiple of it, with the multiplier taken
from a field that gives no feedback. For a mid-size tenant the gap between the
quoted and charged amount is one to two orders of magnitude. This is a pricing
disclosure problem, not only a UI defect.

## Affected Areas

- `/settings/subscription/plans` (tenant product)
- `BillingSettingsClient` — the same component also serves the Overview and
  Billing History views
- `POST /api/billing/checkout-sessions` consumes the seat count the screen never
  explains

## Proposed Resolution

No ExecPlan needed; this is contained to one component plus the response type.

1. Render the interval suffix from `billingModel` — `per seat / month` for
   `PER_SEAT`, `/ month` for `FLAT` — rather than from the selected cycle alone.
2. Surface `includedSeats` on the card when it is non-zero.
3. Add an order summary beside the seat field showing seats, unit price, billable
   seats and the resulting total, computed by the same rule as
   `resolveBillableSeats` so the two cannot drift. Prefer exposing the existing
   `calculateSeatPricing` through a quote endpoint over reimplementing the
   arithmetic in the browser — that rule already had to be de-duplicated once on
   the server after two copies disagreed.
4. Bind the seat input to `minimumSeats` / `maximumSeats` and show the bounds.

## Acceptance Criteria

- A per-seat price never renders without the word "seat".
- Changing the seat count changes a visible total on the same screen.
- The displayed total equals `unitAmount` times `resolveBillableSeats(price, seats)`.
- A seat count outside the price's bounds is refused in the field, with the bound
  stated, rather than silently clamped at submit time.

## Regression Coverage

Needs a REG entry once fixed: a component test asserting that a `PER_SEAT` price
at N seats renders both the per-seat wording and the N-seat total, and that the
total matches `calculateSeatPricing`.

## Dependencies

None. Independent of [[BUG-3333]], though both change what the price area says.

## Related Items

[[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3335]], [[BUG-3336]]

## Resolution

Fixed in `apps/web` only (services/api unchanged, per this task's scope — no
tenant-owned or platform-owned server logic was touched).

`apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`:

1. The interval suffix is now rendered by `formatPriceQualifier`, which reads
   `price.billingModel`: `PER_SEAT` renders `/ seat / month` (or `/ year`);
   anything else renders the plain `/ month` — the word "seat" now appears on
   every per-seat price and only on those.
2. `includedSeats` is shown on the card when non-zero ("Includes N seats"),
   and the seat bounds (`formatSeatBounds`) are always shown.
3. Each plan card carries an "Order summary" block showing seats requested,
   billable seats, and the resulting total for the currently selected billing
   cycle, computed by `estimateSeatOrder` in the new
   `apps/web/app/(authenticated)/settings/billing/_lib/seat-pricing.ts`. No
   quote endpoint exists yet, so this mirrors the server's
   `resolveBillableSeats`/`calculateSeatPricing` rule client-side rather than
   reimplementing it ad hoc — see the `TODO(BUG-3330)` in that file, which
   flags the duplication for the API stream to close with a real quote
   endpoint. Regression coverage for the arithmetic itself lives in the
   colocated `seat-pricing.spec.ts` (mirrors the fixture values from the
   server's own `billing-seat-pricing.spec.ts`).
4. `createCheckoutSession` no longer clamps an out-of-bounds seat count with
   `Math.max`/`Math.min` before submitting. It calls `validateSeatCount` and
   refuses (with the bound stated, via the existing error banner) rather than
   silently substituting a different number than the one entered. Each card
   also shows this validation inline against its own price's bounds, since
   `minimumSeats`/`maximumSeats` differ per plan and the seat field is shared
   across all three cards.

## QA Retest

Pending — needs a QA pass against a live tenant with a `PER_SEAT` price at
several seat counts, and confirmation that a seat count outside a price's
bounds is refused rather than silently clamped at checkout.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.
- 2026-09-12 — fixed in `apps/web` (SESSION-0103, `agent/r-s1-billing-web`).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0161]]
- Modules — [[tenant-application]], [[billing]]
- Regression — REG-413 (see the regression register)

<!-- GRAPH:END -->
