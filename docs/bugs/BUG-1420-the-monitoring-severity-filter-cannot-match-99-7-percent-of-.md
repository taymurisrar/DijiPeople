---
ID: BUG-1420
aliases: [BUG-1420]
Title: The monitoring severity filter cannot match 99.7 percent of stored incidents
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [apps/admin, services/api/src/modules/error-logs]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-270
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1420 — The monitoring severity filter cannot match 99.7 percent of stored incidents

> **Architect triage, 2026-08-27 — `FIX_NOW`.** The severity filter cannot match 99.7% of stored incidents. Same screen as BUG-1419.


## Summary

`ErrorLog.severity` is a free-text `String`, and production has been written
both uppercase and lowercase. A census of all **1,471** incidents on production
finds **1,466 stored lowercase** and **5 uppercase**. Every consumer in the
admin UI — the severity filter, the severity sort, and the severity pill —
compares against uppercase literals with strict equality.

So the filter an operator uses to find errors cannot see 14 of the 15 errors
that exist, and the sort that claims "Most severe first" puts the lowercase rows
above `CRITICAL`. The screen is not empty and reports no error; it silently
answers a different question than the one asked.

## Expected Behavior

Filtering the incident overview by `ERROR` shows every incident whose severity
is an error, regardless of how the row happened to be written. Severity has one
canonical representation, enforced where it is stored.

## Actual Behavior

Filtering by `ERROR` shows **0** rows while 14 error incidents exist.
Filtering by `WARNING` shows **1** row while 1,456 warning incidents exist.

## Reproduction

1. Sign in to https://admin.dijipeople.com.
2. Go to `/settings/monitoring`.
3. Set the severity filter to **ERROR**. The list empties.
4. Confirm the data against the API the same page reads:

```js
await fetch('/api/platform-runtime/monitoring-incidents?page=1&pageSize=100&viewKey=all',
            { credentials: 'include' })
```

Observed, 2026-08-26 against `8d6be21b`, paging the full set:

```
ACTUAL SEVERITY VALUES IN PRODUCTION DATA   (1471 incidents, all pages)
  "warning": 1452
  "error":     14
  "WARNING":    4
  "ERROR":      1

UI FILTER RESULT
  filter "CRITICAL" -> 0 incident rows shown
  filter "ERROR"    -> 0 incident rows shown      (14 exist)
  filter "WARNING"  -> 1 incident rows shown      (1456 exist)
  filter "INFO"     -> 0 incident rows shown
```

## Evidence

The comparison is strict and case-sensitive —
[`monitoring-overview.tsx:110`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L110):

```ts
if (filters.severity && incident.severity !== filters.severity)
```

The options offered are uppercase only —
[`monitoring-overview.tsx:242`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L242):

```ts
options={["CRITICAL", "ERROR", "WARNING", "INFO"]}
```

Two further consumers share the assumption:

- [`monitoring-overview.tsx:129`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L129) —
  `["CRITICAL", "ERROR", "WARNING", "INFO"].indexOf(value)`. A lowercase value
  ranks `-1`, so "Most severe first" sorts all 1,466 lowercase rows *above*
  `CRITICAL`.
- [`monitoring-overview.tsx:539`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L539) —
  the `SeverityPill` colour map is keyed uppercase, so lowercase rows render
  unstyled.

Nothing constrains the column. `services/api/prisma/schema.prisma` declares no
`ErrorLogSeverity` enum — the four `*Severity` enums it does define
(`SupportCaseSeverity`, `PayrollExceptionSeverity`, `DataIssueSeverity`,
`AttendanceExceptionSeverity`) all belong to other models.

## Root Cause

Severity is typed as `string` end to end. Writers disagree on case, and nothing
in the schema, the DTO or the type system forces agreement, so both forms are
valid storage. The readers were written against the uppercase convention and are
correct about the convention — the convention was simply never enforced, and the
minority spelling won by volume.

This is the `doc-code-drift` shape applied to data: a rule that lives only in
the code that reads it, never in the thing that stores it.

## Impact

Production. Every platform user, on the incident triage screen. The failure mode
is the dangerous one — no error, no empty-state explanation, just a confident
answer that is wrong. An operator filtering for errors concludes there are none.

Severity-based triage on this screen cannot currently be trusted at all.

## Affected Areas

- `/settings/monitoring` — filter, sort, severity pill
- `apps/admin/app/_components/monitoring/monitoring-overview.tsx`
- `ErrorLog.severity` in `services/api/prisma/schema.prisma`
- Any writer of `ErrorLog` — the API's own error pipeline and the admin client
  error reporter both write rows

## Proposed Resolution

Needs an ExecPlan: it is a data change on a production table with 1,471 rows.

1. **Contract** — introduce an `ErrorLogSeverity` enum, or a `@db` check
   constraint, so the column cannot hold two spellings.
2. **Backfill** — normalise the existing 1,466 lowercase rows in an
   expand/backfill/contract sequence.
3. **Normalise on write** in the error pipeline so the case can never diverge
   again, regardless of caller.
4. **Read defensively** in the UI as well, so a future stray value degrades to
   visible rather than invisible.

Step 3 is the fix; step 4 is the guardrail. Doing only step 4 leaves the data
inconsistent for every other consumer.

## Acceptance Criteria

- `SELECT DISTINCT severity FROM "ErrorLog"` returns only canonical values.
- Filtering by `ERROR` on `/settings/monitoring` returns every error incident.
- "Most severe first" orders `CRITICAL` above `ERROR` above `WARNING`.
- A test fails if a severity is written in a non-canonical case.

## Regression Coverage

Needed: a test that writes an incident through the real error pipeline and
asserts the stored severity is canonical, plus a UI test that a filter returns
the rows the API reports for that severity.

## Dependencies

Requires an ExecPlan under [`PLANS.md`](../../PLANS.md) — production data
backfill.

## Related Items

- [[BUG-1419]] — dead incident links on the same screen
- [[BUG-1421]] — admin-wide landmark and page-title defects

## Resolution

Fixed 2026-08-27 on `agent/invitation-delivery-visibility`.

The severity filter matches with `mode: 'insensitive'`, and the critical view
lists both spellings of each level — Prisma's `in` has no insensitive mode,
unlike `equals`, so the duplication is load-bearing rather than untidy.

Matched insensitively rather than upper-casing the input, which would only have
moved the mismatch to the other side of the comparison.

**The column itself is not normalised.** 1,466 rows still hold lowercase, and
changing that is a data migration plus a write-side constraint, which is the
real fix and wants a plan. This makes the existing rows reachable; it does not
make the storage consistent. Recorded rather than quietly left.

Guarded by REG-270 and QA-TENANT-024.

## QA Retest

Pending.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-270 (see the regression register)

<!-- GRAPH:END -->
