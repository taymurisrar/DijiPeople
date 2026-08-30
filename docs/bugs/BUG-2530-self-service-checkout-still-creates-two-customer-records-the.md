---
ID: BUG-2530
aliases: [BUG-2530]
Title: Self-service checkout still creates two customer records: the wizard's draft id is dropped between the controller and the order service
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-08-30
DetectedInSha: c18b5024
AffectedModules: [billing, super-admin, landing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: QA-COMMERCIAL-001
RegressionId: REG-374
RelatedBacklogItem: ITEM-0118
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2530 — Self-service checkout still creates two customer records: the wizard's draft id is dropped between the controller and the order service

> **Architect triage, 2026-08-30 — `FIX_NOW`.** Reported from production by the
> repository owner after completing a real checkout. This is [[BUG-1516]]
> recurring in production while its record reads `VERIFIED`, which makes it a
> defect in the fix as much as in the checkout.

## Summary

Completing one self-service checkout on the public site creates **two**
`CustomerAccount` rows. The first is the placeholder the subscribe wizard opens
on the workspace-address step; the second is the real one that goes on to pay
and provision. The mechanism built to prevent exactly this — [[BUG-1516]]'s
`onboardingId` hint — never reaches the code that consumes it, because
`BillingService.createPublicSubscriptionCheckout` does not accept the field and
does not forward it.

## Expected Behavior

One completed signup produces exactly one `CustomerAccount`. The draft opened on
the workspace step is continued and its placeholder identity replaced, not
abandoned in favour of a second record.

## Actual Behavior

Two records, one wizard-step apart, with the asymmetry BUG-1516 first described:
the earlier one is `PROSPECT` with no onboarding and none of the organisation
profile, the later one is the real customer that provisions.

Reported from production, `admin.dijipeople.com/customers`, 2026-08-30:

| Customer | Status | Onboarding | Created |
|---|---|---|---|
| Nisa Co | Prospect | 0 | Aug 30, 2026, 3:52 AM |
| Nisa Co | Active | 1 | Aug 30, 2026, 3:53 AM |

## Reproduction

1. Open `https://www.dijipeople.com/subscribe?plan=starter&billingInterval=MONTH&teamSize=10`.
2. Complete the organisation step, then reach the workspace step and let the
   address check run — this is what opens the draft.
3. Complete the remaining steps and submit.
4. In Platform Admin, open Customers sorted by newest.

Two records with the identical company name are present, a minute apart.

## Evidence

**The chain, traced end to end against the deployed system on 2026-08-30.**

The production landing bundle *does* send the field. From
`https://www.dijipeople.com/_next/static/immutable/chunks/3dhwdo6e199-p.js`, on
both subscribe posts:

```js
await fetch("/api/public/subscribe",{method:"POST", …
  body:JSON.stringify({...j(L,{planPriceId:K.id,seatQuantity:ee}),onboardingId:_??void 0})})
```

The landing route handler forwards the body verbatim —
`apps/landing/app/api/public/subscribe/route.ts` does
`body: JSON.stringify(await request.json())` with no field list.

`PublicSubscribeDto` declares `onboardingId` and the global `ValidationPipe` runs
with `forbidNonWhitelisted: true`, so the value passes validation rather than
400-ing. The controller spreads it on:

```ts
return this.billingService.createPublicSubscriptionCheckout({ ...dto, ipAddress, … });
```

And there it stopped. `createPublicSubscriptionCheckout`'s inline input type
listed 26 of the DTO's 27 fields — every one except `onboardingId` — and its
`openOrder` call passed none. `OpenOrderInput.onboardingId` was therefore always
`undefined` on the only path that has a draft to name, so `resolveCustomer`
computed `draftCustomerId = null` on every production signup and fell through to
the identity rules, which match the buyer's real address against the draft's
`pending@onboarding.invalid` and cannot succeed.

The production API at the time of the report was `fba846d` — current `main`,
with the BUG-1516 fix present. The fix was deployed and inert.

## Root Cause

**A fix built at both ends and not in the middle.**

BUG-1516 was closed by two changes: the wizard sends the draft's `onboardingId`,
and `SubscriptionOrderService.resolveCustomer` consumes it. Nothing was changed
in `BillingService`, which sits between them and re-declares the request shape as
an inline object type. The field was dropped there.

**Why the compiler was silent.** TypeScript applies excess-property checking to
object literals, but not through a spread. `{ ...dto, ipAddress }` passed to a
parameter typed with a narrower object is legal and produces no error — so the
one place where a field can go missing is the one place the type system does not
look.

**Why the guard was silent.** `checkout-customer-record.spec.ts` calls
`resolveCustomer` directly and supplies `onboardingId` itself. It proves the
consumer works. It cannot observe whether any caller supplies the value, so it
passed at full green for the entire time the defect was live — including through
the 2026-08-29 regression-guard sweep that moved BUG-1516 to `VERIFIED`. That
sweep's own caveat was accurate and is worth reading against itself: it
established that the fix was present and its test passed, not that the screen
behaved.

## Impact

1. Every self-service signup leaves a duplicate `PROSPECT` in the Customers
   list, unattributed and carrying no organisation profile.
2. Payment attribution is ambiguous. Two `CustomerAccount` rows for one Stripe
   customer is the state that raises the CRITICAL platform alert "Stripe
   subscription customer could not be resolved to one tenant" and rejects the
   webhook — the revenue-integrity half of BUG-1516, which was never closed.

## Affected Areas

- `billing` — `BillingService.createPublicSubscriptionCheckout`
- `super-admin` — the Customers list, where the duplicate surfaces
- `landing` — the subscribe wizard (correct as built; sends the field)

## Proposed Resolution

Declare and forward the field. Both ends already work; nothing else needs to
change, and no ExecPlan is warranted for a one-field wiring fix on a live
revenue path.

## Acceptance Criteria

- One complete signup creates exactly one `CustomerAccount`.
- A payment for that customer resolves to exactly one tenant, with no CRITICAL
  "could not be resolved" event.
- Abandoning at any step leaves at most one record.

## Regression Coverage

`services/api/src/modules/billing/services/checkout-draft-id-reaches-the-order.spec.ts`
— REG-374. It drives `createPublicSubscriptionCheckout` with a doubled
subscription-order service and asserts the seam that failed: that openOrder
receives the `onboardingId` the caller sent, that a submission with no draft
passes an explicit null, and that the order is opened before the e-mail gate so
the assertion cannot pass vacuously by openOrder never being called at all.

A paired assertion pins the field *name* to `PublicSubscribeDto`, so renaming one
side without the other fails here rather than silently reopening the defect. A
fifth test guards the whole class rather than this instance: it compares every
field `PublicSubscribeDto` declares against the fields the service signature
accepts and fails on any the service would silently discard — with floors on both
parses, because a regex over source that stops matching otherwise reports
agreement instead of failure.

**Mutation-tested, not merely run.** Two separate mutations were applied and
reverted: deleting the forwarding line turns two assertions red, and deleting the
field from the service signature turns the structural one red. That check matters
here because the guard this defect slipped past was itself green throughout — and
the first attempt at mutating this file silently no-opped on CRLF line endings
and reported a false pass, which is the same failure in miniature.

## Dependencies

None. The client half shipped with BUG-1516 and is already in production.

## Related Items

- [[BUG-1516]] — the same duplicate, fixed at both ends and not in the middle.
  This record is why that one's `VERIFIED` was not warranted.
- [[BUG-1543]] — the Stripe webhook rejection BUG-1516 was expected to resolve.

## Resolution

Fixed 2026-08-30 on `agent/checkout-duplicate-customer`.

`createPublicSubscriptionCheckout` now declares `onboardingId` and forwards it to
`openOrder`. That is the whole behavioural change — both ends were already right.

With it in place the sequence is:

1. The workspace step opens draft order `D` and customer `C` with the
   placeholder address.
2. The submission names `D`, so `resolveCustomer` continues `C` and replaces its
   placeholder identity with the buyer's own. No second customer.
3. The post-verification resubmission hashes identically to step 2, so
   `openOrder` returns the existing order rather than opening another.

The id remains a hint and not an authorisation: it selects only a customer this
same flow created, and an unknown or consumed id falls through to the identity
rules unchanged.

**Pre-existing duplicates are not touched by this fix.** The rows already in
production — including the two `Nisa Co` records that prompted the report — need
a separate merge decision, because collapsing two customer accounts touches
subscriptions, invoices and tenant links. Raised as a follow-up rather than done
silently here.

## QA Retest

**Retested against production, and this time that means the running system.**

Local, before deploying:

- `npx jest src/modules/billing` — 22 suites, 180 tests passing.
- Full api suite — 282 suites, 2389 tests passing.
- `npm --workspace api run check-types`, `eslint` — clean.
- All fifteen Framework validation steps — passing.

Then in production, on `54f79ac`, minutes after the deploy went live —
QA-COMMERCIAL-001, driven in a browser against `www.dijipeople.com` and asserted
read-only against the production database:

```text
CUSTOMER ROWS FOR "REG374 Verify 20260830": 1        ✓ EXACTLY ONE
  72bbcf06  PROSPECT  qa.reg374.20260830@dijipeople.com  "Checkout started"

ORDERS: 01440b66 DRAFT + 2e8ef72d PENDING_PAYMENT
  distinct customers across those orders: 1          ✓

PLACEHOLDER ROWS: 8 before, 8 after — this run created none
TOTAL CustomerAccount rows: 18 → 19 — plus one, not plus two
```

The surviving row holds the buyer's **real** address, not
`pending@onboarding.invalid`: the draft's placeholder identity was replaced
rather than merely bypassed, which is the specific behaviour this fix restores.
A run that avoided a second row while leaving the placeholder in place would be
a different and worse outcome, and this evidence tells them apart.

**Why this record is `VERIFIED` and BUG-1516's `VERIFIED` was not warranted.**
That one was granted by a sweep that ran the guard and read the source. This one
was granted by driving the wizard and counting the rows it produced. The
difference is the whole reason this record exists — see [[BUG-1516]], and the
`e816098c` row in [[ITEM-0118]], which is the duplicate BUG-1516 itself quoted as
evidence and which has been sitting in production ever since.

**Boundary, stated rather than glossed.** The run stopped at the e-mail
verification gate. The duplicate was always created at submit, before payment —
both rows of every historical pair were written by `resolveCustomer`, which is
why the never-paid QA twins are still `PROSPECT`. Payment would have proved
nothing further about this defect while creating a real tenant. So what is
established is one customer per submission; the Stripe attribution consequence in
Impact is inferred from that, not separately observed.

## History

- 2026-08-30 — created from qa run at `c18b5024`.
- 2026-08-30 — reported by the repository owner from a completed production
  checkout; root cause traced and fixed the same day.
- 2026-08-30 — merged to `main` as `54f79ac`, deployed, and verified in
  production by QA-COMMERCIAL-001.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0118]]
- Referenced by — [[ITEM-0119]]
- Modules — [[billing]], [[super-admin]], [[landing-architecture]]
- Regression — REG-374 (see the regression register)

<!-- GRAPH:END -->
