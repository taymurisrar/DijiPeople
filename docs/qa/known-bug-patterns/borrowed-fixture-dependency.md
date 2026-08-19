# Bug pattern — `borrowed-fixture-dependency`

**A test asserts against data it did not create, and the failure arrives much
later, in someone else's CI run, wearing the costume of a product defect.**

## Pattern

The test needs a tenant, a customer, a partner, a legal document. Something in
the database already has one, so the test goes and finds it:

```ts
const tenants = await prisma.tenant.findMany({
  where: { businessUnits: { some: {} } },
  take: 2,
  orderBy: { createdAt: 'asc' },
});
if (tenants.length < 2) {
  throw new Error('These tests need two tenants with at least one business unit.');
}
```

It works on the machine it was written on. It is coupled to a fixture the test
does not own, cannot say anything about the identity of what it found, and
mutates rows the next suite is also reading.

## Why it happens in DijiPeople

Because the seeds are good enough to tempt you. `seed:demo` builds a plausible
tenant with employees, locations and schedules, and reaching for it is
genuinely less work than constructing one. The coupling is invisible at the
moment it is written — the test passes.

It then breaks for a reason that has nothing to do with the test: the seed
changes shape, a second suite deletes the row, or the test simply moves to an
environment that ran a different seed.

## Example architecture area

Three e2e suites — `attendance-engine`, `attendance-integrations-http` and
`gateway-runtime` — opened with the query above. `seed:demo` creates **one**
tenant. So `beforeAll` threw on every CI run and **81 tests errored before a
single assertion executed**, for weeks, while the reports counted 81 failures.

Two more suites had the same shape with different data:

- `legal-seed` asserted the ten seeded legal routes against an empty table,
  because the CI job runs `seed:demo` and `seed:admin` and has never run
  `seed:legal`;
- `platform-workflows` drove the invitation token `seed-horizon-onboarding`,
  which exists only in `seed-platform-workflows.ts` — also never run — and both
  public requests returned 404.

Note what each failure *looked* like. Not "the fixture is missing", but "the
attendance engine is broken", "the legal seed is incomplete", "the partner
onboarding route has regressed". A 404 from a route that was never reached is
indistinguishable from a 404 from a route that is gone.

## Detection checklist

- A `beforeAll` that **queries** for its subject rather than creating it:
  `findFirst`, `findFirstOrThrow`, `findMany({ take: n })`, `orderBy: createdAt`.
- A literal that only a seed produces — a company name, a slug, an invitation
  token, a document id.
- An assertion counting rows across a whole table rather than the ids the test
  created.
- A test named for a seed (`*-seed.e2e-spec.ts`) that does not run that seed.
- Teardown that deletes by an id assigned in `beforeAll` — see below; the two
  faults travel together.

## The teardown half

Setup that can fail leaves teardown holding ids that were never assigned, and
Prisma refuses them outright:

```
Invalid `prisma.rawAttendanceEvent.deleteMany()` invocation
  where: { integrationId: { in: [undefined, undefined, undefined] } }
Invalid value for argument `in[0]`: Can not use `undefined` value within array.
```

The result is a second failure, louder than the first, reported as "Test suite
failed to run" on top of the tests that already failed. Worse, Prisma reads a
plain `undefined` **filter** as "do not filter on this column", so
`deleteMany({ where: { tenantId, integrationId } })` with no integration deletes
every row for the tenant — harmless against a fixture tenant, not harmless
against a borrowed one.

## Required regression test

`services/api/test/db-fixtures-contract.e2e-spec.ts` — the fixture layer's own
contract, against real PostgreSQL: a pair really is two isolated tenants, each
carries the organization and business unit its modules need, cleanup removes
everything, and cleanup survives partial construction.

## Agent responsible

**Database Agent** owns the fixture architecture. **QA** owns the scenarios and
must not open one bug per cascading failure — a broken precondition is one
finding.

## Reviewer check

Reject a database-backed test whose `beforeAll` queries for its subject instead
of creating it. `DbFixtures` exists: `createTenantPair()` returns two isolated
tenants with organizations and business units, and `definedIds()` guards the
teardown of anything that does not cascade from a tenant.

## QA check

When many tests in a suite fail identically, read the **first** error, not the
count. `Test suite failed to run` means nothing after it executed, and the
finding is the precondition — one record, not N.

`E2E_FIXTURE_CONTRACT_BROKEN` in `.agent/context/ci-operations.md` is the CI
signal for exactly this, and `database-e2e-report` surfaces it separately from
the test counts.

## Related records

[[ITEM-0047]] — the backlog item this pattern was extracted from, carrying the
suite-by-suite evidence. [[BUG-0049]] — the sibling failure in reporting rather
than fixtures: a red job that read as green. [[qa-and-ci-architecture]] — where
the database e2e gate sits in the pipeline.

`.agent/context/testing-architecture.md` records which test types run against a
real database. It is deliberately not a wikilink: `.agent/` is not synced into
the vault, and a link to a note that cannot exist is worse than a path.

Regression coverage is REG-070 in the regression register; the reusable
scenario is QA-TENANT-006.

## Prevention rule

**A test creates what it asserts on.** Where the subject genuinely is a seed —
`legal-seed` asserts what `seed:legal` produces — the suite runs that seed
itself rather than assuming a pipeline step did. Export the seed as a function
and call it; a seed that can only be executed as a script cannot be tested.
