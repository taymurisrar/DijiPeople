---
ID: BUG-1981
aliases: [BUG-1981]
Title: resolvePolicy hardcodes seven location values and inverts two AttendancePolicy column defaults
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

# BUG-1981 — resolvePolicy hardcodes seven location values and inverts two AttendancePolicy column defaults

## Summary

`resolvePolicy` returns seven location-related values as literals, consulting
neither the `AttendancePolicy` row nor the attendance settings. Two of the seven
are `AttendancePolicy` columns with no settings counterpart, and both are
hardcoded to the **opposite** of their column default — so an administrator
saving the attendance policy screen writes values the engine will never honour,
and the columns themselves are dead.

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

Established as a mechanism: values that the schema models as configurable were
inlined as constants at the resolve site. Whether the mandate behind them is
current policy is a product question, and the inverted defaults suggest the schema
and the resolver were written against different intentions.

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

Decide whether the seven values are genuinely mandated. If they are, remove the
two dead columns from the schema (a destructive change needing an ExecPlan) or
mark them enforced and stop offering them for editing, and align the remaining
column defaults with the enforced values so the schema stops contradicting the
engine. If they are not mandated, read them from the policy row.

## Acceptance Criteria

- No `AttendancePolicy` column is both editable and never read.
- Column defaults agree with the values the engine enforces.
- Editing `requireRemoteLocationForRemoteMode` or `allowRemoteWithoutLocation`
  either changes behaviour or is not offered.

## Regression Coverage

None yet. A test asserting that every `AttendancePolicy` column consulted by the
attendance engine is actually read would fail today on two columns.

## Dependencies

Shares its product decision with BUG-1979 and BUG-1980.

## Related Items

BUG-1979 (seven attendance settings forced on write — a different seven),
BUG-1980 (a saved policy row overrides the settings category) and BUG-1978 (two
attendance checkboxes that are not catalog keys, whose reader side is documented
here).

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — depends on the answer to BUG-1979 and BUG-1980.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
