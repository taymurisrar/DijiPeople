---
ID: ITEM-0026
Title: Partner inquiry form does not yet capture partnership model
Type: FOLLOW_UP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/landing, api:partners]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0019
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0026 — Partner inquiry form does not yet capture partnership model

## Summary

Wave 3 added `PartnershipModel` to the schema and `PartnerInquiry`, and the
option list is exported for the landing app — but the public partner form still
submits only `PartnerType`, and the Admin runtime does not yet render the new
field.

## Why It Matters

`PartnerType` is `{ INDIVIDUAL, COMPANY }` — the *contracting entity type*. It
cannot express whether someone wants to refer customers, resell, implement, or
integrate. Until the form captures `partnershipModel`, every partnership inquiry
still arrives commercially indistinguishable from every other, which is the
substance of what Wave 3 set out to fix on the partner side.

The column exists and is nullable, so nothing is broken and no data is wrong —
the field is simply not populated yet.

## Why it was NOT completed in Wave 3

Wave 3 delivered the Lead/contact path end to end and ran out of scope before
the partner form. The schema, enum, option list and validation helper all landed
so the remaining work is form plus Admin field, not design.

Recording it rather than half-wiring it: a form that collects the value while
Admin cannot display it would look complete and would not be.

## Evidence

- `services/api/prisma/schema.prisma` — `PartnerInquiry.partnershipModel`,
  nullable, and `enum PartnershipModel`.
- `services/api/src/modules/leads/acquisition.catalog.ts` —
  `PARTNERSHIP_MODEL_OPTIONS`, `isPartnershipModel`.
- `apps/landing/lib/acquisition-options.ts` — `PARTNERSHIP_MODEL_OPTIONS`
  exported and covered by tests, not yet consumed by the form.
- `apps/landing/app/partners/partner-inquiry-form.tsx` — still submits `type`
  only.

## Proposed Approach

1. Add the partnership-model select to the partner form, plus the same
   privacy-notice/marketing-consent split the contact form now uses.
2. Accept and validate it in the partner intake DTO against `isPartnershipModel`.
3. Persist attribution and `privacyNoticeVersion` as the Lead path does.
4. Surface it in the Admin Partner Inquiry form and list view.
5. Verify the Partner Inquiry to Partner conversion carries it.

## Acceptance Criteria

- A partnership inquiry records which partnership model was requested.
- Marketing consent is optional and separate on the partner form too.
- Admin displays the model as a label, never a raw enum.
- Conversion to Partner does not discard it.

## Dependencies

None. The schema landed in Wave 3.

## Related Items

[[BUG-0019]] — partner screens reachability.
[[BUG-0021]] — the Lead half of the same acquisition work.

## History

- 2026-08-16 — created during Wave 3, which completed the Lead path and left the
  partner form for a focused follow-up.
