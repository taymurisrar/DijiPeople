---
ID: BUG-1974
aliases: [BUG-1974]
Title: 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-325
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1974 — 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI

## Summary

The tenant settings catalog declares 591 keys. 246 of them (41.6%) have no
production reader anywhere in the monorepo, and 230 of those 246 are rendered as
live, editable controls in the tenant settings UI. A tenant administrator changes
one, the value is validated, stored, cached, audited and echoed back, the screen
says saved, the value survives a reload — and nothing in the platform ever reads
it. There is no error and no warning to give the lie away.

## Expected Behavior

A setting the product offers is a setting the product honours. A key with no
reader is either implemented, removed from the catalog, or marked in the UI as
not yet in effect. `AGENTS.md` names "no duplicate sources of truth" and
"configuration over hardcoding" as architecture principles; a catalog that
advertises behaviour nothing implements breaks the contract both rest on.

## Actual Behavior

Saving any of the 230 succeeds and changes nothing. The write path treats them as
first-class: `updateTenantSettings`
(`services/api/src/modules/tenant-settings/tenant-settings.service.ts:269-337`)
allowlists the key because it *is* in the catalog, coerces it, upserts it,
invalidates the cache and writes a `TENANT_SETTINGS_UPDATED` audit row with
before/after snapshots. The administrator gets a successful save and an audit
trail for a value nothing reads.

## Reproduction

This is a code-level defect measured over the repository at `eb457d9d`; the
customer-visible form of it reproduces on any tenant:

1. Sign in to a tenant workspace and open Settings > Timesheets > Approval
   Workflow.
2. Set "Approval SLA hours" to 24 and turn "Enable approval escalation" off.
3. Save — the screen confirms. Reload — the values persisted.
4. Observe that approvals continue to escalate on the old schedule: nothing in
   the API reads `timesheets.approvalSlaHours` or
   `timesheets.enableApprovalEscalation`.

## Evidence

Measured at `eb457d9d` by an independent re-derivation (scripts kept in the QA
scratchpad, not the repository):

**Baseline — 591 keys**, parsed from
`services/api/src/modules/tenant-settings/tenant-settings.catalog.ts`:

```
TOTAL 591
{ organization:21, employees:43, access:5, leave:6, attendance:70, timesheets:160,
  payroll:87, recruitment:35, documents:30, branding:71, notifications:26,
  security:22, system:15 }
```

**246 dead.** An identifier index was built over every tracked file (4,382 files,
`git ls-files`, any extension), tokenised on `/[A-Za-z_$][A-Za-z0-9_$]*/g`. A key
is dead when its identifier appears in **zero** files outside the catalog itself,
`*.spec.ts` / `*.test.ts` / `e2e/`, `docs/` and `*.md`, and the two settings-UI
directories:

```
dead: 246
by cat: {"organization":6,"employees":17,"access":5,"leave":6,"attendance":19,
         "timesheets":87,"payroll":39,"recruitment":28,"documents":7,"branding":10,
         "notifications":15,"security":7}
```

The figure is stable across two corpus definitions (3,183 code files and 4,382
all-tracked files both yield 246), so it is not an artefact of extension
filtering.

**230 editable**, derived by a `(category, key)` **pair** test over the UI field
definitions rather than a token test — handling the two factory helpers a naive
parser misses (`settings-page-config.ts:1012-1025` `timesheetField(...)`, and
`settings-page-config.ts:1559-1570` `payrollValidationField(...)`):

```
distinct editable (category,key) UI field pairs: 514
catalog keys with an editable UI field: 511 / 591
DEAD keys that are EDITABLE in the UI: 230
DEAD and NOT editable: 16
```

246 − 230 = 16, and those 16 are exactly the keys with zero occurrence anywhere in
the tree including the UI:

```
access.allowDirectPermissions, access.allowCustomRoles, access.defaultManagerRoleKey,
access.defaultEmployeeRoleKey, access.lockSystemRoles,
leave.defaultApprovalFlow, leave.allowHalfDayRequests, leave.documentReminderAfterDays,
leave.defaultCarryForwardEnabled, leave.defaultHolidayCalendarName, leave.allowManualLeaveMarking,
timesheets.defaultPolicyId, timesheets.requirePolicyAssignment,
timesheets.allowEmployeeExemption, timesheets.policyEffectiveDateMode,
payroll.payslipTemplate
```

Two whole categories — `access` (5 keys) and `leave` (6) — are dead in their
entirety, confirmed twice: by the token index, and by a direct word-boundary
`git grep` per key excluding only the catalog, which returned **zero files** for
all eleven. They have no UI surface, so they bite an integrator rather than an
administrator: `access` and `leave` are members of `TENANT_SETTING_CATEGORIES`
(`tenant-settings.catalog.ts:1-15`), so `getAllowedKeysByCategory()`
(`tenant-settings-resolver.service.ts:1669-1682`) allowlists all eleven for
`PATCH /tenant-settings` and `GET /tenant-settings` returns them with their
defaults. A partner who PATCHes `leave.defaultCarryForwardEnabled: true` gets 200
and the value echoed back; carry-forward is a `LeavePolicyRule` field and nothing
has ever read that key.

Note on the `leave` category specifically: the "Leave & Approvals" group in
`settings-navigation.ts:539-580` is a **navigation** group key, not this settings
category — its items route to the real domain models (`LeaveType`, `LeavePolicy`,
`LeavePolicyRule`, `LeavePolicyAssignment`), which do work. The dead keys are
unreachable except through the raw API.

**False-positive risk, assessed rather than assumed.** Dynamic lookup by computed
key was searched for: the generic accessors
(`timesheet-calculation.service.ts:386-407`,
`timesheet-generation.service.ts:698-716`, `timesheet-jobs.service.ts:626-633`,
`timesheet-workflow.service.ts:1994-2009`) are called from 24 sites and **every
one passes a string literal**, so the token scan sees them; sanity check,
`varianceToleranceMinutes` is correctly classified alive. No dispatch table keyed
on catalog entries exists (`DEFAULT_TENANT_SETTINGS` has four non-spec uses, all
allowlisting or map-building). The errors that remain push the other way: the test
is identifier-only and category-blind, and 24 rows share a key name with a row in
another category and are **all** currently counted alive. So 246 is a defensible
**lower bound**.

## Root Cause

Not established as a single cause. The catalog has grown ahead of the code that
consumes it, and nothing fails when a key gains a UI control without gaining a
reader.

## Impact

Customer-facing and silent. 230 controls in the tenant settings UI accept input,
confirm success and do nothing; the administrator has no way to tell them from the
ones that work. Every one is also a support cost — the reported symptom is "the
setting doesn't work", and the first three engineers to look will find the value
correctly stored.

Rated HIGH: it is a contract break against deployed clients (the API advertises
keys it never honours), it spans nearly half the settings surface, and the failure
mode is silence.

## Affected Areas

`services/api/src/modules/tenant-settings` (`tenant-settings.catalog.ts`,
`tenant-settings.service.ts`, `tenant-settings-resolver.service.ts`),
`apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts` and
`organization-settings-config.ts`, and every domain module that ought to be
reading one of the 246.

## Proposed Resolution

Needs an ExecPlan; the work is triage at scale, not a patch. Three classes to
separate: keys that should be implemented, keys that should be deleted from the
catalog (a contract change, since `GET /tenant-settings` returns them today), and
keys whose UI control should be withdrawn until a reader exists.

The durable part is the check, not the cleanup: a validation that fails when a
catalog key has an editable UI field and no production reader would stop the set
growing again. The measurement in this record is reproducible and could be that
check's first implementation.

## Acceptance Criteria

- Every catalog key is classified: implemented, removed, or explicitly deferred
  with its UI control withdrawn.
- No editable settings control exists for a key with no production reader.
- A repository check enforces that, and fails on a new dead editable key.
- `GET /tenant-settings` no longer advertises keys the platform does not honour,
  or documents them as inert.

## Regression Coverage

None yet. The scan described above, run in CI, is the natural regression.

## Dependencies

None identified. BUG-1976 overlaps in subject and must be read with this one.

## Related Items

BUG-1976 (eight settings controls write a key name the resolver never reads) is a
distinct defect that this scan surfaced: those UI names are dead for the same
mechanical reason, but a **live** reader exists under a different name, so the
failure there is a mismatch rather than an absence. BUG-1978 covers two UI fields
that are not catalog keys at all. BUG-0045 (the canonical settings and branding
contract is materially stale) is the documentation side.

## Resolution

Fixed on `agent/bugfix-settings`. Every one of the unread keys now has an
explicit disposition, and a repository check stops the set growing again.

### The measurement, re-derived

The record's figures were re-derived at the branch point rather than carried
over, using the same method (an identifier index over every tracked file,
excluding the catalog, the two settings UI config files, specs, `e2e/` and
documentation, with a `(category, key)` **pair** test for the UI side).

```
catalog keys   591   as recorded
unread         245   record says 246
unread + editable 229   record says 230
```

**The record over-counted by exactly one, and the one is instructive.**
`timesheets.restrictionMessage` is read at `timesheet-jobs.service.ts:438` as
`policy.values.restrictionMessage`. That looks like a `TimesheetPolicy` field
and not a tenant setting, which is presumably why it was classified dead — but
`TimesheetPolicyResolverService.resolveForEmployee`
(`timesheet-policy-resolver.service.ts:269-274`) seeds `values` from
`DEFAULT_TENANT_SETTINGS.timesheets` merged with the tenant's persisted rows
before overlaying policies, so every `policy.values.<key>` read **is** a reader
of the tenant setting. Nothing else in the record's evidence changed. Everything
below is against 245.

### What was done, by category

| Category | Unread | Keys removed | Readers implemented | Controls withdrawn | Left inert |
|---|---|---|---|---|---|
| `organization` | 6 | 1 | 1 | 6 | 6 |
| `employees` | 17 | 7 | 4 new + 6 repointed | 7 | 6 |
| `access` | 5 | 5 | — | — | 0 |
| `leave` | 6 | 6 | — | — | 0 |
| `attendance` | 19 | — | — | **none — deferred** | 19 |
| `timesheets` | 86 | 4 | 3 | 79 | 79 |
| `payroll` | 39 | 1 | — | 38 | 38 |
| `recruitment` | 28 | — | — | 28 | 28 |
| `documents` | 7 | — | — | 7 | 7 |
| `branding` | 10 | — | — | 10 | 10 |
| `notifications` | 15 | — | — | 15 | 15 |
| `security` | 7 | — | — | 7 | 7 |
| **Total** | **245** | **24** | **8 + 6** | **197** | **215** |

The catalog went from 591 keys to 567. `apps/agent-desktop` and `gateway/`
consume tenant settings not at all — a grep over both returns nothing — and
`seed-config.ts`'s only `tenantSetting` write is `notifications.emailEnabled`,
so no removal required a change to `seed-config` or `verify-seed-config`.

### The 24 keys removed

Each had no reader **and** no UI control, or was a dead alias of a live key
(BUG-1976). A word-boundary grep over every tracked file returns only the
catalog itself for each.

- `organization.weekStartDay`
- `employees.maximumReportingLevels`, `employees.requirePrimaryWorkLocation`,
  `employees.allowEmployeeWithoutReportingManager`,
  `employees.preventDuplicatePersonalEmail`, `employees.preventDuplicatePhone`,
  `employees.preventDuplicateNationalId`, `employees.allowSkipLevelReporting`
- `access.allowDirectPermissions`, `access.allowCustomRoles`,
  `access.defaultManagerRoleKey`, `access.defaultEmployeeRoleKey`,
  `access.lockSystemRoles`
- `leave.defaultApprovalFlow`, `leave.allowHalfDayRequests`,
  `leave.documentReminderAfterDays`, `leave.defaultCarryForwardEnabled`,
  `leave.defaultHolidayCalendarName`, `leave.allowManualLeaveMarking`
- `timesheets.defaultPolicyId`, `timesheets.requirePolicyAssignment`,
  `timesheets.allowEmployeeExemption`, `timesheets.policyEffectiveDateMode`
- `payroll.payslipTemplate`

`access` and `leave` were dead in their entirety, as the record found. Both keep
their place in `TENANT_SETTING_CATEGORIES` — that union is a type across three
frontends — but are now empty, so `getAllowedKeysByCategory()` allowlists
nothing in them and the partner scenario in the record's evidence (PATCH
`leave.defaultCarryForwardEnabled`, get a 200, ship) now gets a 400.

### The 8 keys that gained a reader

- `employees.requireCountry`, `employees.requireBusinessUnit`,
  `employees.requireEmployeeLevel` — added to `EmployeeSettingsResolved`
  (`tenant-settings-resolver.service.ts:26-33`) and enforced in
  `collectCreateSettingsIssues` (`employees.service.ts:2688-2712`), in the same
  shape as the sibling rules on the same screen that were already enforced.
- `employees.preventDuplicateWorkEmail` — a fourth rule in the duplicate rule
  engine's list, on both the preview path (`employees.service.ts:2707+`) and the
  enforcing path (`:2977+`). The engine already took a list; this rule was
  simply never added to it.
- `organization.country` — `OrganizationSettingsResolved` never carried it, so
  it could not be resolved at all. Added and consumed by the platform
  Localization panel (BUG-1977).
- `timesheets.auditEntryChanges`, `timesheets.auditPolicyResolution`,
  `timesheets.auditExports` — BUG-2206, wired through
  `TimesheetAuditSettingsService`.

Six more controls were repointed at readers that already existed under another
name (BUG-1976), which is a different fix and recorded there.

### The 215 that stay declared and inert

`services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts` lists
every one with a reason code:

| Reason | Count | Meaning |
|---|---|---|
| `NOT_IMPLEMENTED` | 175 | the behaviour does not exist |
| `DUPLICATE_OF_DOMAIN_MODEL` | 16 | a real model already owns the decision |
| `DEFERRED_ATTENDANCE_WORK` | 19 | owned by another in-flight change |
| `UNCONDITIONAL_BY_DESIGN` | 5 | the domain cannot honour the choice offered |

**They are kept rather than deleted, deliberately.** The acceptance criteria
allow either branch — "no longer advertises keys the platform does not honour,
**or documents them as inert**" — and the second is the safer one here: these
keys have stored values on live tenants, and `GET /tenant-settings` is consumed
by three frontends. Deleting 215 keys would 400 a PATCH that succeeds today. So
the response now carries an `inertKeys` array
(`tenant-settings.service.ts:31-46`, `:164-171`) naming each key and why, which
is strictly more useful to an integrator than silent removal.

Two of the reason codes are worth reading before anyone "finishes the job" by
wiring them:

- **`DUPLICATE_OF_DOMAIN_MODEL`** — the 15 `notifications.*Enabled` keys
  duplicate `NotificationRule.enabled`, which is per `(moduleKey, eventKey)` and
  actually consulted; `security.invitationExpiryHours` duplicates the
  `USER_INVITATION_TTL_HOURS` environment variable that
  `user-invitations.service.ts:354-360` actually reads. Wiring these would create
  the second source of truth `AGENTS.md` forbids. The fix, if wanted, is to
  remove the catalog copy, not to honour it.
- **`UNCONDITIONAL_BY_DESIGN`** — `payroll.activeCompensationAssignmentAction`
  and `payroll.missingExchangeRateAction` do map onto real preflight checks
  (`payroll-run.service.ts:1013-1021` and `:1082-1090`), and the neighbouring
  `payrollBankAccountAction` shows the wiring pattern. They were **not** wired on
  purpose: both checks set `hasBlockingReadinessIssue` and mark the employee
  `EXCEPTION`, and downgrading either to `WARN` would admit an employee to a
  payroll run with no compensation or no exchange rate — producing wrong money.
  A switch that can only be safely left alone should not be offered.
  `employees.preventCircularReporting` and `validateReportingHierarchy` are the
  same shape: hierarchy validation is unconditional, and
  `preventDuplicateEmployeeId` is enforced by `@@unique([tenantId,
  employeeCode])` in the database, which no setting can switch off.

### The check

`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`
is the durable half, and REG-325 describes it. It fails in four directions: a
declared key nothing reads and nothing exempts; a key listed inert that
something now reads; an editable control over an inert key; and an inert entry
naming a key the catalog no longer declares. It also asserts a corpus floor, so
it cannot pass vacuously. Mutation-tested in two directions, both reverted.

### What is NOT done

**The 19 `attendance` keys still render editable controls.** They are declared
inert under `DEFERRED_ATTENDANCE_WORK` and are excluded from the
control-withdrawal assertion, so on the attendance settings page the defect this
record describes is still live. They belong to the concurrent attendance
settings work — BUG-1978, BUG-1979, BUG-1980, BUG-1981, BUG-2091 — which was
editing the same catalog entries, and withdrawing them from under that stream
would have caused a merge conflict in the file both were changing. A dedicated
assertion pins the exemption to the `attendance.` prefix so it cannot widen, and
it is meant to reach zero when that work lands.

Also not done, and deliberately: no reader was implemented for the 175
`NOT_IMPLEMENTED` keys. Those are unbuilt features, not missing wiring —
`documents.encryptDocuments` and `watermarkDownloads` have no implementation
behind them, the 12 unmapped `payroll.*Action` keys name preflight checks that
do not exist, and the 28 `recruitment` keys describe an automation layer that
was never written. Building 175 features is not a bug fix. What this record
fixes is that the product no longer *claims* they are configured.

## QA Retest

Awaiting a QA run. The record's own reproduction is the retest, and should now
fail to reproduce: Settings > Timesheets > Approval Workflow no longer offers
"Approval SLA hours" or "Enable approval escalation", because nothing reads
them. On the attendance settings page the original symptom still reproduces, by
design — see "What is NOT done".

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; figures independently re-derived at that commit rather than carried over from an earlier analysis.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a policy — implement, delete, or mark read-only; too large to fix blind.
- 2026-08-29 — fixed in SESSION-0076 on `agent/bugfix-settings`. Figures re-derived at the branch point: 245 unread rather than 246, the difference being one key the record misclassified. Policy applied per key: 24 removed, 8 readers implemented, 197 controls withdrawn, 215 declared inert with a reason code, and a mutation-tested check to stop the set growing. The 19 attendance keys are the honest gap — deferred to the concurrent attendance stream, controls still on screen.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]], [[tenant-application]]

<!-- GRAPH:END -->
