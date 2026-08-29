---
ID: BUG-1979
aliases: [BUG-1979]
Title: Seven attendance settings are overwritten on write and the admin is never told
Status: PRODUCT_DECISION
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1979 — Seven attendance settings are overwritten on write and the admin is never told

## Summary

`enforceCriticalAttendanceSetting` replaces the submitted value of seven
attendance settings with a mandated constant on every write, unconditionally. The
seven controls are still rendered as live, enabled checkboxes and selects. An
administrator who changes one gets a successful save, no warning, an audit row
recording no change, and the old value back on reload.

## Expected Behavior

A setting the platform mandates is not offered as an editable control — or, if it
is shown for transparency, it is disabled and labelled as enforced by policy. A
submitted value that will not be honoured produces a clear refusal, not a silent
substitution.

## Actual Behavior

The submitted value is discarded and the mandated value stored in its place. Since
the mandated value usually equals what is already stored, the change-diff drops
the update as a no-op: the response echoes the mandated value, the audit row shows
no change, and nothing distinguishes this from "you saved the same value you
already had".

## Reproduction

Code-level at `eb457d9d`; the user-facing sequence:

1. Sign in to a tenant workspace and open Settings > Attendance.
2. Set "Allow manual location exception" to **on** (for example so a technician in
   a basement with no GPS can check in).
3. Save — the screen confirms.
4. Reload. The toggle is **off** again, with no error and no explanation.

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/tenant-settings/tenant-settings.service.ts:745-767`:

```ts
function enforceCriticalAttendanceSetting(category, key, value) {
  if (category !== 'attendance') return value;
  const mandatoryValues = {
    requireRemoteLocationCapture: true,
    locationCaptureRequired: true,
    locationRequiredForModes: ['OFFICE', 'REMOTE', 'HYBRID'],
    captureLocationOnCheckIn: true,
    captureLocationOnCheckOut: true,
    allowManualLocationException: false,
    highAccuracyLocation: true,
  };
  const mandatoryValue = mandatoryValues[key];
  return mandatoryValue === undefined ? value : mandatoryValue;
}
```

- The call site is unconditional — `tenant-settings.service.ts:625-631`, inside
  `normalizeSettingUpdates`, applied to **every** update in the DTO with no flag,
  no role check and no escape:

```ts
value: enforceCriticalAttendanceSetting(
  category,
  key,
  normalizeSettingValue(category, key, item.value),
),
```

- The override runs after normalisation and **before** the change-diff at
  `tenant-settings.service.ts:292-297`, which is why the update is dropped as a
  no-op and the audit trail records nothing.

- All seven are rendered as live, enabled controls in
  `apps/web/.../settings/_lib/settings-page-config.ts` under the `attendance`
  category, and all seven are in the "alive" half of the dead-key scan, so they
  read as working settings.

- Corroboration that this is deliberate policy rather than an accident:
  `services/api/prisma/migrations/20260728234000_attendance_mandatory_location_capture/migration.sql`
  retroactively forced these exact seven keys on existing rows. The policy was
  never reflected in the UI.

## Root Cause

Established as a mechanism: a mandatory-value map applied unconditionally on
write, with no corresponding change to the UI or to the response. Whether the
mandate itself is still intended is a product question this record cannot settle.

## Impact

The administrator is silently overruled. The realistic sequence is: set the
toggle, see "saved", reload, find it reverted, try three more times, file a
support ticket saying the attendance settings page is broken. Nothing in the
product — not the response, not the audit row — explains what happened.

Rated MEDIUM: no data loss and no security consequence (the mandate is
restrictive, not permissive), but a production screen that discards input without
saying so.

## Affected Areas

`services/api/src/modules/tenant-settings/tenant-settings.service.ts`
(`enforceCriticalAttendanceSetting`, `normalizeSettingUpdates`, the change-diff);
`apps/web/.../settings/_lib/settings-page-config.ts` attendance section.

## Proposed Resolution

Make the mandate visible. Render the seven controls disabled with an explanation
of the policy that fixes them, or remove them from the page. If any of the seven
is meant to be tenant-configurable after all, remove it from the map rather than
leaving the control live and inert.

Whichever way it goes, a submitted value that is not honoured should be reported
in the response, not swallowed.

## Acceptance Criteria

- None of the seven mandated keys is offered as an enabled control while the
  mandate stands.
- Submitting a value for a mandated key returns a response that says it was not
  applied.
- The audit trail distinguishes "no change requested" from "change overridden".

## Regression Coverage

None yet. A service test asserting the response reports the override would fail
today.

## Dependencies

None identified.

## Related Items

BUG-1980 (a saved attendance policy overrides the whole settings category) and
BUG-1981 (hardcoded location values at resolve time) are the other two halves of
the attendance configuration audit; BUG-1978 covers two attendance checkboxes
that are not catalog keys at all. All four should be triaged together, since
together they determine which attendance settings mean anything.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — the override may be deliberate policy enforcement; decide whether these should be tenant-editable at all.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]]

<!-- GRAPH:END -->
