---
ID: ITEM-0065
aliases: [ITEM-0065]
Title: Two e2e suites still borrow a CustomerAccount, which is what blocks parallel execution
Type: TEST_GAP
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [services/api/test]
Source: ARCHITECT
OwnerAgent: database
ArchitectDisposition: DEFER
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-20
RelatedBug: 
RelatedQA: docs/qa/runs/2026-08-19-ci-e2e-remediation-3f03571.md
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0065 — Two e2e suites still borrow a CustomerAccount, which is what blocks parallel execution

## Summary

[[ITEM-0047]] converted the database e2e suites onto `test/helpers/db-fixtures.ts`
so each builds its own data. Two instances of the old pattern survive, both on
`CustomerAccount`:

```ts
// permission-propagation.e2e-spec.ts:56 — no filter, NO ORDERING
const customerAccount = await prisma.customerAccount.findFirstOrThrow({
  select: { id: true },
});

// platform-workflows.e2e-spec.ts:45 — no filter, ordered oldest-first
prisma.customerAccount.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
```

They are harmless today because the suite runs at `maxWorkers: 1`. They are also
the reason it has to.

## Why It Matters

This is the residual instance of the [[borrowed-fixture-dependency]] pattern
that [[ITEM-0047]] named — worth recording precisely because the task that wrote
the pattern did not finish removing every case of it.

The concrete race, under parallel workers:

1. `permission-propagation` calls `findFirstOrThrow()` with **no ordering**, so
   PostgreSQL may return any row — including a `CustomerAccount` another suite's
   `DbFixtures` created seconds earlier.
2. It attaches a tenant to that account.
3. The owning suite's `cleanup()` then tries to delete the account, hits the
   `Restrict` foreign key from the borrowed tenant, and — because `tryDelete`
   warns rather than throws, deliberately — **leaks silently**.

The failure is not a red test. It is a row left behind, non-deterministically,
which is worse: it accumulates and becomes visible much later, in a different
suite, as data that should not exist.

`platform-workflows` is the milder case. `orderBy: { createdAt: 'asc' }` will in
practice return the `seed:demo` account, since it is the oldest. "In practice"
is doing real work in that sentence — the ordering is not unique, and nothing
makes the seeded row the oldest by contract.

## Evidence

- `services/api/test/permission-propagation.e2e-spec.ts:56`
- `services/api/test/platform-workflows.e2e-spec.ts:45`
- Three consecutive `--maxWorkers=4` runs passed 25 suites / 304 tests. **That is
  not evidence of safety.** [[ITEM-0047]] records two identical parallel runs
  giving 5 and then 10 failing suites, and its lesson stands: a pass in a
  parallel run is as untrustworthy as a failure. Three passes mean the window is
  narrow, not that it is closed.

## Diagnosis

Both suites need *a* customer account, not *a particular* one, and
`DbFixtures.createTenant()` already creates one per tenant. Neither borrow is
load-bearing — the same was true of every borrow ITEM-0047 removed.

## Proposed Approach

1. Replace both lookups with `fixtures.createTenantWithBusinessUnit()`, or
   `fixtures.createTenant()` where only the account is wanted.
2. Re-run `--maxWorkers=4` three times and confirm 25/304 **and no leaked rows** —
   counting `CustomerAccount` before and after, which the current evidence does
   not do.
3. Only then consider raising `maxWorkers`.

## Why This Is DEFERRED, Not FIX_NOW

**The benefit is close to zero.** The whole suite runs in **93 seconds** in CI at
`maxWorkers: 1` (run 32307298504, job 96242923532), inside a job taking 5m31s end
to end — the database setup costs more than the tests. Parallelising might save
40 seconds of a 331 second job.

Against that: `database-e2e-report` was promoted to a **required gate** in the
same task. A gate that goes intermittently red is far more expensive than 40
seconds, and the failure mode here is a silent leak rather than a clean failure,
which is the hardest kind to diagnose.

So the sequencing is deliberate: fix the borrows because they are wrong, not
because parallelism needs them. Raise `maxWorkers` afterwards, if anyone can show
it buys something.

This also answers [[ITEM-0055]], which asked for the serial suite to be made
parallel again. Its premise was that serialisation had pushed the job past its
30-minute cap. That premise is gone — the job takes 5m31s — so the remaining
question is only this one, and it is small.

## Acceptance Criteria

- No `findFirstOrThrow` without a filter over a shared table anywhere in
  `services/api/test/`.
- Three consecutive `--maxWorkers=4` runs pass with identical counts **and** leave
  no additional `CustomerAccount`, `Tenant` or `Organization` rows behind.
- A decision recorded on whether `maxWorkers` should change at all, with the
  measured saving.

## Dependencies

None. [[ITEM-0047]] is DONE.

## Related Items

[[ITEM-0047]] · [[ITEM-0055]] · [[borrowed-fixture-dependency]] ·
[[qa-and-ci-architecture]]
