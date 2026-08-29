---
ID: BUG-1980
aliases: [BUG-1980]
Title: One saved attendance policy permanently overrides the attendance settings category
Status: PRODUCT_DECISION
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance]
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

# BUG-1980 — One saved attendance policy permanently overrides the attendance settings category

## Summary

`resolvePolicy` reads each value as `policy?.X ?? attendanceSettings.X`. Every
`AttendancePolicy` column consulted that way is non-nullable with a Prisma
default, so the fallback fires only when the whole row is absent. The row is not
seeded — it is created the first time anyone opens and saves the attendance
policy screen. From that moment, seven attendance settings keys stop having any
effect on the tenant, for ever, and nothing in the settings UI says so.

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

Decide the precedence deliberately and implement it once. If the policy is the
source of truth when it exists, stop offering the superseded settings controls
and say where the value now lives. If settings are meant to be the fallback per
field, the policy columns need to be nullable — a schema change requiring an
ExecPlan with a backfill — so `??` means what it was written to mean.

Separately, `upsertAttendancePolicy` should not write hardcoded defaults for
fields the caller did not send.

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

BUG-1979 (seven attendance settings overwritten on write), BUG-1981 (hardcoded
location values at resolve time) and BUG-1978 (two attendance checkboxes that are
not catalog keys). Together these four determine which attendance settings mean
anything, and they should be triaged as one.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — same question — which store is meant to win; answer it once, then fix both.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
