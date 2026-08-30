---
ID: BUG-2334
aliases: [BUG-2334]
Title: A location capture failure is rethrown as a bare Error, discarding the reason code
Status: OPEN
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
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
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

To be added with the fix. `attendance-outcome.spec.ts` already covers the
classifier itself; what is missing is a test that the adapter path reaches it.

## Dependencies

None.

## Related Items

- [[BUG-2331]] — masked this defect by making every capture fail the same way.
- [[BUG-2332]] — the identical mistake on the server side.
- [[BUG-2333]] — same function, adjacent line.

## Resolution

Not yet fixed.

## QA Retest

Pending fix.

## History

- 2026-08-30 — found while fixing [[BUG-2333]] in the same function; triaged
  FIX_NOW but deliberately not bundled into that task.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
