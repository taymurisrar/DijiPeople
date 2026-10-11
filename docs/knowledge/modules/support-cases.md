# Support Cases

> Written from the code at `dc10b371` (SESSION-0121, 2026-10-11).

## Purpose

Platform-side support cases: DijiPeople operators working customer and tenant
issues. These are platform records owned by platform users and platform teams,
not tenant data.

## Lifecycle

The transition table lives in `services/api/src/modules/support-cases/support-case-lifecycle.ts`.
`support-case-transitions.contract.json` mirrors it for the admin command bar,
and a spec in each workspace fails if the two differ.

- NEW can move to Triaged, Assigned, Investigating, Waiting on customer,
  Resolved or Cancelled. The working states move between each other and can
  also move to Resolved or Cancelled.
- RESOLVED can move to Closed or Reopened. CLOSED and CANCELLED can only move
  to Reopened. A merged case has no transitions at all.
- Some transitions need information first:
  - Resolved needs a summary and a category.
  - Waiting on customer needs a customer message.
  - Waiting on internal team needs a team.
  - Cancelled needs a reason.
  - Reopened needs a reason, and clears both resolved and closed dates.
  - Closed honours `closureConfirmationRequired`.
- `PATCH :id` still edits fields. Any status change in it goes through the
  same validator.
- Escalation is numeric, `escalationLevel` + 1, capped at 10. The admin UI once
  sent the string "ESCALATED", which made Escalate always fail ([[BUG-4061]]).

## Teams and ownership

- A case is owned by a platform user, a `PlatformTeam`, or both.
  `assignedTeam` is kept only as a name snapshot, for legacy rows.
- Teams are managed under Settings > Teams.
- A team cannot be archived while open cases or active assignment rules use
  it, unless a reassignment target is given. It can only be deleted if nothing
  ever referenced it.
- A case created with no owner goes through the assignment rules described in
  [[super-admin]].

## Customer and tenant

- The Tenant lookup depends on Customer: `/super-admin/tenants?customerAccountId=`.
- The API rejects a tenant that belongs to another customer, and derives the
  customer from the tenant when only the tenant is given ([[BUG-4060]]).

## Relations and merge

`SupportCaseRelation` links one case to another as RELATED, DUPLICATE or
BLOCKS. A duplicate link and a BLOCKS/DUPLICATE cycle are both refused, and so
is linking cases that belong to different customers.

A merge runs in one transaction. It moves child cases, communications,
attachments, incident links and relations to the target, closes the source as
DUPLICATE, and makes the source read-only. The source keeps its own timeline
as history.

## Related

[[super-admin]] · [[platform-admin]] · [[customers]] · [[BUG-4060]] · [[BUG-4061]]
