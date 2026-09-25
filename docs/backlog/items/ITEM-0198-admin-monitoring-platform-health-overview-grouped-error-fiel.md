---
ID: ITEM-0198
aliases: [ITEM-0198]
Title: Admin monitoring: platform health overview, grouped error fields, module facet and incident-first layout
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/admin, services/api/src/modules/error-logs, services/api/src/modules/platform-monitoring]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: TASK-0032
TargetMilestone: 
BlockedBy: 
---

# ITEM-0198 — Admin monitoring: platform health overview, grouped error fields, module facet and incident-first layout

## Summary

`apps/admin`'s monitoring surface (Overview / Incidents-Errors / Events /
Integrations tabs) is functionally solid for a single occurrence of an error,
but is missing four specific things a real "is the platform healthy"
operator view needs: a health-overview tile for API/DB/jobs/auth/storage/
queue, occurrence/grouping data surfaced in the incidents table (the backend
already computes it), a module-level facet on errors (only `sourceApp` and
`errorCode`-substring exist today), and discoverability of the real
provisioning-stuck queue that already exists but isn't linked from
`MonitoringNav`.

## Why It Matters

An operator today cannot answer "is anything broken right now, in one
glance" without opening multiple tabs and reading raw error codes — there is
no health tile for the six systems (API/DB/jobs/auth/storage/queue) a
platform-ops surface would normally lead with, and the Integrations tab only
covers Stripe + a static "review" card for email. The backend already
computes real deduplication data (`ErrorLog.occurrenceCount`, `firstSeenAt`,
`lastSeenAt`, `fingerprint`) that the incidents table simply does not render,
so a support agent cannot currently see "this has happened 500 times since
08:00" — only the latest occurrence's fields. And the real,
non-fabricated provisioning-stuck queue at `/operations/provisioning` is
invisible from the monitoring nav an operator would actually be using.

## Evidence

- `apps/admin/app/(internal)/settings/monitoring/integrations/page.tsx` — two
  static cards (Stripe, email); no queue depth, DB health, auth service
  health or storage health tile exists anywhere in the admin app — confirmed
  by absence of any such widget across all four monitoring tabs and the
  dashboard.
- `error-logs-table.tsx:39-65` (`PlatformErrorEvent` type) does not include
  `occurrenceCount`/`firstSeenAt`/`lastSeenAt`/`fingerprint`, even though
  `ErrorLogsService.persist()` (`error-logs.service.ts:76-183`) already
  computes and stores all four via `incidentFingerprint()` (lines 456-480)
  and an upsert-by-fingerprint. `getEvent()`
  (`platform-monitoring.service.ts:162-191`) does not add them either.
- Grouping today is by `sourceApp` (web/admin/api) and `category` (=
  `errorCode` substring match) — not by backend module (`employees`,
  `payroll`, etc.). `sourceModule` exists on `AuditLog`/`PlatformAuditLog` but
  is essentially unpopulated (see [[BUG-3227]]) and isn't a column on
  `ErrorLog` at all.
- `apps/admin/app/(internal)/operations/provisioning/page.tsx` +
  `provisioning-queue.tsx` — a real, working queue (confirmed non-fabricated
  by its own header comment), fed by `GET /platform/tenants/provisioning-queue`,
  but **not linked from `MonitoringNav`**
  (`apps/admin/app/_components/monitoring/monitoring-nav.tsx`).
- [[BUG-3227]] (DEFERRED) — `AuditLog`/`PlatformAuditLog` carry
  `requestId`/`traceId`/`sourceModule` columns but no call site populates
  them, which blocks an "error detail → related audit event" join even after
  a module facet exists.
- `apps/admin/app/(internal)/settings/monitoring/monitoring-overview.tsx` is
  already a genuinely good "is anything on fire" band (documented in its own
  header comment as a deliberate redesign that dropped decorative,
  action-less counters) — the target design extends this pattern rather than
  replacing it.

## Proposed Approach

Four independently shippable pieces, all extending existing mechanisms per
`AGENTS.md` principle 2 (extend, don't build competing infrastructure):

1. **Health-overview tile**: a new Integrations-tab (or Overview-tab) card
   summarizing API/DB/jobs/auth/storage/queue status. DB/API health can reuse
   whatever the API already exposes for its own liveness (confirm during
   implementation); job/queue health reads `PlatformEvent.result = FAILED`
   aggregates (already real data, see [[ITEM-0199]]'s dashboard-metrics
   sibling finding).
2. **Occurrence/grouping in the UI**: add `occurrenceCount`, `firstSeenAt`,
   `lastSeenAt` to `PlatformErrorEvent` and `getEvent()`'s response, and
   render them in `error-logs-table.tsx` (extend the existing `ProDataTable`
   columns and detail panel — do not build a new table).
3. **Module facet**: add a `sourceModule` column to `ErrorLog`, populated at
   throw time (likely from the error catalog's module ownership or the
   route's controller module), and add it as a filter alongside the existing
   `search/severity/status/sourceApp/...` filters in
   `platform-monitoring.service.ts`.
4. **Link the provisioning queue** from `MonitoringNav` as a fifth tab or a
   prominent cross-link.
No ExecPlan needed for (2) and (4) — additive UI/DTO changes. (1) and (3) are
scoped small (a new nullable column, a new small aggregation), but (3) is a
schema change and should be raised to the Architect as to whether it needs a
short ExecPlan under `PLANS.md`'s destructive/schema-change criteria (it is
additive/nullable, so likely not, but the call belongs to whoever implements
it).

## Acceptance Criteria

- The Integrations tab (or Overview) shows a status tile for each of
  API/DB/jobs/auth/storage/queue.
- The incidents table shows occurrence count and first/last-seen for each
  grouped error.
- Errors can be filtered by a module facet, not just `sourceApp`/`errorCode`.
- `/operations/provisioning` is reachable from `MonitoringNav`.

## Dependencies

None blocking; [[BUG-3227]] should land before or alongside the module-facet
work if "related audit event" joining is also wanted in the same pass (not
required for the module facet itself).

## Related Items

- [[BUG-3227]] — trace-id-to-audit-log wiring gap, relevant to a future
  "related audit event" join but not blocking this item's four pieces.
- [[BUG-3183]] — a specific alert-delivery defect in the same monitoring
  area (`logger.log` below production log level), unrelated to this item's
  scope but in the same module family.
- [[ITEM-0199]] — the sibling dashboard-metrics item; both draw on the same
  `ErrorLog`/`PlatformEvent` real data sources.
- TASK-0032 — the program that found this.

## Resolution

Built by TASK-0032 WP-06 on `agent/pah-wp06-monitoring` (merged as
`9abb01f4`): a new health-overview endpoint/service (REG-580) reports
API/DB/jobs/auth/storage/email status from real, time-boxed probes — a
timeout reports `UNKNOWN` (never `OK` or a fabricated `DOWN`), and the
notification queue is honestly `UNKNOWN`/excluded from the overall vote rather
than shown green. `ErrorLog.module` is now derived and written on both the
create and update branches (REG-577, REG-584), with two-segment derivation for
the `platform`/`super-admin`/`settings` umbrella prefixes so unrelated
features don't collapse into one bucket. Module and correlation-id filters
reach the real `where` clause with database-side pagination intact (REG-581).
An incident's detail view now returns related occurrences, related audit
events (tenant and platform, requires REG-578's traceId propagation) and
related outbox events, the latter redacted (REG-582, REG-583).

## QA Retest

Verified by the passing `platform-health.service.spec.ts`,
`platform-monitoring-list-filters.spec.ts`, `derive-error-module.spec.ts` and
`error-logs.service.spec.ts`; no regression observed during TASK-0032 WP-09
live QA of the admin monitoring, error-logs and audit-trail screens.

## History

- 2026-09-25 — created at `75fec5b9`; discovery stream D4.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).
- 2026-09-25 — built on `agent/pah-wp06-monitoring` (WP-06, merged
  `9abb01f4`); verified by regression suite and WP-09 live QA; Architect
  disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]

<!-- GRAPH:END -->
