---
ID: BUG-1970
aliases: [BUG-1970]
Title: The elevated-role bypass precedes the self-requester check on leave approval steps
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1970 — The elevated-role bypass precedes the self-requester check on leave approval steps

## Summary

> **CODE-CONFIRMED, LIVE-UNVERIFIED.** This record is filed from code reading
> alone. **No live reproduction exists**, and none was attempted successfully —
> the finding must not be reported, cited or fixed as if it had been observed
> against a running system. Status is `BLOCKED` for that reason.

In `canUserActOnStep`, the elevated-role bypass (global-admin / system-admin) is
evaluated **before** the self-requester check, and `processLeaveRequestDecision`
short-circuits in a way that means the correctly-ordered override check is never
reached. If that reading is right, a user holding an elevated tenant role can
approve their own leave request. The equivalent attendance path orders the two
checks correctly, which is what makes the leave ordering look like a mistake
rather than a decision.

## Expected Behavior

A requester cannot act on their own approval step, whatever role they hold. An
elevated role widens *which* records a user may act on; it does not exempt them
from the self-approval rule. The attendance module already implements exactly
that order.

## Actual Behavior

**Believed** (not observed): a user with `global-admin` or `system-admin` submits
a leave request and approves it themselves, with no second party involved.

## Reproduction

**None. This finding has no reproduction.**

What is needed to produce one: a leave request that exists, whose approver is not
the requester, and a second ACTIVE user to compare against. That could not be
assembled on the demo tenant because:

- BUG-1961, BUG-1965 and BUG-1967 between them make it impossible to create a
  leave request through the product at all, and
- BUG-1969 and ITEM-0106 make it impossible to obtain a second ACTIVE user
  without a deliverable mailbox.

The honest verification route is a unit or e2e test over `canUserActOnStep` and
`processLeaveRequestDecision`, not a live probe.

## Evidence

Code only, at `eb457d9d`:

- `services/api/src/modules/leave/leave.service.ts:2123` — `canUserActOnStep`
  places the elevated-role bypass (global-admin / system-admin) **before** the
  self-requester check.
- `leave.service.ts:1533-1543` — `processLeaveRequestDecision` short-circuits such
  that `canOverrideLeaveDecision` (`leave.service.ts:2156`), which *is* correctly
  ordered, is never reached.
- `services/api/src/modules/attendance/attendance.service.ts:1820` — the
  equivalent attendance path orders the checks correctly, and is the reference
  for what this code should look like.

No request, response, log line or database row supports this record. That is the
point of the warning at the top.

## Root Cause

Not established. The ordering above is the mechanism the code reading suggests;
whether it is reachable in practice depends on the caller paths into
`processLeaveRequestDecision`, which were not traced.

## Impact

**If confirmed:** an authorization defect — self-approval of leave by any user
holding an elevated tenant role, with no second party and no compensating
control. That matches this repository's own documented `self-approval` bug
pattern, which is why it is rated HIGH pending verification rather than parked.

**If not confirmed:** the reading is wrong and the record should be closed
`NOT_A_BUG` with the trace that disproves it. Either outcome is worth the test.

## Affected Areas

`services/api/src/modules/leave` (`canUserActOnStep`,
`processLeaveRequestDecision`, `canOverrideLeaveDecision`). The attendance
equivalent is believed correct and should be left alone except as a reference.

## Proposed Resolution

First, prove or disprove it with a unit test over `canUserActOnStep` that asserts
a requester holding an elevated role cannot act on their own step. Only then
reorder the checks in `processLeaveRequestDecision` so the self-requester test
precedes the elevated-role bypass, matching `attendance.service.ts:1820`.

## Acceptance Criteria

- A test exists that fails on today's ordering and passes after it.
- A requester holding `global-admin` or `system-admin` cannot approve their own
  leave request.
- An elevated role can still act on other people's requests where the design
  intends it to.
- The attendance path is unchanged.

## Regression Coverage

None yet, and here the regression test is also the verification: this record
cannot leave `BLOCKED` until that test exists.

## Dependencies

Live verification is blocked by BUG-1961, BUG-1965, BUG-1967 (no leave request can
be created) and BUG-1969 / ITEM-0106 (no second ACTIVE user). A unit test avoids
all of them.

## Related Items

The repository's `self-approval` known bug pattern under
`docs/qa/known-bug-patterns/`. BUG-1968 is the routing defect on the same code
path.

## Resolution

**Fixed, and the finding is now proven rather than believed.** The reading
recorded in Evidence was correct: a user holding an elevated tenant role could
approve their own leave request.

### What the code did

`canUserActOnStep` (`services/api/src/modules/leave/leave.service.ts:2102`)
answered the elevated-role question before the self-requester question:

```ts
if (hasElevatedTenantRole(currentUser)) return true;                    // first
if (leaveRequest.employee.userId === currentUser.userId) return false;  // second
```

A global-admin or system-admin who submitted a request was therefore reported as
the assigned approver of their own pending step.
`processLeaveRequestDecision` treats a true answer from that helper as
`isAssignedApprover`, and only consults `canOverrideLeaveDecision` when it is
false — so the correctly ordered check at `leave.service.ts:2139`, which bars the
requester before the role bypass, was not a second line of defence on that path.
It was unreachable.

### What changed

- `services/api/src/modules/leave/leave.service.ts:2102-2136` —
  `canUserActOnStep` now tests the self-requester first and the elevated role
  second, matching `canOverrideLeaveDecision` in the same file and
  `attendance.service.ts:1808`, which bars both parties to a correction before
  any permission or role path. The comment records why the order is
  load-bearing.
- `services/api/src/modules/leave/leave.service.ts:1548-1561` —
  `processLeaveRequestDecision` refuses a self-decision explicitly, ahead of the
  status check, with `You cannot approve or reject your own leave request.` The
  reordering above is what closes the hole; this states the rule at the entry
  point so the outcome does not depend on two helpers continuing to agree, and
  so the caller is told what was actually wrong rather than "you are not assigned
  to action this leave request".

The elevated-role bypass itself was not widened, narrowed, or given a new
member: `ELEVATED_TENANT_ROLE_KEYS` is untouched.

The reordering also reaches the UI without a frontend change. `mapLeaveRequest`
derives `canCurrentUserApprove` and `canCurrentUserReject` from the same helper,
so an administrator is no longer offered approve or reject on their own request.

### Regression coverage

`services/api/src/modules/leave/leave-self-approval.spec.ts`, seven cases: both
elevated roles refused on approve, both on reject, the record payload no longer
offering either action on the requester's own request, and two negative
controls — an elevated role still acting on somebody else's request, and the
assigned approver still acting without any elevated role.

**Mutation-tested, not merely passing.** With the fix reverted (a `git checkout`
of `leave.service.ts` alone, the spec left in place) the suite reports
**5 failed, 2 passed**: the five positive cases fail and the two negative
controls pass, which is the shape that shows the tests read the ordering rather
than the fixture. Restored, it reports **7 passed**. The refusal cases assert
that `$transaction`, `updateLeaveApprovalStep` and `updateLeaveRequest` were
never called, as well as the message — under the old ordering the call did not
throw at all but fell through into the decision transaction, so an assertion on
the message alone could have passed against a version that merely reworded a
later failure.

That test is also the verification this record was filed without. The
live-unverified warning at the top of the Summary is discharged for the code
path; a production observation is still absent, deliberately — the honest
verification route named in Reproduction was a unit test over these two
functions, and that is what exists.

## QA Retest

Not performed live, and not required to close the finding. The verification is
`leave-self-approval.spec.ts` — see Regression Coverage — which fails against the
previous ordering and passes against the fix.

A live retest is still worth doing once a release carries this, and it is now
cheap: sign in as a tenant global-admin who has an employee record, submit a
leave request for yourself, and confirm the record offers no approve or reject
action and that `POST /api/leave-requests/{id}/approve` answers 403 with
`You cannot approve or reject your own leave request.` The dependencies listed
below shaped the original blockage, not the fix.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, from code analysis only. Filed `BLOCKED`: no live reproduction exists and the tenant state needed to obtain one is itself blocked by BUG-1961, BUG-1965, BUG-1967 and BUG-1969.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — authorization ordering fix; ship it with the unit test that proves it, since it is live-unverified.
- 2026-08-29 — **fixed** in SESSION-0076 on `agent/bugfix-leave`: the self-requester test now precedes the elevated-role bypass in `canUserActOnStep`, and `processLeaveRequestDecision` refuses a self-decision explicitly. Proven by `leave-self-approval.spec.ts`, mutation-tested against the previous ordering (5 failed / 2 passed with the fix reverted; 7 passed with it in place). Status OPEN to FIXED; the live-unverified caveat is discharged by the test rather than by a production observation.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
