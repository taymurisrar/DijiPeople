# Partner Onboarding

> Generated from repository evidence at `ad8f77f`. Verified by the 2026-08-15
> commercial onboarding E2E (Flow B), where its central defect was found.

## Purpose

The compliance and KYC step between a signed partner agreement and an active
partner. A partner submits legal and banking details; a reviewer approves,
requests changes, or rejects.

## Main API / services

`PartnerExperienceService.reviewOnboarding(user, applicationId, decision, dto)`
in `services/api/src/modules/partner-experience/`, over
`PartnerOnboardingApplication`.

Statuses: `INVITED`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`,
`APPROVED`, `REJECTED`. Approval moves the partner to `INFORMATION_APPROVED`;
rejection moves it to `REJECTED`.

## Important business rules — currently unenforced

The review is modelled as a **setter, not a transition**. `reviewOnboarding`
reads the application and writes the decided status with **no check on the
current status**, so any decision is legal from any state, in either direction.

Two consequences, both reproduced:

1. An application still in `INVITED`, with `legalName` and `iban` **null** — the
   partner never submitted anything — was approved, and the partner activated.
   **The compliance gate is satisfiable without the information it exists to
   review.**
2. An already-`APPROVED` application was flipped to `REJECTED` after activation,
   cascading a live `ACTIVE` partner with a signed agreement and a live referral
   link to `REJECTED`.

## Known bugs

[[BUG-0016-partner-onboarding-review-has-no-state-machine]] — **PRODUCT_DECISION**,
HIGH.

Not fixed, and deliberately so: the correct transition table is a product
question, not an engineering one. Three things need a human answer — which
states may be approved or rejected; whether an `ACTIVE` partner may be demoted
through this endpoint at all; and what happens to a live referral link and its
in-flight attributed leads if a partner is rejected after activation.

Writing a regression test first would encode a guess.

[[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] —
the review screens have no inbound link, which currently makes this defect hard
to trigger through the UI. **That is mitigation by accident** and disappears the
moment the navigation is fixed, so the two should land together.

## Related

[[partners]] · [[contracts-and-agreements]] · [[platform-admin]] ·
[[commercial-onboarding-lifecycle]] · [[rbac]]
