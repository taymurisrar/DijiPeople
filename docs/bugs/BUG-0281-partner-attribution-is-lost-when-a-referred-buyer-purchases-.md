---
ID: BUG-0281
aliases: [BUG-0281]
Title: Partner attribution is lost when a referred buyer purchases through self-service checkout
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: cf9ea47
AffectedModules: [apps/landing, api:billing, api:partner-experience]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId: REG-207
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0281 — Partner attribution is lost when a referred buyer purchases through self-service checkout

## Summary

`CustomerAccount` carries three attribution columns — `originatingPartnerId`,
`originatingReferralLinkId`, `referralCodeSnapshot`. All three are written only
by the lead paths (`LeadsService`, and `convertLeadToCustomer` copying them
forward). The self-service checkout writes none of them, and the subscribe
wizard captures no referral code at all — so a buyer who arrives from a
partner's referral link and pays without ever becoming a lead is recorded as an
unattributed direct purchase.

## Expected Behavior

A purchase that originated from a partner referral is attributed to that
partner, whichever route the buyer took to pay.

## Actual Behavior

Attribution survives only the lead → convert route. A self-service purchase
loses it silently — no error, no empty state, just a customer with no partner.

## Reproduction

1. Follow a partner referral link to the landing site.
2. Go straight to Plans → Subscribe and complete checkout.
3. The resulting `CustomerAccount` has null `originatingPartnerId`,
   `originatingReferralLinkId` and `referralCodeSnapshot`.

## Evidence

- `services/api/src/modules/leads/leads.service.ts:201`, `:853`, `:862` and
  `super-admin/platform-lifecycle.service.ts:234-236` — the only writers.
- `services/api/src/modules/billing/dto/public-subscribe.dto.ts` — accepts no
  referral field.
- `apps/landing/lib/onboarding-wizard.ts`, `buildSubmitPayload` — sends none.
- `apps/admin/lib/runtime/platform-module-registry.ts` — the customers record
  form shows "Originating referral link" and "Referral code" behind
  `visibleWhen: { field: "originatingPartnerId", hasValue: true }`, so for this
  cohort the fields are correctly hidden and the absence is invisible.

## Root Cause

Not established. Most likely the referral flow was built around the lead funnel
before self-service checkout existed, and nothing revisited it when the public
purchase path was added.

## Impact

Partner commission is calculated from attribution. A partner who drives a
self-service sale is not credited, and the platform cannot distinguish "no
partner was involved" from "we did not record which". Low volume today; it is a
money question, so it does not stay low-consequence.

## Affected Areas

`apps/landing` subscribe wizard, `billing` public subscribe DTO and
`resolveCustomer`, `partner-experience` commission calculation.

## Proposed Resolution

**Needs an ExecPlan** — it spans the landing site, a public DTO, and money.

Direction: capture the referral code on any landing entry point into a
first-party cookie, the way the lead form already resolves one; carry it on
`PublicSubscribeDto`; resolve it to a `PartnerReferralLink` **server-side**; and
write all three columns alongside the commercial ones from [[BUG-0280]]. The
resolution must be server-side — a client-supplied partner id would let anyone
assign themselves a commission.

Until then `originChannel` is deliberately set to `WEBSITE` rather than
`PARTNER_REFERRAL` on this path. The flow has no evidence for the latter, and a
guess about who earned a commission is worse than a gap.

## Acceptance Criteria

- A referred self-service purchase carries partner, link and code snapshot.
- The partner is resolved from the code server-side; a forged code attributes
  nothing.
- An unreferred purchase still records `WEBSITE`, not a blank.

## Regression Coverage

None yet.

## Dependencies

Should be sequenced after [[BUG-0280]], which established the commercial columns
this extends.

## Related Items

[[BUG-0280]] — the same creation path, the same kind of omission.

## Resolution

Fixed 2026-08-22, branch `agent/backlog-burndown`, in the direction the record
proposed and for the reason it gave: resolution is server-side, because a
client-supplied partner id would let anyone assign themselves a commission.

Both halves were broken, and either alone would have been enough.

**Landing.** The capture ran in a `useEffect` inside the *lead form*, so it only
fired when that form was mounted — straight to Plans → Subscribe and nothing was
ever remembered. It now lives in `apps/landing/lib/referral.ts` and is mounted in
the root layout by `<ReferralCapture>`, so a partner's link works whichever page
it points at. First touch wins. The code is carried on the first draft as well as
the final submission, so an abandoned checkout that resumes is still attributed.

**API.** `resolveReferral` was private to `LeadsService`, which is exactly why the
newer path — writing the same `CustomerAccount` columns — attributed nothing. It
is now `PartnerReferralResolverService` and both callers use it, so the two
cannot drift again.

`originChannel` follows the evidence: `PARTNER_REFERRAL` only when a code
resolved to an active partner and an active link, `WEBSITE` otherwise. A code
that was presented and rejected — expired link, suspended partner, typo — still
lands in `referralCodeSnapshot`, because "someone presented GOLD-100 and it had
lapsed" is a different fact from "no partner was involved", and only one of them
is recoverable. The three columns are written together or not at all, so no
record can name a partner with no link, and a returning customer who already has
a partner is never reassigned.

The code is deliberately **not** part of `submissionHash`. Making it part of the
order's identity would let a buyer who reloaded with `?ref=` stripped from the
URL create a second customer and a second tenant.

## QA Retest

```text
services/api  partner-referral-resolver.service.spec.ts   10 tests PASS
services/api  checkout-customer-record.spec.ts           10 tests PASS
services/api  full suite                                 1634 tests PASS
apps/landing  full suite                                  134 tests PASS
```

Scenario `QA-PARTNER-007`. The end-to-end half — following a real referral link
to a completed Stripe checkout and reading the resulting `CustomerAccount` — is
described in the scenario and was not run here; it needs a live Stripe test mode
and a seeded partner.
## History

- 2026-08-21 — found while comparing the self-service and sales-assisted
  customer creation paths.
