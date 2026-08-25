---
ID: BUG-1302
aliases: [BUG-1302]
Title: Annual per-seat price is labelled per month on the checkout page
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt:
---

# BUG-1302 — Annual per-seat price is labelled per month on the checkout page

## Summary

On `/subscribe`, the plan card under the headline price renders a seat-total
estimate that always ends in the words "per month", whatever billing cycle is
selected. With **Annual** billing the number shown is the *annual* total, so the
page tells the buyer that a yearly charge is a monthly one — overstating the
cost of an annual subscription by a factor of twelve, on the last screen before
payment.

## Expected Behavior

The estimate names the period it actually covers. For an annual per-seat price
the line should read `... estimated <total> per year.`, or convert the annual
figure to a genuine monthly equivalent and say so — the way `/plans` already
does with "Billed annually" and "Save 17% versus monthly".

## Actual Behavior

The suffix is the literal string `per month.` regardless of
`selectedPrice.billingCycle`, so the annual total is presented as a monthly
charge.

## Reproduction

1. Open `/subscribe?plan=starter&billingInterval=YEAR&teamSize=25`.
2. Read the estimate line beneath the headline price in the "Selected plan" card.
3. Switch the **Billing** select to `Monthly` and read the same line again.

Observed on production (`www.dijipeople.com`, QAR market) and reproduced against
a local stack on `develop` at `42435d59`.

## Evidence

Production, Annual selected — the site's own text:

```
QAR 80
25 purchased seats · estimated QAR 2,000.00 per month.
```

`QAR 80` is captioned "per active employee / **year**" on `/plans`, so
`25 x 80 = 2,000` is the annual total. The same card with Monthly selected reads
`QAR 8 ... estimated QAR 200.00 per month.`, which is correct — establishing
that only the annual case is wrong.

Local stack, USD market, Annual, 25 seats — page said:

```
$3
25 purchased seats · estimated $75.00 per month.
```

The Stripe Checkout session created from that exact click charged:

```
Subscribe to Starter — QAR 284.40 per year
QAR 23.70 / month billed annually
Qty 25, Billed annually, QAR 11.38 each
Total due today  QAR 284.40
```

QAR 284.40 is USD 75 at the 1 USD = 3.7921 rate Stripe displayed — the real
charge is **$75 per year** while the DijiPeople page said **$75 per month**.
Stripe is correct; the landing page is not.

Source — [`apps/landing/app/subscribe/subscribe-form.tsx:555`](../../apps/landing/app/subscribe/subscribe-form.tsx#L555):

```ts
? `${effectiveSeatQuantity} purchased seat${effectiveSeatQuantity === 1 ? "" : "s"} · estimated ${new Intl.NumberFormat("en-US", { style: "currency", currency: selectedPrice.currency }).format(selectedPrice.unitAmount * effectiveSeatQuantity)} per month.`
```

`per month.` is hardcoded into the template literal. `selectedPrice` carries
`billingCycle` (`MONTHLY` | `ANNUAL`) and `billingInterval` (`MONTH` | `YEAR`),
neither of which is consulted.

## Root Cause

The estimate string was written for the per-seat monthly case and the period was
baked into the literal rather than derived from the selected price. When annual
per-seat prices became sellable the string was not revisited, so the same branch
now serves both cycles.

## Impact

Reachable in production today on every plan card where an annual per-seat price
is selected. The error overstates price, so the commercial risk is abandoned
checkouts rather than undercharging — a buyer comparing DijiPeople against a
competitor sees a figure twelve times the real one immediately before paying. It
also contradicts the site's own promise on `/plans` ("Is the price I see the
price I pay? Yes."), and the number the buyer is then shown by Stripe does not
match the number the site quoted, which is the kind of discrepancy that
generates chargebacks and support load.

Annual prices are not currently *purchasable* in production (see [[BUG-0898]]
for the wider readiness picture), so the live blast radius is limited until
annual prices are synced — at which point it becomes immediate.

## Affected Areas

- `apps/landing/app/subscribe/subscribe-form.tsx` — the estimate line.
- Every plan/currency combination whose `billingModel` is `PER_SEAT` and whose
  `billingCycle` is `ANNUAL`.
- Not `/plans`, which renders period captions correctly from the same data.

## Proposed Resolution

Derive the suffix from the selected price rather than hardcoding it — the same
`billingCycle`/`billingInterval` the card already uses to render
`formatPlanPrice`. No ExecPlan needed; this is a single presentational
expression plus a unit test per cycle.

Worth deciding at the same time whether the annual card should show the annual
total, a derived monthly equivalent, or both — `/plans` shows both and reads
well, so matching it would remove the inconsistency between the two screens.

## Acceptance Criteria

- With an `ANNUAL` per-seat price selected, the estimate names a yearly period
  and the figure equals `unitAmount x seats` for that year.
- With a `MONTHLY` per-seat price selected, the line is unchanged from today.
- The period shown on `/subscribe` agrees with the period Stripe Checkout shows
  for the session created from that selection.

## Regression Coverage

Needs a test that fails without the fix: render the plan card with an `ANNUAL`
per-seat price and assert the estimate does not contain "per month". A unit test
over the formatting helper is sufficient; it does not need the browser.

## Dependencies

None. Fixable independently of the checkout-readiness work.

## Related Items

- [[BUG-0898]] — why annual prices cannot currently be bought at all.
- [[BUG-0027]] — admin plan pricing and checkout pricing come from different models.
- [[BUG-0793]] — checkout quotes the wrong currency.

## Resolution

Not yet fixed.

## QA Retest

Pending. Retest with the annual Starter selection used in
`docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md`.

## History

- 2026-08-25 — created from qa run at `42435d59`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]

<!-- GRAPH:END -->
