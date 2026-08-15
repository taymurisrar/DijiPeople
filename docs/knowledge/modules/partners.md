# Partners

> Generated from repository evidence at `ad8f77f`. Verified end to end by the
> 2026-08-15 commercial onboarding E2E (Flow B).

## Purpose

The reseller and referral channel: a public partner enquiry becomes a qualified
partner, signs an agreement, completes compliance onboarding, is activated, and
receives a referral link that attributes the leads it sends.

## Main API / services

`services/api/src/modules/partners/` and
`services/api/src/modules/partner-experience/`. The public entry point is
`/public/partners/inquiries`.

## Important business rules

Verified by scenario:

- **A duplicate partner inquiry is deduplicated** by `submissionHash` — one row,
  same reference returned. This is the data-layer approach that [[leads]]
  deliberately or accidentally does not use ([[ITEM-0007]]).
- **Onboarding invitation is blocked until the agreement is executed.**
- **Activation requires both gates**: an executed agreement *and* an approved
  onboarding.
- **A referral link cannot be minted for a non-`ACTIVE` partner.**
- **Referral attribution is one-way trustworthy**: a valid code sets the partner
  and `ATTRIBUTED`; an invalid one is recorded as `INVALID_CODE` with the code
  retained and no partner attached; a public submitter cannot set `partnerId`.
- Attribution survives conversion into `CustomerAccount` — see [[customers]].

## Authorization

`partner-experience/*` authorizes **inside the service** rather than through
decorators. Every reachable method must assert — see [[rbac]] and
[[service-authorization-hidden]].

## Known bugs

[[BUG-0016-partner-onboarding-review-has-no-state-machine]] — awaiting a
**product decision**. See [[partner-onboarding]].

[[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] —
OPEN, HIGH. The review screens have no inbound link, and the
`partner-inquiries` view filters the wrong entity.

## Untested

Partner-portal lead submission routes are **permanent 403 stubs** in code. The
partner public onboarding *submission* path was not exercised — the approval
after it succeeded anyway, which is how the missing state machine was found.

## Related

[[partner-onboarding]] · [[leads]] · [[customers]] ·
[[contracts-and-agreements]] · [[commercial-onboarding-lifecycle]] ·
[[platform-admin]]
