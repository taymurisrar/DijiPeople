# Test resource ownership, cleanup and evidence

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** scripts/lib/test-resources.mjs, scripts/assert-test-database.mjs, scripts/verify-database.mjs, .agent/context/testing-architecture.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

Every resource a test creates is owned, accounted for and cleaned. Ownership is
recorded when the resource is created, not reconstructed at teardown — because
a teardown that has to *work out* what it owns is a teardown that will eventually
delete something it does not.

QA, Database and Integration own immediate cleanup for their own suites.
Release/DevOps may run a janitor sweep for stale, tagged, unowned leftovers.
There is no separate cleanup agent.

---

## A test creates what it asserts on

This is the rule everything else follows from.

```
BAD    const employee = await prisma.employee.findFirst()
       expect(employee.status).toBe('ACTIVE')

GOOD   const { tenantA, buA, employee } = await fixture.create()
       expect(await service.get(employee.id)).toMatchObject({ status: 'ACTIVE' })
```

`findFirst()` and `findFirstOrThrow()` against shared or demo state couple a test
to rows it does not own. The test passes until somebody reseeds, then fails for
reasons unrelated to the code under test — and when its teardown deletes what it
found, the failure is somebody else's data.

A fixture creates what the assertion needs and returns explicit ids:

```
tenant A · business unit A · users · roles · records
tenant B · business unit B          ← the negative side of every isolation test
```

Two tenants, not one. An isolation test with a single tenant proves nothing
about isolation.

**Cleanup touches owned ids only.** No suite may delete arbitrary shared data —
not by tag, not by prefix, not by "looks like test data".

---

## Every resource is registered

| Field | Why |
|---|---|
| `OWNER` | Which suite or fixture created it |
| `TEST_RUN_ID` | Which run — so a concurrent run's rows are never in scope |
| `RESOURCE_TYPE` | tenant, employee, subscription, file, provider object, … |
| `RESOURCE_ID` | The actual identifier used to clean it |
| `CREATED_AT` | For the janitor's age threshold |
| `CLEANUP_STRATEGY` | delete · cancel · archive · drop-database · none |
| `CLEANUP_STATUS` | `PENDING`, `CLEANED`, `RETAINED_AS_EVIDENCE`, `FAILED`, `ARCHIVED_PROVIDER_LIMITATION` |

Applies to test users, employees, customers, tenants, organizations, business
units, subscriptions, tokens, files, emails, devices, database rows, temporary
databases and schemas, Stripe test objects, gateway records, and anything else a
suite brings into existence.

---

## Cleanup runs on failure too

```
IDEMPOTENT           running it twice is not an error
PARTIAL_SETUP_SAFE   a setup that failed halfway cleans exactly what it made
OWNERSHIP_AWARE      only registered ids, never a broad match
FAILURE_VISIBLE      a failed cleanup is reported, never swallowed
```

The failure being designed out is familiar: setup throws on step three, teardown
runs against undefined ids, and the suite reports a second, misleading error
that buries the first. Registering each resource at the moment it is created —
rather than assuming the whole fixture succeeded — is what makes partial
teardown safe.

**A swallowed cleanup failure is not a clean run.** `try { } catch { }` around
teardown converts a leaked tenant into a green suite. Owned-resource cleanup
failures propagate into the run's accounting, and a QA scenario cannot report
`PASS` while its run leaked.

---

## Ephemeral resource is not durable evidence

Two populations, cleaned differently:

| `EPHEMERAL_TEST_RESOURCE` | `DURABLE_TEST_EVIDENCE` |
|---|---|
| the tenant row a screenshot was taken against | the screenshot |
| the seeded employee | the Playwright trace |
| the temporary database | the QA run record |
| the Stripe test customer | the failure log, the test report, the regression record |

Ephemeral resources are cleaned. Evidence is retained under the evidence policy.

**Do not delete evidence because the resource it describes was deleted.** The
screenshot is the proof; the row it was taken against is not.

---

## Test databases are disposable

```
ephemeral Postgres  →  unique database or schema  →  migrations  →  baseline
                    →  suite-owned fixtures  →  tests  →  cleanup  →  destroy
```

`scripts/assert-test-database.mjs` is the guard: it refuses a managed provider
host, refuses a production-like database name, and requires a local or CI
service host. The developer's persistent database is never the test environment.

---

## External providers

Integration owns provider-specific cleanup mechanics. Stripe test objects are
deleted, cancelled or archived according to what the provider actually permits.

When an object cannot be removed:

```
CLEANUP_STATUS = ARCHIVED_PROVIDER_LIMITATION
```

**Never report `CLEANED` for something that still exists.** A false terminal
status is worse than an honest limitation, because the next run trusts it.

---

## Run accounting

Every run that creates resources closes with:

```
TEST_RESOURCES_CREATED
TEST_RESOURCES_CLEANED
TEST_RESOURCES_RETAINED_AS_EVIDENCE
TEST_RESOURCE_CLEANUP_FAILURES
UNACCOUNTED_TEST_RESOURCES
```

Required to finish:

```
TEST_RESOURCE_CLEANUP_FAILURES = 0
UNACCOUNTED_TEST_RESOURCES     = 0
```

`UNACCOUNTED` means created and neither cleaned, retained as evidence, nor
recorded as failed — a resource nobody can now find. It is the only one of the
five that cannot be argued down, because unlike a failure it leaves no trace to
follow.

---

## The janitor

Release/DevOps may sweep resources that are **all** of:

- tagged as test-owned;
- older than the threshold;
- not claimed by any active run.

All three, never two. A sweep that runs on age and tag alone will eventually
delete a long-running suite's fixtures mid-run. When ownership cannot be proven,
the janitor reports rather than deletes.
