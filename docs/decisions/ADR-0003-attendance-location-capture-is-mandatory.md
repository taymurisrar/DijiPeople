# ADR-0003 — Attendance location capture is a platform mandate, not tenant configuration

## Status

Accepted — 2026-07-29, recorded 2026-08-29.

Written a month after the fact. The decision was made and implemented on
2026-07-29 in commit `a8c04f16`, but was never written down anywhere except line
one of a migration — which is what
[`BUG-2091`](../bugs/BUG-2091-the-canonical-settings-contract-still-describes-attendance-g.md)
records, and what left
[`BUG-1979`](../bugs/BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a.md)
and
[`BUG-1981`](../bugs/BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw.md)
blocked as `PRODUCT_DECISION` for a month while nobody could tell whether the
behaviour was deliberate. The status date is the decision's; the recording date
is when this file was written.

## Context

Every self-service attendance check-in and check-out in DijiPeople requires a
device position. There is no mode for which it is optional and no tenant setting
that turns it off.

That has been true since 2026-07-29, when commit `a8c04f16` landed four
mechanisms at once:

- the write-side lock `enforceCriticalAttendanceSetting`
  (`services/api/src/modules/tenant-settings/tenant-settings.service.ts`), which
  replaces the submitted value of seven attendance settings keys with the
  mandated one;
- an expanded catalog, so a tenant with no rows at all still resolves to the
  mandate;
- literal values at the resolve site in `resolvePolicy`
  (`services/api/src/modules/attendance/attendance.service.ts`), now the named
  constant `MANDATORY_LOCATION_CAPTURE`;
- a retro-migration,
  `20260728234000_attendance_mandatory_location_capture`, forcing those seven
  keys on every existing `TenantSetting` row.

Its first line is the only written statement of intent the change ever carried:

```sql
-- Attendance location is a mandatory integrity control for all self-service modes.
```

A purpose-named test landed in the same commit —
`attendance.service.spec.ts`, "requires current device location for %s check-in
even when legacy policy is optional" — whose mocks deliberately supply a
permissive policy and still expect a refusal.

The August 2026 attendance engine (migration `20260814120000_attendance_engine`,
commit `771bf992`) then built server-side work-mode derivation, geofencing and
the office-device rule on the assumption that a position is always present.

Nothing external drives this. There is no clause in `docs/legal/`, no
requirement in the gateway or the ZKTeco work, and no customer commitment. The
driver is internal and architectural: attendance feeds payroll, and an
attendance record with no verifiable position is a payroll input nobody can
audit.

## Decision

**Device location capture is a platform integrity control. It applies to
OFFICE, REMOTE and HYBRID self-service attendance, it is enforced
unconditionally, and it is not tenant-configurable.**

The single enforcement point is `validateAttendanceLocationPayload`
(`services/api/src/modules/attendance/attendance.service.ts`), called on the
check-in and the check-out path. It throws `LOCATION_CAPTURE_REQUIRED` when
latitude or longitude is absent, consulting no mode, no policy row and no
setting.

MACHINE and MANUAL are outside the mandate. They are not self-service: a device
punch carries its own evidence, and a manual entry is an administrator asserting
a fact about someone else.

## Reasons

1. **Enforcement already worked this way.** The throw is unconditional and reads
   none of the nine fields that appear to configure it. Any decision other than
   this one would have to change the enforcement path, not merely the settings.
2. **Half-enforced controls are worse than none.** Nine fields looked live and
   were not. Recording the mandate is what lets the product say so.
3. **The attendance engine depends on a position always being present.**
   Geofencing and server-side work-mode derivation have no defined behaviour
   without one.
4. **Attendance is a payroll input.** An unverifiable position is an
   unverifiable payroll input.

## Alternatives considered

**Make it tenant-configurable.** Rejected for now, not on principle. It is a
real product option, and it is a much larger change than it looks: the
unconditional throws would have to become policy-driven, and the engine would
need a defined behaviour when no position is supplied — including geofence
evaluation, the office-device rule, and what a `MISSING_LOCATION` day means to
reconciliation. That is an ExecPlan under [`PLANS.md`](../../PLANS.md), and this
ADR does not pre-empt it.

**Delete the write-side lock to "restore configurability".** Rejected as
actively harmful, and called out here because it is the obvious-looking move.
Removing `enforceCriticalAttendanceSetting` restores nothing: a tenant that then
set `locationCaptureRequired: false` would still be refused at check-in. It
would only make the settings start *looking* live while behaving identically —
the same defect, harder to diagnose.

**Leave it undocumented.** Rejected. That was the status quo, and it cost a
full investigation plus three bug records parked on a decision nobody could
locate.

## Consequences

- The seven mandated settings keys are rendered as **disabled** controls under
  Settings > Attendance, labelled as enforced by platform policy.
- A submitted value that differs from the mandate is **refused** with
  `ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM`, naming the key, instead of being
  silently substituted. A submission that already matches is a no-op and is
  accepted.
- The `AttendancePolicy` columns behind the mandate are written at the mandated
  values on every policy save, so the stored row stops contradicting the engine.
  Six of the column *defaults* still say the opposite; aligning them is a
  migration and is deliberately not done in the same change.
- `requireRemoteLocationForRemoteMode`, `allowRemoteWithoutLocation`,
  `locationCaptureRequired`, `locationRequiredForModes`,
  `allowManualLocationException`, `captureLocationOnCheckIn` and
  `captureLocationOnCheckOut` are no longer accepted by
  `PATCH /attendance/policy`. They were accepted and discarded.
- A tenant genuinely unable to supply a position — a basement with no GPS, a
  device with location services disabled at the OS level — cannot use
  self-service attendance. The manual and device paths remain.

## Migration / compatibility impact

None at the database level. `PATCH /attendance/policy` narrows: a client sending
any of the seven removed fields now receives a 400, because the global
`ValidationPipe` runs with `forbidNonWhitelisted`. `apps/web` is the only
consumer of that endpoint and was updated in the same change.

## Security / tenant impact

The mandate is restrictive rather than permissive, so it opens nothing. It
strengthens the audit position of every attendance record: a stored entry always
carries the position it was created with.

No tenant isolation impact. `AttendancePolicy.tenantId` is unique and every read
and write remains scoped to `request.user.tenantId`.

## Agent rules

- **Do not delete `enforceCriticalAttendanceSetting`** or remove keys from
  `MANDATORY_ATTENDANCE_SETTINGS`, and do not delete
  `MANDATORY_LOCATION_CAPTURE` in the attendance service. They are the mandate,
  not an oversight. Two separate investigations have filed them as bugs.
- **Do not "fix" the hardcoded location values in `resolvePolicy`** by reading
  them from the policy row or from tenant settings. Enforcement consults none of
  them, so that change would alter what the client is *told* and not what the
  server *does* — and would stop the browser asking for a position it still has
  to supply.
- **Do not render any of the nine reported-but-not-enforcing fields as an
  enabled control** in any surface.
- Relaxing the mandate requires an ExecPlan that covers
  `validateAttendanceLocationPayload`, the attendance engine's work-mode
  derivation and geofencing, and the reconciliation behaviour for a day with no
  position. It is not a settings change.

## Related modules

`attendance`, `attendance-engine`, `tenant-settings`.

## Related features

Self-service check-in and check-out; attendance geofencing; the Settings >
Attendance page.
