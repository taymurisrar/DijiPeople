---
ID: BUG-1974
aliases: [BUG-1974]
Title: 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: REG-325
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; figures independently re-derived at that commit rather than carried over from an earlier analysis.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a policy — implement, delete, or mark read-only; too large to fix blind.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]], [[tenant-application]]

<!-- GRAPH:END -->
