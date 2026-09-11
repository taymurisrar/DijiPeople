---
ID: ITEM-0169
aliases: [ITEM-0169]
Title: "Notification catalog hygiene: dead events, duplicate leave pairs, two key conventions and placeholder copy"
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [notifications, apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
RelatedBug: BUG-3375
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0169 — Notification catalog hygiene: dead events, duplicate leave pairs, two key conventions and placeholder copy

## Summary

The notification catalog is shown to tenant administrators as a list of 53
events they can switch on and off per channel. Read as a document, it is
visibly unfinished: two incompatible key conventions sit side by side, several
events are duplicated under both, seven events cannot fire at all, two spellings
of one category coexist, and a good third of the descriptions are
auto-generated filler restating the event name.

None of this is a functional failure on its own. Together it is the reason the
screen does not inspire confidence, and it is what the product owner was
reacting to in asking whether notifications are "properly utilized".

## Why It Matters

This list is a tenant administrator's only map of what the product will tell
people about. If it contains entries that cannot fire, near-duplicate entries
with different channels, and descriptions that say nothing, an administrator
cannot make a decision from it — and switching something on is not the same as
it working. The duplicate pairs in particular mean an administrator can disable
a leave notification and still receive one, from the other entry.

## Evidence

Measured by reading the rendered catalog at
`/settings/notifications/rules` on the live workspace at `cbd9b812`.

| Measurement | Value |
|---|---|
| Event rows | 53 |
| Keys in `SCREAMING_SNAKE_CASE` | 38 |
| Keys in `lowercase.dotted.form` | 15 |
| Distinct category values | 10 |
| Channel checkboxes | 64 |
| Search or filter controls | 0 |

**Two key conventions, with semantic duplicates.** Both of these appear in the
same table:

| Event | Key | Channels |
|---|---|---|
| Leave approved | `LEAVE_APPROVED` | In-app, Email |
| Leave request approved for employee | `leave.request.approved.employee` | In-app |
| Leave approval request | `LEAVE_APPROVAL_REQUEST` | In-app, Email |
| Leave request submitted for approver | `leave.request.submitted.approver` | In-app |

Two entries for one real-world occurrence, differing in channel. `AGENTS.md`
principle 4 forbids a second source of truth for the same thing.

**Two spellings of one category.** `APPROVAL` is used by Claim approval
requested, Claim rejected, Loan approval requested and Loan rejected;
`APPROVALS` is used by Leave request escalated. Categorisation is also
inconsistent across modules: Claim approval requested is `APPROVAL` while Claim
approved is `PAYROLL`.

**Seven events have no trigger anywhere in the codebase**, so they can never
fire and yet are shown as Enabled: `leave.request.returned.employee`,
`leave.request.escalated`, `employee.profile.change.submitted.hr`,
`TIMESHEET_OVERDUE`, `AUTH_OTP`, and the two legacy leave entries above.
`AUTH_OTP` is candid about it in its own tenant-facing description: "Reserved
for future one-time passcode authentication flows."

**Placeholder descriptions.** A substantial group reads as generated from the
event name: "Timesheet overdue workflow notification.", "Journal posted payroll
notification.", "Payment batch failed payroll notification.", "Payroll approved
payroll notification.", and roughly a dozen more in the payroll and timesheet
groups. Compare a written one — "Sent when a published payslip is available in
employee self-service." — which tells an administrator something.

**Developer diagnostics rendered to tenants.** Above the table, verbatim:

> SOURCE: TENANTSETTING CONTROLS GLOBAL LIGHTWEIGHT NOTIFICATION TOGGLES.
> NOTIFICATIONPREFERENCE CONTROLS PER-EVENT CHANNEL ENABLEMENT.

and the section blurb "These lightweight tenant settings are read from the
existing tenant settings API". Model names and internal topology are not tenant
copy.

## Proposed Approach

Contained; no ExecPlan needed, but it must be sequenced after the model question
in [[BUG-3375]] is settled, because that decides which screen survives to show
this list.

1. Pick one key convention and migrate to it. The dotted form is the newer and
   more expressive; whichever is chosen, the legacy duplicates are retired with
   a mapping so existing preference rows are not orphaned.
2. Collapse each duplicate pair into one event carrying the union of the
   channels the two had.
3. Normalise `APPROVALS` to `APPROVAL` and review the cross-module
   categorisation while there.
4. Remove events with no trigger, or mark them explicitly as not yet available
   rather than showing them as Enabled. `AUTH_OTP` is a clear candidate for
   removal until the feature exists.
5. Write real descriptions for the generated ones. An event an administrator
   cannot understand from its description is not configurable in practice.
6. Delete the diagnostic text and rewrite the section blurbs in tenant language.

Adding search and filter over 53 rows belongs with the table replacement in
[[BUG-3375]].

## Acceptance Criteria

- Every catalog key follows one convention.
- No two catalog entries describe the same occurrence.
- One spelling of each category.
- No event shown as Enabled is incapable of firing.
- Every description says when the notification is sent, in words that do not
  merely restate the title.
- No model name or internal API reference appears in tenant-facing copy on this
  screen.
- Existing tenant preferences survive the key migration.

## Dependencies

Sequenced after [[BUG-3375]] settles which model and which screen own this list.
[[ITEM-0170]] covers the modules with no events at all, which is the other half
of the coverage question.

## Related Items

[[BUG-3375]] the rules screen and model mismatch. [[ITEM-0170]] modules that
emit nothing. [[ITEM-0171]] the dispatch path that ignores rules entirely.

## History

- 2026-09-11 — created at `cbd9b812`; catalog contents counted and quoted from
  the live rendered screen, dead entries confirmed by code search for triggers.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3375]]
- Modules — [[notifications]], [[tenant-application]]

<!-- GRAPH:END -->
