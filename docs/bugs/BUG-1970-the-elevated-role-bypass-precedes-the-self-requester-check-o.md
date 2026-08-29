---
ID: BUG-1970
aliases: [BUG-1970]
Title: The elevated-role bypass precedes the self-requester check on leave approval steps
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written, and none should be until the finding is proven.

## QA Retest

Not applicable yet — the finding has never been verified in the first place.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, from code analysis only. Filed `BLOCKED`: no live reproduction exists and the tenant state needed to obtain one is itself blocked by BUG-1961, BUG-1965, BUG-1967 and BUG-1969.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — authorization ordering fix; ship it with the unit test that proves it, since it is live-unverified.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
