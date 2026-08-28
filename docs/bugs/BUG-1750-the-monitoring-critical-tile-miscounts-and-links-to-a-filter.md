---
ID: BUG-1750
aliases: [BUG-1750]
Title: The monitoring critical tile miscounts and links to a filter that matches nothing
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:platform-monitoring]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-281
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1750 — The monitoring critical tile miscounts and links to a filter that matches nothing

## Summary

The Monitoring overview tile "Critical, untriaged" shows **11** and links to
`?severity=CRITICAL&status=NEW`, which returns **0 of 0**. Two separate defects
meet on one tile: the count is computed with a case-sensitive `severity: 'ERROR'`
match that misses the lowercase rows [[BUG-1420]] was raised about, and the link
filters on a severity value nothing in the system stores.

[[BUG-1420]] fixed the incidents *view*. It did not fix the overview *metric*,
which still carries the original defect.

## Expected Behavior

The tile's number and its link agree: clicking "Critical, untriaged 11" shows
those 11 incidents. The count matches errors regardless of the case they were
stored in.

## Actual Behavior

The tile reads 11. Its link lands on an empty queue. Filtering the queue to
Critical shows 25.

## Reproduction

1. Platform Admin, **Monitoring**. The tile reads "CRITICAL, UNTRIAGED 11".
2. Click it. It navigates to
   `/settings/monitoring/error-logs?severity=CRITICAL&status=NEW`, which shows
   "Showing 0 of 0 sanitized incidents".
3. From the incidents queue, apply the **Critical** severity chip. It navigates
   to `?severity=ERROR` and shows 25 incidents — while the Critical stat tile in
   that same view reads 11.

## Evidence

The count — `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts:103`:

```ts
this.prisma.errorLog.count({
  where: { AND: [where, { severity: 'ERROR' }] },
}),
```

Exact, case-sensitive, and excluding `FATAL`.

The view that [[BUG-1420]] fixed — same file, `incidentViewWhere()`:

```ts
if (viewKey === 'critical') {
  // BUG-1420. Both spellings ... Prisma's `in` is case-sensitive and has no
  // insensitive mode, so the levels are listed rather than folded.
  return { severity: { in: ['ERROR', 'FATAL', 'error', 'fatal'] } };
}
```

The fix exists and the metric does not use it. Filtering the queue to Critical
yields 25 incidents while the Critical tile reads 11: the 14-row difference is
rows stored as lowercase `error`, which the view matches and the metric does not.

The link — `apps/admin/app/_components/monitoring/monitoring-overview.tsx:173`:

```tsx
href={`${QUEUE}?severity=CRITICAL&status=NEW`}
value={metrics.critical}
```

Nothing is stored with severity `CRITICAL`; the ingest path writes
`ERROR` / `FATAL` / `WARNING` / `INFO`. The file's own comment above this block
reads: "Four figures, each a link that applies its own filter. A count an agent
has to go and rebuild a filter for is a count that costs them time to use." That
is exactly what fails.

Underneath both: `ErrorLog.severity` is a plain `String` in `schema.prisma`, not
an enum, so nothing constrains case or vocabulary.

## Root Cause

`severity` is unconstrained free text. The critical *view* was taught to fold
case; the critical *metric* and the tile's link were not, and there is no shared
definition of "critical" the three could agree on.

## Impact

The first number an operator reads when asking "is anything on fire" is wrong,
and the link that should take them to those incidents takes them to an empty
page. It undercounts, so it fails in the direction of appearing calmer than the
system is.

## Affected Areas

Monitoring overview and its metrics, the incidents queue filters,
`platform-monitoring` list and count paths, `ErrorLog.severity` storage.

## Proposed Resolution

Give "critical" one definition and use it in all three places — the metric, the
view and the link. Prefer promoting `severity` to an enum, with a migration that
normalises the existing rows; the handoff notes roughly 1,466 rows still hold
lowercase values. Until that migration, at minimum make `metrics.critical` reuse
`incidentViewWhere('critical')` and make the tile link to the view key rather
than to a raw severity value.

Needs an ExecPlan for the enum migration and backfill.

## Acceptance Criteria

- The tile's count equals the number of rows its own link displays.
- The count matches errors regardless of stored case, and includes `FATAL`.
- A regression test asserts count and link agree for a fixture containing
  `ERROR`, `error` and `FATAL` rows.

## Regression Coverage

None for the metric. The view is covered by [[BUG-1420]]'s fix, which is why the
defect survived: the test and the defect are on different code paths.

## Dependencies

Normalising `severity` needs a migration and a backfill plan.

## Related Items

[[BUG-1420]] — fixed the critical view; this is the half that was not fixed.
[[BUG-1419]] — incident titles now deep-link correctly, verified in this pass.
[[BUG-1754]] — the incident queue signal-to-noise problem, which is why 1,588
items sit untriaged.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep` — the part that does not need a
migration, which is all of it that was actually broken.

"Critical" now has one definition, `criticalIncidentWhere()`, and the three
places that disagreed all read it:

- the overview **metric**, which counted `severity: 'ERROR'` exactly;
- the incidents **view**, which [[BUG-1420]] had already taught to fold case;
- the tile's **link**, which filtered on `severity=CRITICAL` — a value nothing
  in the system stores, so it returned 0 of 0 while the tile above it read 11.

The link now names the view (`viewId=critical`) rather than spelling out a
severity, and the error-logs page passes the view key through to the API instead
of translating it into `severity=ERROR`. That translation was the third copy of
the definition and the one nobody had noticed.

**Not done:** promoting `severity` to an enum with a normalising migration. This
record calls that the preferred fix and asks for an ExecPlan, and it is right —
roughly 1,466 rows still hold lowercase values, and the duplicated spellings in
the `in` list are load-bearing until they do not. What is fixed is that the
duplication now exists once instead of three times, which is what made the
screen contradict itself.

Guarded by REG-281.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/platform-monitoring/incident-severity-case.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `incident-severity-case.spec.ts` asserts the metric
and the view produce the same where clause, and that the severity list appears
in exactly one place in the source — a second occurrence is a second definition,
which is this defect returning.

`monitoring-overview.spec.ts` asserts the tile links to the view, and asserts
negatively that `severity=CRITICAL` is gone: the failure mode here is a link
that looks plausible and filters on nothing.

The browser check is one click: the Critical tile's count and the count on the
screen it opens must agree.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - one definition of critical, read by the metric, the view and the link. The enum migration is still open. REG-281.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/platform-monitoring/incident-severity-case.spec.ts`

Proven by:

- `npm --workspace api run test` — 2016 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-281 (see the regression register)

<!-- GRAPH:END -->
