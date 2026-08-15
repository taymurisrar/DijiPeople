# Partner Program

> Generated from repository evidence at `ad8f77f`, verified by the 2026-08-15
> QA run (Flow B, 41 scenarios).

## The journey

```
public partner enquiry  (/public/partners/inquiries)
   ↓ deduplicated on submissionHash — a repeat returns the same reference
   ↓ qualification
   ↓ partner agreement → executed
   ↓ compliance onboarding invited  (blocked until the agreement is executed)
   ↓ partner submits legal and banking details
   ↓ review: approve / request changes / reject
   ↓ activation  (requires executed agreement AND approved onboarding)
   ↓ referral link minted  (refused for a non-ACTIVE partner)
   ↓ partner-referred lead arrives with a referral code
   ↓ attribution → conversion → CustomerAccount retains the partner
```

## What works, verified

- **Both activation gates are enforced** — agreement and approved onboarding.
- **A referral link cannot be minted for a partner that is not `ACTIVE`.**
- **Attribution is honest in both directions**: a valid code attributes; an
  invalid one is recorded as `INVALID_CODE` with the code retained and no
  partner attached. A public submitter cannot set `partnerId` directly.
- **Attribution survives conversion.** A customer created from a
  partner-referred lead keeps `originatingPartnerId` and its originating lead.

## What does not work

[[BUG-0016]] — **the compliance review has no state machine**, and it is
awaiting a **product decision** rather than an engineering fix.

Two things were reproduced: an application that had never been submitted — legal
name and IBAN both null — was approved and the partner activated; and an
already-approved application was flipped to rejected *after* activation,
cascading a live partner with a signed agreement and a working referral link to
`REJECTED`.

The compliance gate is currently satisfiable without the information it exists
to review. What needs deciding is which transitions are legal, whether an active
partner may be demoted through this endpoint at all, and what happens to a live
referral link and its in-flight leads if one is.

[[BUG-0019]] — **the review screens have no inbound link**, and the
`partner-inquiries` list filters the wrong entity. That currently makes BUG-0016
hard to trigger through the UI, which is mitigation by accident and disappears
the moment navigation is fixed. The two should land together.

## Not exercised

Partner-portal lead submission routes are **permanent 403 stubs** in code. The
public onboarding *submission* path was never driven successfully — the approval
after it succeeded anyway, which is how the missing state machine was found.

## Related

[[partners]] · [[partner-onboarding]] · [[leads]] · [[customers]] ·
[[contracts-and-agreements]] · [[commercial-onboarding-journey]] ·
[[platform-admin]]
