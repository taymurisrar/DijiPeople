---
ID: ITEM-0032
aliases: [ITEM-0032]
Title: Recompute productivity totals inflated by heartbeat replays
Type: DATA_MIGRATION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/agent]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-22
RelatedBug: BUG-0036
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0032 — Recompute productivity totals inflated by heartbeat replays

## Summary

[[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] is
fixed going forward: a `dedupeKey` unique index now makes heartbeat ingestion
idempotent, so a replayed batch can no longer increment the counters twice.

It does **not** correct what was already counted. `WorkSession.totalActiveSeconds`,
`WorkSession.totalIdleSeconds`, `WorkSession.totalAwaySeconds` and every
`DailyProductivitySummary` row still carry whatever the defect added before the
fix landed.

## Why It Matters

`utilizationPercent` is computed from those totals, and it is a number managers
read about individual employees. An inflated active-seconds figure makes someone
look more productive than they were; the same replay inflates idle and away
totals too, which can make someone look worse. Neither error is visible to the
person it describes.

The size of the error is unknown and is not uniform — it depends entirely on how
often each agent hit a mid-batch failure and replayed, which correlates with
network quality, not with anything about the employee.

## Evidence

The mechanism is documented in BUG-0036's Resolution. The fix commit adds
`ActivityEvent.dedupeKey`; every row written before that migration has NULL
there, which is also the marker for "written while the defect was live".

## Proposed Approach

Needs a decision before it needs an ExecPlan, because the honest answer may be
"do not recompute".

Recomputing from `ActivityEvent` rows is only correct for sessions whose events
still exist. `enforceTelemetryRetention` prunes events on a tenant-configured
window, so for older sessions the true total is **no longer derivable** — the
summary row is the only surviving record, and it is the wrong one. A recompute
across the board would silently replace unknown-but-inflated numbers with
confidently-wrong ones for exactly the periods nobody can check.

Three options worth costing:

1. **Recompute only where the source events survive**, and mark the rest as
   unverified rather than rewriting them.
2. **Annotate rather than rewrite** — flag affected sessions so anyone reading a
   utilisation figure knows its provenance.
3. **Accept and document.** Legitimate if the measured inflation turns out to be
   small; it must be *measured* first, not assumed.

Start by quantifying it: count `ActivityEvent` rows sharing
`(tenantId, sessionId, occurredAt)` where `dedupeKey IS NULL`. That query is
read-only, answers how big the problem actually is, and should run before anyone
argues for an option.

## Acceptance Criteria

- The scale of the inflation is measured and recorded, per tenant.
- A decision is taken and written down, including if the decision is to accept it.
- If totals are rewritten, the previous values are preserved somewhere before
  being overwritten.

## Resolution — 2026-08-22, SESSION-0040

**Measured, and there is nothing to recompute.** This record insisted the
inflation be quantified before anyone chose a remedy — *"it must be measured
first, not assumed"* — and measuring is what closed it.

Production, read 2026-08-22:

| Table | Rows |
|---|---|
| `ActivityEvent` | **0** |
| &nbsp;&nbsp;of which written before the fix (`dedupeKey IS NULL`) | **0** |
| `WorkSession` | **0** |
| `DailyProductivitySummary` | **0** |
| `RawAttendanceEvent` | **0** |

The corrective migration this record was weighing would operate on zero rows.
No `utilizationPercent` has ever been computed from an inflated total, because
no total has ever been computed at all.

### Why the database is not simply the wrong one

It is the production database and it does hold data — 3 tenants, 3 plans, 3
subscriptions, 5 customer accounts, 2 platform users. What it holds no rows of
is *attendance telemetry*. All three tenants are `INACTIVE` with subStatus
"Pending payment": nobody has completed checkout, so no workspace has an
employee, and the desktop agent has never had a session to report.

### The decision, on evidence

Option 3 of the three this record costed — **accept and document** — and it is
the legitimate one precisely because the inflation was measured rather than
assumed. Option 1 (recompute where events survive) and option 2 (annotate) both
have an empty domain.

The guard that matters is already in place: [[BUG-0036]] made ingestion
idempotent through the `dedupeKey` unique index, so every row written from now
on carries one. There is no window of bad data behind it to clean up.

### If attendance ever goes live

Nothing needs re-opening. Data written after the fix cannot be double-counted,
and `dedupeKey IS NULL` remains the marker for pre-fix rows — a query that will
keep returning zero.

## History

- 2026-08-17 — status reconciled to `PRODUCT_DECISION`. TASK-0005 records the
  three options and recommends measuring per tenant before choosing; no data
  rewrite is authorized until that owner decision is made.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0036]]

<!-- GRAPH:END -->

- 2026-08-22 — user asked for it to be fixed. Quantified against production first, as this record required: zero ActivityEvent, WorkSession and DailyProductivitySummary rows. Nothing to correct; closed on measurement rather than on assumption.
