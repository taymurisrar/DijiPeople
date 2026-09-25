---
ID: BUG-3564
aliases: [BUG-3564]
Title: The platform audit trail is write-only: no screen or endpoint can read PlatformAuditLog
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 10d5d148
AffectedModules: [services/api/src/modules/audit, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-602
RelatedBacklogItem:
RelatedDecision: ADR-0018
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3564 — The platform audit trail is write-only: no screen or endpoint can read PlatformAuditLog

## Summary

Platform operations write audit rows to `PlatformAuditLog`, but nothing in the API reads that table. The only audit read route, `GET /audit-logs`, queries the tenant `AuditLog` table by the caller's `tenantId`, and a platform user's `tenantId` is the literal `platform`, so even a Super Admin gets an empty page. Every platform action is recorded and none can be inspected in the product.

## Expected Behavior

A platform user with monitoring or audit read permission can list and filter the platform audit trail (actor, action, entity, time, trace id) and see the before/after snapshot of a change; a record screen can show its own audit history.

## Actual Behavior

`GET /audit-logs` as SUPER_ADMIN returns 200 with no rows. No other endpoint reads `PlatformAuditLog`.

## Reproduction

1. On a local stack, log in to admin as SUPER_ADMIN.
2. Edit a lead or a customer through the admin UI (writes a PlatformAuditLog row).
3. Call `GET /api/audit-logs` with the admin token: 200, empty list.
4. `grep -rn "platformAuditLog\." services/api/src` finds only `.create(` calls.

## Evidence

- WP-08 live CRUD harness run on 2026-09-25 against the throwaway stack at `10d5d148` (TASK-0032-streams/WP-08-report.md, finding 1): the Audit column of the CRUD matrix could not be verified for any module.
- `services/api/src/modules/audit` — no `platformAuditLog.findMany/count` anywhere in `services/api/src` (grep at `c6fb718d`).

## Root Cause

The platform audit table was introduced as a write target (`AuditService.log` routes `tenantId: 'platform'` rows there) without a matching read path; the existing reader was written for tenant audit only.

## Impact

Auditability of every platform administrator action — tenant edits, role changes, partner and agreement changes, MFA resets — exists only in the database. Operators and auditors cannot review it; incident investigation cannot correlate a failure with the change that preceded it.

## Affected Areas

- `services/api/src/modules/audit` (read endpoint)
- `apps/admin` monitoring / audit screen and record timelines

## Proposed Resolution

Add a platform-guarded read endpoint over `PlatformAuditLog` (list with filters: actor, action, entity type/id, date range, trace id; detail with snapshots, redacted) and an admin screen, linked from monitoring error detail by trace id. Part of TASK-0032 (EXECPLAN-0051).

## Acceptance Criteria

- A SUPER_ADMIN sees the audit row for a tenant profile edit within the admin app.
- A role without audit read permission is refused.
- A tenant user can never reach the platform audit trail.
- Snapshots never expose secrets.

## Regression Coverage

REG-602 (`AuditService.listPlatform`/`detailPlatform` and their repository
methods did not exist before this package — `platform-audit-trail.spec.ts`),
REG-603 (`GET /audit-logs` refuses a platform caller instead of an empty page
— `audit.controller.spec.ts`), REG-604 (the reader's authorization boundary is
pinned — `platform-audit-authorization.spec.ts`), REG-605 (a trace-id filter
and a free-text search cannot silently overwrite each other), REG-606
(snapshot redaction is re-applied on read, not trusted from write time),
REG-607/REG-608 (the two bulk-delete admin-tier gaps this same WP-10 package
closed, found as a WP-02 follow-up), REG-609 (server-side pagination proven by
inspecting the actual Prisma call arguments). All proven to fail against the
pre-fix code by temporary revert.

## Dependencies

None.

## Related Items

[[BUG-3544]], [[BUG-3231]], [[BUG-3551]], [[TASK-0032]]

## Resolution

Fixed on `agent/pah-wp10-audit-trail` (TASK-0032 WP-10, merged as `3dccd1e6`)
across three commits: `1712e957` adds `AuditService.listPlatform`/
`detailPlatform`, the backing repository methods and `PlatformAuditController`
(`GET /platform/audit-logs`, `:id`, guarded by `monitoring.read`); `cac4a93c`
closes the WP-02-documented bulk-delete admin-tier gap
(`bulkDeleteCustomers`/`bulkDeleteCustomerOnboardings` now share
`isPlatformAdminTier` with the runtime delete path); `7e625f14` wires the
admin UI (audit trail nav entry, and a "View in audit trail" link from a
monitoring incident filtered by its trace id). `GET /audit-logs` now refuses a
platform caller with `PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT` instead of
answering with a silent empty page.

## QA Retest

Verified by the passing `platform-audit-trail.spec.ts`,
`audit.controller.spec.ts`, `platform-audit-authorization.spec.ts`,
`bulk-delete-admin-tier.spec.ts` and the admin-side
`audit-trail-nav.spec.ts`/`audit-trail-link.spec.ts`; no regression observed
during TASK-0032 WP-09 live QA of the admin monitoring screens.

## History

- 2026-09-25 — created from qa run at `c6fb718d`.
- 2026-09-25 — fixed on `agent/pah-wp10-audit-trail` (WP-10, commits
  `1712e957`/`cac4a93c`/`7e625f14`, merged `3dccd1e6`); verified by regression
  suite and WP-09 live QA; Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[audit-and-events]], [[platform-admin]]
- Regression — REG-602 (see the regression register)

<!-- GRAPH:END -->
