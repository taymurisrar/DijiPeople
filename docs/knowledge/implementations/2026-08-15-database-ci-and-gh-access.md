# Database CI, GitHub access, and the first four framework merges

**Category:** ARCHITECTURE_CHANGE · TESTING_RULE
**Date:** 2026-08-15
**Branches:** `agent/ci-merge-gate`, `agent/knowledge-learning-loop`, `agent/database-test-infra`
**Merge SHAs:** `af2d81d`, `0c4256a`, `1df9182`
**Final `origin/main`:** `1df9182`
**CI runs:** 31837034443, 31839103240, 31844677961, post-merge 31845310879

## What shipped

Three stacked framework branches that had been blocked on an unreadable CI
verdict, merged in dependency order once `gh` made the verdict readable:

1. **Shared-target CI gate** — merging into `main`, `develop`, `release/*` or
   any protected branch requires `REMOTE_CI_STATUS = PASS` on the exact SHA.
2. **Selective knowledge retrieval and the durable learning loop** —
   `USER_FEEDBACK_CLASS`, `RELEVANT_KNOWLEDGE_RETRIEVAL`, repeated-mistake
   detection.
3. **Ephemeral PostgreSQL in CI** — a required `database-migration` gate and a
   report-only `database-e2e-report`.

## The lesson worth keeping

**Reading a test tells you what it creates. Only running it tells you what it
needs.**

The audit behind the e2e classification inspected every suite and concluded they
were self-sufficient: own data, unique suffixes, `deleteMany` cleanup. All true.
The first real run failed **10 suites and all 190 tests**, for three reasons
none of which were visible in the suite source:

| Cause | Why reading missed it |
|---|---|
| `STRIPE_SECRET_KEY is required for Stripe billing.` | `StripeBillingService` throws **at construction**. Booting `AppModule` instantiates it. The variable is not in `PRODUCTION_REQUIRED_ENV`, so env-validation review said "only `DATABASE_URL` is needed" |
| `customerAccount.findFirstOrThrow()` found nothing | `Tenant.customerAccountId` is a required FK; `seed:config` does not create an account, `seed:demo` does. Two suites depend on it |
| `PrismaClientInitializationError` | This repository drives Prisma through `@prisma/adapter-pg`. A bare `new PrismaClient()` is invalid — it must be constructed with the adapter, as `PrismaService` does |

**Env validation is not the same question as "what does booting require".** A
provider can throw during dependency injection without ever being declared a
required environment variable. That generalises well beyond Stripe.

After the fixes: **4 suites / 60 tests passing**, including the new
`tenant-isolation-pattern` spec. See
[`../../qa/test-strategy/e2e-suite-classification.md`](../../qa/test-strategy/e2e-suite-classification.md).

## What the database gate proved

`database-migration` passed on its **first** run: the entire committed migration
history applied to an empty PostgreSQL, `migrate status` reported fully applied,
and `seed:config` + `seed:verify` succeeded. The migration history is sound — a
fact no developer database could have established, because it already holds the
schema.

`tenant-isolation-pattern` now verifies against real PostgreSQL: cross-tenant
read returns null, cross-tenant `updateMany` affects 0 rows, `RESTRICT` blocks
deleting a referenced `CustomerAccount`, tenant-scoped composite uniqueness
permits the same key in another tenant, and a failed statement rolls the whole
transaction back. Mocked Prisma could have "proved" every one of those without a
single constraint existing.

## `gh` was installed but invisible

`gh.exe` was present at `C:\Program Files\GitHub CLI\gh.exe` and authenticated,
but absent from the `PATH` of both shells — they had been started before the
install. `command -v gh` failed in each, which is indistinguishable from "not
installed".

**Check the filesystem before concluding a tool is missing.** The cost of the
wrong conclusion here would have been four branches staying blocked
indefinitely.

Follow-up: `scripts/finalize-agent-task.mjs` probes `gh --version` via the
`PATH` and therefore still reports `CI_READ = BLOCKED_BY_ACCESS`. The capability
is real; the probe looks in the wrong place.

## Context updates recommended

- `.agent/context/testing-architecture.md` — record that booting `AppModule`
  requires Stripe configuration, which is not part of env validation.
