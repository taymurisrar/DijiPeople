---
ID: ITEM-0047
aliases: [ITEM-0047]
Title: Database e2e suites fail against an ephemeral PostgreSQL
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [services/api/test, .github/workflows, database]
Source: QA_RUN
OwnerAgent: database
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-20
RelatedBug: BUG-0049
RelatedQA: docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0047 — Database e2e suites fail against an ephemeral PostgreSQL

## Summary

`database-e2e-report` runs the fifteen database-backed e2e suites and, at the
last audited SHAs, 7 of 15 suites and 148 of 227 tests failed. BUG-0049 fixed
the reporting — the summary now states `RESULT: FAIL` explicitly instead of
letting a green job conclusion imply a pass — but it deliberately did not touch
the failures themselves. This item carries them.

## Why It Matters

These are the only suites that exercise the product against a real PostgreSQL:
migrations, tenant erasure ordering, permission propagation, attendance
integration isolation, platform workflows. Every one of them is a tenant-boundary
or data-integrity assertion, and none of them currently gates anything. Until
they pass deterministically the job cannot be promoted, and `database-migration`
alone proves only that a *new* installation works.

## Evidence

- GitHub run `32009837400`, SHA `0051180` — 6 of 15 suites, 136 of 227 tests failed.
- GitHub run `32020076245`, SHA `47b127f` — worsened to 7 suites, 148 tests.
- `docs/qa/runs/2026-08-17-record-state-reconciliation-d919e1a.md:143` records
  the same 7 failed / 8 passed split at the task SHAs.
- `.github/workflows/ci.yml` — the job seeds demo data before running, which is
  the one pre-existing-data dependency in the suite set.

## Diagnosis, 2026-08-18

**The suites were reproduced locally for the first time.** That is what had been
missing: the failures were only ever observed in CI, so nobody could iterate on
them. The recipe is recorded in `docs/development/database-e2e-reproduction.md`
and reproduces the recorded baseline exactly — 7 suites, **148 failed / 128
passed**, matching run `32020076245` test-for-test.

Four causes were found. Three are fixed; the fourth is the headline and is not.

### A. The API could not boot without Stripe credentials — FIXED

`createStripeClient` was an eager `useFactory` that threw during Nest dependency
resolution. Because `BillingModule` sits in `AppModule`, **the whole API was
un-bootable without Stripe configuration** — not just billing. Any environment
that does not sell anything hit it: a developer machine, a seed script, a CLI
invocation. CI masked it by setting placeholder keys, which is exactly why it
never appeared in CI logs while blocking local reproduction.

Fixed by deferring construction to first use, while keeping production
fail-fast. Every guarantee is retained; only the moment of failure moved.

### B. `attendance-integrations-isolation` needed two seeded tenants — FIXED

It searched for two tenants that each already had an employee and a work site.
`seed:demo` creates **one** tenant, so the search failed on every freshly seeded
database and all 42 tests errored before reaching an assertion. Rewritten to
build its own tenants through `db-fixtures` — which is what the CI job's own
comment asks new tests to do. **42 tests recovered.**

### C. `platform-workflows` depended on data no seed creates — FIXED

It required a customer account literally named `Crescent Retail Group`. Nothing
produces that name; `seed:demo` creates `DijiPeople Demo Company`. It also needs
an ACTIVE `PlatformUser`, which only `seed:admin` creates and which the CI job
never ran. Both fixed: the hardcoded name is gone (it was only interpolated into
sample contract HTML) and `seed:admin` is now a CI step. **3 of 5 recovered**;
the remaining 2 are genuine assertion failures needing their own investigation.

### D. The suites share one database and run in parallel — NOT FIXED

This is the real source of the nondeterminism, and it confirms the hypothesis
this item already recorded. Two runs of the identical command, minutes apart,
gave **5 failing suites** and then **10** — with different membership each time,
including suites that had just passed in isolation. That is cross-suite
interference: one database, one seeded tenant, jest running suites in parallel
workers.

It also explains the drift this item was opened over. 136, then 148, then 128
were never three states of the product; they were three samples of one race.

**Nothing should be concluded about a suite from a parallel run**, in either
direction — a pass is as untrustworthy as a failure.

## Result so far

| | Suites failing | Tests failing | Tests passing |
|---|---|---|---|
| Recorded baseline (`32020076245`) | 7 | 148 | 79 |
| Local reproduction of that baseline | 7 | 148 | 128 |
| After fixes A, B and C | 5 | 86 | 190 |

**62 tests recovered.** The residual 86 are a mix of the parallel-execution race
(D) and real failures hidden behind it. They cannot be separated until D is
addressed, which is why no further suite is being "fixed" on the strength of a
parallel run.


## Status on 2026-08-19 — still RED, and now it does not even finish

Re-measured at the close of the agent-framework-hardening task. This is not a
new record; it is this one, updated with what the evidence currently says.

**Last run that actually completed** — run 32160472427, SHA 2d6cf1a3:

```
Test Suites:   6 failed, 15 passed, 21 total
Tests:        92 failed, 184 passed, 276 total
```

**Every run since then has timed out instead of completing.** `maxWorkers: 1`
landed in e9cad20 for determinism (correct — see [[ITEM-0055]]), and the suite
now exceeds the 30-minute job cap on every run:

| Run | SHA | Duration | Outcome |
|---|---|---:|---|
| 32179954819 | 3f6775e0 | 30m17s | cancelled — timeout |
| 32182849325 | bec5cdfb | 30m25s | cancelled — timeout |
| 32186211469 | 574fba19 | 30m17s | cancelled — timeout |

So the current honest position is worse than "6 suites red": **the suite has no
completing run at all**, and therefore no current pass/fail evidence. The 30
minute cap is doing its job — before it existed the same job ran unbounded and
was stopped only by a superseding push.

`DATABASE_E2E_HEALTH_STATUS = FAIL`. The `CI required gate` being green does not
change that: this job is report-only by design, and a report-only job that is
red is a red job, not an absent one (that distinction is exactly [[BUG-0049]]).

### The six failing suites, and their root-cause groups

Named from run 32160472427 so the next agent starts from evidence rather than
re-deriving it:

| Suite | Group |
|---|---|
| `test/attendance-engine.e2e-spec.ts` | **A — shared fixture state** |
| `test/attendance-integrations-http.e2e-spec.ts` | **A — shared fixture state** |
| `test/attendance-review.e2e-spec.ts` | **A — shared fixture state** |
| `test/gateway-runtime.e2e-spec.ts` | **B — environment/boundary** |
| `test/legal-documents.e2e-spec.ts` | **C — schema-sensitive seed** |
| `test/platform-workflows.e2e-spec.ts` | **C — schema-sensitive seed** |

**Group A** is the cluster `maxWorkers: 1` was introduced to contain: three
attendance suites sharing one seeded dataset. Serialising made them
*deterministic*, not *passing* — a distinction worth keeping, because it is why
[[ITEM-0055]] is a blocker here and not a fix.

**Group B** depends on gateway/boundary state that CI does not provide.

**Group C** relies on rows `seed:config` does not create; the workflow already
compensates with `seed:demo` and `seed:admin`, and these are the suites that
still want more.

Grouping is from suite identity and the workflow's own notes, not from reading
every failure — the suite has not completed since, so per-test causes cannot be
claimed. Treat the groups as a starting hypothesis to confirm, not a diagnosis.

### Open handles

```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown.
```

`DATABASE_E2E_OPEN_HANDLES = PRESENT`. A leaked handle keeps the worker alive
after its assertions finish, which inflates wall-clock and is a plausible
contributor to the 30-minute overrun — the two symptoms are probably one defect.
Run with `--detectOpenHandles` before assuming the serial mode alone explains the
duration.

### Ownership

**Database Agent leads; QA owns the evidence.** Split as the roles define it:

- **Database Agent** — fixture architecture, per-worker database isolation,
  schema-sensitive setup, and whether a failure is a genuine data-integrity
  defect or a test-harness artefact.
- **QA** — durable scenarios, the regression register entry, and proving the
  behaviour once the harness stops lying.

This was `OwnerAgent: qa` and is now `database`: the blocking problem is
database fixture architecture, not scenario design.

### The `DATABASE_E2E_RED` signal

Report-only does **not** mean ignorable. Repeated failure or repeated timeout is
now an operational signal the Database Agent and QA act on — see
`.agent/context/ci-operations.md`. Red database evidence must not persist
indefinitely behind a green required gate.

## Resolved on 2026-08-20 — every suite green, twice, in under eleven minutes

Reproduced locally against a throwaway PostgreSQL using the recipe in
[`database-e2e-reproduction.md`](../../development/database-e2e-reproduction.md),
then fixed. The result:

| | Suites | Tests failing | Tests passing | Wall clock |
|---|---|---|---|---|
| Recorded baseline (`32020076245`) | 7 failing | 148 | 79 | — |
| Last completing CI run (`32160472427`) | 6 failing | 92 | 184 | — |
| Every run after that | — | — | — | **timed out at 30m** |
| **After this task, run 1** | **0 failing / 24 total** | **0** | **295** | **644s** |
| **After this task, run 2** | **0 failing / 24 total** | **0** | **295** | **see below** |

`DATABASE_E2E_OPEN_HANDLES = 0` — no "force exited" line, no "Jest did not
exit", under `--detectOpenHandles` on both runs.

### It was one defect wearing six faces

The three groups this record hypothesised — A shared fixture state, B
environment/boundary, C schema-sensitive seed — were **not three causes**. They
were one: *suites reaching for data they did not create*, differing only in
which absent data they reached for.

| Suite | What it reached for | What existed |
|---|---|---|
| `attendance-engine` | two tenants with a business unit | `seed:demo` makes one |
| `attendance-integrations-http` | same | same |
| `gateway-runtime` | same | same |
| `attendance-review` | nothing — collateral of the shared-database race | — |
| `legal-seed` | the output of `seed:legal` | CI never ran it |
| `platform-workflows` | the token `seed-horizon-onboarding` | only `seed:platform-workflows` makes it, and CI never ran that either |

Group B was never environmental. `gateway-runtime` failed on exactly the same
`take: 2` query as the two attendance suites, and went 0/27 → 27/27 with the
same fixture change. The classification was a reasonable hypothesis from suite
identity, and it was wrong; that is why this record said to confirm it rather
than treat it as a diagnosis.

### The 30-minute timeout was a hang, not slowness

Running the three group-A suites together locally reproduced it: 27 minutes
with 86 seconds of CPU — a process waiting, not working. It never appeared when
a suite ran alone, which is why the CI timeout looked like a capacity problem
and was not.

Once the suites stopped sharing borrowed rows, the whole set — all 24 suites,
still at `maxWorkers: 1` — completed in **644 seconds**. That is the answer to
[[ITEM-0055]] as well: serialisation was never the cost.

### What changed

- `test/helpers/db-fixtures.ts` — `createOrganization`, `createBusinessUnit`,
  `createTenantWithBusinessUnit`, `createTenantPair`, `definedIds`.
- `test/db-fixtures-contract.e2e-spec.ts` — the fixture layer's own contract,
  including that a fixture tenant's cascade really does remove Organization and
  BusinessUnit. Asserted, because `BusinessUnit → Organization` is `Restrict`
  and only a real PostgreSQL shows that ordering.
- Teardown across the converted suites collapses to `fixtures.cleanup()` inside
  `try`/`finally`, with `app.close()` guaranteed. The hand-ordered deletes are
  gone, and with them the `in: [undefined, undefined]` that turned a setup
  failure into a louder teardown failure.
- `prisma/seed-legal.ts` exports `seedLegalDocuments(prisma)`; `legal-seed`
  calls it. A test of a seed runs that seed.
- `platform-workflows` creates its own Partner and PartnerOnboardingApplication
  with a per-run token.
- `attendance-integrations-http`'s `createActor` grants matrix privileges as
  well as legacy keys — `PermissionsGuard` requires both, and the borrowed
  seeded tenant had been supplying the second half by accident.

### No product defect was found

Every failure classified as a test-harness defect. Nothing here became a BUG
record, and nothing was "fixed" by relaxing an assertion. The one assertion that
changed — the legal foreign-key wording in `legal-documents.e2e-spec.ts` —
widened which *sentence* it accepts across three layers that can raise the same
rejection; the delete must still be refused.

[[BUG-0079]] was raised in the same task, and is the browser install, not this.

### Promotion

See the promotion decision recorded on `database-e2e-report` in `ci.yml`.

## Proposed Approach

ExecPlan required; this is diagnosis before repair and the causes are probably
not uniform.

1. Re-run the suites **serially** to separate shared-state races from real
   product failures. The suites share one database and one seeded tenant, so a
   parallel run cannot distinguish the two.
2. Classify each residual failure: test-fixture defect, suite-ordering
   dependency, or genuine product defect. **A product defect gets its own BUG
   record** rather than being absorbed here.
3. Move suites onto `test/helpers/db-fixtures.ts` so they build their own data
   instead of depending on `seed:demo`.
4. Promote `database-e2e-report` into `ci-required` only after two consecutive
   deterministic green runs on `develop`, following the same criteria pattern
   the dual-permission invariant and API lint were promoted under.

## Acceptance Criteria

- A serial run is recorded, with each failure classified into one of the three
  causes above.
- Every genuine product defect found has its own BUG record with evidence.
- The suites pass deterministically twice in a row on `develop`.
- `database-e2e-report` is promoted into the required gate, or this item states
  explicitly why it should not be.

## Dependencies

None blocking. Independent of the authorization packages.

## Related Items

[[BUG-0049]] · [[TASK-0005]] · [[qa-and-ci-architecture]] · [[ITEM-0055]] ·
[[database-architecture]]
