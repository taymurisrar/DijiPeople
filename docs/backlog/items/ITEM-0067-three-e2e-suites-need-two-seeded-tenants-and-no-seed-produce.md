---
ID: ITEM-0067
aliases: [ITEM-0067]
Title: Three e2e suites need two seeded tenants and no seed produces them
Type: TEST_GAP
Status: DUPLICATE
Priority: P3
Severity: LOW
AffectedModules: [attendance, attendance-integrations, agent]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DUPLICATE
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation: TASK-0008 WP-08
TargetMilestone:
BlockedBy:
---

# ITEM-0067 — Three e2e suites need two seeded tenants and no seed produces them

**DUPLICATE of [[ITEM-0047]], which was already `DONE` on `develop` when this
was filed.** Withdrawn rather than deleted, because how it was filed is the
useful part.

## What was observed

The WP-08 QA campaign ran the full e2e suite against a real PostgreSQL and found
81 tests failing in `beforeAll` across `attendance-engine`,
`attendance-integrations-http` and `gateway-runtime`, all on:

```
These tests need two tenants with at least one business unit.
```

`seed:demo` creates one. That reading was correct, the diagnosis was correct,
and the proposed fix — per-suite fixtures rather than a bigger `seed:demo` —
was the fix that had already been written.

## Why it was filed anyway

**The campaign ran against the task branch before merging `develop`.** At that
point `develop` was 36 commits ahead and carried `agent/ci-e2e-remediation`,
which fixed exactly this under [[ITEM-0047]] / [[REG-070]] — `db-fixtures.ts`
with `createTenantPair()`, the three suites converted, `legal-seed` made to run
its own seed, and `platform-workflows` given its invitation data. The same
branch also promoted `database-e2e` into the required gate, which it could only
do because the failures were gone.

So this item is a duplicate produced by a stale base, not by a wrong reading.
The lesson is scheduling, not analysis: **a QA campaign that establishes a
baseline should merge the integration branch first**, or every pre-existing
failure that somebody else has already fixed gets rediscovered and re-filed. The
cost here was one record and the time to write it; on a longer-lived branch it
would be a duplicate fix.

Recorded in TASK-0008's WP-08 section so the next campaign sequences it the
other way round.

## Related Items

- [[ITEM-0047]] — the canonical record. `DONE`.
- [[REG-070]] — the regression that holds it.
- [[TASK-0008]] — the parent whose WP-08 campaign refiled it.
- [[ITEM-0066]] — the other local-QA obstacle from the same campaign, which is
  genuinely open.
