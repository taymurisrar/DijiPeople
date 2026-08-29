---
ID: BUG-1981
aliases: [BUG-1981]
Title: resolvePolicy hardcodes seven location values and two AttendancePolicy columns are dead
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-322
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1981 — resolvePolicy hardcodes seven location values and two AttendancePolicy columns are dead

## Summary

`resolvePolicy` returns seven location-related values as literals, consulting
neither the `AttendancePolicy` row nor the attendance settings. Two of the seven
are `AttendancePolicy` columns with no settings counterpart, and both are
hardcoded to the opposite polarity from their column default — so an
administrator saving the attendance policy screen writes values the engine will
never honour, and the columns themselves are dead.

**This record splits in two.** The SESSION-0072 investigation settled which half
is which:

- **The seven hardcodes are deliberate and coherent.** They report the location
  mandate consistently with an enforcement path that is unconditional anyway
  (see BUG-1979 for the mandate's evidence). Keep them — ideally expressed as
  one named constant with a comment, so the next reader does not file this
  again.
- **The two dead `AttendancePolicy` columns are a genuine leftover** — an
  unfinished cleanup, safe to fix without answering any product question.

## Correction — the values are not "inverted" by mistake

*Added 2026-08-29. The original wording of this record was wrong and is corrected
here rather than quietly removed, because a future reader would otherwise hunt
for a typo that does not exist.*

The record previously described `requireRemoteLocationForRemoteMode: true` and
`allowRemoteWithoutLocation: false` as "inverted" relative to their column
defaults, and its Root Cause inferred from that that "the schema and the
resolver were written against different intentions". **That inference is
incorrect.**

The two values are **logical complements**, and they have always been consumed
as complements. Before commit `a8c04f16`, `resolvePolicy` derived them as:

```ts
requireRemoteLocationForRemoteMode: policy?.X ?? settings.requireRemoteLocationCapture,
allowRemoteWithoutLocation:         policy?.Y ?? !settings.requireRemoteLocationCapture,
```

That is `require = X`, `allowWithout = !X`. The column defaults `false` / `true`,
set in `20260413183000_attendance_advanced_foundation` (2026-04-13, commit
`b984e570`), are internally consistent with each other and with the then-current
catalog default `requireRemoteLocationCapture: false`.

`a8c04f16` replaced both derivations with literals that are **also** complements
— `true` / `false`. The same pair; only the polarity moved, to match the
mandate. The April 2026 column defaults were simply never revisited, along with
the DTO, the policy screen and the schema. Nothing was inverted by accident.

One further nuance the original record did not have: **these two columns were
never read in an enforcement branch, before or after `a8c04f16`.** The mandate
did not kill them. They have been decorative since 2026-04-13; all they ever did
was populate `getPolicy().policy.remoteRequiresLocation` for the ESS card, which
today correctly reports `true`, matching the server.

So the defect is stale schema plus live UI controls over dead columns — not a
contradiction of intent.

## Expected Behavior

A value the schema stores as a configurable column is read from that column.
Where the platform mandates a value, the column and the UI reflect the mandate
rather than accepting input that is discarded at resolve time.

## Actual Behavior

`resolvePolicy` hardcodes:

```
requireRemoteLocationForRemoteMode: true
allowRemoteWithoutLocation:         false
locationCaptureRequired:            true
locationRequiredForModes:           [OFFICE, REMOTE, HYBRID]
allowManualLocationException:       false
captureLocationOnCheckIn:           true
captureLocationOnCheckOut:          true
```

`requireRemoteLocationForRemoteMode` has column default `false` and is forced
`true`; `allowRemoteWithoutLocation` has column default `true` and is forced
`false`.

## Reproduction

Code-level at `eb457d9d`. The user-facing consequence: set
"Allow remote without location" on the attendance policy screen, save, and the
attendance engine behaves as if it were off — the stored column is simply never
read.

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/attendance/attendance.service.ts:3556-3577` — the
  seven literals above, inside `resolvePolicy`.
- `services/api/prisma/schema.prisma` — `requireRemoteLocationForRemoteMode`
  `@default(false)` and `allowRemoteWithoutLocation` `@default(true)`, both
  `AttendancePolicy` columns with **no** `TenantSetting` counterpart.

**A correction to an earlier analysis, recorded so it is not repeated.** These
seven are *not* the same seven that `enforceCriticalAttendanceSetting` forces on
write (BUG-1979). Both lists have seven entries — which is presumably how the
error crept in — but they overlap in only five:

| Field | Forced on write | Hardcoded at resolve |
|---|:-:|:-:|
| `locationCaptureRequired` | yes | yes |
| `locationRequiredForModes` | yes | yes |
| `allowManualLocationException` | yes | yes |
| `captureLocationOnCheckIn` | yes | yes |
| `captureLocationOnCheckOut` | yes | yes |
| `requireRemoteLocationCapture` | **yes** | **no** — not read by `resolvePolicy` at all |
| `highAccuracyLocation` | **yes** | **no** — read as `policy?.highAccuracyLocation ?? settings.highAccuracyLocation` |
| `requireRemoteLocationForRemoteMode` | **no** | **yes** — and it is not a catalog key |
| `allowRemoteWithoutLocation` | **no** | **yes** — and it is not a catalog key |

The last two rows are what make this a distinct defect from BUG-1979: hardcoding
them makes two *policy columns* dead, rather than two settings keys.

Related, and separately confirmed: `allowOffDayCheckIn`, `allowHolidayCheckIn`,
`allowCheckInOnApprovedLeave`, `preventDuplicateAttendance`, `markMissingCheckout`
and `allowHrAdminOverride` are read **only** from the policy row
(`attendance.service.ts:3585-3590`) with a hardcoded `??` default and no settings
key consulted — which is the reader-side explanation for BUG-1978.

## Root Cause

Established, and split.

The seven literals are the **deliberate** location mandate landed by commit
`a8c04f16` on 2026-07-29, whose migration
(`20260728234000_attendance_mandatory_location_capture`) opens with
`-- Attendance location is a mandatory integrity control for all self-service modes.`
See BUG-1979 for the full evidence. Since the enforcement path
(`validateAttendanceLocationPayload`) throws unconditionally and reads none of
these fields, reading them from the policy row instead would change the value
the client is *told* without changing what the server *does*.

The genuine defect is an **unfinished cleanup**: `a8c04f16` moved the resolve
site to literals and left the two `AttendancePolicy` columns, their April 2026
defaults, their DTO fields and their two live checkboxes behind. Those two
columns were already decorative before the mandate — see the Correction above —
so nothing about them was ever a contradiction of intent, only a leftover nobody
swept up.

An earlier draft of this record attributed the leftover to "the schema and the
resolver written against different intentions". That is withdrawn; see the
Correction section.

## Impact

Two configurable columns are inert, and their defaults say the opposite of what
the engine does, so anyone reading the schema to understand attendance behaviour
is misled. An administrator editing them on the policy screen gets a successful
save with no effect. The mandate is restrictive rather than permissive, so there
is no security exposure — the cost is configuration that lies.

Rated MEDIUM, consistent with BUG-1979 and BUG-1980: silent divergence between
stated configuration and enforced behaviour, no data loss.

## Affected Areas

`services/api/src/modules/attendance` (`resolvePolicy`), `AttendancePolicy` in
`schema.prisma`, and the attendance policy screen that edits the two dead
columns.

## Proposed Resolution

The mandate question is answered — the seven values **are** genuinely mandated
(BUG-1979). So:

1. **Keep the seven literals.** Extract them into one named, commented constant
   at the resolve site that points at migration `20260728234000`, so the next
   reader can see they are the mandate rather than an oversight.
2. **Remove the two dead columns** — `requireRemoteLocationForRemoteMode` and
   `allowRemoteWithoutLocation`. Dropping columns is a destructive change and
   needs an ExecPlan under `PLANS.md` with a backfill and rollback section. If
   the drop is deferred, the interim step is to align their defaults with the
   enforced values so the schema stops contradicting the engine.
3. **Remove the two live checkboxes** (`attendance-policy-card.tsx:85,95`) and
   the two DTO fields (`update-attendance-policy.dto.ts:32,36`) that accept
   input which can never take effect. This half needs no ExecPlan and no product
   input.

Do **not** "restore configurability" by reading the seven from the policy row.
The enforcement never consults them; that change would alter only what the
client is told.

Also worth fixing while here, though strictly separate: `apps/web/.../attendance/team/page.tsx:121-131`
hardcodes a fallback policy object carrying the **pre-mandate** values
(`allowRemoteWithoutLocation: true`, `captureLocationOnCheckIn: false`,
`locationRequiredForModes: []`), directly contradicting the server.

## Acceptance Criteria

- No `AttendancePolicy` column is both editable and never read.
- Column defaults agree with the values the engine enforces.
- Editing `requireRemoteLocationForRemoteMode` or `allowRemoteWithoutLocation`
  either changes behaviour or is not offered.

## Regression Coverage

None yet. A test asserting that every `AttendancePolicy` column consulted by the
attendance engine is actually read would fail today on two columns.

## Dependencies

The product decision this record used to share with BUG-1979 and BUG-1980 is
answered (see BUG-1979). Step 2 of the resolution — dropping the two columns —
needs an ExecPlan under `PLANS.md`. Steps 1 and 3 need nothing.

## Related Items

BUG-1979 (seven mandated attendance settings still rendered editable — a
different seven, and the record carrying the mandate's evidence), BUG-1980 (a
saved policy row overrides the settings category — unrelated to the mandate) and
BUG-1978 (two attendance checkboxes that are not catalog keys, whose reader side
is documented here).

BUG-2091 records that the canonical settings contract still describes
attendance geolocation as configurable, which is the documentation half of the
same unfinished cleanup.

## Resolution

Fixed, along the split this record's own Summary defines: **the seven hardcodes
are kept and named; the leftover is swept up.** Steps 1 and 3 of the proposed
resolution are done. Step 2 — dropping the two columns — is deferred, as the
record itself says it must be.

**What changed.**

**Step 1 — the literals are now one named, commented constant.**
`MANDATORY_LOCATION_CAPTURE` in `attendance.service.ts`, spread into
`resolvePolicy`. Its comment states that these are the deliberate mandate rather
than an oversight, quotes the migration
`20260728234000_attendance_mandatory_location_capture` that carries the intent,
names `validateAttendanceLocationPayload` as the thing that actually enforces
it, and explains why reading them from the policy row would change what the
client is *told* without changing what the server *does* — and would stop the
browser asking for a position it still has to supply. It also warns that the
write-side list in `tenant-settings.service.ts` is related but **not identical**,
which is the error this record itself records having been made once.

**Step 3 — input that can never take effect is no longer accepted.**

- `dto/update-attendance-policy.dto.ts` — `requireRemoteLocationForRemoteMode`
  and `allowRemoteWithoutLocation` are removed, along with the five other
  mandated location fields the DTO accepted and discarded for the same reason
  (`locationCaptureRequired`, `locationRequiredForModes`,
  `allowManualLocationException`, `captureLocationOnCheckIn`,
  `captureLocationOnCheckOut`). Removed rather than deprecated, with comments in
  their place saying why. `allowIpFallback`, `locationTimeoutSeconds`,
  `highAccuracyLocation` and `maxAllowedAccuracyMeters` stay — those *are* read
  from the policy row.
- `attendance-policy-card.tsx` — the two checkboxes are gone, with a comment
  recording what they were.
- `attendance/types.ts` — `AttendancePolicyRecord` no longer declares them.

**The interim measure the record asks for, done in code rather than schema.**
`updatePolicy` now writes all seven mandated columns at the mandated values on
both halves of the upsert, so a stored row that says the opposite is corrected
on the next save and the stored policy agrees with what the engine does.

**A third defect, found while fixing this, and more serious than either half of
the record: the attendance policy screen could not save at all.**
`AttendancePolicyCard` posted its whole form back, and that form is the object
`GET /attendance/policy` returns — the *resolved* policy, which also carries
`allowedModes`, `locationRetryAttempts` and `standardWorkHoursPerDay`. The
global `ValidationPipe` runs with `forbidNonWhitelisted`, so **every save on
that screen was rejected with a 400 naming a field the administrator never
touched.** The card now builds an explicit payload typed as
`AttendancePolicyUpdate`, declared separately from the read shape so the two
cannot drift back together.

This also **falsifies the reproduction on BUG-1980**, whose step 2 is "open the
attendance policy screen and press Save once" — that step could not have
succeeded through the UI. BUG-1980's underlying claim is still true; only its
route into the state was wrong.

**Also fixed in passing, as the record suggested:**
`apps/web/.../attendance/team/page.tsx` held a hardcoded fallback policy
carrying the **pre-mandate** values (`allowRemoteWithoutLocation: true`,
`captureLocationOnCheckIn: false`, `locationRequiredForModes: []`),
contradicting the server for every tenant. It now describes the server honestly,
with a comment saying what it used to claim.

**Blast radius checked, not assumed.** `apps/admin` and `apps/agent-desktop`
reference none of the removed fields; `apps/web` is the only consumer of
`PATCH /attendance/policy`. The narrowing is still a compatibility change and is
recorded in ADR-0003's Migration section.

**Step 2 is deferred, deliberately.** Dropping
`requireRemoteLocationForRemoteMode` and `allowRemoteWithoutLocation` is a
destructive schema change and needs an ExecPlan under `PLANS.md` with backfill
and rollback, exactly as this record says. The six column defaults that still
say the opposite of what the engine enforces are the same job. Until then the
columns are written at the mandated values on every save, so the **data** agrees
with the engine even while the **defaults** do not. Acceptance criterion "column
defaults agree with the values the engine enforces" is therefore **not** met and
is the one thing left here.

**Tests** — `services/api/src/modules/attendance/attendance-policy-write.spec.ts`
(new, 8 cases): the mandated columns are written on create and on update,
correcting a stale row that contradicts them in every column; the resolved
policy reports the mandate even when the stored row says the opposite in every
column; both halves of the upsert are tenant-scoped.

**Mutation-tested.** Removing the `MANDATORY_LOCATION_CAPTURE` spread from
`resolvePolicy` fails exactly the case asserting the resolved policy reports the
mandate.

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
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — depends on the answer to BUG-1979 and BUG-1980.
- 2026-08-29 — amended by the SESSION-0072 attendance-override investigation. The record **splits**: the seven hardcodes are deliberate and coherent with the location mandate (keep them), while the two dead `AttendancePolicy` columns are a genuine leftover (remove them). Status moves PRODUCT_DECISION -> OPEN and ArchitectDisposition PRODUCT_DECISION -> FIX_NOW. A **Correction** section was added: the record's claim that the two values are "inverted" relative to their column defaults, and the Root Cause inferred from it, were wrong — `require=true` / `allowWithout=false` are logical complements exactly as the pre-mandate `require=X` / `allowWithout=!X` derivation was; only the polarity moved, and the April-2026 column defaults were never revisited. The claim is corrected in place rather than dropped. Title adjusted to stop asserting the inversion.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
