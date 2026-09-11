---
ID: ITEM-0170
aliases: [ITEM-0170]
Title: Eleven tenant modules emit no notifications at all
Type: FOLLOW_UP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [notifications, recruitment, documents, policies, contracts, support-cases, business-trips, benefits, compensation, projects, sla, legal, partners]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
RelatedBug: BUG-3375
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0170 — Eleven tenant modules emit no notifications at all

## Summary

The product owner asked that proper notifications be used across the whole web
app. Surveying which tenant workflows actually notify anybody, the answer splits
cleanly: leave, attendance, timesheets, claims, loans, payroll, payslips,
onboarding, employee documents, scheduled reports and authentication are all
wired. Eleven other modules have no notification wiring whatsoever — no catalog
entry and no trigger.

This is the coverage half of the notifications review. The configuration half is
[[BUG-3375]] and [[ITEM-0169]].

## Why It Matters

A workflow that notifies nobody depends on someone remembering to look. For the
modules below that means a contract renewal nobody is warned about, a policy
acknowledgement nobody is chased for, a support case updated with no one told,
and a recruitment candidate advancing with no signal to the hiring manager.
These are the notifications a customer expects an HR platform to send, and their
absence is invisible from the settings screen, which lists only what exists.

## Evidence

**Wired today**, with the trigger call sites found:

| Area | Trigger |
|---|---|
| Leave submit, approve, reject | `leave.service.ts:771`, `:1851` |
| Attendance corrections and exceptions | `attendance.service.ts:2303-2590` |
| Employee document upload and expiry | `employee-profiles.service.ts:1231`, `:1366` |
| Onboarding task assigned | `onboarding.service.ts:542` |
| Timesheets, including reminder and escalation | `timesheet-workflow.service.ts`, `timesheet-jobs.service.ts:349` |
| Claims and loans | `claims.service.ts`, `loans.service.ts` |
| Payroll, payments and journals — 15 events | `payroll-operations.service.ts`, `payroll-journal.service.ts` |
| Payslip available | `payslips.service.ts:101` |
| Scheduled reports | `report-scheduler.worker.ts:100` |
| Account activation and password reset | `user-invitations.service.ts:440`, `auth.service.ts:854`, `:1034` |
| Invoice issued | `super-admin.service.ts:3253` |

**No catalog entry and no trigger**, established by searching each module for
any reference to the notifications service, orchestrator or catalog and finding
none:

recruitment, documents and policy acknowledgement, contracts, support cases,
business trips, benefits, compensation, projects, SLA, legal, partners.

Corroborated by the live workspace. Its entire email delivery history is twelve
rows: eleven scheduled Employee Directory reports and one account activation.
Nothing else in the product has ever sent this tenant an email, despite the
workspace holding leave requests, employees and attendance data.

## Proposed Approach

Needs an ExecPlan under `PLANS.md`, and it should be scoped by value rather than
by completeness — wiring all eleven modules at once would be a large change with
little feedback along the way.

1. **Settle the model question first.** [[BUG-3375]] and [[ITEM-0171]] have to
   resolve which mechanism gates a notification before new events are added to
   it, or the new ones inherit the ambiguity.
2. **Rank by expectation, not by module count.** The candidates most likely to
   be noticed missing: document and policy acknowledgement due, contract
   renewal or expiry, recruitment stage change, support case updated, business
   trip approved. Benefits, compensation, projects, SLA, legal and partners can
   follow or be declined.
3. **Decline explicitly where appropriate.** Not every module needs to notify.
   A module reviewed and deliberately left silent should be recorded as such, so
   the next survey does not re-raise it.
4. **Reuse the existing path.** `AGENTS.md` is explicit that the `notifications`
   module is the only route for tenant notification and email. New events go
   through the catalog, orchestrator, queue and processor, not through a direct
   mailer call — see [[ITEM-0171]] for the precedent to avoid.

## Acceptance Criteria

- Every tenant module has been reviewed and is either wired to the notification
  catalog or recorded as deliberately silent, with a reason.
- Each new event has a catalog entry, a real trigger, a written description, and
  a template where a channel needs one.
- No new event is dispatched outside the `notifications` module.
- A test or check exists that a catalog entry has a trigger, so the dead
  entries in [[ITEM-0169]] cannot recur.

## Dependencies

Sequenced after [[BUG-3375]] and [[ITEM-0171]]. [[BUG-3200]] affects whether
delivery is asynchronous, which matters for volume once coverage widens.

## Related Items

[[BUG-3375]] rules screen and model mismatch. [[ITEM-0169]] catalog hygiene.
[[ITEM-0171]] the ungated dispatch path. [[ITEM-0061]] covers billing lifecycle
notifications in a different catalog. [[ITEM-0148]] is the generic notification
delivery test gap.

## History

- 2026-09-11 — created at `cbd9b812` from a user request to check notification
  usage across the app; coverage established by tracing trigger call sites and
  corroborated against the live workspace's complete delivery history.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3375]]
- Modules — [[notifications]], [[contracts-and-agreements]], [[legal]], [[partners]]

<!-- GRAPH:END -->
