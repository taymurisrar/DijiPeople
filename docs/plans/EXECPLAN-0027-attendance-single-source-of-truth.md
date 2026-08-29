---
ID: PLAN-027
aliases: [PLAN-027, EXECPLAN-0027]
Title: Attendance policy as the single source of truth
Status: APPROVED
Session: SESSION-0071
Type: BUG
Size: LARGE
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
---

# EXECPLAN-0027 — Attendance policy as the single source of truth

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md
  - .agent/context/failure-adaptation.md

SPECIALIST_AGENTS_REQUIRED:
  - Database                           — a defaults migration and a backfill of rows
                                         written while the engine ignored them
  - Backend/API                        — resolvePolicy, and the settings write path
  - Frontend                           — the attendance settings screen
  - QA                                 — three records, none live-retested
DELIBERATELY_NOT_USED:
  - Security                           — no permission or tenant-scoping change; the
                                         settings write is already guarded

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/**

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-307 — a settings toggle wired to nothing

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no        (ships with a later release)
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         database -> api -> web
ROLLBACK_CLASS:           DATA_MIGRATION
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           rebase
KNOWN_CONCURRENT_WORK:    none known on services/api/src/modules/attendance
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Give attendance one source of truth. Today it has three, and they disagree.

## Business requirement

BUG-1979, BUG-1980 and BUG-1981 are three records describing one design. The
repository owner decided on 2026-08-29: **`AttendancePolicy` wins, and the
settings screen edits it** — one home, with the settings UI writing through
rather than into a parallel store.

## Existing behavior

**FACT.** Seven attendance values are decided in three different places, and
each place disagrees with the others.

1. `resolvePolicy` (`attendance.service.ts:3540`) returns seven values as
   **literals**, consulting neither the policy row nor settings:

   ```
   requireRemoteLocationForRemoteMode: true
   allowRemoteWithoutLocation:         false
   locationCaptureRequired:            true
   locationRequiredForModes:           [OFFICE, REMOTE, HYBRID]
   allowManualLocationException:       false
   captureLocationOnCheckIn:           true
   captureLocationOnCheckOut:          true
   ```

2. `enforceCriticalAttendanceSetting` (`tenant-settings.service.ts:745`)
   overwrites the submitted value of those same seven keys with the same
   constants on every settings write, unconditionally — while the settings
   screen still renders them as live, enabled controls. An administrator gets a
   successful save, no warning, an audit row recording no change, and the old
   value back on reload.

3. Every **other** value resolves as `policy?.X ?? attendanceSettings.X`. Every
   `AttendancePolicy` column consulted that way is non-nullable with a Prisma
   default, so the fallback fires only when the whole row is absent. The row is
   created the first time anyone opens and saves the attendance policy screen —
   and from that moment the settings keys stop having any effect on that tenant,
   for ever, with nothing in the UI saying so.

**FACT, and better news than the records imply.** All seven values already have
`AttendancePolicy` columns. Nothing needs adding.

**FACT.** Six of the seven columns carry a default that is the *opposite* of the
literal the engine uses:

| Column | Column default | `resolvePolicy` literal |
|---|---|---|
| `requireRemoteLocationForRemoteMode` | `false` | `true` |
| `allowRemoteWithoutLocation` | `true` | `false` |
| `locationCaptureRequired` | `false` | `true` |
| `locationRequiredForModes` | `[]` | `[OFFICE, REMOTE, HYBRID]` |
| `captureLocationOnCheckIn` | `false` | `true` |
| `captureLocationOnCheckOut` | `false` | `true` |
| `allowManualLocationException` | `false` | `false` *(agrees)* |

**Corrected after SESSION-0072, whose account is better sourced than this one.**
This plan first read that table as evidence the schema and the resolver were
written against different intentions, and called the defaults "inverted". That
framing is wrong, and BUG-1981 now carries the correction:

- `requireRemoteLocationForRemoteMode` and `allowRemoteWithoutLocation` are
  **logical complements** and have always been consumed as complements. Before
  `a8c04f16` the resolver derived them as `require = X` / `allowWithout = !X`
  from a single setting. `a8c04f16` replaced both with literals that are also
  complements. Only the polarity moved, to match the mandate.
- The column defaults were set in `20260413183000_attendance_advanced_foundation`
  and are internally consistent with the catalog default of the time. They were
  never revisited. Nothing was inverted by accident.
- Those two columns **have never been read in an enforcement branch**, before or
  after `a8c04f16`. They populate one ESS card and nothing else.

What survives the correction is the operational consequence, and it is the reason
for the ordering below: the columns are **stale relative to what the engine
enforces**, so pointing `resolvePolicy` at them without correcting the data first
would still **silently turn location capture off for every tenant**. The risk is
real; the explanation this plan originally gave for it was not.

## Existing architecture

The three mechanisms read as a compliance decision enforced defensively: someone
made location capture mandatory and pinned it at write time *and* at read time,
then left the controls on screen. The pinning works. What it costs is that no
column, and no setting, means anything for those seven values — so the product
cannot express a tenant that is allowed to differ, and an administrator is shown
controls that lie.

## Requirements

1. `resolvePolicy` reads every value from `AttendancePolicy`, with no literals.
2. A tenant with no policy row behaves exactly as it does today.
3. A tenant with a policy row behaves exactly as it does today **unless an
   administrator deliberately changes a value**.
4. The attendance settings screen writes through to `AttendancePolicy`. A saved
   value is the value that comes back on reload and the value the engine uses.
5. `enforceCriticalAttendanceSetting` is deleted. A control that cannot be
   changed is either removed from the screen or made changeable; it is not
   rendered and quietly ignored.
6. No tenant's effective attendance behaviour changes as a result of this work.

Requirement 6 is the one to design against. This is a refactor of *where* the
truth lives, not a change to what it currently says.

## Database impact

**A defaults migration and a backfill.** No new columns.

- Change the six column defaults to match the literals the engine has actually
  been using, so a policy row created after this lands behaves as before.
- **Backfill every existing `AttendancePolicy` row** to the literal values for
  those six columns. This is the load-bearing step: existing rows hold whatever
  the settings screen wrote while the engine ignored it, so reading the columns
  without backfilling would change behaviour on every tenant that has ever saved
  the attendance policy screen — which is every tenant that opened it.
- `allowManualLocationException` needs neither, its default already agreeing.

`ROLLBACK_CLASS: DATA_MIGRATION` because of the backfill. Rolling back the code
alone is safe; rolling back after administrators have started changing values is
not, and the plan should not pretend otherwise.

## Backend impact

- `resolvePolicy` reads columns only. It still needs a row: keep the
  `?? attendanceSettings.X` fallback **only** for the case where no row exists,
  or create the row on first read. Creating it is cleaner and removes the last
  fallback, but it is a write on a read path — decide explicitly, do not drift
  into it.
- The settings write path routes the attendance category to `AttendancePolicy`
  instead of the settings store.
- `enforceCriticalAttendanceSetting` is deleted along with its call site.

## Frontend impact

The attendance settings screen keeps its controls and its shape. If the
write-through is done in the API, the frontend may need no change at all — which
should be confirmed rather than assumed, since the screen reads its current
values from the settings resolver.

## Permission / RBAC impact

None. Both paths are already guarded and the endpoint does not change.

## Tenant-isolation impact

`AttendancePolicy.tenantId` is `@unique`, so a policy row is per tenant by
construction. Every read and write must still filter on `tenantId` from
`request.user`; the backfill takes it as an explicit argument.

## Audit / event / logging impact

Improves. Today an attendance settings write produces an audit row recording a
change that did not happen — the value was replaced before it was stored. After
this, the audit row describes a real change.

## Migration / data compatibility

Expand/backfill/contract, in that order:

1. **Expand** — change the column defaults. Nothing reads them yet.
2. **Backfill** — set the six columns to the engine's literals on every existing
   row. Idempotent, and verifiable by counting rows that already match.
3. **Contract** — point `resolvePolicy` at the columns, route the settings
   write, delete `enforceCriticalAttendanceSetting`.

Steps 1 and 2 change no behaviour, so they can land and be verified first. Only
step 3 changes anything, and by then the data it reads is already correct.

## Parallel-safe tasks

- `PARALLEL_SAFE` — the defaults migration and its backfill script
- `PARALLEL_SAFE` — a spec pinning current effective behaviour, per value, as the
  baseline requirement 6 is measured against

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — `resolvePolicy`, on the backfill
- `DEPENDENCY_BLOCKED` — the settings write-through, on `resolvePolicy`
- `DEPENDENCY_BLOCKED` — deleting `enforceCriticalAttendanceSetting`, on the
  write-through

## Integration tasks

- `INTEGRATION` — api suite, framework validation, integrate to `develop` behind
  a CI verdict, and a live retest of all three records, none of which has had one

## Testing strategy

**Write the baseline spec first**, before any change: assert the effective value
of all twenty-odd values `resolvePolicy` returns, for a tenant with a policy row
and one without. That spec must pass unchanged after the work — it *is*
requirement 6, and without it "no behaviour changed" is an assertion nobody
checked.

Then:

- The six defaults match the literals they replace.
- The backfill is idempotent and touches only the six columns.
- A settings write is readable back and reaches the engine — the assertion that
  fails today for all seven keys.
- `enforceCriticalAttendanceSetting` no longer exists (a grep-level guard is
  acceptable here: the requirement is its absence).

## Risks

1. **Silently disabling location capture on every tenant.** The single largest
   risk, and the reason the backfill precedes the read change. Six columns
   default to the opposite of what the engine enforces.
2. **A tenant that saved the settings screen has stored values nobody honoured.**
   Those values are not a preference to preserve — they were never in effect —
   and the backfill deliberately overwrites them. An administrator who set them
   may nonetheless believe they were live. Worth a release note.
3. **The compliance intent is undocumented.** Nothing says *why* location capture
   was mandated. Making it configurable may be exactly wrong for the reason it
   was pinned. **This should be confirmed with the repository owner before step 3
   lands** — the decision taken was about where truth lives, not about whether
   the mandate should be relaxable.

## Rollback considerations

Code-only rollback is safe before administrators begin changing values, because
the backfilled data equals the behaviour the literals produced. Afterwards, a
rollback restores the literals and silently discards deliberate configuration.
Note it in the release.

## Definition of Done

- The baseline spec passes unchanged, before and after.
- All three records — BUG-1979, BUG-1980, BUG-1981 — are FIXED with a live
  retest, which none of them has had.
- `enforceCriticalAttendanceSetting` is gone.
- A REG entry and a QA scenario exist, under a plan for the attendance area.
- Risk 3 is put to the repository owner and answered before step 3 merges.

## Concurrent work — read this first

**SESSION-0072 is already inside these records.** It retitled all three, set them
`FIX_NOW`, raised [[ITEM-0112]] for `enforceCriticalAttendanceSetting` having zero
test coverage, and wrote the correction cited above. This plan was written
without knowing that, and is published rather than withdrawn because the piece it
adds is the one that session did not have: **the repository owner's decision that
`AttendancePolicy` is the source of truth.**

Before executing any step here, reconcile with that session. In particular
[[ITEM-0112]] — nothing anywhere names `enforceCriticalAttendanceSetting`, so
deleting it breaks no test — makes step 3 of the sequence below cheaper to get
wrong than it looks, and a characterisation test should exist before it goes.

## Related

The three records this closes are [[BUG-1979]], [[BUG-1980]] and [[BUG-1981]].
[[BUG-2045]] and [[BUG-2206]] are the same family in a different module — a
control rendered on screen that nothing honours — and REG-307 is the guard for
the one of those that is fixed. [[PLAN-009]] is the QA plan for attendance.
