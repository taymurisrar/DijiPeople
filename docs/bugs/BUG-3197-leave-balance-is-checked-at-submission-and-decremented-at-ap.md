---
ID: BUG-3197
aliases: [BUG-3197]
Title: Leave balance is checked at submission and decremented at approval, so pending requests are invisible and the balance can be overdrawn
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3197 — Leave balance is checked at submission and decremented at approval, so pending requests are invisible and the balance can be overdrawn

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Checking leave balance at submission and decrementing at approval lets two requests both pass. Check and decrement in one transaction at the decision point.

## Summary

Leave balance is checked at submission and decremented at approval, so pending requests are invisible and the balance can be overdrawn

Identified by the 2026-09-10 full technical audit as RES-03 (confidence: RES-03=CONFIRMED).

## Expected Behavior

the availability check must count `PENDING` requests
  as encumbered (available = `totalRemaining` − sum of pending days), and the
  approval transition must re-validate the policy ceiling before incrementing
  `totalUsed`.

## Actual Behavior

pending requests do not reduce `totalRemaining`. An
  employee with 5 days remaining can submit three separate 5-day requests; each
  passes the check independently. When all three are approved the balance
  becomes −10, silently past a `maximumNegativeBalance` of, say, 2. This does not
  require concurrency — it is deterministic. Under concurrency it is worse: two
  simultaneous submissions both read `remaining = 5` before either row exists.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-03** (`services/api/src/modules/leave/leave.service.ts`, `leave-entitlement.service.ts`):

The only balance check is inside `validateLeaveRequestAgainstPolicy`, called
  from the *create* path at `leave.service.ts:504`. The check reads the stored
  balance — `leave.service.ts:658-672`:
  ```ts
  const balance = await this.prisma.leaveBalance.findUnique({
    where: { tenantId_employeeId_leaveTypeId: { tenantId, employeeId, leaveTypeId: leaveType.id } },
  });
  const remaining = balance?.totalRemaining ?? new Prisma.Decimal(0);
  if (remaining.greaterThanOrEqualTo(totalDays)) return;
  ```
  The decrement happens only on approval —
  `leave.service.ts:2059-2079` (`recordApprovedLeaveConsumption`):
  ```ts
  update: {
    totalUsed: { increment: leaveRequest.totalDays },
    totalRemaining: { decrement: leaveRequest.totalDays },
  ```
  and `totalRemaining` is defined purely as allocation minus *consumed* —
  `leave-entitlement.service.ts:191`:
  ```ts
  totalRemaining: entitlement.minus(used),
  ```
  Grepping the approval path (`leave.service.ts:1780-1813`) shows
  `recordApprovedLeaveConsumption` is called with **no re-validation** of the
  balance or the negative-balance ceiling.

---


Full finding text: RES-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

unpaid/paid leave liability that HR did not authorise, carried into
  payroll (leave feeds `time-payroll`). The policy control that a tenant
  configured — `maximumNegativeBalance` — does not actually bind. Affects every
  tenant using leave.

## Affected Areas

services/api/src/modules/leave

## Proposed Resolution

in `validateLeaveRequestAgainstPolicy`
  (`leave.service.ts:603`), subtract the sum of `totalDays` over
  `LeaveRequest` rows with `status: PENDING` for the same
  `(tenantId, employeeId, leaveTypeId)`. Re-run the same validation inside
  `recordApprovedLeaveConsumption`'s transaction before the upsert, and reject
  the approval when it fails. A `@@check` is not available in Prisma; the
  re-validation inside the approval transaction is the enforcement point.

(Difficulty: MEDIUM; Regression risk: MEDIUM — tenants that have already overdrawn will start
  seeing approvals refused; that is the correct outcome but needs an
  announcement and possibly a one-off reconciliation report.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/leave/leave.service.ts`, `leave-entitlement.service.ts` (audit id RES-03).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-03=MEDIUM — tenants that have already overdrawn will start
  seeing approvals refused; that is the correct outcome but needs an
  announcement and possibly a one-off reconciliation report.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-03) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
