---
ID: ITEM-0161
aliases: [ITEM-0161]
Title: Subscription plans screen content and interaction polish
Type: UX
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
RelatedBug: BUG-3330
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0161 — Subscription plans screen content and interaction polish

## Summary

The smaller findings from the 2026-09-11 review of
`/settings/subscription/plans`, collected so they can be fixed in one pass rather
than filed as eight records. None of them alone justifies a bug record; together
they are most of what makes the screen feel unfinished.

**Content**

- "Plans shown here are active, public, and configured by the platform billing
  team." A tenant does not know or care that DijiPeople has a billing team. This
  is internal vocabulary on a customer-facing purchase screen.
- The page heading renders "Plans" while the tab it belongs to is "Plans &
  Features" and `SettingsShell` is given "Plans & Features". Three names, two of
  them visible at once.
- Empty-state copy has the same problem: "The billing team has not published any
  self-service plans yet."
- No tax, VAT or "exclusive of taxes" statement anywhere, on a screen that shows
  prices and collects a purchase. `tax-basis.service.ts` exists on the server.
- "This plan is not available for online checkout yet." is a dead end with no
  contact route. The API returns `checkoutReadinessReasons`, and the presentation
  payload carries a `contactLabel` that is only used when self-service is
  disabled entirely.

**Information structure**

- Subscription lives under Settings → General Setup → Apps & Modules. Billing and
  subscription are not an app or a module, and a tenant administrator looking for
  invoices is unlikely to open "Apps & Modules" to find them.
- **Seats to purchase** sits above the "Plans / Select a subscription plan"
  heading, separated from the Billing cycle and Currency controls it belongs
  with, which sit to the right of that heading. Three inputs to one decision, in
  two places, in the wrong order.
- The feature comparison puts Payroll & Finance last, after Platform. It is the
  most expensive differentiator on the screen.

**Interaction**

- The seat field cannot be cleared. `onChange` runs
  `setSeatQuantity(Math.max(1, Number(event.target.value)))`, so deleting the
  contents immediately writes `1` back and you cannot select-and-retype a
  multi-digit number in the usual way. `Number("1e3")` is also accepted by a
  `type="number"` field and yields 1000.
- Seat bounds are invisible. `minimumSeats` and `maximumSeats` are returned by the
  API and neither is bound to the input; a value above the maximum is silently
  clamped at submit time with no feedback. Covered as item 4 of [[BUG-3330]].
- The seat field does not default to, or mention, how many employees the tenant
  actually has. `ActiveEmployeeCountService` and `SeatUsageService` both exist.
- The current-plan button carries an `ArrowUpRight` icon — the same "go
  somewhere" icon used by "Manage in Stripe" — on a disabled control that goes
  nowhere, next to a `Current` chip that already says the same thing.
- `CreateCheckoutSessionDto` accepts a `promotionCode` and the screen offers no
  field for one, so a promotion can only be applied by typing it into Stripe's
  own page.
- `const [plans] = useState(initialPlans)` — a setter that does not exist, so
  plans never refresh even when "Refresh status" is pressed on the Overview tab.
- The API returns `availableBillingCyclesByCurrency`, saying exactly which
  cycle and currency pairs have prices. The screen ignores it, so selecting a
  pair with no prices shows three cards reading "Not available" with no hint
  that another pair would work. See [[BUG-3333]] for what that costs.
- `SafeExternalLink` validates no origin despite the name; it sets
  `rel="noopener noreferrer"` and nothing more. `window.location.assign` is
  likewise called on whatever URL the checkout and portal endpoints return.
  Both URLs come from our own API today, so this is a naming and
  defence-in-depth point rather than a live hole — but a component named Safe
  should do the check its name claims.
- `fetchJson` reads only `message` from the error body, discarding the
  `traceId`, `description` and `fieldErrors` that `HttpExceptionFilter` sends.
  A customer reporting a failed checkout has no trace id to quote.

## Why It Matters

This is the screen where a tenant decides whether to give DijiPeople more money.
Individually these are small; collectively they are the difference between a
purchase flow and a settings form that happens to have prices on it.

## Evidence

All in `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`
unless stated:

- internal copy, lines 366-369 and 399-405
- seat field, lines 346-357
- `ArrowUpRight` on the disabled current-plan button, line 491
- `useState(initialPlans)`, line 104
- `fetchJson`, lines 976-994
- heading source, `apps/web/app/(authenticated)/settings/subscription/_components/subscription-settings-page.tsx:21-26`
- `promotionCode`, `services/api/src/modules/billing/dto/create-checkout-session.dto.ts`

## Proposed Approach

No ExecPlan needed. Take it in one pass alongside [[BUG-3330]], since that record
already rebuilds the price and seat area.

1. Rewrite the customer-facing copy without internal role names, and settle on one
   name for the screen.
2. Move the seat field next to Billing cycle and Currency, after the heading.
3. Hold the seat input as a string while editing so it can be cleared, and bind
   its bounds.
4. Default the seat count to the tenant's active employee count, and say what that
   count is.
5. Drop the arrow icon from the disabled current-plan button.
6. Add a promotion code field, or remove `promotionCode` from the DTO.
7. Carry the trace id into the error banner.
8. Add a tax statement, and give the not-purchasable panel a contact route.
9. Consider moving Subscription out of Apps & Modules into its own settings group.

## Acceptance Criteria

- No customer-facing string on the screen names an internal DijiPeople team.
- The screen has one name.
- The seat field can be cleared and retyped, and states its bounds.
- A failed checkout shows a trace id the customer can quote.

## Dependencies

Overlaps [[BUG-3330]] (seat and price area) and [[ITEM-0159]] (error banner
semantics).

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3336]],
[[ITEM-0159]], [[ITEM-0160]], [[BUG-3345]], [[BUG-3350]]

## History

- 2026-09-11 — created at `caad4a56`.
- 2026-09-11 — Architect triage: `DEFER` — none of it blocks; fold into the
  [[BUG-3330]] change.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3330]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
