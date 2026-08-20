---
ID: ITEM-0063
aliases: [ITEM-0063]
Title: Self-service checkout must prove the owner email before charging
Type: SECURITY
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [billing, platform-communications, landing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
RelatedBug: 
RelatedQA: docs/qa/scenarios/QA-BILLING-010-checkout-cannot-open-until-the-owner-email-is-verified.md
RelatedADR: 
RelatedImplementation: TASK-0008 WP-02
TargetMilestone: 
BlockedBy: 
---

# ITEM-0063 — Self-service checkout must prove the owner email before charging

## Summary

`paidAt` must imply `ownerEmailVerifiedAt`. Before this, a self-service buyer
could be charged for a workspace whose administrator address was a typo, and
nobody would find out until the welcome mail went nowhere.

Recorded as an item rather than a bug because nothing was *broken* — the
behaviour was simply absent, and the brief requires it. It exists as a canonical
record so REG-068 has a root to trace to.

## Why It Matters

A card proves somebody can pay. It proves nothing about whether they typed their
own address.

The owner email is the one credential that cannot be corrected from inside the
product: it is the only account in a brand-new workspace, so if it is wrong there
is nobody who can sign in to fix it. The recovery is a support case against an
account that has already been charged, and the customer's first experience of
DijiPeople is asking a human to undo their purchase.

Verifying first moves that failure from *after the money* to *before it*, where
it costs a re-typed address.

## Evidence

The cost was accepted deliberately, and it is real: a mail round-trip in the
middle of a funnel loses some buyers. Owner decision OD-03 on [[TASK-0008]]
chose before-payment over after-payment for the reason above — the alternative
loses their money rather than their click.

## Proposed Approach

Implemented in TASK-0008 WP-02.

- Six digits from `randomInt`, stored as a SHA-256 hash and compared in constant
  time. It is a credential for fifteen minutes and is treated as one.
- Five attempts per code, then the code is burned — including for the correct
  value, because the budget belongs to the code and not to the guess.
- Resends throttled per order, not per IP: the abuse this stops is one order
  mailing one victim repeatedly, which an IP limit would not see as unusual.
- The gate lives inside `createPublicSubscriptionCheckout` rather than in a new
  endpoint. A verified route added *beside* the existing one would have left the
  unverified route as the one everybody kept using.

## Acceptance Criteria

- A first submission returns no checkout URL and **creates no Stripe session**.
- The code reaches the owner address and no other.
- A wrong code spends one attempt; five wrong guesses refuse the correct one.
- After verification the same submission returns a checkout URL and the stored
  hash is cleared.
- Re-verifying an already-verified order succeeds.

All are asserted by [[QA-BILLING-010]] and covered by REG-068.

## Dependencies

None. Depends on TASK-0008 WP-01 only for the order the verification hangs off.

## Related Items

[[TASK-0008]] · [[QA-BILLING-010]]

## History

- 2026-08-19 — implemented as TASK-0008 WP-02 under owner decision OD-03.
