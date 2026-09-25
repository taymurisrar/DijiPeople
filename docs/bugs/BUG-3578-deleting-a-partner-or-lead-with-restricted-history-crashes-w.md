---
ID: BUG-3578
aliases: [BUG-3578]
Title: Deleting a partner or lead with restricted history crashes with a 500
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [services/api/src/modules/partners, services/api/src/modules/leads]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-620
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3578 — Deleting a partner or lead with restricted history crashes with a 500

## Summary

Deleting a single partner, or bulk-deleting a lead, could crash with an
unhandled `500` instead of a clean refusal whenever the record carried history
Prisma's schema protects with `onDelete: Restrict` — a public inquiry record,
an onboarding application, a lead-attribution correction, an agreement, or a
partner-lead review. The delete service checked some Restrict relations and
silently missed others, so the database's own foreign-key constraint was the
first thing to actually refuse the operation, and it does so with a driver
exception, not a domain error.

## Expected Behavior

Deleting a partner or bulk-deleting a lead that still has Restrict-protected
history should be refused with a clear `400`/`409` naming every relation that
blocks it, exactly like the checks the service already had for leads,
commissions, agreements, referral links and portal users. A record with no
such history should delete cleanly, including its own timeline, in one
transaction.

## Actual Behavior

`PartnerDeletionService.deletePartners` checked leads, commissions,
agreements, referral links and portal users, but not: the partner's origin
inquiry, its onboarding applications, lead-attribution history pointing at
it, lead reviews, or support cases — all `Restrict` — nor the partner's own
`Restrict` timeline. `LeadsService.bulkDeleteLeads` similarly checked only
whether the lead had converted to a customer, not `LeadAttributionCorrection`,
`Contract.relatedLeadId` or `PartnerLeadReview`. In both cases, deleting a
record with the unchecked relation reached Prisma's `delete`/`deleteMany` and
failed with a raw foreign-key-violation exception, surfaced to the operator as
a generic `500`.

## Reproduction

1. Create a partner from a public inquiry (so it has an origin
   `PartnerInquiry` row), or one with an onboarding application, a lead
   attributed to it via `LeadAttributionCorrection`, a lead review, or a
   support case.
2. Call the admin partner delete action for that partner.
3. Observe `500 Internal Server Error` instead of a named refusal.
4. Separately, bulk-delete a lead that has attribution-correction history, an
   agreement (`Contract.relatedLeadId`), or a `PartnerLeadReview` — same `500`.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 QA,
partners Defect 1; agreements Defect 5): both paths crashed with an unhandled
foreign-key violation instead of a domain error.

## Evidence

- `services/api/src/modules/partners/partner-deletion.service.ts` —
  `deletePartners` had explicit checks for `Lead`, `PartnerCommission`,
  `Contract` (via partner), `PartnerReferralLink` and `PartnerPortalUser`, but
  none for `PartnerInquiry.partnerId`, `PartnerOnboardingApplication`,
  `LeadAttributionCorrection.partnerId`, `PartnerLeadReview` or
  `SupportCase.partnerId` — all declared `onDelete: Restrict` in
  `schema.prisma` — nor for `PartnerTimeline`, the partner's own Restrict
  child.
- `services/api/src/modules/leads/leads.service.ts` — `bulkDeleteLeads`
  checked only `Lead.convertedToCustomerId`, not
  `LeadAttributionCorrection.leadId`, `Contract.relatedLeadId` or
  `PartnerLeadReview.leadId`.
- QA reproduction: `docs/tasks/TASK-0032-streams/QA-summary.md` ("Partners …
  hand-off to the agreement gate", row referencing partners Defect 1 and
  agreements Defect 5).

## Root Cause

Both delete guards were written against an incomplete list of the model's
`Restrict` relations, so the database's own foreign-key constraint — not the
service — was the actual enforcement point for the relations nobody
enumerated, and a constraint violation there is a raw Postgres/Prisma
exception, not a caught domain error.

## Impact

Any partner or lead with a legitimate, common history (an inquiry origin, an
onboarding record, an attribution correction, an agreement, a review, or a
support case) could not be deleted through the normal UI action — the
operator saw a generic server error with no indication of which relation was
in the way, and the request left a half-visible failure in the platform error
log.

## Affected Areas

- `services/api/src/modules/partners/partner-deletion.service.ts`
- `services/api/src/modules/leads/leads.service.ts` (`bulkDeleteLeads`)
- `apps/admin` partner and lead delete actions (consumers of both endpoints)

## Proposed Resolution

Enumerate every `Restrict` relation for `Partner` and `Lead` explicitly,
refuse by name before attempting the delete, and delete the record together
with its own Restrict children (the partner's timeline) inside one
transaction when nothing blocks it. No ExecPlan needed — this is a service-
level guard fix with no schema change.

## Acceptance Criteria

- Deleting a partner with any of: an origin inquiry, an onboarding
  application, attribution-correction history, a lead review, or a support
  case is refused with the relation named.
- A partner with none of those is deleted together with its timeline in one
  transaction.
- Bulk-deleting a lead with attribution changes, agreements or partner
  reviews is refused with a `400` naming them; a lead with none is deleted.

## Regression Coverage

REG-620 (`services/api/src/modules/partners/partner-deletion.service.spec.ts`,
"restricted relations refuse by name") and REG-621
(`services/api/src/modules/leads/lead-delete-and-partner.spec.ts`), both
proven to fail against the pre-fix service.

## Dependencies

None.

## Related Items

- [[BUG-3579]] — found by the same WP-09 partners/leads QA pass.
- Modules — [[partners]], [[leads]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commit `0a84a58e` (`fix(partners,leads): refuse restricted deletes by
name, show the attributed partner (TASK-0032)`): `deletePartners` now checks
every `Restrict` relation on `Partner` (inquiry, onboarding applications,
attribution corrections, lead reviews, support cases, plus the existing
leads/commissions/agreements/referral-links/portal-users checks) and deletes
the partner with its timeline in one transaction when none block it;
`bulkDeleteLeads` adds checks for `LeadAttributionCorrection`,
`Contract.relatedLeadId` and `PartnerLeadReview`.

## QA Retest

Verified by TASK-0032 WP-09 live QA against the throwaway stack — see
`docs/tasks/TASK-0032-streams/QA-summary.md` ("Partners … hand-off to the
agreement gate": Pass) and the passing regression specs
`partner-deletion.service.spec.ts` / `lead-delete-and-partner.spec.ts`.

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA (partners Defect 1, agreements Defect 5).
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `0a84a58e`
  and verified by WP-09 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]], [[leads]]
- Regression — REG-620 (see the regression register)

<!-- GRAPH:END -->
