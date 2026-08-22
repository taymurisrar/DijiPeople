---
ID: BUG-0080
aliases: [BUG-0080]
Title: Seeded prices bill a flat fee while the Terms say the billable unit is an active employee
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: ARCHITECT
DetectedDate: 2026-08-20
DetectedInSha: d4c0b00
AffectedModules: [billing, super-admin, legal]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-075
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-20
---

# BUG-0080 — Seeded prices bill a flat fee while the Terms say the billable unit is an active employee

## Summary

The Terms of Service draft states: *"The billable unit is an **active
employee**."* An entire seat engine exists to support that — active-employee
counting, usage history, overage, seat-change lifecycle, all delivered by
TASK-0007 WP-04 and WP-06.

Every seeded price is `BillingModel.FLAT`.

So a buyer who selects 5 seats, 50 seats or 500 seats is charged the same
amount, and the seat count they chose has no effect on what Stripe collects.

## Expected Behavior

Either the prices bill per active employee, matching the Terms and the seat
engine — or the Terms and the pricing page describe a flat subscription and the
seat field is not presented as something that changes the price.

## Actual Behavior

A checkout for 5 seats of Growth produced a Stripe session for **$399**, the
flat monthly amount. Not $1,995.

## Reproduction

Against the Stripe sandbox with the synced USD prices:

1. `POST /public/subscribe` with `seatQuantity: 5` for Growth monthly.
2. Verify the owner email, resubmit, and retrieve the resulting session.
3. `amount_total` is `39900`.

## Evidence

`commercial-bootstrap.ts:352` — every seeded price:

```ts
billingModel: BillingModel.FLAT,
```

`seed-legal.ts:190`, Terms of Service draft:

> The billable unit is an **active employee**. Employees counted as active are
> those in active, probation or notice status.

Confirmed live on 2026-08-20 by a temporary spec driving the real Stripe
sandbox through `BillingService.createPublicSubscriptionCheckout`:

```
seatQuantity: 5, Growth monthly (unitAmount 399.00, billingModel FLAT)
Stripe session amount_total: 39900
```

The code is self-consistent — `calculateSeatPricing` multiplies only for
`PER_SEAT`, and `FLAT` correctly ignores the seat count. The defect is that the
seeded configuration and the customer-facing description disagree about which
model this product uses.

## Root Cause

Not established, and worth saying so. Two plausible readings:

1. The seat engine was built for a per-employee model and the bootstrap was
   never updated from an earlier flat-fee design.
2. The product genuinely is a flat subscription with a seat *cap*, and the Terms
   draft describes an intention rather than the implementation.

Which one it is determines the fix, and neither is an engineering call.

## Impact

**Revenue, in whichever direction the answer goes.** If the product is meant to
bill per employee, every self-service customer is currently undercharged by a
factor of their headcount. If it is meant to be flat, the Terms promise a
metering model that does not exist, and the seat field on the pricing page
misleads.

The wizard asks for a seat count and shows an estimate. Today that estimate is
computed from a `PER_SEAT` branch that the seeded prices never take, so a buyer
can be shown one figure and charged another — which is the one part of this that
is a straightforward defect regardless of the product answer.

Nothing has been mischarged yet: no live prices exist and no real payment has
been taken.

## Affected Areas

- `commercial-bootstrap.ts` — seeds every price `FLAT`
- `billing-seat-pricing.ts` — `calculateSeatPricing`, the `PER_SEAT` branch
- `seed-legal.ts` — Terms and Subscription/Billing Terms drafts
- `apps/landing/app/subscribe` — the seat field and its estimate
- The whole active-employee seat engine, which currently bills nothing

## Proposed Resolution

`PRODUCT_DECISION` first, engineering second. The question for the business:

> **Is DijiPeople priced per active employee, or is it a flat subscription with
> a seat cap?**

If per employee: seeded prices become `PER_SEAT`, and the Stripe prices are
recreated with `recurring.usage_type` matching. If flat: the Terms draft is
corrected before publication and the seat field stops implying it affects price.

Either way the pricing page, the wizard estimate, the Terms and the seeded
`billingModel` must all state the same thing — the defect is the disagreement,
not any one of them.

## Acceptance Criteria

- The seeded `billingModel`, the Terms wording and the wizard's estimate agree.
- A checkout for N seats charges what the pricing page showed for N seats.
- A regression asserts the amount Stripe receives against the displayed estimate.

## Regression Coverage

REG-075, added with the fix, plus the QA scenario *"a flat price is never
described as per-employee"*. The guard is on the **wording against the model**
rather than on the arithmetic, which is the right place: the arithmetic was never
wrong.

## Dependencies

Blocks nothing technically. Blocks going live commercially: it decides what
customers are charged.

## Related Items

[[TASK-0008]] · [[TASK-0007]]

## Resolution

Fixed 2026-08-20 in `e9f977c` — *"the prices were right, the words were wrong"*.

The product answer was **flat**: DijiPeople is a flat subscription per plan, and
plans differ by the modules they include rather than by headcount. So the code
was correct and the legal text was not, and `seed-legal.ts` was rewritten to
match:

- **Terms of Service** — *"The subscription is a flat fee per plan, for the
  billing period chosen. It does not vary with the number of employees in the
  workspace — the plans differ by the modules they include. Active-employee
  numbers are measured for capacity, not for billing."*
- **Subscription and Billing Terms** — *"A flat subscription fee per plan… The
  fee does not change with the number of employees in the workspace"*, followed
  by a **How employees are counted** section that says explicitly that headcount
  is measured for capacity and *"is not what you are billed on"*.

The active-employee seat engine is therefore not unused — it governs **capacity**
and makes a capacity dispute answerable from usage history. It simply is not the
billing basis, and the Terms now say which of the two it is.

`billingModel` stayed `FLAT` in `commercial-bootstrap.ts`, and that was the
deliberate, documented answer rather than an accident.

### Superseded the same day — the model changed, the defect did not

Later on 2026-08-20 the owner changed the product: **per active employee on the
public site and self-service checkout, flat by arrangement through sales.** Both
models are now seeded for the same plan, market, cycle and currency, and the
channel decides which one a caller can reach.

This record stays `FIXED`. What it was about — the code and the Terms making
different claims — was genuinely fixed by `e9f977c`, and the new model was
implemented with the Terms rewritten in the same change, so the two have never
been out of step since.

The work is
[`EXECPLAN-0002`](../plans/EXECPLAN-0002-per-seat-public-pricing-with-sales-assisted-flat.md)
under TASK-0010 WP-08. It is recorded here rather than left for a reader to
discover, because a Resolution section describing a model the product no longer
uses is exactly the stale prose [[ITEM-0071]] was written to catch — and this
record has already misled one reader today.

## QA Retest

Pass. REG-075 and the QA scenario *"a flat price is never described as
per-employee"* were added with the fix and assert the wording against the seeded
billing model, so the two cannot drift apart again silently.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-075 names `apps/landing/lib/plan-presentation.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, apps/landing   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-20 — superseded by a product change: per-seat for self-service, flat
  by arrangement. The Terms were rewritten with it, so code and words still
  agree. See EXECPLAN-0002.
- 2026-08-20 — **this record was left half-written, and it cost a later task an
  hour and a wrong decision.** `e9f977c` fixed the defect, rewrote the Terms,
  added REG-075 and a QA scenario, and updated the regression register, the
  remediation inventory and three dashboards. It never filled in this record's
  own `## Resolution` and `## QA Retest` sections, which still read *"Pending a
  product decision"* and *"Pending"* while `Status` correctly read `FIXED`.

  During TASK-0010's release readiness assessment that stale narrative was read
  as authoritative. The record was reversed to `PRODUCT_DECISION`, the seeded
  `billingModel` was changed to `PER_SEAT`, the base prices were zeroed, and the
  owner was asked to settle a question that had been settled the same day. All of
  it was reverted once `seed-legal.ts` was actually read.

  The lesson is not "read the code" in general — it is narrower and sharper.
  **A record whose `Status` and whose prose disagree is not a record; it is two
  claims.** The status field is generated and checked, so it was right. The prose
  is written by hand and checked by nobody, so it was wrong, and it was the more
  persuasive of the two because it explained itself. `Status: FIXED` with
  `Resolution: Pending` should be a validation error, not a puzzle for a future
  reader — filed as [[ITEM-0071]].
- 2026-08-20 — fixed in `e9f977c`. The product answer was flat; the Terms were
  rewritten to say so.
- 2026-08-20 — found while proving the checkout path against the real Stripe
  sandbox. The test asserted `5 x $199 = 99500` from the pricing page's own
  logic; Stripe returned `39900`. The literal in the test was wrong *and* it was
  wrong in the same way a customer's expectation would be, which is what made
  the mismatch visible.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0071]]
- Modules — [[billing]], [[super-admin]], [[legal]]
- Regression — REG-075 (see the regression register)

<!-- GRAPH:END -->
