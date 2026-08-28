---
ID: BUG-0903
aliases: [BUG-0903]
Title: Production runs Stripe in test mode, so no real payment can be collected
Status: ACCEPTED_RISK
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: ACCEPTED_RISK
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-0903 — Production runs Stripe in test mode, so no real payment can be collected

## Summary

The live API service has `STRIPE_MODE = test`. Whatever else is fixed, the
production deployment cannot take a real payment: every checkout it opens is a
test-mode session and no money moves. This is expected for a pre-launch
environment and is a blocker for the launch itself, so it is recorded rather
than assumed to be intentional.

## Expected Behavior

At go-live the production service runs `STRIPE_MODE = live` with live keys, and
`deriveCheckoutReadiness` requires each plan price to carry
`stripeEnvironment = LIVE` before it can be sold.

## Actual Behavior

`STRIPE_MODE = test` on `srv-d7js7fqqqhas739v4i7g`.

## Reproduction

Read the service's environment through the Render API and inspect
`STRIPE_MODE`.

## Evidence

```
STRIPE_MODE = test
STRIPE_API_VERSION = 2026-02-25.clover
```

Key material was deliberately not read; the mode flag is sufficient and the code
enforces an `sk_test_` prefix when the mode is `test`, so the keys necessarily
match it.

## Root Cause

The environment has not been switched for launch. Nothing flags it: the API
starts, the admin screens work, and readiness reasons name the environment
mismatch only once a price has been synced against the *other* mode.

## Impact

No revenue can be collected in production. It also interacts with [[BUG-0898]]:
whichever mode is active when prices are synced is baked into
`PlanPrice.stripeEnvironment`, so syncing prices now and switching to live later
invalidates all 36 of them and re-blocks checkout with `DP-CHK-01`. **The order
matters** — switch the mode first, then sync.

## Affected Areas

- production environment of the API service
- `services/api/src/modules/billing/services/stripe-billing.service.ts`
- `PlanPrice.stripeEnvironment` on every synced price

## Proposed Resolution

At go-live: set `STRIPE_MODE=live` with live secret, publishable and webhook
secrets, register the production webhook endpoint at
`https://api.dijipeople.com/api/billing/stripe/webhook`, and only then sync plan
prices. Add the ordering note to the go-live checklist so the two steps are not
done the wrong way round.

## Acceptance Criteria

- `STRIPE_MODE=live` in production with matching live keys.
- Every sellable price reports `stripeEnvironment: LIVE` and
  `checkoutReady: true`.
- A real card completes a purchase end to end.

## Regression Coverage

`smoke:deployment` should assert that `stripeEnvironment` on sellable prices
matches the runtime mode — the mismatch is already a readiness reason, it is
simply never checked at deploy time.

## Dependencies

Must be sequenced before [[BUG-0898]]'s price sync.

## Related Items

[[BUG-0898]], [[BUG-0904]]

## Resolution

**Reclassified 2026-08-28 by the repository owner: this is a decision, not a
defect.**

Nothing here is broken. `STRIPE_MODE = test` is the correct configuration for a
platform that has not chosen to start taking money, and the record itself says
so — *"This is expected for a pre-launch environment."* It was filed as a bug
because it blocks launch, but "we have not launched yet" is a position, not a
fault, and it does not belong in a defect queue where it reads as work somebody
forgot to do.

Going live is one deliberate act with commercial consequences: real cards get
charged from that moment. It needs live keys generated in the Stripe dashboard
by the account owner, `STRIPE_MODE`, `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` changed together on the
live service, and every plan price re-synced against the live account —
`deriveCheckoutReadiness` requires `stripeEnvironment = LIVE` before a price can
be sold, so today's TEST-synced prices do not carry over.

Ordering matters and is the one genuinely technical point worth keeping:
**switch the mode before syncing prices.** Prices synced under one mode are not
valid under the other.

The engineering side is ready and was verified on 2026-08-28: the mechanism
works, 8 of 18 public plan prices are synced (to TEST), and the outbox worker
that provisions a workspace after payment is enabled.

## QA Retest

Not applicable — there is nothing to retest until the decision is made.

When it is, the check is a real card against a real plan, ending in a
provisioned workspace. [[BUG-0898]] is the same decision seen from the pricing
side and should be actioned in the same sitting.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-28 — confirmed still live from price data: 14 checkout-ready prices, all TEST, none LIVE. The "real" paid signups were test-mode transactions.
- 2026-08-28 - reclassified PRODUCT_DECISION at the owner's direction: going live is a commercial decision, not a defect, and does not belong in the bug queue.



## Owner decision — 2026-08-29

**Not yet, and deliberately.** Asked directly whether to go live now, the
repository owner chose to record this as accepted pre-launch state rather than
perform it.

Neither of the two things this record needs is a defect to fix. Syncing prices
writes to a real Stripe account, and switching `STRIPE_MODE` to `live` needs
live keys. Both are operator actions on money, and both are the owner's to
perform when the business is ready — not something an agent should do on
anyone's behalf, which is the same reasoning `seed-commercial.ts` gives in its
own header for refusing to talk to Stripe.

`ACCEPTED_RISK` rather than `DEFERRED`, because deferring implies it is queued.
It is not queued: it is a decision that has been made, for now, with a reason.

**The ordering matters when it is reversed, and is recorded here so nobody has
to rediscover it.** Switch to live keys **first**, then sync prices. Prices
synced under `STRIPE_MODE = test` carry test-mode Stripe ids, and
`deriveCheckoutReadiness` requires `stripeEnvironment = LIVE` before a price can
be sold — so syncing first means doing it twice.

Reopen this record when go-live is scheduled; nothing about the mechanism has
changed and the analysis above still stands.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]

<!-- GRAPH:END -->
