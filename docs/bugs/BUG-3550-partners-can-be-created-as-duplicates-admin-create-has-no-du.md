---
ID: BUG-3550
aliases: [BUG-3550]
Title: Partners can be created as duplicates: admin create has no duplicate check and the inquiry check ignores tax and registration numbers
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/partners, services/api/src/modules/partner-experience]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-552
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3550 — Partners can be created as duplicates: admin create has no duplicate check and the inquiry check ignores tax and registration numbers

## Summary

The internal admin partner-create path (`POST /partners`) has no duplicate
detection at all — an operator can create any number of `Partner` rows with
the same email, company name or tax id. The public inquiry path
(`submitInquiry`) has a duplicate check, but it only matches on `email` OR
case-insensitive `companyName`; it never checks `taxId` or
`registrationNumber`, even though both are stored on `Partner` and
`PartnerInquiry`.

## Expected Behavior

Creating a partner — through either the admin path or the public inquiry
path — should surface a warning or block when a matching `taxId`,
`registrationNumber`, email or company name already exists, so the same legal
entity cannot silently accumulate multiple `Partner` rows.

## Actual Behavior

`PartnersService.create()` (`partners.service.ts:391`) performs no duplicate
lookup of any kind before inserting a new `Partner` row. `submitInquiry()`
(`partner-experience.service.ts:74-95`) checks only `email` OR
case-insensitive `companyName` via `Partner.findFirst`; `taxId`/
`registrationNumber` are never read for dedup on either path.

## Reproduction

1. Admin path: call `POST /partners` twice with identical `email`,
   `companyName` and `taxId` — both requests succeed and create two separate
   `Partner` rows.
2. Public path: submit two partner inquiries with different `email`/
   `companyName` but the same `taxId`/`registrationNumber` — both succeed with
   no warning, creating two `Partner`-track records for what may be the same
   legal entity.

## Evidence

- `services/api/src/modules/partners/partners.service.ts:391`
  (`create()`) — no duplicate lookup before `prisma.partner.create`.
- `services/api/src/modules/partner-experience/partner-experience.service.ts:74-95`
  (`submitInquiry`) — `Partner.findFirst` on `email` OR case-insensitive
  `companyName` only; if a match exists and its status is not
  `INQUIRY`/`NEW_INQUIRY`, the request is refused; if still fresh, the
  existing row is updated in place rather than duplicated — but this
  protection only exists for the public path, and only for these two fields.
- `services/api/prisma/schema.prisma` — `Partner.taxId` and
  `PartnerInquiry.taxId` both exist as plain columns with no unique
  constraint and no code path found that reads either for deduplication.

## Root Cause

Duplicate detection was implemented once, for the public inquiry funnel, to
solve customer enumeration / accidental resubmission on the fields most
likely to repeat in that flow (`email`, `companyName`). It was never extended
to the internal admin create path, and never extended to the two fields
(`taxId`, `registrationNumber`) that most reliably identify a legal entity
regardless of how its name or contact email is spelled.

## Impact

Medium data-integrity gap: an operator using the internal admin screen has no
protection against creating duplicate partner records for the same company,
and the public path's weak email/name-only check can be defeated by a partner
re-applying under a slightly different company name or email while reusing
the same tax id. Downstream effects include duplicate commission tracking,
duplicate referral links, and confusion in reporting that treats each
`Partner` row as a distinct entity. Reachable in production today.

## Affected Areas

- `services/api/src/modules/partners/partners.service.ts` (`create`)
- `services/api/src/modules/partner-experience/partner-experience.service.ts`
  (`submitInquiry`)
- Admin partner create form (`apps/admin/app/(internal)/partners/new/page.tsx`)
  and the public inquiry form (`apps/landing/app/partners/partner-inquiry-form.tsx`)

## Proposed Resolution

1. Add a duplicate check to `PartnersService.create()` — at minimum matching
   on `taxId`/`registrationNumber` in addition to `email`/`companyName` —
   surfaced as a blocking validation error or an operator-facing warning
   (product decision on whether to block or warn-and-allow).
2. Extend `submitInquiry()`'s existing check to also match on
   `taxId`/`registrationNumber`, not just `email`/`companyName`.
3. Consider whether either field should become a database-enforced unique
   constraint (a schema change, requiring an ExecPlan under `PLANS.md` with a
   backfill plan for existing duplicate data) versus an application-level
   warning only (no ExecPlan needed) — flagged as an open question for the
   implementing specialist and Architect.

## Acceptance Criteria

- `POST /partners` refuses or warns on a `taxId`/`registrationNumber`/`email`/
  `companyName` match against an existing partner.
- `submitInquiry()` also checks `taxId`/`registrationNumber`, not just
  `email`/`companyName`.
- Existing legitimate re-submission flows (a still-fresh `INQUIRY` being
  updated in place) continue to work.

## Regression Coverage

REG-552 (`POST /partners` admin create — `partner-duplicate-detection.spec.ts`,
`partners-audit.spec.ts`), REG-553 (`qualifyInquiry` no-`partnerId` case),
REG-554 (registration number / tax id duplicate detection at onboarding
submission). All in
`services/api/src/modules/partners/partner-duplicate-detection.spec.ts`,
proven to fail against the pre-fix code — the module did not exist before this
branch. Also related: REG-557/REG-558 (`lead-attribution-correction.spec.ts`)
— the same WP-04 stream's lead↔partner attribution-status guard and no-op
duplicate-history fix for the same underlying "no duplicate check" theme, and
REG-559 (the admin lead partner selector UX this made necessary).

## Dependencies

Resolved — WP-04 implemented the application-level check (no DB-level unique
constraint): `findPartnerDuplicate`/`assertNoPartnerDuplicate` compares
`email`, `taxId` and `companyName` (normalised) across the admin create path,
the platform-runtime "create" path, `qualifyInquiry`'s no-`partnerId` case,
and onboarding submission's `registrationNumber`/`nationalIdNumber`/`taxId`.

## Related Items

- [[BUG-3549]] — the same discovery pass's other `Partner`-model finding.
- TASK-0032 — the program that found this.

## Resolution

Fixed by commit `5dfb4de4` on `agent/pah-wp04-partners` (TASK-0032 WP-04,
merged as `7f134e70`): `PartnersService.create()`, the platform-runtime create
path, `qualifyInquiry()` and onboarding-submission validation now all check
`email`/`taxId`/`companyName` (admin/qualify paths) or
`registrationNumber`/`nationalIdNumber`/`taxId` (onboarding submission) before
inserting, returning `409 Conflict` naming the existing partner.

## QA Retest

Verified by TASK-0032 WP-09 live QA ("Partners … duplicate email / tax id /
company name … Pass (the public inquiry duplicate check keeps its documented
merge-in-place 400)" — see
`docs/tasks/TASK-0032-streams/QA-summary.md`) and the passing
`partner-duplicate-detection.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D2.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032) — application-level
  duplicate check first; a DB-level unique constraint is a separate decision
  the implementing specialist should raise if warranted.
- 2026-09-25 — fixed at `5dfb4de4` (WP-04, application-level check, no schema
  change); verified by WP-09 live QA; Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]]
- Regression — REG-552 (see the regression register)

<!-- GRAPH:END -->
