---
ID: ITEM-0112
aliases: [ITEM-0112]
Title: enforceCriticalAttendanceSetting has no test coverage despite enforcing a mandatory integrity control
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/tenant-settings]
Source: ARCHITECT
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
RelatedBug: BUG-1979
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0112 — enforceCriticalAttendanceSetting has no test coverage despite enforcing a mandatory integrity control

## Summary

`enforceCriticalAttendanceSetting`
(`services/api/src/modules/tenant-settings/tenant-settings.service.ts:745-767`)
is the write-time lock that keeps seven attendance settings pinned to the values
required by the platform's mandatory location-capture control. It has **zero**
spec coverage — no unit test, no e2e test, nothing anywhere in
`services/api/src` names it. Deleting the function today breaks no test.

## Why It Matters

The mandate it enforces is deliberate and load-bearing. Migration
`20260728234000_attendance_mandatory_location_capture` opens with
`-- Attendance location is a mandatory integrity control for all self-service modes.`,
and the August 2026 `attendance-engine` (geofencing, server-side work-mode
derivation, the office-device rule) was built on the assumption that a position
is always present.

Two concrete risks:

1. **The lock can be removed silently.** BUG-1979 was originally read as "stop
   overriding the admin", and a fixer acting on that reading would have deleted
   this function with a green test suite. The record now says explicitly not to,
   but a comment in a bug record is not a gate. A test is.
2. **The fix for BUG-1979 touches this exact code path.** That fix moves the
   override relative to the change-diff so a refusal can be reported. Reordering
   an unlocked, untested lock is how a mandate quietly stops being enforced.

The framework's own rule applies: a check that only asserts something is
*mentioned* passes after the behaviour is deleted. This one is not even
mentioned.

## Evidence

At `70391242`:

- `services/api/src/modules/tenant-settings/tenant-settings.service.ts:745` —
  the function definition; `:628` — its only call site, inside
  `normalizeSettingUpdates`.
- `grep -rn "enforceCriticalAttendanceSetting" services/api/src --include=*.spec.ts`
  returns **nothing**. The identifier appears in exactly two places in the
  repository's source, both of them the implementation.
- By contrast the *enforcement* side is covered:
  `services/api/src/modules/attendance/attendance.service.spec.ts:461-468`
  asserts the check-in refusal ("requires current device location for %s
  check-in even when legacy policy is optional"). The throw is tested; the
  settings lock that keeps the reported configuration consistent with it is not.

## Proposed Approach

No ExecPlan needed. Add a colocated
`tenant-settings.service.spec.ts` block (or extend the existing suite) asserting:

1. All seven mandated keys — `requireRemoteLocationCapture`,
   `locationCaptureRequired`, `locationRequiredForModes`,
   `captureLocationOnCheckIn`, `captureLocationOnCheckOut`,
   `allowManualLocationException`, `highAccuracyLocation` — resolve to their
   mandated value when the caller submits the opposite.
2. A non-mandated key in the `attendance` category passes through unchanged.
3. A key with a mandated *name* in a **different** category passes through
   unchanged (the `category !== 'attendance'` early return).
4. The mandated set is asserted against a named exported constant rather than
   re-listed in the test, so adding a key to the map without deciding to
   mandate it is visible in the diff.

Point 4 matters: a test that copies the map into the assertion passes whatever
the map says, which is the mutation-testing failure this repository has hit
before.

## Acceptance Criteria

- A spec file references `enforceCriticalAttendanceSetting` by name.
- Deleting the function, or removing any single key from its map, fails at least
  one test.
- Changing the value of any mandated key fails at least one test.
- The `category !== 'attendance'` early return is covered.
- The suite passes with `npm --workspace api run test`.

## Dependencies

None blocking. Best landed **before** BUG-1979's fix, since that fix reorders
this code path and the test is what makes the reorder safe.

## Related Items

BUG-1979 (the record this gap protects — the mandate is deliberate; the
disclosure around it is the defect), BUG-1981 (the resolve-site half of the same
mandate), BUG-2091 (the architecture contract still contradicts the mandate).

## History

- 2026-08-29 — created at `70391242`.
- 2026-08-29 — filed by the SESSION-0072 attendance-override investigation, which established that the location mandate is deliberate and found that the mechanism enforcing it at write time has no test at all. Triaged FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1979]]
- Modules — [[settings]]

<!-- GRAPH:END -->
