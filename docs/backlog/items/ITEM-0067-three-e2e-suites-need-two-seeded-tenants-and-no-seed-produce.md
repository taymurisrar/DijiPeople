---
ID: ITEM-0067
aliases: [ITEM-0067]
Title: Three e2e suites need two seeded tenants and no seed produces them
Type: TEST_GAP
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [attendance, attendance-integrations, agent]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DEFER
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

## Summary

`attendance-engine.e2e-spec.ts`, `attendance-integrations-http.e2e-spec.ts` and
`gateway-runtime.e2e-spec.ts` each open with:

```
if (tenants.length < 2) {
  throw new Error('These tests need two tenants with at least one business unit.');
}
```

`seed:demo` creates one. No seed script in the repository creates a second, so
these three suites cannot pass against a database prepared the documented way —
87 tests across them fail in `beforeAll`, before a line of product code runs.

Found during the WP-08 QA campaign, running the full e2e suite against a local
PostgreSQL prepared exactly as `.github/workflows/ci.yml` prepares it:
`verify-database` → `seed:demo` → `seed:admin`.

## Why this has gone unnoticed

`database-e2e` is not in the `ci-required` gate's `needs` list. It reports, and
its report has presumably been carrying these failures for as long as the
suites have existed. Nothing blocks on it, so nothing forced the question.

## Why it is deferred

Nothing here is a product defect. The suites test tenant isolation — they need a
second tenant precisely so they can prove a boundary holds — and the boundary
they test is covered elsewhere by `tenant-isolation-pattern.e2e-spec.ts` and
`workspace-domain-isolation.e2e-spec.ts`, both of which pass because they build
their own fixtures.

That is also the shape of the fix, and the reason it is not a one-liner: the
right answer is for each suite to construct what it needs via
`test/helpers/db-fixtures.ts`, which is already the documented convention —
`.github/workflows/ci.yml` says so in the e2e job, calling `seed:demo` "the one
pre-existing-data dependency in the suite set" and asking that new tests not
grow it. These three grew it. Adding a second tenant to `seed:demo` would make
them pass while making that dependency worse.

## What it costs while deferred

Three suites, 87 tests, contribute nothing. Anybody running the e2e set locally
meets a wall of red that has nothing to do with their change, and has to work
out which failures are theirs — which is exactly the tax this campaign paid.

## Proposed Resolution

Convert the three suites to build their own tenants through
`test/helpers/db-fixtures.ts`. Then consider whether `database-e2e` can join the
required gate, which is the only thing that would stop this recurring.

## Evidence

Full e2e run at `f5bd870` against `localhost/dijipeople_wp08_test`, prepared
with migrate deploy → `seed:config` → `seed:demo` → `seed:admin`:

```
Test Suites: 5 failed, 19 passed, 24 total
Tests:       87 failed, 224 passed, 311 total
```

The other two failures were separate and are fixed under this parent:
`legal-seed` (see [[TASK-0008]] WP-08 — `seed:legal` was in no aggregate script)
and `platform-workflows` (needed `seed:platform-workflows`, which CI's e2e job
also does not run — it passes 5/5 once seeded).

Of the 87, every one fails in `beforeAll` on the two-tenant precondition.

## Related Items

- [[TASK-0008]] — found during the WP-08 QA campaign.
- [[ITEM-0066]] — the other local-QA obstacle found in the same session.
