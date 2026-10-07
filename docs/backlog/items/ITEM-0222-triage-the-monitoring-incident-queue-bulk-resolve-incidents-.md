---
ID: ITEM-0222
aliases: [ITEM-0222]
Title: Triage the monitoring incident queue: bulk-resolve incidents covered by fixed records, and add bulk triage by fingerprint
Type: FOLLOW_UP
Status: PRODUCT_DECISION
Priority: P2
Severity: 
AffectedModules: [platform-monitoring]
Source: REVIEWER
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0222 — Triage the monitoring incident queue: bulk-resolve incidents covered by fixed records, and add bulk triage by fingerprint

## Summary

Nobody has ever triaged the production incident queue in Platform admin,
Monitoring. Since 2026-08-08 it has 236 NEW incidents and 0 resolved,
investigating or assigned, and no support case has been linked. About 120 of the
NEW incidents belong to defects that are already fixed or verified (the table
below). About 70 are business-rule rejections ([[ITEM-0224]]). About 10 are live
and now have their own records.

This item covers two things:

1. A one-off bulk resolution of the incidents mapped to fixed records.
2. A bulk-triage action by fingerprint or error code, so the queue can be kept
   clean afterwards.

The bulk resolution mutates production data, so it needs the owner's go-ahead.
That is why this item is a product decision.

## Why It Matters

The "waiting for triage" tile (236) and the "critical" tile (42) never move.
When a new real incident arrives, an operator sees no change, so the queue cannot
work as an alerting surface.

## Evidence

Production `ErrorLog`, read-only query on 2026-10-07:

- 2,230 incidents, with 13,432 occurrences.
- Incidents by `supportStatus`:
  - `NOT_AN_INCIDENT`: 1,994.
  - `NEW`: 236.
  - Every other status: 0.
- 0 rows with an assignee, and 0 `SupportCaseIncident` rows.

The historical NEW incidents that are already covered by records, with no
recurrence since:

| Id | Issue | Occ | Window | Covered by |
|---|---|---|---|---|
| H-01 | Stripe webhook 400s (signature, customer resolution, invoice mapping); 24 failed Stripe platform events | 50 | 08-23 → 08-30 | [[BUG-2462]], [[BUG-1543]], [[BUG-1128]] |
| H-02 | Disallowed CORS origin → 500 | 13 | 08-20 → 08-23 | [[BUG-0976]] |
| H-03 | Stale Stripe price or product → 500 on plan price changes | 4 | 08-22 → 08-24 | [[BUG-1134]] |
| H-04 | `/auth/refresh` 429 rate limited | 52 | 08-30 | [[BUG-2458]] |
| H-05 | Refresh-token update P2025 (rotation race) | 5 | 08-10 → 08-12 | [[BUG-3359]] |
| H-06 | `/public/legal/*` 404, no published version | ~176 | 08-20 → 08-23 | [[BUG-0906]] |
| H-07 | Neon data-transfer quota → 500 on `/public/legal` | 2 | 08-23, 09-23 | [[ITEM-0208]] |
| H-08 | React #418 hydration errors on several settings pages | 8 | 08-29 → 09-12 | [[BUG-3316]], [[BUG-3496]], [[BUG-2647]], [[BUG-2464]] |
| H-09 | React #441 crashes and 403s for users without the role | 36 | 08-29 → 09-12 | [[BUG-3491]], [[BUG-2003]], [[BUG-2004]] |
| H-10 | Route shadowing of `new`/`import` pages by `:id` routes | ~14 | 08-28 → 09-09 | [[BUG-2014]], [[BUG-2461]] |
| H-11 | Web calling non-existent Next proxy routes | 12 | 08-28 → 08-29 | [[BUG-1955]] |
| H-12 | Unsupported setting key `attendance.allowOffDayCheckIn` | 2 | 08-29 | [[BUG-1978]] |
| H-13 | Tenant email with no enabled provider; console sink not delivered | 6 | 08-26 → 09-12 | [[BUG-1595]], [[BUG-3501]] |
| H-14 | Platform email test-connection SMTP timeout | 8 | 08-11 | fixed in `platform-email-settings.service.ts`; the residual is [[BUG-3901]] |
| H-15 | Burst of `NETWORK_ERROR` during a deploy or outage window | 16 | 08-27 | none needed (transient) |
| H-16 | Admin 405s from stale server-action ids after a deploy | ~14 | 08-12 → 08-28 | none needed (transient) |
| H-17 | Frontend/DTO contract-drift 400s | ~45 | 08-10 → 09-09 | **not** bulk-resolved until [[ITEM-0225]] re-verifies them |
| H-18 | Prisma transaction-start timeout on `/public/leads` | 1+ | 08-10 | none needed (pool pressure, no recurrence) |

## Proposed Approach

1. Once the owner approves, resolve the H-01 to H-16 and H-18 incidents with a
   reviewed, scoped update. Use the existing resolve path where practical, so
   that each resolution is audited. Record the counts in this item.
2. Add a bulk "resolve or mark as not an incident by fingerprint or error code"
   action to the Error logs tab. Guard it with `monitoring.manage`, or the
   existing platform permission, and audit it.
3. Leave H-17 to [[ITEM-0225]], and the business-rule rejections to
   [[ITEM-0224]].

The code part (step 2) is small. Step 1 does not need an ExecPlan, but it does
need the owner's approval.

## Acceptance Criteria

- The owner's decision is recorded in this item.
- If approved: the mapped incidents are resolved, the "waiting for triage" tile
  drops by the resolved count, and each resolution is audited.
- A platform operator can resolve all incidents that share a fingerprint in one
  action.

## Dependencies

The owner's go-ahead for the production data change.

## Related Items

- [[BUG-1754]]: the queue counting routine responses.
- [[BUG-3889]]: query strings in fingerprints, which multiplies the incidents to
  triage.
- [[ITEM-0224]]: business-rule rejections in the queue.
- [[ITEM-0225]]: re-verifying the contract-drift 400s.

## History

- 2026-10-07 — found in the production monitoring triage at 94f65fa4.
  Triage id MON-03. Disposition PRODUCT_DECISION: the bulk resolution mutates
  production data.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
