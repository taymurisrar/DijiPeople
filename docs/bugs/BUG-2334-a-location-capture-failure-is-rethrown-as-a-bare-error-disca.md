---
ID: BUG-2334
aliases: [BUG-2334]
Title: A location capture failure is rethrown as a bare Error, discarding the reason code
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: f77c0abb
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-363
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2334 — A location capture failure is rethrown as a bare Error, discarding the reason code

## Summary

`buildAttendanceLocationPayload` in the standard module data adapter handles a
failed capture with `if (!location.ok) throw new Error(location.message)`. The
structured `location.reason` — `PERMISSION_DENIED`, `TIMEOUT`,
`POSITION_UNAVAILABLE`, `UNSUPPORTED` — is discarded and replaced by a plain
`Error` carrying only a message string.

`classifyLocationCaptureFailure` exists precisely to turn that reason into the
right card with the right retry affordance, and on this path it never runs.

## Expected Behavior

Each capture failure renders its own outcome: a denied permission offers a
retry after the employee grants access; a timeout suggests moving near a window;
an unsupported browser says web attendance is unavailable here and does **not**
offer a retry that cannot succeed.

## Actual Behavior

All four failures collapse into one generic runtime command error carrying only
the message text. The distinctions the classifier draws — particularly
`canRetry`, which is `false` for `UNSUPPORTED` and `true` for the rest — are
lost.

## Reproduction

1. Open `/attendance` in a browser where location will fail (deny the prompt, or
   disable OS location services to force `POSITION_UNAVAILABLE`).
2. Press **Check In**.
3. Observe the failure is rendered from the message string alone, with no
   reason-specific affordance.

## Evidence

`apps/web/lib/runtime/modules/standard-module-data.adapter.ts`:

```ts
const location = await captureAttendanceLocation({ ... });
if (!location.ok) throw new Error(location.message);
```

`location` at that point is the discriminated failure union from
`apps/web/lib/location/location-capture.ts`, carrying
`{ ok: false, reason, message, permissionState }`. Only `message` survives.

The sibling path in `module-runtime-command-handler.tsx` does it correctly:

```ts
if (!location.ok) {
  setAttendanceOutcome(
    classifyLocationCaptureFailure({ reason: location.reason, message: location.message }),
  );
  setAttendanceRetry(() => attempt);
  return;
}
```

This is the same shape of defect as [[BUG-2332]] on the server side: a
classifier that is correct, reached by a path that has already thrown its input
away.

## Root Cause

Two capture paths, one of which predates the outcome classifier and was never
migrated to it. `permissionState` is discarded along with `reason`, so even a
consumer willing to guess has nothing to guess from.

## Impact

Every browser-side location failure on the attendance module's own Check In
button is rendered generically. The employee is not told which of four quite
different problems they have, and an `UNSUPPORTED` browser is offered a retry
that can never succeed.

Reachable in production, but was masked until now: [[BUG-2331]] meant capture
failed identically for everyone with `PERMISSION_DENIED`, so the missing
distinctions were invisible.

## Affected Areas

- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts` —
  `buildAttendanceLocationPayload`, used by `attendance.checkIn` and
  `attendance.checkOut`

## Proposed Resolution

Have the adapter surface the structured outcome rather than a bare `Error`. The
work is in the command-result contract, not the capture: the handler that
catches this needs to carry an `AttendanceOutcome` through to the renderer the
way the sibling path already does. Better still, both paths should share one
capture-and-classify helper so the decision cannot drift a third time.

Not fixed alongside [[BUG-2331]] and [[BUG-2332]] deliberately: it changes
control flow across the runtime command layer, and doing it late in an
unrelated task without room to verify it properly is how the sibling path came
to differ in the first place.

## Acceptance Criteria

- Denying the prompt, timing out, and an unsupported browser each render their
  distinct message and retry affordance from the attendance module's Check In.
- `UNSUPPORTED` offers no retry.
- One helper owns capture-and-classify for both paths.

## Regression Coverage

`apps/web/lib/attendance/location-capture-failure-routing.spec.ts` plus one
assertion in `attendance-location-payload.spec.ts` — REG-363.

Behavioural rather than a source scan: the thrown error travels the same three
links the runtime uses, so a change to any of them fails here. It asserts the
four reasons stay distinct, that `UNSUPPORTED` alone reports `canRetry: false`,
that an unrecognised code still escalates, and — reproducing the shipped code —
that a bare `Error` could not have worked.

One honest limit: the spec reproduces `readErrorData` and the adapter helper,
neither of which is exported, so it could pass against a stale copy of the
former. The source-level tie-in assertion mitigates that; exporting the seam
would solve it.

## Dependencies

None.

## Related Items

- [[BUG-2331]] — masked this defect by making every capture fail the same way.
- [[BUG-2332]] — the identical mistake on the server side.
- [[BUG-2333]] — same function, adjacent line.

## Resolution

Fixed on `agent/attendance-location-capture`.

`buildAttendanceLocationPayload` now throws `locationCaptureError(location)`,
which carries `{ statusCode: 422, errorCode: location.reason, message,
locationPermissionState }` on the error's `data`. That is not a new mechanism:
`readErrorData` in `command-execution.service.ts` already forwards a thrown
error's `data` onto the command result, where `readCommandFailureContract` reads
`errorCode`. 422 matches the status the API uses for the same class of refusal,
so a browser-side failure and a server-side one now reach
`classifyAttendanceFailure` looking alike — which is what `attendance-outcome.ts`
was written to assume.

Deliberately not done: unifying the two capture paths behind one
capture-and-classify helper. That is the durable fix for the duplication and is
a refactor of the runtime command layer, not a bugfix.

## QA Retest

QA-ATTENDANCE-005. Not yet retested against a deployed build — the fix is on
`develop` and this release cycle shipped only BUG-2331/2332/2333.

## History

- 2026-08-30 — found while fixing [[BUG-2333]] in the same function; triaged
  FIX_NOW but deliberately not bundled into that task.
- 2026-08-30 - fixed after the release, once the record's own reasoning was tested rather than assumed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-363 (see the regression register)

<!-- GRAPH:END -->