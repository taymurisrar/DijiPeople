---
ID: BUG-1980
aliases: [BUG-1980]
Title: One saved attendance policy permanently overrides the attendance settings category
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-323
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-1980 — One saved attendance policy permanently overrides the attendance settings category

## Summary

`resolvePolicy` reads each value as `policy?.X ?? attendanceSettings.X`. Every
`AttendancePolicy` column consulted that way is non-nullable with a Prisma
default, so the fallback fires only when the whole row is absent. The row is not
seeded — it is created the first time anyone opens and saves the attendance
policy screen. From that moment, seven attendance settings keys stop having any
effect on the tenant, for ever, and nothing in the settings UI says so.

**This is a plain bug, unrelated to the attendance location mandate.** The
SESSION-0072 investigation confirmed that none of the fields this record is
about — `lateCheckInGraceMinutes`, `requireOfficeLocationForOfficeMode`,
`allowIpFallback`, `locationTimeoutSeconds`, `storeIpAddress`,
`storeUserAgent` — is mandated by anything: no commit, comment, test or
document expresses an intent that they should be frozen. Nothing here waits on
the product decision that BUG-1979 and BUG-1981 were parked behind, and the
`??`-on-non-nullable degeneration is the classic mechanical error.

## Expected Behavior

A documented precedence between the attendance policy and the attendance settings
category, visible where the values are edited. If the policy wins, the settings
controls it supersedes are not offered as live controls; if the settings are a
per-field fallback, the fallback works per field rather than per row.

## Actual Behavior

Once an `AttendancePolicy` row exists for the tenant:

- `defaultGraceMinutes` (which feeds both grace fields),
  `enforceOfficeLocationForOfficeMode`, `allowIpFallback`,
  `locationTimeoutSeconds`, `highAccuracyLocation`, `storeIpAddress` and
  `storeUserAgent` are ignored;
- the tenant settings UI continues to offer all of them;
- a partial PATCH of the policy persists hardcoded defaults for the fields it
  omits, so those columns silently take over too.

## Reproduction

Code-level at `eb457d9d`; the user-facing sequence:

1. On a tenant that has never saved an attendance policy, set Settings >
   Attendance > "Default grace minutes" to 10. Late marking honours it.
2. Open the attendance policy screen and press Save once, changing nothing else.
   This creates the `AttendancePolicy` row, with `lateCheckInGraceMinutes` at its
   column default of `0`.
3. Change "Default grace minutes" from 10 to 15 in Settings and save. Late marking
   does not change, then or ever again.

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/attendance/attendance.service.ts:3540-3592`,
  `resolvePolicy`:

```ts
const attendanceSettings = await this.tenantSettingsResolverService.getAttendanceSettings(tenantId);
const policy = await this.attendanceRepository.findAttendancePolicy(tenantId);
return {
  lateCheckInGraceMinutes: policy?.lateCheckInGraceMinutes ?? attendanceSettings.defaultGraceMinutes,
  …
  requireOfficeLocationForOfficeMode:
    policy?.requireOfficeLocationForOfficeMode ?? attendanceSettings.enforceOfficeLocationForOfficeMode,
```

- The claim turns entirely on nullability, so the model was read —
  `services/api/prisma/schema.prisma:6033-6063`:

```prisma
model AttendancePolicy {
  tenantId                           String   @unique
  lateCheckInGraceMinutes            Int      @default(0)
  lateCheckOutGraceMinutes           Int      @default(0)
  requireOfficeLocationForOfficeMode Boolean  @default(true)
  allowIpFallback                    Boolean  @default(false)
  locationTimeoutSeconds             Int      @default(15)
  highAccuracyLocation               Boolean  @default(true)
  maxAllowedAccuracyMeters           Int?
  storeIpAddress                     Boolean  @default(false)
  storeUserAgent                     Boolean  @default(false)
  …
}
```

  Every column consulted with `??` is non-nullable with a default **except**
  `maxAllowedAccuracyMeters Int?` — the one field where the `??` behaves as a
  per-field fallback, correctly.

- **The row is not seeded.** `grep -rn "attendancePolicy" services/api/prisma`
  returns nothing. It is created only by `PATCH /attendance/policy`
  (`attendance.controller.ts:309-316` -> `attendance.service.ts:2758+` ->
  `upsertAttendancePolicy`, `attendance.repository.ts:571`). The trap is armed by
  the first person who ever opens and saves that screen.

- **A partial PATCH is enough.** The upsert writes `dto.X ?? <hardcoded default>`
  for most fields (`attendance.service.ts:2780-2795`), so omitted fields persist
  defaults — permanently overriding whatever the tenant had configured in
  settings for them.

In the tenant's favour, one qualification: `getPolicy`
(`attendance.service.ts:2723-2755`) does return a
`source: 'policy' | 'settings' | 'catalog-default'` discriminator, so the
precedence is not entirely undisclosed at the API layer. The settings UI shows no
such marker.

## Root Cause

Established: `??` was used as if the policy columns were nullable per field. They
are not — only the row is optional — so the operator degenerates into "policy row
exists, therefore policy wins for everything".

## Impact

A tenant that once opened the attendance policy screen finds its attendance
settings quietly inert, including grace minutes, which directly affects who is
marked late. There is no signal anywhere in the settings UI, and the trigger — a
single Save on an unrelated screen — is not something anyone would connect to the
symptom.

Rated MEDIUM: it changes attendance marking behaviour, which is close to the
HIGH bullet for an attendance calculation error, but the values in play are
policy thresholds resolving to defensible defaults rather than a miscalculation.
The Architect may reasonably raise it.

## Affected Areas

`services/api/src/modules/attendance` (`resolvePolicy`, `upsertAttendancePolicy`,
`getPolicy`), `AttendancePolicy` in `schema.prisma`, the attendance section of
the tenant settings UI, and the attendance policy screen.

## Proposed Resolution

**Recommended direction: make the consulted `AttendancePolicy` columns
nullable**, so `??` means what it was written to mean, rather than declaring the
policy row supreme.

The one piece of documented intent here is
`docs/architecture/tenant-settings-attendance-runtime.md:34-35`:

> `AttendancePolicy` stores operational switches that **must survive
> independently of catalog defaults**. Allowed modes remain in resolved tenant
> settings.

Read precisely, that is intent for policy-wins-over-**catalog-defaults**. It
does **not** say the policy should win over a value an administrator explicitly
saved in Settings — which is what the code does today. Read together with the
row not being seeded and with `maxAllowedAccuracyMeters Int?` already behaving
correctly as a per-field override, the intended design looks like "policy is an
optional per-field override". That points at a schema change — nullable columns,
an ExecPlan with a backfill mapping current default-valued columns to `NULL`
where they were never explicitly set — not at removing the settings controls.

The alternative (policy is the source of truth when the row exists) remains
open, but it costs the tenant a documented, editable settings surface and has no
evidence behind it. Whichever is chosen, implement it once and say so in both
UIs.

Separately, and independently fixable today: `upsertAttendancePolicy`
(`attendance.service.ts:2780-2795`) should not write hardcoded defaults for
fields the caller did not send. Nobody designs a PATCH that overwrites omitted
fields with constants; that half is unambiguously accidental.

## Acceptance Criteria

- The precedence between `AttendancePolicy` and the `attendance` settings
  category is documented and implemented consistently.
- A tenant that saves an attendance policy without changing grace minutes does not
  thereby freeze the settings value.
- A partial PATCH of the policy leaves untouched fields untouched.
- The settings UI indicates which attendance values are being taken from the
  policy.

## Regression Coverage

None yet. A service test that sets a settings value, creates a policy row with a
partial PATCH, and asserts the settings value still applies would fail today.

## Dependencies

None identified. Shares a decision with BUG-1978's "add the keys to the catalog"
option.

## Related Items

BUG-1979 (seven mandated attendance settings still rendered editable), BUG-1981
(hardcoded location values at resolve time) and BUG-1978 (two attendance
checkboxes that are not catalog keys). Together these four determine which
attendance settings mean anything.

They no longer share one triage. The SESSION-0072 investigation separated them:
BUG-1979 and BUG-1981 turn on the location mandate, which is now settled as
deliberate; **this record does not touch that mandate at all** and can be fixed
independently.

## Resolution

**Partly fixed. Status stays OPEN, deliberately** — two of the four acceptance
criteria are not met, and the remainder is a schema migration with a backfill
that this bug-burndown branch is not the right vehicle for. What landed and what
did not is set out below so the next agent does not have to re-derive it.

## The premise, measured

**The core claim is true.** `resolvePolicy`
(`services/api/src/modules/attendance/attendance.service.ts`) reads each value as
`policy?.X ?? attendanceSettings.X`, and every `AttendancePolicy` column
consulted that way is non-nullable with a Prisma default — so the fallback fires
only when the whole **row** is absent, never per field. `maxAllowedAccuracyMeters
Int?` is the single exception and behaves correctly. The row is not seeded.

**One sub-claim is false**, and it is worth recording rather than quietly
fixing. Actual Behavior says "a partial PATCH of the policy persists hardcoded
defaults for the fields it omits". That is true of the **create** branch — the
lines the record cites, `attendance.service.ts:2780-2795` — and **not** of the
update branch, which already read `dto.X ?? existing?.X ?? default` and left
omitted fields alone. Acceptance criterion 3, "a partial PATCH of the policy
leaves untouched fields untouched", was therefore already satisfied for updates
before this work.

**The reproduction cannot have been performed as written.** Step 2 is "open the
attendance policy screen and press Save once". That save could not succeed:
`AttendancePolicyCard` posted the whole resolved policy back, which carries
`allowedModes`, `locationRetryAttempts` and `standardWorkHoursPerDay` — none of
them in the DTO — and the global `ValidationPipe` runs with
`forbidNonWhitelisted`. Every save on that screen returned 400. That is fixed
under BUG-1981, and it means the trap this record describes is armed by an API
client, not by the screen. The trap itself is real.

## What was fixed

`updatePolicy` no longer fills omitted fields with hardcoded constants when it
creates the row. It resolves the currently **effective** policy first and seeds
from that, so the row starts out saying exactly what the tenant already had.
Before this, a tenant with `defaultGraceMinutes: 10` configured in Settings had
`locationTimeoutSeconds`, `storeIpAddress`, `highAccuracyLocation`,
`allowIpFallback` and `maxAllowedAccuracyMeters` replaced by constants the moment
the row appeared — the act of creating the row changed behaviour by itself.

Covered by `services/api/src/modules/attendance/attendance-policy-write.spec.ts`,
which asserts six fields whose effective values all differ from the constants
that used to be written, so a regression cannot pass by coincidence.
Mutation-tested: restoring `dto.locationTimeoutSeconds ?? 15` fails that case.

## Follow-up — 2026-08-30, the three fields the first pass missed

The pass above covered nine fields. Three more consulted the same way by
`resolvePolicy` — `lateCheckInGraceMinutes`, `lateCheckOutGraceMinutes` (both
fed by `attendanceSettings.defaultGraceMinutes`) and
`requireOfficeLocationForOfficeMode` (fed by
`attendanceSettings.enforceOfficeLocationForOfficeMode`) — still had no
fallback at all in the create branch:
`attendance.service.ts:2934-2937` (pre-fix) wrote `dto.lateCheckInGraceMinutes`,
`dto.lateCheckOutGraceMinutes` and `dto.requireOfficeLocationForOfficeMode`
bare. When the caller's payload left one `undefined`, Prisma's `create` applies
the column default (`0`, `0`, `true`) rather than leaving the column alone —
the exact mechanism the September pass fixed for the other nine, just not
carried through to these three. That is the repro this record opens with,
literally: `defaultGraceMinutes: 10` in Settings, no policy row, one save that
does not touch grace minutes, and the tenant's late-marking threshold silently
drops to `0`.

Fixed at `attendance.service.ts:2940-2946` (create branch of `updatePolicy`):
these three now read `dto.X ?? effective.X`, matching the pattern already used
for the other nine. `effective` is the `resolvePolicy(tenantId)` result already
computed earlier in the method for that purpose.

**One caveat, found while verifying rather than assumed:** `UpdateAttendancePolicyDto`
declares all three fields as required (no `@IsOptional()` —
`services/api/src/modules/attendance/dto/update-attendance-policy.dto.ts:4-19`).
The global `ValidationPipe` therefore refuses any real `PATCH /attendance/policy`
that omits them, so this exact gap could not be triggered through the live HTTP
endpoint today — only by calling `AttendanceService.updatePolicy` directly with a
value that bypasses DTO validation. The fix is made anyway, for the same reason
the other nine fields were: it is dead-simple, it matches the established
pattern in the same object literal, and it removes a latent trap that would
reactivate instantly the day someone makes these fields optional (a change the
`allowOffDayCheckIn`-style sibling fields already show is a normal thing to do
on this DTO).

Covered by the same spec file, a new case in the `BUG-1980` describe block:
asserts all three fields resolve to the effective settings values (not the
column defaults) when omitted from the DTO, using an unrelated field flip to
prove the omission itself is what's under test. Verified red/green by hand,
not just by reading the diff: reverting the three-field fallback to the
original bare `dto.X` and re-running
`attendance-policy-write.spec.ts` fails exactly the new case (received
`lateCheckInGraceMinutes: undefined`, `lateCheckOutGraceMinutes: undefined`,
`requireOfficeLocationForOfficeMode: undefined` against the object the create
branch would have sent to Prisma); restoring the fix turns the suite green
again (9/9).

This does not change the "What is NOT fixed" section below in any way — it
closes the remainder of the *reset-on-create* symptom, not the precedence
question, which is still EXECPLAN-0027's to answer.

## What is NOT fixed

**The precedence itself.** Once the row exists, later edits to the attendance
settings category still have no effect, and the settings UI still gives no sign
of it. Acceptance criteria 1, 2 and 4 remain open:

- 1 — precedence documented and implemented consistently: **not done**
- 2 — saving a policy does not freeze the settings value: **not done** (the
  value is no longer *reset*, but it is still frozen)
- 3 — a partial PATCH leaves untouched fields untouched: **done**, and was
  already true for updates
- 4 — the settings UI indicates which values come from the policy: **not done**

## Why it was not fixed here

The repository owner's decision of 2026-08-29 (recorded above) is that
`AttendancePolicy` wins and the settings screen writes through to it. Executing
that is **EXECPLAN-0027**, and its own sequencing forbids doing it piecemeal:
the columns are stale relative to what the engine enforces, so pointing the
resolver at them without correcting the data first would change behaviour on
every tenant that has ever saved the attendance policy screen. It requires a
defaults migration, a backfill of every existing row, a routing change in the
settings write path, and the owner's answer to that plan's Risk 3 before its
final step may merge.

Three things make that unsuitable for this branch: it is a `DATA_MIGRATION`
rollback class; the settings write path it must change is under concurrent work
by another stream; and the plan explicitly gates its last step on a question
only the repository owner can answer.

## For whoever picks this up

The alternative the record recommends — making the consulted columns nullable so
`??` means what it was written to mean — is **not** the direction the owner
chose. Read the Decision section above and EXECPLAN-0027 before starting, not
the Proposed Resolution, which predates the decision.

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
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — same question — which store is meant to win; answer it once, then fix both.
- 2026-08-29 — amended by the SESSION-0072 attendance-override investigation. This record is **not** part of the location-mandate question: none of its fields is mandated by any commit, comment, test or document, so it was never blocked on that decision. Status moves PRODUCT_DECISION -> OPEN and ArchitectDisposition PRODUCT_DECISION -> FIX_NOW. Proposed Resolution now carries the documented steer from `tenant-settings-attendance-runtime.md:34-35` — policy survives independently of *catalog defaults*, not of explicitly saved settings — which points at nullable `AttendancePolicy` columns rather than at policy supremacy.
- 2026-08-30 — follow-up fix closes the three-field gap the 2026-08-29 partial fix left (`lateCheckInGraceMinutes`, `lateCheckOutGraceMinutes`, `requireOfficeLocationForOfficeMode` — see "Follow-up" section above). **Status stays OPEN and ArchitectDisposition stays FIX_NOW, deliberately**: acceptance criteria 1, 2 and 4 are unaffected by this change and remain blocked on EXECPLAN-0027 exactly as before. `RegressionId` stays `REG-323` — that entry already covers this bug and has been amended, not replaced. A second entry, **REG-325**, was added for this specific follow-up in `docs/qa/regressions/_incoming/attendance.md` — not REG-324, which `_incoming/attendance.md` already assigned to BUG-2091 (an unrelated doc-drift finding) within this same branch's centrally reserved 318-324 range. REG-325 is **not** centrally reserved; it is the next unused integer after this branch's reservation, chosen because no id-allocator exists for regression ids and reserving one properly requires `scripts/rebuild-backlog.mjs`-family tooling this task was told not to run. Confirm/reserve REG-325 formally at splice time.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
