# Reproducing the database e2e suites locally

> Written 2026-08-18 while diagnosing
> [ITEM-0047](../backlog/items/ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql.md).

These suites had failed in CI for weeks and nobody could work on them, because
nobody could run them. This is the recipe that reproduces the CI result exactly.
It matched the recorded baseline test-for-test on the first attempt: **7 suites,
148 failed, 128 passed**.

## Why it did not work before

Two things, and neither is the database:

1. **Booting `AppModule` required Stripe credentials.** `createStripeClient` was
   an eager provider factory that threw during dependency resolution, so the
   whole API refused to start without them. CI hid this by setting placeholder
   keys; a developer without them saw only `STRIPE_SECRET_KEY is required` and
   no way forward. Fixed — the client is now built on first use, with production
   still failing fast.
2. **The suites need seeded data that is not obvious.** `seed:demo` for the
   tenant side, and `seed:admin` for an ACTIVE `PlatformUser`. The CI job ran
   only the first.

## The recipe

Everything below is synthetic and test-only. Do not point this at the dev
database — it seeds and mutates.

```bash
# 1. A throwaway database. The role needs CREATEDB.
createdb dijipeople_e2e_ci

export DATABASE_URL="postgresql://<user>:<password>@localhost:5432/dijipeople_e2e_ci"
export NODE_ENV=test

# 2. The same synthetic values CI uses. None is a real credential.
export SECRET_ENCRYPTION_KEY=ci-test-only-encryption-key-not-a-secret-000000
export STRIPE_MODE=test
export STRIPE_SECRET_KEY=sk_test_ci_placeholder_not_a_real_key
export STRIPE_API_VERSION=2024-06-20
export PLATFORM_SUPER_ADMIN_EMAIL=ci-admin@example.invalid
export PLATFORM_SUPER_ADMIN_PASSWORD=ci-test-only-password-000000

# 3. Full migration history, then both seeds.
npm --workspace api run prisma:migrate:deploy
npm --workspace api run seed:demo
npm --workspace api run seed:admin

# 4. The suites.
npm --workspace api run test:e2e
```

`STRIPE_SECRET_KEY` must keep the `sk_test_` prefix even though it is fake —
`assertSecretMatchesMode` rejects a non-test key when `STRIPE_MODE=test`, and
that guard is worth keeping honest in CI too.

## Reading the result

**A parallel run tells you almost nothing about an individual suite.** The
suites share one database and one seeded tenant, and jest runs them in parallel
workers, so they interfere. Two runs of the identical command minutes apart gave
5 and then 10 failing suites, with different membership — including suites that
had just passed on their own.

That is ITEM-0047 cause D and it is not fixed. Until it is:

- To judge one suite, run **only** that suite:
  `npx jest --config ./test/jest-e2e.json --testPathPatterns <name>`
- To compare whole-run numbers, use `--runInBand` so at least the ordering is
  deterministic. It is slow — several minutes — but a serial number means
  something and a parallel one does not.
- Never record a parallel run as a pass. A green suite in a parallel run is as
  untrustworthy as a red one.

## What a new suite should do

Build its own data through `test/helpers/db-fixtures.ts`. Two suites failed for
years' worth of CI runs purely because they reached for ambient data:

- `attendance-integrations-isolation` wanted two tenants that already had
  employees and work sites; `seed:demo` makes one.
- `platform-workflows` wanted a customer account named `Crescent Retail Group`,
  which no seed has ever created.

Neither dependency was load-bearing — both suites now create what they need and
pass. Reaching for seeded data couples a test to a fixture it does not own, and
the failure arrives much later, in someone else's CI run, looking like a
database problem.
