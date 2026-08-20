# Self-Service Acquisition Path

**Category:** ARCHITECTURE_CHANGE
**Date:** 2026-08-20
**Branch:** `agent/self-service-onboarding-provisioning`
**Base:** `origin/develop` at `494c44d`
**Parent:** [[TASK-0008]]
**QA run:** [`2026-08-19-self-service-onboarding-provisioning-f5bd870.md`](../../qa/runs/2026-08-19-self-service-onboarding-provisioning-f5bd870.md) — PASS WITH RISKS
**Engineering history:** [`2026-08-20-self-service-onboarding-provisioning-c935fcb.md`](../../engineering-history/tasks/2026-08-20-self-service-onboarding-provisioning-c935fcb.md)

## What this records

How a visitor on the public site becomes a Tenant Owner inside their own
workspace, with no Platform Admin involved — and, more usefully, **which parts
of that already existed and were not reached.**

The brief that opened this parent described the whole lifecycle. Roughly
two-thirds of it was already built across the commercial-platform waves and
TASK-0007, spread over four deployables and not obvious from outside. The first
act was therefore reconciliation rather than planning: probing each requirement
against the code and recording BUILT / PARTIAL / ABSENT with evidence.

**Four rows of that reconciliation were wrong on the first pass, and all four in
the same direction.** Each read the *presence* of code as the presence of
behaviour — a provisioning engine exists, a webhook emits a provisioning event —
without following the call graph to the end. Following it showed the website
never reached the engine and the event had no consumer at all. The rows were
struck through rather than corrected silently, because a reconciliation that
edits its own wrong answers teaches the next reader nothing about how far to
trust the rest of it.

Generalised: **emitted is not handled, and exists is not reached.**

## The path, as it now runs

```
plans page                      server-resolved price for the visitor's market
  ↓
POST /public/onboarding         a DRAFT SubscriptionOrder — a form, not a customer
  ↓
GET  …/workspace-address        session-bound slug check; advisory, DB decides
  ↓
POST /public/subscribe          verification code issued; no Stripe session yet
  ↓
POST …/verify-email             6-digit code, hashed, timing-safe, 15-min TTL
  ↓
POST /public/subscribe (again)  now returns the Stripe checkout URL
  ↓
Stripe webhook, signature-verified   ← the ONLY thing that authorises provisioning
  ↓
PROVISIONING_REQUESTED → outbox → handler → provisionTenantForCustomer()
  ↓
GET  …/:id/status               what /subscribe/success polls and renders
```

## The five decisions worth carrying forward

**1. Payment authorises provisioning, and nothing else does.** Before this,
`POST /public/subscribe` created a `Lead`, a second `CustomerAccount`, a
`Tenant` and a `Subscription` *before payment* — so every abandoned checkout
consumed a workspace slug permanently ([[BUG-0077]]). Separately,
`PROVISIONING_REQUESTED` was emitted into the outbox and nothing consumed it;
the only consumer handled `PAYMENT_CONFIRMED` ([[BUG-0078]]). Automatic
provisioning had never run, and the pre-payment tenant is what hid that.

The two had to land together. Removing the pre-payment tenant without wiring the
consumer takes the platform from "provisions the wrong way" to "does not
provision at all" — which is why WP-10 was one package and why an
implementation of BUG-0077 alone was written and **reverted** rather than
committed once the missing consumer was found.

**2. The slug is reserved by the database, not by a pre-check.**
`SubscriptionOrder.requestedSlug` is nullable-unique — PostgreSQL treats NULLs
as distinct, so unreserved orders do not collide, and the index refuses the
second claimant. The API then *queries for the holder* rather than parsing the
driver error:

```ts
if (isUniqueViolation(error) && requestedSlug) {
  const holder = await this.prisma.subscriptionOrder.findUnique({
    where: { requestedSlug }, select: { id: true },
  });
  if (holder) throw new ConflictException({ code: 'WORKSPACE_SLUG_TAKEN', … });
}
```

That indirection is load-bearing: **Prisma 7 does not populate `meta.target` on
P2002.** Two attempts to shape-match the error failed before this was
understood. A driver's internal error shape is not a contract; the row is.

**3. The availability check is session-bound, and that is an anti-enumeration
control rather than an implementation detail.** The obvious design —
`GET /public/workspace-slug?value=maseer` — is a tenant-existence oracle: walk a
list of company names and the "taken" answers map DijiPeople's customer base.
Requiring a live onboarding order means a caller must first create a
rate-limited, durably recorded row before asking anything. A dead session and a
fabricated one return the same 404 with the same body, because distinguishing
them hands back exactly what the binding withholds.

**4. The order id is the capability, and that is accepted deliberately.** It is
an unguessable v4 uuid, it is the same token the buyer's browser carried through
the whole wizard, and everything it unlocks is that buyer's own data. It reaches
the success page through the Stripe `success_url`, and
`Referrer-Policy: strict-origin-when-cross-origin` keeps it off cross-origin
requests. Adding a second factor to a page somebody reaches *by paying* would
cost real conversions against an attacker who does not exist.

**5. The post-payment page asserts nothing of its own.** Arriving there means a
browser was redirected — not that the provider confirmed anything. Every step
shown is a row the API read; no step animates on a timer; the "Open DijiPeople"
button waits for a primary domain rather than for a `READY` state, because
`READY` without a domain is precisely the case where the button 404s.

Its poll also backs off, and the arithmetic is the reason: `PublicRateLimitGuard`
allows 120 GETs per ten minutes per IP and path, and this page's path carries
the order id — so 120 is its entire budget. A flat three-second poll spends 200
and starts collecting 429s six minutes in, exactly when something has gone slow
and the customer is still watching. **The page would have rate-limited itself
out of the one situation it exists for.**

## Pricing: flat and per-seat coexist, and needed no new code

`PlanPrice.billingModel` is per-price, not global. Public plans are `FLAT`;
negotiated per-seat prices remain available and are set from the admin app. No
schema change, no branch on tenant.

What was wrong was the words. Every seeded price was flat while the Terms, the
billing terms, the features page, the plans hero and the cost estimator all told
the customer that pricing was per active employee — and `billingUnitLabel`
returned `null` for a flat price, so the figure rendered with no unit at all
beside copy insisting it was per person ([[BUG-0080]]). The arithmetic was never
wrong; `estimateCost` refuses to multiply a flat price and says so in a comment.
Only the prose was.

## What is deliberately not finished

- **No legal document is published.** They seed as DRAFT by design — drafting
  text must not put it in front of anybody. The wizard requires only agreements
  carrying a published version, so with none published it requires none, and a
  purchase records no consent. Publishing is the owner's decision and is the one
  thing between this path and being genuinely sellable.
- **Placeholder PKR prices, no QAR prices.** A visitor in Qatar meets the
  honest "no published price for your region" state.
- **Central login and the workspace picker are still PARTIAL.** `AuthService`
  refuses to authenticate without tenant context, and `/workspaces/mine` returns
  a one-element array *by construction* because it reads `user.tenantId` from
  the session. [[ITEM-0062]] carries the identity/membership model; WP-06 waits
  on it.

## Related

[[BUG-0075]] · [[BUG-0077]] · [[BUG-0078]] · [[BUG-0080]] · [[BUG-0081]] ·
[[BUG-0082]] · [[billing]] · [[customer-onboarding]] · [[legal]] · [[outbox]] ·
[[tenant-provisioning]] · [[assertion-without-a-check]] ·
[[structural-guard-lost-in-rewrite]]
