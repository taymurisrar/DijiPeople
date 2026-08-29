---
ID: BUG-1978
aliases: [BUG-1978]
Title: Two attendance checkboxes are not catalog keys, so touching either rejects the whole settings save
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-321
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1978 — Two attendance checkboxes are not catalog keys, so touching either rejects the whole settings save

## Summary

The attendance settings page renders "Allow off-day check-in" and "Allow holiday
check-in" as ordinary settings checkboxes. Neither `attendance.allowOffDayCheckIn`
nor `attendance.allowHolidayCheckIn` exists in the tenant settings catalog — they
are `AttendancePolicy` **columns**. The settings write path rejects any key not in
the catalog, so the moment an administrator toggles either one the entire PATCH
400s and every other unsaved change in that submission is lost with it.

## Expected Behavior

Every control on a settings page maps to a key that page can save. A control
backed by a different model is either wired to that model's endpoint or not
rendered there.

## Actual Behavior

The two checkboxes sit inert while untouched, because the form sends only changed
fields. Touching either adds an unknown key to the PATCH, and
`normalizeSettingUpdates` throws:

```ts
if (!allowedKeys || !allowedKeys.has(key)) {
  throw new BadRequestException(`Unsupported setting key ${compoundKey}.`);
}
```

The whole request fails, so the administrator's other edits in the same
submission are discarded too.

## Reproduction

**Confirmed live on production, 2026-08-29**, having originally been filed from
code alone.

1. Sign in to a tenant workspace and open the attendance settings page.
2. Tick **"Allow off-day check-in"** and Save. The request fails:

```
PATCH /api/tenant-settings -> 400
"Unsupported setting key attendance.allowOffDayCheckIn."
```

3. Observe the checkbox: it **remains visually checked** after the rejection, so
   the UI now disagrees with the persisted state until the page is reloaded. A
   user who does not read the error believes the setting was saved.
4. Reload, change one or two settings that do work — leaving the two broken
   toggles alone — and Save. The PATCH returns **200** and the "Attendance
   configuration is incomplete" banner clears.

Step 4 bounds the blast radius: the page is **not** permanently unsaveable, and
the loss is scoped to the keys changed in the *same* submission as one of the two
broken toggles. The form sends only changed keys
(`settings-form.tsx:297-306`, `:324`), so a save that does not touch them
succeeds normally.

## Evidence

**Live**, 2026-08-29 on production: the verbatim 400 and the checkbox left
visually checked afterwards, plus the clean 200 on a save that avoids both
toggles — all quoted under Reproduction. The stale checkbox is a second, smaller
defect riding on this one: the control's rendered state survives a rejected save,
so the screen asserts a value the server refused.

Code, at `eb457d9d`:

- UI field definitions:
  `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts:~1163`
  ("Allow off-day check-in", checkbox) and `:~1169` ("Allow holiday check-in",
  checkbox).
- Neither key is in the catalog: a `(category, key)` pair scan over the catalog
  and the UI configs found three UI pairs with no catalog entry —
  `attendance.allowOffDayCheckIn`, `attendance.allowHolidayCheckIn` and
  `tenant.tenantSlug`.
- They are `AttendancePolicy` columns instead —
  `services/api/prisma/schema.prisma:6033+`.
- The rejection:
  `services/api/src/modules/tenant-settings/tenant-settings.service.ts:617-623`,
  as quoted above.
- Only changed fields are sent, which is why the controls look harmless until
  used: `apps/web/.../settings/_lib/settings-form.tsx:297-306` and `:324`.
- The reader side confirms these two belong to the policy, not to settings:
  `attendance.service.ts:3585-3590` reads `allowOffDayCheckIn`,
  `allowHolidayCheckIn`, `allowCheckInOnApprovedLeave`,
  `preventDuplicateAttendance`, `markMissingCheckout` and `allowHrAdminOverride`
  **only** from the policy row, with a hardcoded `??` default and no settings key
  consulted.

**A third, unconfirmed lead — do not treat it as a finding.** `tenant.tenantSlug`
(`organization-settings-config.ts:18-22`) has the same shape one level up:
`normalizeCategory` (`tenant-settings.service.ts:638-651`) rejects any category
not in `TENANT_SETTING_CATEGORIES`, and `tenant` is not one. The Tenant Profile
adapter's save path was **not** traced far enough to confirm it reaches that
endpoint, so this is a lead to check during the fix, not a verified defect.

## Root Cause

Established: two UI fields were defined against `AttendancePolicy` column names
in a page whose save path only accepts tenant settings catalog keys.

## Impact

Silent until used, then destructive of unsaved work: the failing key takes the
whole submission down, so an administrator who changed four things and ticked one
of these loses all five. The message names an internal key, so the cause is not
obvious from the screen.

Rated MEDIUM: recoverable by re-entering the changes and avoiding those two
controls, no data corruption — but it is a save path that discards user input on
a production screen.

## Affected Areas

`apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts` (attendance
section) and `settings-form.tsx`;
`services/api/src/modules/tenant-settings/tenant-settings.service.ts`
(`normalizeSettingUpdates`); `AttendancePolicy` in `schema.prisma` and the
attendance policy endpoint that owns these two columns.

## Proposed Resolution

Decide where these two controls belong. Either move them to the attendance policy
screen, which writes the columns that actually back them, or add the keys to the
catalog **and** make the attendance resolver read them — the second is only
honest if the policy precedence problem in BUG-1980 and BUG-1981 is settled at the
same time, otherwise the new keys would be dead on arrival.

Independently of that choice, a rejected key should not discard the rest of the
submission: the settings save should report which key it refused and persist the
valid remainder, or validate before it sends.

Also worth adding: a check that every UI field's `(category, key)` pair exists in
the catalog. This defect is exactly what such a check catches, and the same check
BUG-1974 argues for would cover it.

## Acceptance Criteria

- Toggling "Allow off-day check-in" or "Allow holiday check-in" persists, on
  whichever screen ends up owning them.
- A settings submission containing an unsupported key does not silently discard
  the user's other changes.
- A control whose save was rejected does not remain rendered in the state the
  server refused.
- No UI field references a `(category, key)` pair absent from the catalog, and a
  repository check enforces it.
- The `tenant.tenantSlug` lead is traced and either filed or dismissed.

## Regression Coverage

None yet.

## Dependencies

The "add them to the catalog" option depends on the attendance precedence
decisions in BUG-1980 and BUG-1981.

## Related Items

BUG-1979 (seven attendance settings overwritten on write), BUG-1980 (a saved
attendance policy overrides the settings category) and BUG-1981 (hardcoded
location values) are the rest of the attendance configuration audit. BUG-1974 is
the catalog-wide scan that surfaced these three orphan UI pairs.

## Resolution

Fixed. The premise held. Neither `attendance.allowOffDayCheckIn` nor
`attendance.allowHolidayCheckIn` appears anywhere in the tenant-settings catalog
(checked across the whole `tenant-settings` module, not only
`tenant-settings.catalog.ts`), while both are `AttendancePolicy` columns and
both are read by `resolvePolicy` **only** from the policy row.

**The choice taken**, of the two the record offered: **move them to the
attendance policy screen**, which writes the columns that actually back them.
The other option — adding catalog keys and teaching the resolver to read them —
would have created a second home for a value that already has one, and the
record itself says it is only honest once the precedence question in BUG-1980
and BUG-1981 is settled. That question is not settled; it is sequenced in
EXECPLAN-0027. So this fix deliberately does not depend on it.

**What changed.**

- `apps/web/.../settings/_lib/settings-page-config.ts` — both fields removed
  from the Schedule Fallback section, with a comment in their place recording
  what they were, why they could not be saved there, and where they went.
  `requireReasonForOffdayHolidayCheckIn`, which *is* a catalog key, stays.

- `apps/web/.../attendance/_components/attendance-policy-card.tsx` — both are
  now checkboxes on the policy screen, alongside four other policy switches the
  card had never exposed (`allowManualAdjustments`,
  `preventDuplicateAttendance`, `allowCheckInOnApprovedLeave`,
  `markMissingCheckout`) and which its endpoint requires. They save through
  `PATCH /attendance/policy`, which writes the columns.

- `apps/web/.../settings/settings-form.tsx` — a rejected save no longer leaves
  the refused value on screen. On a **server rejection** the form reverts to the
  persisted values and says so; on a network failure it does not, because
  nothing is known about what the server did. This is the second, smaller defect
  the record identified: the control stayed ticked after the server declined it,
  so anyone who did not read the error believed the setting had saved.

**A defect found while fixing this one, and reported here because it is the
reason the "move them" option needed work before it could function:** the
attendance policy screen **could not save at all**. `AttendancePolicyCard`
posted its entire form back, and that form is the object
`GET /attendance/policy` returns — the *resolved* policy, which also carries
`allowedModes`, `locationRetryAttempts` and `standardWorkHoursPerDay`. The
global `ValidationPipe` runs with `forbidNonWhitelisted`, so every save was
rejected with a 400 naming a field nobody had touched. The card now builds an
explicit payload typed as `AttendancePolicyUpdate`, declared separately from the
read shape `AttendancePolicyRecord` so the two cannot drift back together. Full
detail is on BUG-1981, whose fix shares the file.

**The `tenant.tenantSlug` lead**, which this record asked to trace and either
file or dismiss: **neither, and deliberately.** It has the same shape one level
up — `organization-settings-config.ts` declares category `tenant`, which is not
in `TENANT_SETTING_CATEGORIES`, so `normalizeCategory` would reject it — but
confirming it needs the Tenant Profile adapter's save path traced to the
endpoint it actually reaches, which was not done. It is an unverified lead, and
filing it as a defect on the strength of a shape match is how a record acquires
a premise that turns out to be false. It stays as written in the Evidence
section above, for whoever traces it.

**Not done:** the repository-wide check that every UI `(category, key)` pair
exists in the catalog. That is the scan BUG-1974 argues for, it is owned by
concurrent work on the catalog, and adding a second one here would be the
duplicate-source-of-truth mistake this record is about. The web spec below
covers the two attendance pairs specifically.

**Tests.**

- `apps/web/app/(authenticated)/settings/_lib/attendance-settings-fields.spec.ts`
  (new) asserts the attendance settings page offers neither key, and asserts the
  field list is non-empty first — an `it.each` over an empty array is green, and
  so is a `flatMap` over a renamed export.
- `services/api/src/modules/attendance/attendance-policy-write.spec.ts` (new)
  asserts both keys persist through `PATCH /attendance/policy` on create and on
  update, and that omitting either leaves the stored value alone.

**Mutation-tested.** Restoring the `allowOffDayCheckIn` field to
`settings-page-config.ts` fails exactly the case asserting the page does not
offer it.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — either add the catalog entries or stop rendering the controls.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[settings]]

<!-- GRAPH:END -->
