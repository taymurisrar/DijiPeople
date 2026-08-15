# Requirement — Partner Onboarding

> **Source type: `INFERRED_FROM_IMPLEMENTATION`, and deliberately incomplete.**
>
> The activation gates are implemented and verified. **The review state machine
> is not decided**, so this note records the requirement as far as it is
> established and stops where the product question begins. Guessing the rest
> would put a decision nobody made into the place people look for decisions.

## Established requirements

Verified by scenario, 2026-08-15:

| # | Requirement | Evidence |
|---|---|---|
| R1 | A duplicate partner enquiry is deduplicated on `submissionHash` — one row, same reference | B1.05 |
| R2 | Onboarding cannot be invited until the partner agreement is executed | B3.06 |
| R3 | Activation requires **both** an executed agreement and an approved onboarding | B3.07, B4.11 |
| R4 | A referral link cannot be minted for a partner that is not `ACTIVE` | B3.08 |
| R5 | A valid referral code attributes the lead to the partner; an invalid one is recorded as `INVALID_CODE` with the code retained and no partner attached | B6.02, B6.03 |
| R6 | A public submitter cannot set `partnerId` directly | B6.04 |
| R7 | Partner attribution survives conversion into a customer | B7.04 |

## The undecided part

The compliance review currently accepts **any decision from any state, in either
direction**. Two consequences were reproduced: an application that had never
been submitted — legal name and IBAN both null — was approved and the partner
activated; and an approved application was flipped to rejected after activation,
cascading a live partner to `REJECTED`.

**The compliance gate is satisfiable without the information it exists to
review.**

Three questions need a human answer before a requirement can be written:

1. Which application states may be approved or rejected? Presumably
   `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED` — but that is the decision,
   not the answer.
2. May an `ACTIVE` partner be demoted through this endpoint at all, or must
   deactivation go through the governed `partnerTransition` actions?
3. What happens to a live referral link and its in-flight attributed leads if a
   partner is rejected after activation?

Tracked as [[BUG-0016]], status `PRODUCT_DECISION`. A regression test written
before these are answered would encode a guess.

## Related

[[partner-onboarding]] · [[partners]] · [[partner-program]] ·
[[contracts-and-agreements]] · [[requirement-commercial-onboarding]]
