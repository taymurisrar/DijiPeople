---
ID: BUG-2046
aliases: [BUG-2046]
Title: Audit actions use two naming conventions and the Result column is populated only by login events
Status: OPEN
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/audit]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2046 — Audit actions use two naming conventions and the Result column is populated only by login events

## Summary

The `action` column of the tenant audit log carries two naming conventions at
once — `SCREAMING_SNAKE` and `dot.lower_snake` — with no mapping layer between
them. 18 distinct actions were observed on one tenant, split across both. Anyone
filtering, alerting or exporting on `action` has to know which convention each
module happened to use.

Separately, the **Result** column of the Audit Events screen is empty for every
row except `auth.login.succeeded`. That is not a display bug: `result` is not a
column on `AuditLog` at all. It is scraped out of the `afterSnapshot` JSON by key
name, and only the auth module puts it there — along with four other columns the
screen offers.

## Expected Behavior

One naming convention for audit actions, declared in one place, so a consumer can
predict an action name rather than discover it. Columns the audit screen offers
are either populated by every writer or are not offered.

## Actual Behavior

Two conventions, observed live:

```
SCREAMING_SNAKE   LEAVE_REQUEST_APPROVED · TENANT_SETTINGS_UPDATED ·
                  APPROVAL_MATRIX_UPDATED · EMPLOYEE_LEVEL_CREATED ·
                  USER_INVITATION_CREATED · EMPLOYEE_SYSTEM_ACCESS_PROVISIONED ·
                  TIMESHEET_BACKGROUND_JOB_COMPLETED · STRIPE_INVOICE_PAID · …

dot.lower_snake   attendance.manual_created · attendance.deleted ·
                  project.create · project.update · auth.login.succeeded
```

Note that the dotted set is not even internally consistent: `project.create`
against `attendance.manual_created` mixes tense as well as convention.

The **Result** column is blank on every row but `auth.login.succeeded`, which
carries `SUCCESS`.

## Reproduction

1. Aggregate `GET /api/audit-logs?pageSize=100` across every page for a tenant
   with varied activity.
2. Collect the distinct values of `action`. Both conventions are present.
3. Open `/settings/audit-compliance/history/audit-events` and read the **Result**
   column: populated only for login rows.

## Evidence

Live, 2026-08-29, production API `949f461c`, DijiPeople Demo tenant: 18 distinct
actions across 305 rows, as listed above.

Code, at `eb457d9d`:

- There is **no action catalog**. Every `auditService.log()` call site passes a
  string literal, so the convention is whatever the author of that module chose.
  Compare `services/api/src/modules/leave/leave.service.ts:1631`
  (`LEAVE_REQUEST_APPROVED`) with
  `services/api/src/modules/attendance/attendance.service.ts:1162`
  (`attendance.manual_created`) — 82 non-test files under
  `services/api/src/modules/` reference `AuditService` and nothing constrains
  what they pass.
- `services/api/prisma/schema.prisma:10410-10436` — `AuditLog` has columns
  `action`, `entityType`, `entityId`, `requestId`, `traceId`, `sourceModule`,
  `scope`, `beforeSnapshot`, `afterSnapshot`. **There is no `result` column**,
  and none for `ipAddress`, `appClientId`, `sessionId`, `failureReason`,
  `userAgent` or `mfaResult`.
- `services/api/src/modules/audit/audit.service.ts:203-209` — the API projects
  all seven of those fields by reading them out of `afterSnapshot` by key:
  `result: readSnapshotString(item.afterSnapshot, 'result')`, and the same for
  the rest.
- `services/api/src/modules/auth/auth.service.ts:296, 329, 377, 1225, 1255` — the
  auth module is the writer that puts `result` (and the client fields) into its
  snapshots, which is why its rows are the only populated ones.
- `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts:6584-6642`
  — the Audit Events adapter offers Result, Failure Reason, IP Address, App
  Client and Session ID as columns, all of which are therefore blank for every
  non-auth row.

The QA observation named only **Result**. The code shows the same mechanism
empties four more columns; that broadening is from code reading, not from the
live run.

## Root Cause

Established. Audit action names are free-form string literals, spread across 82
services with no shared catalog, so two conventions coexist by accident. The audit item
projection invents fields that the schema does not have by scraping
`afterSnapshot` for well-known keys — a convention only the auth module follows,
because only the auth module knew about it.

## Impact

Consumption, not correctness. Filtering by `action`, building an alert, or
handing a customer an audit export all require knowing per-module which
convention was used. The blank columns make the export look like data is missing
rather than never captured.

Recorded as `LOW`: the severity scale's LOW rung covers naming and consistency,
and nothing here is wrong, unsafe or unreachable. The QA log rated it
"LOW-MEDIUM"; the scale has no intermediate rung and the failure is consistency,
so LOW with P3 is the honest placement.

## Affected Areas

`services/api/src/modules/audit` (the item projection and the absent catalog),
every module that calls `AuditService.log()`, the Audit Events screen and its
column set, and any audit export.

## Proposed Resolution

Needs a plan; the migration is the hard part, not the choice.

1. Pick one convention and declare the action names in a catalog under
   `services/api/src/common/constants/`, in the shape of the existing error
   catalog, so a call site names a constant rather than a literal.
2. Decide what happens to existing rows — a data migration rewriting historical
   `action` values rewrites an audit trail, which is exactly the thing an audit
   trail must not do. A mapping layer at read time is likely the correct answer
   and should be stated as such.
3. Decide whether `result` and the client fields become real columns or the
   screen stops offering them. If they become columns, the snapshot-scraping in
   the projection goes away.

## Acceptance Criteria

- Audit action names come from one declared catalog, and a new literal at a call
  site fails a test or lint rule.
- One convention is used for every new action.
- Historical rows remain readable and are not rewritten in place.
- Every column the Audit Events screen offers is either populated by all writers
  or removed.

## Regression Coverage

None yet. A test asserting every `action` string emitted in the API matches one
declared catalog entry would fail today, and is the check that keeps the
convention once chosen.

## Dependencies

None blocking. Overlaps BUG-2044, which will add new action names — those should
be named under whatever convention this record settles, so the two are best
sequenced together.

## Related Items

BUG-2044 (no employee lifecycle event is audited) and BUG-2045 (background-job
rows dominate the trail) come from the same audit sweep. BUG-2043 is the screen
that displays all of this.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — while filing, the empty Result column was traced to `AuditLog` having no such column: the field is scraped from `afterSnapshot` and only the auth module writes it. Four further columns are empty for the same reason.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — pick one convention and migrate; it touches every module and every existing row.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[audit-and-events]]

<!-- GRAPH:END -->
