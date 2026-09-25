---
ID: BUG-3549
aliases: [BUG-3549]
Title: Partner type Individual or Company drives no behaviour and individuals are asked for a company registration number
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/partners, services/api/src/modules/partner-experience, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3549 — Partner type Individual or Company drives no behaviour and individuals are asked for a company registration number

## Summary

`Partner.type` (`PartnerType`: `INDIVIDUAL | COMPANY`) is captured, stored and
displayed, but drives zero behaviour anywhere in the backend, frontend or
validation. In particular, an `INDIVIDUAL` partner is required to submit the
same onboarding fields as a `COMPANY` partner — including `registrationNumber`
and `legalName` — with no individual-appropriate alternative (e.g. a national
ID field), even though the schema comment above the enum treats
`INDIVIDUAL`/`COMPANY` as a real, distinct contracting-entity axis.

## Expected Behavior

Selecting `INDIVIDUAL` as a partner's type should meaningfully change what is
required of that partner — at minimum, not demand a company registration
number from a person with no company to register — or, if `PartnerType` is
intentionally a pure data-capture field today with behaviour deferred, that
should be a documented decision rather than a silent gap.

## Actual Behavior

`validatePartnerOnboardingData()` requires the identical field set —
`legalName`, `registrationNumber`, `registeredAddress`, `authorizedSigner`,
`privacyConsent` (plus tax/bank unless settings disable them) — regardless of
`type`. No code path anywhere branches on `INDIVIDUAL` vs. `COMPANY`.

## Reproduction

1. Create a `Partner`/`PartnerInquiry` with `type: INDIVIDUAL` (via the public
   inquiry form or the admin `POST /partners` path).
2. Proceed to onboarding submission.
3. Observe the onboarding form/validation demands `registrationNumber` and
   `legalName` exactly as it would for `type: COMPANY`, with no
   individual-appropriate field offered instead.

## Evidence

- `services/api/prisma/schema.prisma:424` (`PartnerType` enum) and the
  comment at `:275-280` explicitly framing `PartnerType` (contracting-entity
  type) as a different axis from `PartnershipModel` (commercial relationship)
  — i.e. the schema's own documentation treats the distinction as meaningful.
- `partner-experience.service.ts:1320-1343`
  (`validatePartnerOnboardingData`) — no branch on `type` at all; the same
  required-field set applies unconditionally.
- `partners.service.ts` — no `type` reference anywhere in the commission
  calculation or lifecycle state machine (`partnerTransition()`, line 576).
- `apps/admin/app/(internal)/partners/new/page.tsx` — `type` is a plain enum
  selector defaulted to `COMPANY`; confirmed by repo-wide grep returning zero
  matches for `PartnerType.INDIVIDUAL`/`'INDIVIDUAL'`/`.type ===` outside
  enum/DTO declarations — no UI or service code anywhere branches on the
  value.

## Root Cause

`PartnerType` was introduced to capture the contracting-entity distinction
(schema comment `:275-280`), but no downstream consumer — onboarding
validation, commission calculation, the admin UI, or the public inquiry
form — was ever built to read it. It is stored and rendered, and that is the
entirety of its current effect.

## Impact

Medium — this is either a product gap (individual/sole-proprietor partners
are an intended, actively-onboarded category but cannot complete onboarding
in a way that fits them) or a placeholder value nothing exercises. Either way,
an `INDIVIDUAL` partner today is functionally forced through a
company-shaped onboarding flow with no natural field for what an individual
would actually provide (e.g. a national ID instead of a registration number).
Reachable in production today for any partner created with `type: INDIVIDUAL`.

## Affected Areas

- `services/api/src/modules/partner-experience/partner-experience.service.ts`
  (`validatePartnerOnboardingData`)
- `services/api/src/modules/partners/partners.service.ts` (lifecycle/commission,
  confirmed to not branch on `type`)
- `apps/admin/app/(internal)/partners/new/page.tsx` (create form)
- `services/api/prisma/schema.prisma` (`PartnerType`, `Partner.type`)

## Proposed Resolution

This needs a product decision before implementation: is `INDIVIDUAL` an
actively-used onboarding category, or a rarely-exercised placeholder? If the
former, `validatePartnerOnboardingData` should require an
individual-appropriate field set (e.g. national ID / personal tax id instead
of `registrationNumber`/`legalName`) when `type === 'INDIVIDUAL'`, and the
admin/public onboarding forms should render the matching fields. If the
latter, this should become an explicit, documented product decision (not a
silent gap) rather than a code change. No ExecPlan needed for the validation/
form change itself once the policy is decided; flag to the Architect if the
decision requires one.

## Acceptance Criteria

- Either: an `INDIVIDUAL` partner's onboarding no longer requires
  `registrationNumber` and instead requires an individual-appropriate
  identifier, with the admin/public forms updated to match; or: a recorded
  product decision states `PartnerType` is intentionally data-capture-only
  today, and this record is closed `NOT_A_BUG`/`PRODUCT_DECISION` accordingly.

## Regression Coverage

Once the policy is decided: a unit test on `validatePartnerOnboardingData`
asserting the individual-appropriate field set is required (and
`registrationNumber` is not) for `type: INDIVIDUAL`. No `REG-nnn` entry yet.

## Dependencies

A product decision on whether `INDIVIDUAL` partners are an actively-onboarded
category (see Proposed Resolution).

## Related Items

- [[ITEM-0030]] — the item that added `PartnershipModel` to capture the
  commercial-relationship axis `PartnerType` does not; the same discovery pass
  that motivated it did not extend to giving `PartnerType` behaviour.
- TASK-0032 — the program that found this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D2.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032) — the individual
  onboarding field question is raised as an open question for the
  implementing specialist rather than blocking triage.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]], [[platform-admin]]

<!-- GRAPH:END -->
