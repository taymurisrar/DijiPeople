---
ID: BUG-0281
aliases: [BUG-0281]
Title: Partner attribution is lost when a referred buyer purchases through self-service checkout
Status: OPEN
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
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt:
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

Not resolved. Recorded rather than guessed at: inferring a referral from
anything available at checkout today would attribute commission on evidence this
platform does not have.

## QA Retest

Not applicable yet.

## History

- 2026-08-21 — found while comparing the self-service and sales-assisted
  customer creation paths.
