---
ID: ITEM-0199
aliases: [ITEM-0199]
Title: Admin dashboard: operational metrics for logins, MFA adoption, error rate, job failures, partner funnel and agreements
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/admin, services/api/src/modules/super-admin]
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

# ITEM-0199 — Admin dashboard: operational metrics for logins, MFA adoption, error rate, job failures, partner funnel and agreements

## Summary

`SuperAdminService.getDashboardSummary()` is a large, genuinely
real-data `Promise.all` of ~40 Prisma queries (no fabricated metrics found),
and its 9 role-scoped dashboard views already cover tenants, customers,
subscriptions, invoices, payments, leads, partners, contracts, support cases
and commissions well. It has no metrics at all for logins/failed logins, MFA
adoption, error rate, or job/queue failure rate — despite `ErrorLog` and
`PlatformEvent.result` already existing as real data sources for exactly
those, and despite the "platform-administration" dashboard view's own
description mentioning "security."

## Why It Matters

The `platform-administration` view is the one the top operator tier
(`SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN`) lands on, and its own stated
scope includes security — but it shows nothing about login activity,
failed-login volume, or (once [[ITEM-0197]] ships) MFA adoption. There is
also no error-rate trend (only a point-in-time `supportStatus` breakdown) and
no job/queue-failure metric, even though `PlatformEvent.result = FAILED`
counts already exist and are simply never aggregated into a dashboard tile.
This leaves the platform's own leadership/ops view blind to exactly the
signals a security- and reliability-conscious dashboard should lead with.

## Evidence

- `services/api/src/modules/super-admin/super-admin.service.ts:333`
  (`getDashboardSummary`) — confirmed real Prisma-backed metrics for tenants,
  customers, subscriptions, invoices, payments (Stripe-backed), leads/partner
  leads, partners, partner onboarding, contracts/signature requests, support
  cases, commissions, and revenue/lead/collections trend series
  (`addPeriodComparisons`).
- **Confirmed NOT present** anywhere in the dashboard or its 9 role-scoped
  views (`DASHBOARD_VIEWS`, `apps/admin/lib/runtime/platform-module-registry.ts:714-800`):
  no login/failed-login metric (no grep hit for a login-audit aggregate
  anywhere in `super-admin.service.ts`); no error-rate calculation (only the
  point-in-time `errorLog.groupBy({ by: ['supportStatus'] })` breakdown
  exists); no job/queue-failure metric (`PlatformEvent.result = FAILED`
  counts are not aggregated into any tile); no pending-invitations aggregate.
- `apps/admin/package.json` has no charting library installed (no `recharts`,
  `chart.js`, `d3`, `victory`, `nivo`, `visx`); all "charts" in
  `platform-dashboard.tsx` (1685 lines) are hand-rolled CSS-width bars
  (`BreakdownChart` line 1432, `TrendChart` line 1489) with no tooltip or
  interaction.
- `errorLog.groupBy({ by: ['supportStatus'] })` already feeds the
  "system-health" view's incident breakdown, reusing the exact `ErrorLog`
  table the monitoring queue uses ([[ITEM-0198]]), so a new error-rate tile
  cannot disagree with the monitoring queue by construction if built the same
  way.

## Proposed Approach

Add new tiles to the existing dashboard-widget registry
(`buildDashboardWidgets()`/`DashboardWidget()`,
`platform-dashboard.tsx:470,554`) — this is a registry of entries, not a
framework to build:

1. **Logins/failed logins**: requires a login-audit aggregate. `logTenantAuthEvent`
   already writes `AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED`
   through `AuditService` — a new query grouping these by day/tenant would
   populate this tile with no new write path needed.
2. **MFA adoption**: depends on [[ITEM-0197]] (TOTP MFA) shipping first —
   `User.mfaEnabled`/`PlatformUser.mfaEnabled` would be the source columns.
   Sequence this tile after that item.
3. **Error rate**: extend the existing `ErrorLog` aggregation with a
   time-bucketed rate (errors per period), reusing the same table
   [[ITEM-0198]]'s monitoring queue reads, so the two surfaces cannot diverge.
4. **Job/queue failure rate**: aggregate `PlatformEvent.result = FAILED`
   over the selected range — the field already exists and is simply unread by
   any dashboard tile today.
5. Charting: continue the hand-rolled CSS-bar approach already established
   (`BreakdownChart`/`TrendChart`) rather than adding a charting library
   dependency, unless the Architect decides a real chart library is justified
   — per `AGENTS.md`, do not add a dependency without justification recorded.
No ExecPlan needed for (1), (3), (4) — new read-only aggregation queries and
registry entries, no schema change. (2) is blocked on [[ITEM-0197]]'s schema
change landing first.

## Acceptance Criteria

- The `platform-administration` (or `system-health`) dashboard view shows a
  login/failed-login metric.
- An error-rate trend tile exists, sourced from the same `ErrorLog` data the
  monitoring queue uses.
- A job/queue-failure-rate tile exists, sourced from `PlatformEvent.result`.
- MFA adoption tile ships once [[ITEM-0197]] provides the underlying columns.

## Dependencies

MFA-adoption tile is blocked by [[ITEM-0197]] (TOTP MFA) shipping the
`mfaEnabled` columns it reads. The other three tiles have no dependency.

## Related Items

- [[ITEM-0197]] — TOTP MFA; this item's MFA-adoption tile depends on it.
- [[ITEM-0198]] — the sibling monitoring-UX item; both draw on `ErrorLog`/
  `PlatformEvent` as real data sources and should stay consistent with each
  other.
- TASK-0032 — the program that found this.

## Resolution

Built by TASK-0032 WP-07 on `agent/pah-wp07-dashboard` (commit `11c74257`,
merged as `c6fb718d`): a new `OperationsDashboardService` adds
logins/failed-logins, MFA adoption (now that [[ITEM-0197]] shipped the
`mfaEnabled` columns), error rate and job/queue-failure-rate tiles, plus a
partner-funnel and agreements breakdown. Each of the five sections computes
independently (REG-585) so one failing section (e.g. a slow `partner.groupBy`)
never blanks the other four; a metric with no reliable source reports "not
available" with a reason, never a fabricated zero (REG-586); the admin page
fetches the new endpoint independently of the existing commercial summary so
a failure there cannot blank the whole dashboard either (REG-587).

## QA Retest

Verified by the passing `operations-dashboard.service.spec.ts` (18/18) and
`operations-dashboard-metrics.spec.ts`; no regression observed during
TASK-0032 WP-09 live QA of the admin dashboard screen.

## History

- 2026-09-25 — created at `75fec5b9`; discovery stream D4 §4.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032); MFA-adoption tile
  sequenced after [[ITEM-0197]].
- 2026-09-25 — built on `agent/pah-wp07-dashboard` (WP-07, commit `11c74257`,
  merged `c6fb718d`); verified by regression suite and WP-09 live QA;
  Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]

<!-- GRAPH:END -->
