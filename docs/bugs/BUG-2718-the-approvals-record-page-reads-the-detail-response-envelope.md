---
ID: BUG-2718
aliases: [BUG-2718]
Title: The approvals record page reads the detail response envelope, so every field is blank
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: 2b001494
AffectedModules: [approvals, leave, attendance]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: QA-RUNTIME-039
RegressionId: REG-390
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt: 2026-08-31
---

# BUG-2718 — The approvals record page reads the detail response envelope, so every field is blank

## Summary

Opening any approval from the approvals inbox showed a record page with every
field empty. `GET /approvals/:id` answers `{ item: { … } }` while `GET /approvals`
answers a bare list, and the record page was typed as the bare record — so every
field it read came off the envelope and was `undefined`. The same approval's row
in the list, one click earlier, displayed all of those fields correctly, which is
what made the screen read as broken rather than merely empty.

Two further defects on the same screen are recorded here because they were found
in the same pass and fixed together: `detail()` never derived `currentStep`, and
the Approve and Reject buttons were permanently disabled stubs with no endpoint
behind them.

## Expected Behavior

Opening an approval shows the approval's name, the module that raised it, the
requester, who it is assigned to and when it was submitted — the same facts the
list row shows. An approver assigned to the pending step can approve or reject it
from that page, and the decision reaches the record being approved.

## Actual Behavior

- **Approval**, **Module** and **Assigned To** rendered empty.
- **Requester** rendered its fallback string, "Unknown requester".
- **Approve** and **Reject** were greyed out for every caller on every row,
  captioned "Approve is not wired to a generic ModuleDataAdapter handler yet."
- **Edit**, **Save** and **Delete** were offered on a record that has no writable
  field and no endpoint behind any of them.

## Reproduction

1. Sign in to a tenant with at least one approval — the demo tenant has five.
2. Open **Approvals**. The list shows e.g. `ACR-000001 - Taimur Israr`,
   module `attendance`, requester `Taimur Israr`, submitted `08/30/2026`.
3. Click that row.
4. The record page loads with Approval, Module and Assigned To blank, Requester
   showing "Unknown requester", and Approve/Reject disabled.

## Evidence

The response shape and the read disagree:

- `services/api/src/modules/approvals/approvals.service.ts` — `detail()` returns
  `{ item: { ...approval } }`.
- `apps/web/app/(authenticated)/approvals/[approvalId]/page.tsx` — declared
  `apiRequestJson<ApprovalRequestItem>` and then read `approval.title`,
  `approval.moduleKey`, `approval.submittedByUser`, `approval.currentStep`.

Because `ApprovalRequestItem` was not the response type, TypeScript had nothing
to object to.

`currentStep` was derived in `list()` and not in `detail()`, so it was
`undefined` on the record page even after the envelope was unwrapped.

The disabled commands were declared, not accidental:

- `apps/web/lib/runtime/modules/standard-module-specs.ts` —
  `disabledBusinessCommand("approval.approve", "Approve")` and the reject twin.
- `services/api/src/modules/approvals/approvals.controller.ts` — two handlers,
  both `@Get`.
- `apps/web/app/api/approvals/[...path]/route.ts` — exported `GET` only, so a
  `POST` answered 405.

`ApprovalsService.action()` and `cancel()` existed with no HTTP caller; their
only callers were `claims`, `benefits`, `loans`, `timesheets` and `payroll`,
in-process. `docs/knowledge/modules/leave-attendance-approvals.md` already
recorded that this API has no action endpoint and judged the disabled buttons
intended — correct about the code, and it is still a screen that lists work it
cannot act on.

## Root Cause

Two different causes behind one screen.

The blank fields are a **response-shape mismatch that the type system was told
to ignore**. `apiRequestJson<T>` casts; it does not validate. Naming
`ApprovalRequestItem` as `T` asserted a shape the endpoint does not return, and
every downstream read was `undefined` at runtime while typechecking clean.

The dead buttons are **an unfinished feature**, not a slip. The generic inbox
was built to list approvals from every module and the decision half was never
wired, because `ApprovalRequest` is a *mirror* for leave and attendance —
`LeaveApprovalStep` is authoritative — so a generic endpoint that moved the
mirror would have shown APPROVED on this screen while the leave request stayed
PENDING and no balance was consumed. Doing it correctly needed a way to reach the
owning module, which did not exist.

## Impact

Reachable in production on every tenant, on a screen in the primary navigation.

- Every approval detail page is unreadable. Severity HIGH rather than CRITICAL
  because the list is correct and no data is wrong — the screen fails to display
  what it holds.
- The inbox cannot action anything. Approvers must know which module raised each
  request and navigate to that module's own screen; nothing on the page said so.

No data was corrupted and no authorization was bypassed.

## Affected Areas

`GET /api/approvals/:id`, the `/approvals` and `/approvals/[approvalId]` screens
in `apps/web`, and the `approvals` runtime spec. The delegating fix additionally
touches `leave`, `attendance` and `common/guards/permissions.guard.ts`.

## Proposed Resolution

No ExecPlan: the envelope fix is one line, and the decision path extends existing
mechanisms rather than introducing a competing one.

1. Unwrap `item`, and model the envelope so the compiler refuses the old read.
2. Derive `currentStep` in `detail()` as `list()` does.
3. Add `POST /approvals/:id/{approve,reject,cancel}` which **dispatches to the
   module that raised the request** through a registry, so the authoritative
   record moves and not just the mirror.
4. Evaluate the owning module's own permission requirement before dispatching,
   using the function `PermissionsGuard` itself calls, so the generic endpoint
   is neither more nor less permissive than that module's own route.
5. Drive the command bar from a server-computed capability, so a disabled button
   states a reason the reader can act on.

## Acceptance Criteria

- Opening an approval shows the same Approval, Module, Requester and Submitted At
  values as its list row, and Assigned To shows the pending step's assignees.
- An approver assigned to the pending step can approve or reject, and the
  underlying leave request or attendance correction reaches its decided state.
- A caller holding `approvals.manage` but not `leave-requests.approve` is
  refused, exactly as they would be at `POST /leave-requests/:id/approve`.
- A module with no registered delegate says where the decision is made instead of
  offering a disabled button with a developer-facing caption.
- `GET /approvals?status=FOO` answers 400, not 500.

## Regression Coverage

`REG-390`. Every assertion was confirmed to fail on the unfixed tree by reverting
the change and re-running:

- `services/api/src/modules/approvals/approvals.decision.spec.ts`
- `apps/web/lib/runtime/modules/approval-decision-commands.spec.ts`

## Dependencies

None.

## Related Items

[[BUG-2004-the-approvals-inbox-offers-a-new-action-whose-page-crashes-i]] — the
New action on the same screen, the same family of unfinished affordance.
[[approvals]] · [[leave-attendance-approvals]] · [[rbac]]

## Resolution

Fixed on `agent/approvals-inbox-decisions`.

- The record page unwraps `item`, and `ApprovalDetailResponse` models the
  envelope so the old read no longer compiles.
- `ApprovalsService.detail()` derives `currentStep` through a shared
  `resolveCurrentStep` used by both `list()` and `detail()`.
- `ApprovalDecisionRegistry` lets a module register how its approvals are
  decided; `LeaveApprovalDelegate` and `AttendanceApprovalDelegate` register
  leave requests and attendance corrections.
- `satisfiesPermissionRequirement` extracted from `PermissionsGuard` into
  `common/security/permission-evaluation.ts`, so the guard and the dispatcher
  share one implementation rather than two that can drift.
- `ApprovalChain` renders the steps, their assignees, the decision history with
  comments, and a link to the source record.
- `ListApprovalsQueryDto` validates the list query, which previously cast an
  unvalidated string straight to a Prisma enum.

Timesheets, payroll, benefits, claims and loans deliberately have no delegate:
each needs input an inbox row cannot show — a loan approval sets an amount and an
instalment count, a timesheet week is a grid of hours, a payroll run is a payroll
run. They report why, and link to their own screen. Adding one later is a small
delegate class; the registry exists for exactly that.

## QA Retest

`QA-RUNTIME-039`.

## History

- 2026-08-31 — created from qa run at `2b001494`.
- 2026-08-31 — fixed; regression `REG-390` and scenario `QA-RUNTIME-039` added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[approvals]], [[attendance]]
- Regression — REG-390 (see the regression register)

<!-- GRAPH:END -->
