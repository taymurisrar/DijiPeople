---
ID: BUG-1979
aliases: [BUG-1979]
Title: Seven mandated attendance settings are still rendered editable and the refusal is never reported
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-320
RelatedBacklogItem: ITEM-0112
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1979 — Seven mandated attendance settings are still rendered editable and the refusal is never reported

## Summary

Attendance location capture is a **deliberate mandatory integrity control**, not
an accident. `enforceCriticalAttendanceSetting` replaces the submitted value of
seven attendance settings with the mandated constant on every write, and that
lock is intended. The defect is what surrounds it: the seven controls are still
rendered as live, enabled checkboxes and selects, and the refusal is never
reported to the administrator. An admin who changes one gets a successful save,
no warning, an audit row recording no change, and the old value back on reload.

**The fix is to disable or remove the controls and surface the refusal. The fix
is not to stop overriding** — see the decisive fact below, which explains why
deleting the override would make things strictly worse.

## Decisive Fact — do not delete `enforceCriticalAttendanceSetting`

Established by the SESSION-0072 attendance-override investigation (see History).

The real enforcement is **`validateAttendanceLocationPayload`**
(`services/api/src/modules/attendance/attendance.service.ts:3645`, called at
`:326` for check-in and `:478` for check-out). It throws
`LOCATION_CAPTURE_REQUIRED` **unconditionally** at `attendance.service.ts:3702`,
with no mode check and no policy check:

```ts
if (latitude === undefined || longitude === undefined) {
  throw new UnprocessableEntityException({
    code: 'LOCATION_CAPTURE_REQUIRED',
    …
```

All nine settings/policy fields in this cluster — `locationCaptureRequired`,
`locationRequiredForModes`, `captureLocationOnCheckIn`,
`captureLocationOnCheckOut`, `requireRemoteLocationCapture`,
`highAccuracyLocation`, `allowManualLocationException`,
`requireRemoteLocationForRemoteMode`, `allowRemoteWithoutLocation` — are read in
**zero** enforcement branches. They only populate the `getPolicy` response and
the audit snapshot. (`highAccuracyLocation` reaches the browser
`enableHighAccuracy` flag client-side; `allowManualLocationException` and
`allowIpFallback` appear only in the accuracy-limit and IP-source conditions,
never in the unconditional throw.)

Therefore **deleting `enforceCriticalAttendanceSetting` would restore no
configurability whatsoever.** A tenant that then set `locationCaptureRequired:
false` would still be refused at check-in. The settings would merely start
*looking* live while behaving identically — the same defect with the lock
removed, and harder to diagnose. A fixer must not take that route.

Reversing the mandate is a much larger job than this record: the unconditional
throws would have to become policy-driven, and the `attendance-engine`'s
server-side work-mode derivation, geofencing and office-device rule would need a
defined behaviour when no position is supplied. That is an ExecPlan, not a bug
fix, and nothing here asks for it.

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

### The mandate is deliberate — evidence, settled 2026-08-29

The SESSION-0072 investigation established this beyond reasonable doubt. Four
mechanisms plus a test landed in one commit:

- **Commit `a8c04f16`** (2026-07-29, "major release") is the *only* commit
  `git log -S "enforceCriticalAttendanceSetting"` returns. In one change it
  added the override function, expanded the catalog from one permissive key to
  the seven mandating ones, replaced `resolvePolicy`'s settings-derived values
  with literals, added the retro-migration, and added the test below.

- **The migration states the intent in words.**
  `services/api/prisma/migrations/20260728234000_attendance_mandatory_location_capture/migration.sql`,
  line 1, verbatim:

```sql
-- Attendance location is a mandatory integrity control for all self-service modes.
```

  It then retroactively forces these exact seven keys on every existing
  `TenantSetting` row. This is the closest thing to a written rationale anywhere
  in the repository, and "for all self-service modes" is exactly why
  `locationRequiredForModes` is `OFFICE,REMOTE,HYBRID` and excludes MACHINE and
  MANUAL.

- **A test asserts the mandate beats configuration**, by name.
  `services/api/src/modules/attendance/attendance.service.spec.ts:461-468`, added
  in the same commit:

```ts
it.each([AttendanceMode.REMOTE, AttendanceMode.HYBRID])(
  'requires current device location for %s check-in even when legacy policy is optional',
  …
```

  The suite's own mocks supply `locationCaptureRequired: false`,
  `locationRequiredForModes: []`, `captureLocationOnCheckIn: false` and a null
  `AttendancePolicy`, and the test still expects a refusal. The author's phrase
  "even when legacy policy is optional" describes the pre-existing configuration
  as superseded.

- **It is now load-bearing.** The August 2026 `attendance-engine`
  (migration `20260814120000_attendance_engine`, commit `771bf992`) built
  server-side work-mode derivation, geofencing and the office-device rule on the
  assumption that a position is always present —
  `attendance.service.ts:278-309` says so in a comment ("THE SERVER DECIDES THE
  WORK MODE, not the browser… With a position — which every current client
  sends, unconditionally — the geofence decision is the answer").

- **No external compliance driver exists.** Nothing in `docs/legal/`, the
  requirements notes, `gateway/` or `tools/zkteco-poc/` ties attendance to
  location. The driver is internal and architectural. There is also no ADR:
  `docs/decisions/` holds only ADR-0001 and ADR-0002, neither related. **The
  mandate was never written down**, which is what produced this record and
  BUG-1981 in the first place.

- Note that the catalog defaults already deliver the mandate
  (`tenant-settings.catalog.ts:108-135` overlaid by
  `getSettingsMap`), so every tenant resolves to it with or without any rows.
  `enforceCriticalAttendanceSetting` is therefore a **lock, not a default** — its
  only job is to stop an admin changing them. That is consistent with it being
  deliberate.

## Root Cause

Established, and it is two things, not one.

The mandate itself is deliberate policy (evidence above) and is correct to keep.
What is defective is everything around it:

1. The seven controls are rendered live and enabled, so the product invites
   input it will always discard.
2. The override is applied inside `normalizeSettingUpdates` **before** the
   change-diff, so a discarded submission is indistinguishable from a no-op — no
   response signal, no audit row.
3. The mandate was never propagated to the settings UI, the architecture
   contract, an ADR, or any test of the lock itself.

The product question that previously blocked this record — "is verified device
location a non-negotiable platform control, or a tenant choice?" — is answered:
the platform answered "non-negotiable" on 2026-07-29 and built the August
geofencing engine on that answer.

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

**Keep the override. Make the mandate visible and the refusal audible.**

1. Render the seven controls **disabled** and labelled as enforced by platform
   policy, or remove them from the attendance settings page entirely.
2. Report a non-honoured submission in the update response instead of swallowing
   it — either move the override to *after* the change-diff so the diff sees the
   attempted change, or refuse the write outright with a catalog error code.
3. Add the explanatory comment `enforceCriticalAttendanceSetting` never got,
   pointing at migration `20260728234000` so the next reader does not file this
   again.
4. Record the mandate as an ADR, and fix the architecture contract that still
   contradicts it (BUG-2091, filed by the same investigation).

**Explicitly out of scope, and explicitly forbidden:** deleting
`enforceCriticalAttendanceSetting`, or removing keys from its map, in the belief
that it restores configurability. It does not — see *Decisive Fact* above.

## Acceptance Criteria

- None of the seven mandated keys is offered as an enabled control while the
  mandate stands.
- Submitting a value for a mandated key returns a response that says it was not
  applied.
- The audit trail distinguishes "no change requested" from "change overridden".
- `enforceCriticalAttendanceSetting` still forces all seven keys after the fix,
  and a test proves it (see ITEM-0112, the test-gap item).

## Regression Coverage

None yet. A service test asserting the response reports the override would fail
today. `enforceCriticalAttendanceSetting` has **zero** spec coverage of any kind
— tracked separately as ITEM-0112.

## Dependencies

None blocking. BUG-2091 (the architecture contract still describes location
capture as configurable) and ITEM-0112 (no test covers the lock) were filed by
the same investigation and should land alongside this fix.

## Related Items

BUG-1980 (a saved attendance policy overrides the whole settings category) and
BUG-1981 (hardcoded location values at resolve time) are the other two halves of
the attendance configuration audit; BUG-1978 covers two attendance checkboxes
that are not catalog keys at all.

The SESSION-0072 investigation **split** what was previously one shared product
decision across these records: BUG-1979 is a deliberate mandate with a real
disclosure bug; BUG-1980 is a plain bug with no connection to the mandate;
BUG-1981 is deliberate at the resolve site and a genuine leftover at the
schema/UI site. They no longer need to be triaged as one.

BUG-2091 (documentation drift in the canonical settings contract) and ITEM-0112
(no test covers `enforceCriticalAttendanceSetting`) were filed by that
investigation.

## Resolution

Fixed, in the direction this record insists on: **the mandate is kept and the
refusal is made audible.** `enforceCriticalAttendanceSetting` still forces all
seven keys.

The premise held. All seven were live, enabled controls, and the substitution
ran inside `normalizeSettingUpdates` before the change-diff, so a discarded
submission was indistinguishable from a no-op.

**What changed.**

- `tenant-settings.service.ts` — new `assertAttendanceSettingIsChangeable`,
  called immediately before `enforceCriticalAttendanceSetting`. A submitted
  value that **differs** from the mandate now fails the request with
  `ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM`, naming the key and saying no other
  setting in the submission was saved. A value that already **matches** the
  mandate is accepted as an ordinary no-op — refusing that would break any
  client that re-sends what it read, and it is not an attempted change.
  Comparison uses the same `normalizeComparableValue` the change-diff uses, so
  `locationRequiredForModes` in a different array order is not mistaken for an
  edit.

- The mandate map is now declared once, as `MANDATORY_ATTENDANCE_SETTINGS`, and
  read by both the assertion and the lock. It previously lived inline inside
  `enforceCriticalAttendanceSetting`, so the two could not have disagreed
  because there was only one; there are two consumers now, and one map.

- `enforceCriticalAttendanceSetting` is **kept**, with the explanatory comment
  it never had, pointing at migration `20260728234000` and stating plainly that
  deleting it restores nothing. Its own comment now says it is the guarantee and
  the assertion is the disclosure.

- `apps/web/.../settings/_lib/settings-page-config.ts` — all seven controls are
  rendered `disabled: true` with the description "Enforced by platform policy
  and cannot be changed." The section carries a comment explaining the mandate
  and naming the enforcement point.

- `docs/decisions/ADR-0003-attendance-location-capture-is-mandatory.md` — the
  ADR this record's resolution asked for, written under BUG-2091. Its **Agent
  Rules** section says explicitly not to delete this lock. That is the durable
  part of this fix: the code comment protects the function, the ADR protects the
  decision.

**On the audit trail.** The acceptance criterion asked that the trail
distinguish "no change requested" from "change overridden". With a hard refusal
there is no overridden change to record — the write never happens and the caller
is told why. That satisfies the intent more directly than an audit row would,
and it is why the "move the override after the change-diff" option in the
proposed resolution was not taken.

**Tests** — `services/api/src/modules/tenant-settings/attendance-settings-mandate.spec.ts`
(new, 24 cases) and
`apps/web/app/(authenticated)/settings/_lib/attendance-settings-fields.spec.ts`
(new, 18 cases). This closes the coverage gap ITEM-0112 records: the lock had
**zero** tests of any kind, which is exactly what made deleting it look safe.

The API suite asserts the refusal for each of the six boolean mandated keys and
for `locationRequiredForModes`; that the error names the key; that the whole
submission is rejected so no other key is written; that a matching value is
accepted; that a contradicting value already stored is rewritten to the mandate
on the next accepted write; that unmandated attendance keys are untouched; and
that an identically-named key in another category is not policed.

A note the register carries too: the lock is now **unreachable from this
endpoint by construction**, because the refusal fires first. The tests therefore
pin the invariant — no path through `updateTenantSettings` leaves a mandated key
stored at another value — rather than the substitution itself. A future reader
must not read that as the lock being dead code.

The web suite asserts every mandated control is disabled and each says why, that
the genuinely configurable location settings (`allowIpFallback`,
`locationTimeoutSeconds`, `locationRetryAttempts`, `maxAllowedAccuracyMeters`)
stay editable, and that the field list is non-empty before anything is asserted
about it.

**Mutation-tested.** Removing the `assertAttendanceSettingIsChangeable` call
fails nine of the twenty-four API cases — every refusal case and no acceptance
case. Re-enabling one mandated control in the page config fails exactly that
control's two web cases.

## QA Retest

Awaiting a fix — nothing to retest yet.

## Decision — 2026-08-29, from the repository owner

Asked which of the places that decide an attendance value should be the source of
truth, the repository owner chose: **`AttendancePolicy` wins, and the settings
screen edits it.** One home, with the settings UI writing through rather than
into a parallel store.

This is the answer BUG-1979, BUG-1980 and BUG-1981 were all waiting on, and it is
recorded on each of the three because each reads as a separate defect and none of
them can be fixed without it.

Sequencing is in EXECPLAN-0027 (`docs/plans/`): change the column defaults,
backfill existing rows, and only then point the resolver at the columns. The
order matters — the columns are stale relative to what the engine enforces, so
reading them before correcting the data would change behaviour on every tenant
that has ever saved the attendance policy screen.

> Added by SESSION-0071, which planned this work before noticing SESSION-0072 was
> already inside it. The correction section above is theirs and is better sourced
> than the account this session first wrote: the "inverted defaults" framing is
> wrong, the two values are logical complements that have always been consumed as
> complements, and those columns were never read in an enforcement branch at all.
> EXECPLAN-0027 has been amended to say so. Where the two accounts differ, that
> one is right.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — the override may be deliberate policy enforcement; decide whether these should be tenant-editable at all.
- 2026-08-29 — amended by the SESSION-0072 attendance-override investigation. The product question is answered: the mandate is deliberate (commit `a8c04f16`, migration `20260728234000`, and a purpose-named test), so Status moves PRODUCT_DECISION -> OPEN and ArchitectDisposition PRODUCT_DECISION -> FIX_NOW. The record's fix direction was wrong and has been rewritten: the enforcement is an unconditional throw in `validateAttendanceLocationPayload` that reads none of these keys, so removing the override restores nothing. Title and Summary re-pointed at the defect that remains — editable controls and an unreported refusal. Filed BUG-2091 (the architecture contract still says "when configured") and ITEM-0112 (the lock has no test).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0112]]
- Modules — [[settings]]

<!-- GRAPH:END -->
