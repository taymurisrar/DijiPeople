---
ID: BUG-2206
aliases: [BUG-2206]
Title: Three timesheet audit toggles render on screen and are read by nothing
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: REVIEWER
DetectedDate: 2026-08-29
DetectedInSha: f2d367d0
AffectedModules: [services/api/src/modules/timesheets, services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-328
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2206 — Three timesheet audit toggles render on screen and are read by nothing

## Summary

The `timesheets` settings category declares four audit toggles. All four render
in Settings as live checkboxes. **Nothing reads three of them.**

```
auditEntryChanges        rendered — read by nothing
auditPolicyResolution    rendered — read by nothing
auditExports             rendered — read by nothing
auditBackgroundJobs      wired 2026-08-29 by BUG-2045
```

Found while fixing BUG-2045, which was the fourth. That record described the
noise one unwired toggle caused; this one records that the same toggle was not
alone, so the class is closed rather than one instance of it.


## Expected Behavior

An administrator who turns off "Audit entry changes", "Audit policy resolution"
or "Audit exports" sees fewer audit rows of that kind. A control that is rendered
and saved either governs something or is not rendered.


## Actual Behavior

The setting saves, the UI reflects the new value, the audit behaviour is
unchanged. There is no error and nothing on screen suggests the control is
inert.


## Reproduction

Static, and complete — the absence of a reader is proved by there being no
reference at all:

```
grep -rn "auditEntryChanges\|auditExports\|auditPolicyResolution" \
  --include=*.ts services/api/src | grep -v catalog
(no output)
```

The three keys appear only in `tenant-settings.catalog.ts` (their declaration)
and in `apps/web/.../settings-page-config.ts` (their rendering).


## Evidence

- `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts` — all
  four keys declared, defaulting to `true`.
- `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts` — all four
  rendered as timesheet fields.
- No consumer anywhere in `services/api/src` for three of them, by the grep
  above.
- `auditBackgroundJobs` is now read in `timesheet-jobs.service.ts` — the shape
  the other three need.


## Root Cause

The settings catalog and the code that would honour it are separate, and nothing
requires a declared key to have a reader. A key can be added, rendered, saved,
audited and reviewed without one.

This is the same class as BUG-2015 (a permission key nothing enforced), BUG-0669
(a validation DTO nothing referenced) and BUG-2045 itself: **a control that
exists, reads as an assurance, and is connected to nothing.** The catalog makes
it particularly easy, because declaring the key is the visible work and wiring it
is invisible by omission.


## Impact

Lower than BUG-2045 in volume — these three do not generate the 71% of audit rows
that background jobs did — but identical in kind. An administrator who turns one
off believes they have changed what is recorded, and has not. For an audit
control specifically, believing you have narrowed what is captured when you have
not is the wrong direction to be wrong in.

MEDIUM rather than HIGH: nothing is lost or exposed, and the failure is that a
preference is ignored.


## Affected Areas

Modules, endpoints, screens and consumers.

## Proposed Resolution

Wire the three, following `shouldAuditBackgroundJobs` in
`timesheet-jobs.service.ts`: read the category, treat "not explicitly enabled" as
the decided default, fail closed on a read error, and cover it with the shape of
`timesheet-job-audit.spec.ts`.

**Decide the default per toggle rather than by analogy.** `auditBackgroundJobs`
was defaulted off because machine events crowd out actor decisions. The other
three record *human* actions — entry changes, policy resolution, exports — and
the same reasoning points the other way. That is a question for the repository
owner, not a pattern to copy.

Worth considering separately, and larger than this record: a check that every
catalog key has a reader, or an explicit `rendered-only` marker for the ones that
legitimately do not. Four instances of this class are now on the register.


## Acceptance Criteria

- Turning each of the three off changes what is audited.
- Each has a test asserting on, off and unset.
- The default for each is a recorded decision rather than inherited from
  BUG-2045.


## Regression Coverage

None yet. REG-308 covers `auditBackgroundJobs` only, and deliberately says so.


## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

[[BUG-2045]] is the toggle that was wired and how this was found. [[BUG-2015]]
and [[BUG-0669]] are the same class in permissions and validation. REG-308 is the
guard for the one that is done.


## Resolution

Fixed on `agent/bugfix-settings`. The premise held: at the branch point the grep
in Reproduction still returned nothing for all three keys.

**One reader, three toggles.**
`services/api/src/modules/timesheets/timesheet-audit-settings.service.ts` — a new
`TimesheetAuditSettingsService` with a single `shouldAudit(tenantId, toggle)`.
It reads the `timesheets` category through
`TenantSettingsService.getTenantSettingsCategory`, the same accessor
`shouldAuditBackgroundJobs` uses, so the value goes through the existing settings
cache rather than a second read path. It also coerces a stored string `"false"`,
because `TenantSetting.value` is `Json` and the generic PATCH endpoint could have
stored one.

**The default is decided per toggle, not copied.** All three default **on**, and
the reader fails **open** on a settings read error — the deliberate inverse of
`auditBackgroundJobs`, which defaults off and fails closed. The reasoning is in
the file's header comment: background jobs are machine events that crowd out
actor decisions, while these three record human actions — an entry change, a
policy decision, an export of other people's hours. Losing an actor's audit row
to a settings blip is the worse of the two mistakes. On for an unconfigured
tenant also means no existing tenant's audit trail changes on upgrade, which is
the opposite of the BUG-2045 situation where quieting the log *was* the point.

**The three call sites, each a single choke point:**

| Toggle | Gated at | Rows it governs |
|---|---|---|
| `auditEntryChanges` | `timesheets.service.ts:1868-1895` (`auditTimesheet`) | `Timesheet` before/after rows for an actor's change |
| `auditPolicyResolution` | `timesheet-policy-resolver.service.ts:84-99` (`shouldAuditPolicyResolution`), applied at `:164`, `:231` and `:250` | `TIMESHEET_POLICY_CREATED`, `TIMESHEET_POLICY_VERSION_CREATED`, `TIMESHEET_POLICY_DISABLED` |
| `auditExports` | `timesheet-export.service.ts:554-581` (`auditExport`) | who exported whose hours, with which filters |

`auditTimesheet` and `auditExport` became `async`; every existing caller already
awaited them, so no call site changed.

**On `auditPolicyResolution` specifically.** It gates the policy *lifecycle* rows
rather than emitting a new row per resolution. The record's Expected Behavior is
"sees fewer audit rows of that kind", so the toggle suppresses rows that exist;
auditing every `GET /timesheet-policies/preview` would have added volume rather
than removed it, which is the failure BUG-2045 was about.

**Coverage.**
`services/api/src/modules/timesheets/timesheet-audit-settings.service.spec.ts` —
on, off, and unset for each of the three, as the acceptance criteria require,
plus the fail-open path, the string-`"false"` case, and a tenant-isolation
assertion that the category read is scoped to the calling tenant. The `off` case
is the one that fails against the old code.

Two existing specs construct the touched services positionally and were updated
for the new dependency: `timesheet-export.service.spec.ts` and
`timesheet-policy-resolver.service.spec.ts`.

The wider class the record asks about — a check that every catalog key has a
reader — is implemented under BUG-1974 on the same branch.

## QA Retest

Awaiting a QA run. Each toggle is checkable from Settings > Timesheets > Audit:
turn one off, perform the corresponding action, and confirm no new audit row of
that kind appears.

## History

- 2026-08-29 — created from qa run at `f2d367d0`.
- 2026-08-29 — fixed in SESSION-0076 on `agent/bugfix-settings`, alongside BUG-1974, which covers the same class at catalog scale. Defaults decided on the record's own reasoning rather than inherited from BUG-2045: all three on, failing open.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]], [[tenant-application]]
- Regression — REG-328 (see the regression register)

<!-- GRAPH:END -->
