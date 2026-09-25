---
ID: BUG-3497
aliases: [BUG-3497]
Title: Employee Reset Password sends without confirmation, is offered with no linked user and fails silently
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, employees, error-logs]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-495
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: [docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md, apps/web/lib/runtime/modules/employee-account-actions.ts, apps/web/lib/runtime/command-failure-message.ts, apps/web/app/(authenticated)/employees/_components/employee-runtime-form-wrapper.tsx]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3497 — Employee Reset Password sends without confirmation, is offered with no linked user and fails silently

## Summary

On an employee record, the **Reset Password** command acts on the first click
with no confirmation. It is offered even when the employee has no linked user
account, which is a state the API refuses. When the API refuses, the user sees
nothing. The client then reports the expected 400 refusal to the production
client error log as an unexpected 500 (`SYSTEM_UNEXPECTED_ERROR`).

## Expected Behavior

- Sending a password reset link is a deliberate action and asks for confirmation first.
- The command is not offered for an employee who has no linked user account, so there is nothing to reset.
- If the API still refuses the request, the user sees the refusal as a business outcome in place.
- An expected validation refusal is not recorded as an unexpected system error.

## Actual Behavior

- Clicking Reset Password on EMP-0001, an employee with no linked user, immediately sends `POST /api/employees/{id}/send-reset-password-link`. No confirmation appears.
- The API answers 400 `VALIDATION_FAILED`: "A password reset link can only be sent to an employee with a linked user account."
- Nothing visible happens on the page. There is no toast, inline message or dialog.
- The client then sends `POST /api/error-logs/client` with severity `ERROR`, errorCode `SYSTEM_UNEXPECTED_ERROR`, statusCode `500` and method `employees.resetPassword`. The row lands in the production client error log.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` (demo tenant) as the workspace owner.
2. Open the employee record EMP-0001. This employee has no linked user account.
3. In the record command bar, click **Reset Password**.
4. Observe that no confirmation is shown.
5. Observe the network request `POST /api/employees/{id}/send-reset-password-link` → 400 `VALIDATION_FAILED` with the message above.
6. Observe that no feedback is shown on screen.
7. Observe the follow-up `POST /api/error-logs/client` carrying `SYSTEM_UNEXPECTED_ERROR` / 500 / `employees.resetPassword`.

## Evidence

Browser QA on the live demo tenant at `df0f84f1`. Code references are at the
worktree HEAD.

**The command has no confirmation and no visibility rule.** In
`apps/web/app/(authenticated)/employees/_components/employee-runtime-form-wrapper.tsx:170-180`,
`employees.resetPassword` declares neither `requiresConfirmation` nor
`confirmation`, and has no `visibilityRules`. The sibling `employees.sendInvitation`
in the same file (lines 181-199) does gate itself with `visibilityRules`.
`apps/web/app/components/runtime/module-record-page.tsx:622` and `:649` place
the command in the read-mode command bar unconditionally.

**The API refusal is intentional.**
`services/api/src/modules/employees/employee-profiles.service.ts:1684-1688`
throws `BadRequestException` when `employee.userId` or `employee.user` is
missing. The route is `services/api/src/modules/employees/employees.controller.ts:777`,
proxied by `apps/web/app/api/employees/[employeeId]/send-reset-password-link/route.ts`.

**The status is lost on the client.** `postEmployeeAction` in
`employee-runtime-form-wrapper.tsx:285-303` handles a non-OK response with
`throw new Error(message)`. That discards the status code and the error envelope.

**The lost status becomes a 500.**
- `apps/web/lib/runtime/command-execution.service.ts:99-107` catches the throw and builds `data: readErrorData(error)`.
- `readErrorData` at lines 138-141 reads `error.data`, which a plain `Error` does not have, so `data` is `undefined`.
- `readCommandFailureContract` in `apps/web/lib/runtime/command-failure-message.ts:38-44` defaults a missing status to `500`, which `statusToCode` maps to `SYSTEM_UNEXPECTED_ERROR`.
- `apps/web/app/components/runtime/module-runtime-command-handler.tsx:344-349` sends a failure that is not a business failure to `dispatchCommandFailure`. That function (lines 680-707) emits the API error event with `method: result.command?.key`.
- `apps/web/app/components/errors/error-provider.tsx:45` persists the event through `persistClientError`.

Side effect on the demo tenant: one client error-log row. No email was sent.

## Root Cause

Two established causes, plus one that is still open.

1. **Offered without confirmation or eligibility.** The `employees.resetPassword`
   command definition (`employee-runtime-form-wrapper.tsx:170-180`) carries no
   confirmation and no visibility rule tied to a linked user account.
2. **The refusal is misclassified.** `postEmployeeAction` throws a bare `Error`
   (`employee-runtime-form-wrapper.tsx:292-299`), dropping the HTTP status and
   the error envelope. `readCommandFailureContract` then defaults the missing
   status to 500 (`command-failure-message.ts:38-39`). The expected 400 is
   therefore treated as a technical defect and logged as
   `SYSTEM_UNEXPECTED_ERROR`, instead of being answered in place as a business
   refusal.

**Not yet established:** why the failure dispatched through
`dispatchCommandFailure` showed no technical dialog on screen either. TASK-0031
WP-03 did not establish it; the fix routes a 4xx refusal to the business path,
and the browser retest checks that a forced 500 still shows the technical path.

**Found while fixing (WP-03).** Send Invitation's visibility rule reads
`hasNeverLoggedIn`, which the API returns (`employees.service.ts:3731` at
`88f33c6e`) but `mapEmployeeRecordToRuntimeValues` never mapped, and
`field-equals` compares with `===`; Send Invitation was therefore never offered
to anyone.

## Impact

- **Who is affected:** tenant administrators and HR users with employee account-action rights.
- **Confirmation:** an unconfirmed click sends a reset link to a real employee whenever the linked account does exist.
- **No linked user:** the action appears to do nothing.
- **Error log:** every such click writes a false `SYSTEM_UNEXPECTED_ERROR` row to the production client error log. That pollutes the signal used to find real defects.
- **Reach:** reachable in production today. Severity is not higher because the API refuses correctly and no data is changed.

## Affected Areas

- Employee record command bar (`apps/web`, employees runtime form wrapper).
- The shared runtime command failure path (`command-execution.service.ts`, `command-failure-message.ts`, `module-runtime-command-handler.tsx`). Any adapter handler that throws a bare `Error` on a non-OK response is affected the same way.
- The client error log (`error-logs` module).
- API endpoint `POST /employees/:employeeId/send-reset-password-link`.

## Proposed Resolution

No ExecPlan needed.

- Give `employees.resetPassword` a confirmation.
- Show the command only when the record has a linked user account, following the `visibilityRules` pattern `employees.sendInvitation` already uses.
- Make `postEmployeeAction` preserve the response status and error envelope when it throws, for example by attaching the parsed payload as `data`. A 4xx refusal then reaches the business-failure path and is shown through the existing notification, not the technical path.
- Check whether other adapter helpers throw bare `Error`s the same way, and fix them at the shared seam rather than one handler at a time.

## Acceptance Criteria

- Clicking Reset Password on an employee with a linked user opens a confirmation. Cancelling sends no request.
- Reset Password is not offered on an employee record with no linked user account.
- If the API returns a 4xx for this command, the user sees the API's user-facing message in place.
- A 4xx refusal from an employee account action writes no `SYSTEM_UNEXPECTED_ERROR` row to the client error log.
- A genuine 5xx from the same endpoint is still reported as an unexpected error.

## Regression Coverage

REG-495 and REG-496, QA scenario QA-EMPLOYEE-002:
`apps/web/lib/runtime/modules/employee-account-actions.spec.ts` — a 400 envelope
classifies as business with statusCode 400 and `VALIDATION_FAILED`; a 500 and an
envelope-less 4xx stay unexpected; the confirmation is declared; the command is
hidden with no linked user and shown with one; Send Invitation is reachable; the
owner renders as a name. Mutation-checked: restoring the bare `Error` fails two
cases; removing the `hasLinkedUser` mapping or the confirmation fails its case.

As filed, the record required:

A web unit test must fail without the fix. When an employee account-action
handler receives a 400 envelope, the resulting failure contract must carry
`statusCode: 400` and a non-`SYSTEM_UNEXPECTED_ERROR` code, and it must not be
dispatched to the client error log. Also cover the command's visibility rule
against a record with no linked user. REG entry to be added when the test exists.

## Dependencies

None.

## Related Items

[[BUG-3498]] is the other record command-bar defect found in the same walkthrough.
[[ITEM-0184]] collects the remaining employee record usability defects.

## Resolution

Fixed in TASK-0031 WP-03 (commit 270757ba on `agent/walkthrough2-employee-record`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0047).

- **Confirmation and eligibility.** The employee account commands and their
  request moved to `apps/web/lib/runtime/modules/employee-account-actions.ts`.
  Reset Password carries a `confirmation` (title "Send password reset link?",
  button "Send link") handled by the runtime's existing confirmation dialog, and
  `visibilityRules: field-equals hasLinkedUser === true`.
- **Found while fixing.** Send Invitation's rule read `hasNeverLoggedIn`, which
  the API returns but `mapEmployeeRecordToRuntimeValues` never mapped, so Send
  Invitation was never offered to anyone. The mapper now carries both
  `hasLinkedUser` (from `userId`) and `hasNeverLoggedIn`.
- **Status preserved at the seam.** `postEmployeeAction` throws
  `buildCommandRequestError(status, payload)` (new, in
  `apps/web/lib/runtime/command-failure-message.ts`), whose `data.response`
  carries the real status and envelope. A 4xx with the API envelope classifies
  as a business failure (shown in place, no error-log row); a 5xx, or a 4xx with
  no server message, stays unexpected. Other adapter handlers can use the same
  helper instead of a bare `Error`.

## QA Retest

**PASS.** Browser-verified in the local QA run
(`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
scenario S14) on a throwaway database: the confirmation dialog is shown before
sending. Not separately re-exercised on production. CI runs 34732185363,
34732682935 and 34732697734 passed on f865ac5e (the merged tree). Scenario
QA-EMPLOYEE-002:

1. Employee with no linked user (demo EMP-0001): no Reset Password command.
2. Employee with a linked user: Reset Password opens a confirmation; Cancel
   sends nothing; Send link sends it and a success notice appears.
3. Force a 400 with the API envelope: the API message appears in place, once;
   no `POST /api/error-logs/client`.
4. Intercept to 500: the technical path appears and logs.
5. An employee who has never signed in is offered Send Invitation.

Watch step 3 for a double toast from the record page's account-action notice.
The earlier "no technical dialog either" observation is not re-examined by the
fix; step 4 shows whether the technical path renders.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-03; unit-tested; browser verification pending.
- 2026-09-13 — QA retest: PASS — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]]
- Implementation — [[EXECPLAN-0047-employee-record-walkthrough-two-remediation]]
- Regression — REG-495 (see the regression register)

<!-- GRAPH:END -->
