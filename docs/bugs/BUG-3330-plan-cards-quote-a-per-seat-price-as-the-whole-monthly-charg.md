---
ID: BUG-3330
aliases: [BUG-3330]
Title: Plan cards quote a per-seat price as the whole monthly charge and ignore the seat count entirely
Status: OPEN
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
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt:
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

**Server-side support only** — the UI fix (`apps/web`'s `BillingSettingsClient`)
is out of this record's scope, owned by a concurrent stream, and is where
this record's acceptance criteria actually get satisfied. This is the
prerequisite the record itself recommended: "Prefer exposing the existing
`calculateSeatPricing` through a quote endpoint over reimplementing the
arithmetic in the browser."

New endpoint, for the sibling `apps/web` stream to call:

```
GET /billing/plan-prices/:planPriceId/seat-quote?seats=<n>
```

Guarded and tenant-scoped exactly like every other billing read
(`@Permissions(BILLING_VIEW)` + `@RequirePermission(TENANT_ADMINISTRATION, 'read')`),
and additionally gated by the same sellability + market checks
`createCheckoutSession` applies (BUG-3334/BUG-3333) — a price this tenant may
not buy is not a price this tenant may be quoted either.

Response shape:

```json
{
  "planPriceId": "uuid",
  "planId": "uuid",
  "billingModel": "PER_SEAT | FLAT",
  "billingInterval": "MONTH | YEAR",
  "currency": "USD",
  "seats": 25,
  "minimumSeats": 1,
  "maximumSeats": 250,
  "includedSeats": 5,
  "billableSeats": 20,
  "unitPrice": 10,
  "total": 200
}
```

`total` is `unitPrice * billableSeats`, computed via the existing
`calculateSeatPricing`/`resolveBillableSeats` in
`services/api/src/modules/billing/billing-seat-pricing.ts` — the single
implementation this record itself warned had to be de-duplicated once
already, never a third copy in the browser. A seat count outside
`minimumSeats`/`maximumSeats` is refused (400) with the bound stated in the
message, via the same `normalizePurchasedSeats` used at checkout.

`BillingService.getSeatQuote(tenantId, planPriceId, seats)` is the
implementation; `services/api/src/modules/billing/controllers/billing.controller.ts`'s
`getSeatQuote` handler is the route.

Specs: `services/api/src/modules/billing/services/billing-seat-quote.spec.ts`
(new) — PER_SEAT and FLAT arithmetic, minimum/maximum bound refusal, DRAFT
price refusal, foreign-market price refusal, unknown price refusal.

Not done here, and this record cannot be marked `FIXED` until it is: the
plans screen actually rendering "per seat" wording, `includedSeats`, an order
summary calling this endpoint, and binding the seat input to
`minimumSeats`/`maximumSeats` in the UI.

## QA Retest

Pending the `apps/web` half. Server behaviour can be retested now:
`GET /billing/plan-prices/:id/seat-quote?seats=N` for a real published
per-seat price returns a total equal to `unitPrice * (N - includedSeats)`,
refuses a seat count outside bounds with the bound named in the message, and
refuses a DRAFT or foreign-market price the same way checkout does.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.
- 2026-09-12 — Server half landed: `GET /billing/plan-prices/:planPriceId/seat-quote`.
  UI half remains open with a concurrent `apps/web` stream.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0161]]
- Modules — [[tenant-application]], [[billing]]

<!-- GRAPH:END -->
