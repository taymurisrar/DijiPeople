---
ID: ITEM-0126
aliases: [ITEM-0126]
Title: Decide which of the 41 always-visible settings pages should be sold
Type: PRODUCT_DECISION
Status: DONE
Priority: P1
Severity: 
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
RelatedBug: BUG-2958
RelatedQA: 
RelatedADR: ADR-0005
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0126 — Decide which of the 41 always-visible settings pages should be sold

## Summary

[[BUG-2958]] made settings visibility follow the tenant's plan. It can only do
that for pages a capability key exists for. There are thirteen keys and 87
settings pages, so **41 pages — 47% of the tree — are attributed `CORE` and
render on every plan**, including a tenant whose subscription entitles nothing.
Each of those is a deliberate declaration reviewed under ADR-0005, and
several are defensible only because no key exists to sell them with.

This item asks the question the fix could not: which of the 41 should become
capabilities, and which are genuinely free.

## Why It Matters

The fix closes the leak it can prove — a page whose capability the plan
withholds. It cannot close a leak that has no key, and stating "settings now
follow the plan" without this list would overstate what was achieved. A tenant
on Starter at USD 69 per month can currently configure ZKTeco attendance
terminals, pair an on-premise .NET gateway, define field-level security
policies, build compliance exports and use the full runtime customization
designers.

The cost of not deciding is that these stay free by default and get harder to
sell later: carving out a capability people already use needs a backfill or it
reads as a removal, which is the trap ADR-0005 Decision 5 records for
Customization.

## Evidence

Measured at `2466afc4` by resolving the settings IA against each shipped plan's
capability set, with every settings permission and the `global-admin` role:

| Plan | Categories | Groups | Items |
|---|---|---|---|
| No entitlements (lapsed subscription) | 9 | 23 | 41 |
| Starter | 10 | 34 | 67 |
| Growth | 10 | 35 | 70 |
| Enterprise / Enterprise+ | 11 | 41 | 87 |

The 41 that survive with no entitlements at all, grouped by the question each
raises:

**Attendance hardware, sold today as part of `attendance`** — not in the 41, but
the sharpest case. Starter buys `attendance`, so it gets all eight of
`attendance-integrations-overview`, `attendance-integrations`,
`attendance-devices`, `attendance-employee-mapping`, `attendance-provisioning`,
`attendance-sync-history`, `attendance-gateways` and the installer page. Device
integration and an on-premise gateway are enterprise machinery attached to a
key every plan holds. This is the largest single block of questionable exposure
and it is *not* fixable by attribution — it needs its own key.

**Customization (9)** — `tables`, `fields`, `sidebar`, `forms`, `views`,
`action-bars`, `widgets`, `packages`, `publish-center`. Free by explicit
decision (ADR-0005 Decision 5), listed here so the decision is revisited
rather than forgotten.

**Audit and compliance (4)** — `audit-logs`, `data-access-history`,
`retention-rules`, `compliance-exports`. Retention policy and compliance export
are conventional compliance-tier features.

**Approvals and workflow (5)** — `approval-matrices`, `delegation-rules`,
`escalation-rules`, `policy-engine`, `workflow-templates`. Starter buys Leave
and leave requests route through the first three, so those are hard to withhold.
`policy-engine` and `workflow-templates` are not needed for leave.

**Security governance (3)** — `field-security`, `password-login-policies`,
`login-history`. Field-level security is usually sold; the other two are table
stakes.

**Data movement (1)** — `data-management`, bulk import and export.

**Shared master data (5)** — `locations`, `shifts`, `work-calendars`,
`holiday-calendars`, `work-schedules`. Reviewed and confirmed free under
ADR-0005 Decision 3; listed for completeness, not as a candidate.

**Identity, tenancy and billing (14)** — `tenant`, `subscription`, `users`,
`roles`, `permissions`, `access-teams`, `countries`, `states`, `cities`,
`timezones`, `currencies`, `fiscal-years`, `system-preferences`, plus
`apps-downloads`. Not candidates. `subscription` in particular must stay
reachable on every plan or a lapsed customer cannot pay.

## Proposed Approach

No ExecPlan. This is a pricing decision, and the mechanism to enforce whatever
is decided already exists: add a key to `TENANT_FEATURE_DEFINITIONS`, mirror it
into `tenant-features.ts` and `security-keys.ts`, attribute the pages in
`settings-entitlements.ts`, and list it on the plans that sell it. The
`settings-entitlements.spec.ts` coverage test then holds it.

Take the four blocks in order of how clear the case is: attendance hardware
first, then compliance, then field security, then customization. Each new key
carved out of something already in use needs a `PlanFeature` backfill in the
same change, or existing tenants silently lose it.

## Acceptance Criteria

- Each of the four candidate blocks has a recorded decision — sold or free —
  with a reason, appended to ADR-0005 or in an ADR of its own.
- Any block decided "sold" has a capability key, plan assignments, page
  attributions and a backfill for tenants already using it.
- The count of `CORE` settings pages is restated after the decisions, so the
  residual is a known number rather than an unexamined one.

## Dependencies

None. [[BUG-2958]] has landed and the mechanism is in place; this is the
product decision layered on top of it.

## Related Items

- [[BUG-2958]] — the fix that surfaced this residual.
- [[BUG-1952]] — the API enforcement underneath it.
- ADR-0005 — the five attribution decisions already taken.
- [[ITEM-0127]] — the IA reorganization found in the same audit.
- Modules — [[settings]], [[tenant-application]]

## History

- 2026-09-09 — created at `2466afc4` from the per-plan resolution audit run
  while fixing [[BUG-2958]]. Raised because "settings now follow the plan" is
  true for the 46 pages a key exists for and silent about the other 41.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2958]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
- 2026-09-09 — triaged by the Architect for SESSION-0094: PRODUCT_DECISION. The
  engineering question is settled and the mechanism is in place; what remains is
  a pricing judgement that no agent should make by attributing a page quietly.

- 2026-09-09 — answered in the same session. Four blocks were put to the product
  owner and three were carved out: attendance hardware
  (`attendance-integrations`, Growth up, 8 pages), compliance and retention
  (`compliance`, Enterprise up, 4 pages) and bulk import/export
  (`data-management`, Growth up, 1 page). Field security and the advanced
  workflow pages stay free, as does Customization under Decision 5. Recorded as
  ADR-0005 Decisions 6 and 7.

  The residual moves from 41 always-visible pages to 28, and a Starter tenant
  from 67 resolved pages to 54. What remains free is now free by a decision that
  was put to a person, which is what this item asked for. Closing DONE rather
  than leaving it open on the un-carved remainder: those were considered and
  declined, not overlooked.
