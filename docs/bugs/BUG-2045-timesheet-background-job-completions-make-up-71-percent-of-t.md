---
ID: BUG-2045
aliases: [BUG-2045]
Title: Timesheet background-job completions make up 71 percent of the tenant audit trail
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/timesheets, services/api/src/modules/audit, services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-308
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2045 — Timesheet background-job completions make up 71 percent of the tenant audit trail

## Summary

Of 305 audit rows on a tenant, **216 are `TIMESHEET_BACKGROUND_JOB_COMPLETED`** —
machine events with no actor decision behind them, generated as a side effect of
61 manual attendance entries. They crowd out the human actions an auditor opens
the log to find.

The product appears to have anticipated this: the tenant settings catalog carries
a **`timesheets.auditBackgroundJobs`** toggle, defaulting to `true`, and the
settings UI renders it as "Audit background jobs". Nothing reads it. The switch
that would answer this complaint already exists on screen and is not wired to
anything.

## Expected Behavior

Either background-job telemetry does not enter the tenant's compliance audit
trail at all — it belongs in an operational log — or the existing
`auditBackgroundJobs` setting governs whether it does, and the audit screen
excludes it by default with a filter to bring it back.

## Actual Behavior

```
TIMESHEET_BACKGROUND_JOB_COMPLETED : 216 of 305 rows   (71%)
attendance.manual_created          :  61
everything else                    :  28
```

3.5 job rows per attendance entry. Combined with the 20-row window of BUG-2043,
the first — and only reachable — page of the audit screen can be entirely
background jobs.

## Reproduction

1. On a tenant workspace, create attendance entries manually (the QA run created
   61).
2. Aggregate `GET /api/audit-logs?pageSize=100` across every page and count rows
   by `action`.
3. Open Settings → Timesheets and find the **Audit background jobs** control. Turn
   it off, save, repeat step 1, and count again: the count is unchanged.

## Evidence

Live, 2026-08-29, production API `949f461c`, DijiPeople Demo tenant: the
distribution above, aggregated over all four API pages.

Code, at `eb457d9d`:

- `services/api/src/modules/timesheets/timesheet-jobs.service.ts:120-129` — the
  emitter. It fires unconditionally on every successful job execution, with
  `sourceModule: 'timesheets'` and the job result as `afterSnapshot`. There is no
  settings lookup on the path.
- `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:386-389` —
  the `timesheets` category declares `auditEntryChanges`,
  `auditPolicyResolution`, `auditExports` and `auditBackgroundJobs`, all
  defaulting to `true`.
- `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts:1546-1549`
  — all four are rendered as tenant-editable controls.
- A repository-wide search for those four key names returns **only** the catalog
  entry and the settings control for each. No reader exists for any of them, so
  all four toggles are inert. They are four of the dead keys counted in BUG-1974.

## Root Cause

Established for the mechanical half: the emitter never consults the setting that
was created to govern it, and no reader for that setting exists anywhere.

The other half is not a defect to root-cause but a decision nobody has recorded:
whether machine events belong in a tenant's *compliance* audit trail at all. The
catalog default of `true` is an assertion that they do, made by whoever added the
key rather than by a product decision, and it has never been exercised because
the key is unread.

## Impact

The tenant audit trail is 71% noise on a tenant with light usage. An auditor
scanning it for human actions must page past machine rows to find them — and,
until BUG-2043 is fixed, cannot page at all, so the audit screen may show nothing
but background jobs.

The volume also scales with attendance activity, which is the highest-frequency
operation in the product. A real tenant will have a far worse ratio than 71%.

No data is wrong and nothing is exposed; this degrades the usefulness of a
compliance surface rather than breaking one.

## Affected Areas

`services/api/src/modules/timesheets` (`timesheet-jobs.service.ts` emitter),
`services/api/src/modules/tenant-settings` (four unread `timesheets.audit*`
keys), the Audit Events screen as the consumer, and any audit export a customer
takes.

## Proposed Resolution

The decision comes first, and it is a genuine one:

1. **Do machine events belong in the tenant audit trail?** If no, route
   `TIMESHEET_BACKGROUND_JOB_COMPLETED` to an operational log
   (`platform-events`, `error-logs` or a job-execution table — `TimesheetJobExecution`
   already records status, result and failure reason, so the audit row may be
   entirely redundant) and drop the audit call.
2. **If yes**, wire `timesheets.auditBackgroundJobs` to the emitter, flip the
   catalog default to `false`, and add a default exclusion plus an explicit
   filter on the Audit Events screen.

Either way, the other three unread `timesheets.audit*` toggles must be resolved
in the same pass — implemented or removed — rather than left as controls that
do nothing.

## Acceptance Criteria

- A decision is recorded (an ADR, or a note on this record) on whether background
  job telemetry belongs in the tenant audit trail.
- No tenant-facing control remains that claims to govern audit behaviour and does
  not.
- On a tenant with routine attendance activity, human actions are findable in the
  audit trail without paging past machine rows.

## Regression Coverage

None yet. Once the decision is made, a service test asserting the emitter
respects `auditBackgroundJobs` — or that it no longer writes to `AuditLog` at all
— is what holds it.

## Dependencies

BUG-2043 — the audit screen cannot demonstrate the improvement while it shows
only 20 rows. BUG-1974 counts these four keys among its dead settings; a policy
decision there may subsume the settings half of this record.

## Related Items

BUG-2044 is the mirror image of this record — the trail is simultaneously missing
the human actions and full of machine ones, and a fixer looking at only one of
them will misjudge how bad the other is. BUG-1974 (dead catalog keys) is where
the four unread `timesheets.audit*` toggles are counted.

## Resolution

Fixed on `agent/web-shell-accessibility`.

**The decision**, taken by the repository owner on 2026-08-29: wire the existing
`timesheets.auditBackgroundJobs` toggle and default it **off**. The audit log is
for actor decisions; a tenant that wants the machine events can ask for them.
That is a deliberate behaviour change for existing tenants on upgrade rather than
an accident of the default, and it is the reason the choice was put rather than
assumed.

`TimesheetJobsService` now reads the setting before writing the completion audit
row. The reader fails closed: a settings lookup that throws logs a warning and
skips the audit row rather than losing a background job that completed
successfully.

**The default here is `false` while the catalog still declares `true`**, and that
is not an inconsistency to tidy away. The catalog value is what an unconfigured
tenant is *shown*; changing it is a settings-catalog migration with its own
consequences. Until that lands, the reader treats "not explicitly enabled" as
off, which is the decided behaviour. The code says so at the point it matters.

**Not fixed, and the more interesting half.** Three sibling toggles in the same
category are also read by nothing: `auditEntryChanges`, `auditPolicyResolution`
and `auditExports`. They render on screen exactly as this one did. Only
`auditBackgroundJobs` was in scope for this record; the other three are recorded
in ITEM-0114 rather than silently left.


## QA Retest

Retested by the regression suite: five assertions in `timesheet-job-audit.spec.ts`
pass, covering on, off, unset and a settings-read failure, plus that the read is
scoped to the calling tenant.

**Not retested live.** The audit-row counts in this record came from a production
tenant and have not been re-measured; what is established is that the toggle now
governs the write. Re-measuring after this ships is the honest confirmation, and
it needs the release.


## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — while filing, the `timesheets.auditBackgroundJobs` setting was found to exist, to be rendered as a tenant control, and to have no reader. That was not in the QA observation and narrows the decision: the intended control is already designed and unwired.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — decide whether background-job telemetry belongs in the tenant audit trail at all.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[audit-and-events]], [[settings]]
- Regression — REG-308 (see the regression register)

<!-- GRAPH:END -->
