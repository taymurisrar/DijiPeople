---
ID: BUG-3551
aliases: [BUG-3551]
Title: Partner create, update, lifecycle and onboarding review are not written to the audit log
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/partners, services/api/src/modules/partner-experience]
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

# BUG-3551 — Partner create, update, lifecycle and onboarding review are not written to the audit log

## Summary

`partners.service.ts` and `partner-experience.service.ts` never call
`AuditService.log()`. Every partner lifecycle transition (start-review,
approve, reject, request-information, suspend, reactivate, deactivate),
partner create/update, referral-link create/enable/disable/expire/regenerate,
commission create/update, inquiry qualify/reject, onboarding send-invitation/
submit/review, and partner activation are invisible to the platform audit
trail (`AuditService`/`PlatformAuditLog`). The only history is
`PartnerTimeline`, a bespoke, partner-scoped, free-text-`eventType` table not
surfaced through the platform's general audit/report views.

## Expected Behavior

Per `AGENTS.md`'s Backend rule ("call `AuditService.log()` for every
state-changing operation that a tenant admin or auditor would need to see"),
every partner lifecycle transition and mutation should be queryable from the
standard platform audit surface, the same way `leads.service.ts` — the same
commercial funnel — already audits 7 distinct actions.

## Actual Behavior

Confirmed by grep: `partners.service.ts` has no `AuditService` import or
constructor injection at all. `partner-experience.service.ts` has none
either. The **one** exception in the module family is
`partner-deletion.service.ts`, which does inject and call `AuditService.log()`
for its bulk-delete actions. A compliance officer or auditor querying the
platform audit log for "who activated this partner" or "who approved this
onboarding application" finds nothing — that history exists only inside
`Partner.timeline`, reachable only from that specific partner's own detail
page.

## Reproduction

1. As a platform operator, approve a partner inquiry, activate a partner, or
   suspend an active partner through the admin UI or API.
2. Query `/api/audit-logs` (or the underlying `PlatformAuditLog` table) for
   any row referencing that partner or action.
3. Observe no row exists — the action is recorded only in `Partner.timeline`
   on that partner's own record.

## Evidence

- `services/api/src/modules/partners/partners.service.ts` — `rg
  "AuditService|auditService|audit\.log"` returns zero matches; no import, no
  constructor injection. Every lifecycle transition in `partnerTransition()`
  (line 576) and `update()` (line 403) writes only to `PartnerTimeline`.
- `services/api/src/modules/partner-experience/partner-experience.service.ts`
  — same grep, zero matches. Inquiry qualify/reject, onboarding
  send-invitation/submit/review, partner activation and partner-lead review
  all go through `PartnerTimeline` + `PlatformCommunicationsService.sendEmail`
  only; `PlatformEventsService.record()` is called exactly twice in the whole
  file.
- `services/api/src/modules/partners/partner-deletion.service.ts` — the one
  exception: does inject and call `AuditService.log()` (actions
  `PARTNER_BULK_DELETED`, `PARTNERINQUIRY_BULK_DELETED`,
  `PARTNERONBOARDINGAPPLICATION_BULK_DELETED`).
- Contrast: `services/api/src/modules/leads/leads.service.ts` calls
  `AuditService.log()` 7 times (create/update/status transitions/attribution
  correction/bulk actions) — the same commercial-funnel module family,
  auditing correctly.
- `PartnerTimeline` model (`schema.prisma:2978`) — `eventType` is a free
  string (no enum), `metadata` is `Json`; this is the only persistent history
  for most partner-side state changes today, and it is partner-scoped (not
  queryable from the general audit view).

## Root Cause

No comment or decision anywhere in `partners.service.ts` or
`partner-experience.service.ts` states that audit logging was intentionally
scoped out of partner mutations. The module family appears to have adopted
`PartnerTimeline` as its own event log early on and never additionally wired
`AuditService`, unlike its sibling `leads.service.ts` and unlike
`partner-deletion.service.ts` within the same module.

## Impact

Medium security/compliance gap: every partner lifecycle decision — who
approved an onboarding application, who activated or suspended a partner, who
edited a partner's commission rate — is invisible to the platform's general
audit trail and to anyone (auditor, support, security reviewer) who does not
already know to open that specific partner's timeline tab. This is consistent
with the Security checklist's "Auditability" requirement being unmet for an
entire module family handling commercial/legal-adjacent relationships.
Reachable in production today.

## Affected Areas

- `services/api/src/modules/partners/partners.service.ts` (create, update,
  every `partnerTransition()` branch, referral-link and commission mutations)
- `services/api/src/modules/partner-experience/partner-experience.service.ts`
  (inquiry qualify/reject, onboarding send/submit/review, activation, lead
  review)

## Proposed Resolution

Inject `AuditService` into both services (following the exact pattern already
used in `leads.service.ts` and `partner-deletion.service.ts`) and call
`AuditService.log()` alongside every existing `PartnerTimeline` write, with
before/after snapshots where a state-changing update applies. Keep
`PartnerTimeline` as the partner-scoped, human-readable narrative — it answers
a different question (this partner's own history) than the general audit
trail does (queryable across all partners/actors). No ExecPlan needed; this
follows an established pattern already proven elsewhere in the same module
family.

## Acceptance Criteria

- Partner create, update, and every lifecycle transition write an
  `AuditService.log()` entry with before/after snapshots.
- Inquiry qualify/reject, onboarding send-invitation/submit/review, and
  partner activation each write an `AuditService.log()` entry.
- `PartnerTimeline` continues to be written alongside, unchanged.
- `modules/audit/lifecycle-audit-coverage.spec.ts` (or an equivalent new spec)
  covers `PartnersService`/`PartnerExperienceService` the way it already
  covers `EmployeesService`/`OrganizationService`/`LeaveService`.

## Regression Coverage

A unit test asserting `AuditService.log()` is called on partner create,
update, each lifecycle transition, and each onboarding-review decision,
failing against the unfixed code (which currently calls it zero times in
either service). No `REG-nnn` entry yet.

## Dependencies

None.

## Related Items

- [[BUG-3231]] — the contracts module's own audit-trail gap (`DEFERRED`),
  the same failure shape in a sibling commercial module.
- TASK-0032 — the program that found this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D2.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]]

<!-- GRAPH:END -->
