---
ID: BUG-2822
aliases: [BUG-2822]
Title: A business refusal is rendered as a fatal error dialog with a reference id and a log download
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-08
DetectedInSha: 2cee8b9b
AffectedModules: [runtime, approvals, attendance]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: QA-RUNTIME-040
RegressionId: REG-392
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-08
UpdatedAt: 2026-09-08
ResolvedAt: 2026-09-08
---

# BUG-2822 — A business refusal is rendered as a fatal error dialog with a reference id and a log download

## Summary

Pressing **Approve** on an approval you raised yourself produced the platform's
technical error dialog: a red `ERROR ACCESS_DENIED` heading, the sentence "You do
not have permission to perform this action.", a reference id, a timestamp and a
**Download log** button — for a rule the product deliberately enforces and had
just enforced correctly.

That dialog exists for defects. A business rule firing is not a defect; it is the
system working, and it needs a sentence the reader can act on and dismiss.

## Expected Behavior

A refusal the product means to issue — a validation failure, a permission
refusal, a state conflict — appears as a toast or inline message carrying the
server's own sentence. The technical dialog, with its trace id and log download,
is reserved for failures nobody designed.

## Actual Behavior

Every runtime command failure that had no inline field error reached the
technical dialog, for every module except attendance.

Attendance was already exempt: `lib/attendance/attendance-outcome.ts` was written
after the same complaint about a refused check-in, and its own header says so —
*"a refused check-in was being routed into the platform's fatal-error dialog: an
employee standing in their own office was shown ERROR VALIDATION_FAILED, a
reference id and a Download log button."* The reasoning was correct and it was
solved one module at a time, so every module added since inherited the fatal
dialog by default.

## Reproduction

1. Sign in to a tenant and open an approval you submitted yourself — the demo
   tenant's `ACR-000001` is one.
2. Press **Approve**, then **Approve** in the comment dialog.
3. The API refuses, correctly, with 403 `ACCESS_DENIED` and a specific message.
4. The refusal is rendered as the fatal-error dialog.

## Evidence

Live, production, `fe1cd3dd`, 2026-09-08 20:39 UTC, reference id
`client_1788899957479_kyd1z35tgn`. The response was well formed:

```
statusCode  403
errorCode   ACCESS_DENIED
message     You cannot approve or reject your own attendance correction request.
description You do not have permission to perform this action.
```

Everything needed to render this well was already in the payload. The runtime
simply had no notion that a 403 with a stated reason is different from a 500.

`module-runtime-command-handler.tsx` classified an attendance command through
`classifyAttendanceFailure` and sent everything else to
`dispatchCommandFailure`, which raises the dialog.

## Root Cause

**The split between "refused" and "broken" existed, and was owned by one
module.** Attendance had the concept; the runtime that every module shares did
not. So the correct behaviour was opt-in, and opting in required knowing the
problem existed.

A second, smaller cause in the rendering: `HttpExceptionFilter` fills
`description` with a generic sentence when the thrower supplies none, so the
dialog showed a precise headline above a vague one, making the precise line read
like boilerplate too.

## Impact

Every runtime command in every module except attendance, so: approvals, leave,
timesheets, claims, loans, employee bank accounts and each module added later.
Cosmetic in the strict sense — the server refused correctly and no data was at
risk — and corrosive in practice. A user shown a crash dialog for a rule cannot
tell the two apart, so the next real crash looks routine.

## Affected Areas

`apps/web/lib/runtime/` and `module-runtime-command-handler.tsx`. No API change:
the payload was already sufficient.

## Proposed Resolution

Generalise attendance's split into the shared runtime.

1. `classifyCommandFailure(contract)` returning `business` or `unexpected`.
2. Draw the line on **status**, not on a list of error codes — a code list here
   would be a second copy of the API's catalog and would misclassify whatever was
   added last.
3. Business refusals go to the existing `useSideToast`; everything else keeps the
   dialog.
4. Attendance keeps its richer treatment, which has a retry affordance and the
   distance and accuracy numbers behind the refusal.

## Acceptance Criteria

- A 400, 403, 409 or 422 carrying the API's envelope appears as a toast with the
  server's own message.
- A 5xx, a network failure, an HTML body, or a body with no message of its own
  still raises the technical dialog with its trace id.
- 401 still raises the dialog, which is the only surface that can offer Sign in.
- 404 still raises the dialog, so a dead route stays loud.
- A generic `description` that only repeats the headline is not shown twice.
- Attendance behaviour is unchanged.

## Regression Coverage

`REG-392` — `apps/web/lib/runtime/command-failure-classification.spec.ts`.

Both directions are pinned, and the second matters more: removing the status gate
fails seven cases, and removing the envelope shape check fails three. The risk in
this fix is not that a refusal stays in the dialog; it is that a genuine defect
becomes a calm toast nobody investigates.

## Dependencies

None.

## Related Items

[[BUG-2718]] — the release whose live verification surfaced this.
[[ITEM-0121]] — the other half: the button should ideally not have been enabled.
Fixing that reduces how often this path is reached; it does not replace it, since
the server stays authoritative.

## Resolution

`apps/web/lib/runtime/command-failure-classification.ts`, wired into
`module-runtime-command-handler.tsx`.

Status-based rather than code-based, deliberately. `BUSINESS_REFUSAL_STATUSES` is
400, 403, 409 and 422; 401 and 404 are excluded with the reasons recorded beside
them in the source.

A business status is necessary and not sufficient. A proxy or WAF can answer 403
with an HTML page, and `readCommandFailureContract` fills missing fields with its
own defaults — so the payload is checked for a message the server actually wrote
before it is treated as a refusal. Without that, an infrastructure failure would
have been shown as a calm sentence.

## QA Retest

`QA-RUNTIME-040`.

## History

- 2026-09-08 — created and fixed. Found by the owner, from the screenshot of the
  fatal dialog raised for the self-approval refusal during post-release
  verification of BUG-2718.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[approvals]], [[attendance]]
- Regression — REG-392 (see the regression register)

<!-- GRAPH:END -->
