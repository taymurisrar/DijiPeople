---
ID: ITEM-0078
aliases: [ITEM-0078]
Title: No end-to-end payment to provisioned tenant run against Stripe test mode
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [api:billing, api:tenant-control-plane, api:outbox, apps/landing]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
RelatedBug: BUG-0078
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0078 — No end-to-end payment to provisioned tenant run against Stripe test mode

## Summary

Three records — BUG-0077, BUG-0078 and BUG-0281 — each cover their own half of
the self-service purchase, and each carries the same residual gap in its QA
Retest: **nothing has driven a real payment through to a provisioned tenant.**
Every piece is tested; the seam between them is not.

## Why It Matters

The pieces that *are* covered are covered well. `subscription-order.e2e-spec.ts`
proves the order and customer are created before payment and that a repeat
submission is absorbed. `emitted-events-have-consumers.invariant.spec.ts` proves
`PROVISIONING_REQUESTED` has a consumer. `checkout-customer-record.spec.ts`
proves the commercial and attribution columns are written.

What no test does is let Stripe say "paid" and watch what happens next. That
path crosses a webhook, the outbox, the provisioning run and the tenant control
plane, and each of those handoffs is exactly the kind of seam BUG-0078 was
about in the first place: an event emitted with nobody listening. The invariant
that caught it is a source-level check — it proves a consumer is *registered*,
not that the chain *completes*.

BUG-0281's attribution columns have the same shape of gap: the resolver is
tested, the write is tested, and the journey from `?ref=` on the landing site to
a `CustomerAccount` row has never been run.

## Evidence

- `docs/bugs/BUG-0077-*.md` — "Pending a full QA campaign in WP-08."
- `docs/bugs/BUG-0078-*.md` — "an end-to-end *payment → provisioned tenant* run
  needs a Stripe webhook this environment cannot deliver without live
  credentials."
- `docs/bugs/BUG-0281-*.md` — the end-to-end half "needs a live Stripe test mode
  and a seeded partner".

## Proposed Approach

ExecPlan, because it needs credentials and a decision about where they live.

Direction: Stripe test mode with the CLI's webhook forwarding, driven from the
database-e2e job. The suite would follow a partner referral link, complete
checkout with a test card, let the webhook arrive, and then assert the tenant
exists, is reachable, and carries the partner attribution.

The alternative — a fabricated webhook payload posted directly — is deliberately
**not** the proposal. It would exercise the handler, which is already covered,
and skip the signature verification and delivery semantics that are the actual
untested part.

## Acceptance Criteria

- A test-mode payment produces a provisioned, reachable tenant.
- The resulting `CustomerAccount` carries partner, link and code snapshot when
  the buyer arrived from a referral link.
- The suite runs in CI without a human pasting a key.

## Dependencies

Stripe test-mode credentials, and a decision about how CI holds them.

## Related Items

[[BUG-0077]] · [[BUG-0078]] · [[BUG-0281]] · [[ITEM-0063]]

## History

- 2026-08-22 — raised during the QA verification pass, consolidating the same
  residual gap named separately in three bug records.
