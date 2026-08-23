# Bug pattern — `seeded-but-unsellable`

**A seed writes every row the product needs, and the product still cannot be
used, because the rows depend on state in an external system the seed
deliberately does not touch.**

The row exists. The list screen shows it. The admin console shows it. Nothing
errors. And the one operation the data exists to support refuses, for a reason
recorded on the row that nobody reads until somebody asks why nothing works.

Distinct from [`silent-config-fallback`](silent-config-fallback.md), where a
missing setting is quietly substituted. Here nothing is substituted and nothing
is missing locally: the *local* half of a two-sided fact is complete, and the
remote half was never created.

## What it looks like

A seed that is explicit and correct about its own limits:

```ts
/**
 * What it does **not** do is talk to Stripe. Every price it writes is published
 * … Syncing is … a real Stripe account — not something a seed should do on
 * anyone's behalf.
 */
```

A readiness derivation that is also correct:

```ts
if (!price.stripeProductId) reasons.push('Stripe Product ID is missing.');
if (!price.stripePriceId)   reasons.push('Stripe Price ID is missing.');
if (price.stripeSyncStatus !== StripeSyncStatus.SYNCED)
  reasons.push('Stripe verification has not succeeded.');
```

And a public surface that honours it, exactly as designed:

```text
This plan is not available to buy online at the moment. (DP-CHK-01)
```

Every one of those decisions is right. Together they produced a production site
on which **0 of 36 active prices were purchasable**, for months, with no error
anywhere — because the step that bridges the two systems is an operator action,
and no operator knew it was outstanding.

## Why it survives review

- **The seed is honest.** It says in its own header that it does not sync. A
  reviewer reads that as a limitation acknowledged, not a launch blocker
  outstanding.
- **Nothing is broken.** Every test passes, because every test either seeds its
  own data or does not reach the external system.
- **The failure is a *refusal*, not an error.** Refusals are what a healthy
  system does with an invalid request; they do not page anyone.
- **The evidence is on the row.** `checkoutReadinessReasons` listed all eight
  reasons the whole time. It is a field, not an alert.

## How to catch it

**Ask what the data is *for*, and assert that.** A row exists is not the
property worth checking; a row can be used is.

The report that already existed said it in one line — it simply was not wired to
anything that fails:

```text
0 of 36 active price(s) are synced to Stripe. The rest cannot be checked out until they are.
```

- Put that assertion in `smoke:deployment`, so a deployment that cannot take
  money is a *failed deployment* rather than a quiet one. ITEM-0086.
- Where an operator step is genuinely required, give it a command rather than a
  procedure. Thirty-six individual admin edits is not a step anyone completes.
  ITEM-0085.
- In QA, drive the journey the data serves. This was found by attempting a
  purchase, not by reading the catalogue — the catalogue looked perfect.

## Where it has happened

- [[BUG-0898]] — no plan price ever synced to Stripe; every plan on `/subscribe`
  rendered `DP-CHK-01` and no form, on production and on every fresh local
  stack. Self-service checkout had never worked.
- [[BUG-0904]] — `render.yaml` declares `OUTBOX_WORKER_ENABLED: "true"`; the live
  service does not have it, so `PROVISIONING_REQUESTED` events accumulate
  undelivered and a paid customer never receives a workspace. Same shape: the
  local half — the event row — is written correctly, and the half that acts on
  it is switched off somewhere no test looks.
- [[BUG-0906]] — ten legal documents seeded as drafts and never published, so a
  purchase records no consent.

## QA check

Attempt the operation the data exists for, against a freshly seeded environment
— not against one an engineer has been using, because the manual steps they
performed months ago are exactly what a new deployment lacks.

## Prevention rule

A row that cannot be used is not seeded data, it is a pending task. Where a seed
depends on an external system it deliberately does not touch, the deployment
must assert the bridge exists — and there must be a command that builds it, not
a procedure someone is expected to remember.

## Related

- [[silent-config-fallback]] — a missing setting quietly substituted; here
  nothing is substituted and the remote half was simply never created.
- [[declared-but-unwired-step]] — the same disconnection one layer in: there the
  consumer is missing, here the consumer exists and its precondition was never
  met.
- [[billing]], [[commercial-onboarding-lifecycle]] — the modules where this has
  bitten.
