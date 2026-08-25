# Landing Website (`apps/landing`)

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `apps/landing/app/**`, `apps/landing/lib/**`,
> `services/api/src/modules/leads/`, `modules/partner-experience/`,
> `modules/billing/controllers/public-billing.controller.ts`,
> `modules/contracts/contracts.controller.ts`
>
> This describes the repository; the code is authority over it.

## What it is

The **public, unauthenticated acquisition surface** — port 3000, the apex
domain. It is where every commercial relationship DijiPeople has starts, and it
is the only application a stranger can reach.

It holds **no session and no tenant context.** Its only first-party state is a
30-day referral cookie. Everything it can do, it does through the API's
`/public/*` namespace.

## The five visitor journeys

Each is a real, traced path — not a proposed one.

| Journey | Entry | Conversion surface | Terminal state |
|---|---|---|---|
| Marketing → lead | `/`, `/features`, `/about` | `/request-demo`, `/contact` | a `Lead` row |
| Marketing → purchase | `/plans` → `/subscribe` | Stripe Checkout redirect | `Tenant` + `Subscription`, both pending payment |
| Partner acquisition | `/partners` | partner inquiry form | `Partner` + inquiry, reference number returned |
| Partner activation | emailed token → `/partners/onboarding/[token]` → `/partners/activate/[token]` | onboarding + password | partner portal credential |
| Contract signing | emailed token → `/sign/[token]` | signing experience | signature, decline, or changes requested |

Three of the five are **token-addressed**: a partner or signatory arrives with a
credential in the URL and no account. That is the shape that makes this app
security-relevant rather than merely public — see [[landing-architecture]].

## Where it sits relative to the other surfaces

- **→ `services/api`** — the only backend. Server components fetch it directly;
  browser code goes through four thin Next route handlers.
- **→ `apps/web`** — link-out only, to the workspace login. No shared code.
- **→ `apps/admin`** — **no direct relationship at all.** The coupling is
  entirely indirect: what landing creates, admin works. An agent looking for a
  landing↔admin call will not find one, and should not add one.

## Business rules worth knowing before changing anything here

- **Price is never trusted from the client.** `/subscribe` re-reads the plan
  price server-side and refuses unless the price, plan and publication flags are
  all active — `billing.service.ts:232-255`.
- **Purchase is genuinely transactional.** One accepted checkout creates a
  `Lead`, a `CustomerAccount`, a `Tenant` (consuming a unique tenant slug), a
  `Subscription` and audit rows, then a Stripe Customer and Checkout Session.
  Activation waits on the Stripe webhook, and both `/subscribe` and
  `/subscribe/success` say so to the visitor.
- **Partner inquiries deduplicate; website leads do not.** The partner path
  hashes a normalised snapshot and returns the existing reference on a repeat.
  Whether website leads should behave the same is an open product question —
  [[ITEM-0007]], unanswered since 2026-08-15.
- **Referral attribution is resolved server-side and never fails loudly.** An
  unrecognised `?ref` code produces a lead flagged `INVALID_CODE`, not an error.
  See [[leads]].
- **Plans, prices and feature copy are platform data, not landing content.**
  They come from `/public/plans` and `/public/commercial-config`. Hardcoding any
  of them is what produced [[BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron]]
  and [[BUG-0029-public-features-page-advertised-capabilities-the-product-doe]].

## The two-forms problem

`/request-demo` and `/contact` submit to the **same** endpoint with different
fields, different validation and different abuse protection. `/request-demo`
carries a honeypot and referral capture; `/contact` carries neither, and
fabricates three lead attributes.

This is not a cosmetic inconsistency. It means:

- a partner link that lands a visitor on `/contact` **loses attribution
  silently** — the partner is not paid for a lead they sourced;
- the unprotected form is the one with **no test coverage at any level**.

Tracked as [[BUG-0021-landing-contact-form-fabricates-lead-data]], still `OPEN`
with disposition `FIX_NOW`, and re-verified unchanged at `78072d2`.

## What a purchase actually needs, end to end

Established on 2026-08-25 by driving the whole journey to a provisioned
workspace, then releasing the fixes and re-checking production. Recorded because
these are invisible until you try to buy something, and most of them fail
*silently*.

A completed purchase needs **all** of:

1. **A checkout-ready price in the visitor's market.** Not a seeded price — a
   synced one. `seed-commercial` deliberately never talks to Stripe, so a
   freshly seeded deployment has a full catalogue and nothing purchasable. Check
   `checkoutReady` on `/api/public/plans`, never the catalogue's appearance —
   that is the `seeded-but-unsellable` pattern.
2. **`stripeEnvironment` matching the runtime `STRIPE_MODE`.** It is baked in at
   sync time, so syncing in test mode and then switching to live makes every
   price unsellable again. **Switch the mode first, then sync.**
3. **A reachable owner mailbox.** The wizard will not take payment until a
   six-digit code sent to the administrator address is entered ([[ITEM-0063]]).
   The code is stored hashed; `PlatformOutboundEmail.htmlBody` is the only way
   to read it without a real mailbox.
4. **A working Stripe webhook.** Without it the order sits at `PENDING_PAYMENT`
   after a successful charge — the money moves and nothing else does
   ([[BUG-0989]]).
5. **`OUTBOX_WORKER_ENABLED=true`.** Provisioning is an outbox consumer, so
   without the worker the payment succeeds, the webhook lands, and no workspace
   is ever created ([[BUG-0904]]).

Only the first two are visible on the page. The rest look like success right up
to the point where the customer has paid and has nothing.

**A price is only verified when Stripe has been asked what it will charge.**
[[BUG-1302]] is the case in point: the page read `$75.00 per month` and the
Stripe session charged `QAR 284.40 per year`. Every check short of opening the
checkout session agreed with itself, because the arithmetic was right and only
the period was wrong.

## Known open records

| Record | State |
|---|---|
| [[BUG-0021-landing-contact-form-fabricates-lead-data]] | **OPEN** · FIX_NOW · scope now known to be wider than recorded |
| [[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]] | **OPEN** · the most expensive public write has no throttle |
| [[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]] | **OPEN** · the throttle that exists cannot see visitors |
| [[ITEM-0024]] | `lucide-react` imported but undeclared · DEFER |
| [[ITEM-0007]] | lead deduplication · awaiting a product decision |
| [[ITEM-0019]], [[ITEM-0018]] | market model and plan lifecycle · in validation |

## Related

[[landing-architecture]] · [[monorepo-application-map]] · [[leads]] ·
[[partners]] · [[partner-onboarding]] · [[contracts-and-agreements]] ·
[[billing]] · [[commercial-onboarding-journey]] · [[commercial-onboarding-lifecycle]] ·
[[partner-program]] · [[requirement-lead-conversion]] · [[requirement-partner-onboarding]]
