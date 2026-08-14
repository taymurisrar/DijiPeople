# E2E Suite Classification

The nine `*.e2e-spec.ts` suites under `services/api/test/`, classified so the
`database-e2e-report` job can be promoted to a required gate deliberately rather
than hopefully.

> **This classification is static.** It was derived by reading the suites, not by
> running them — at the time of writing no database was reachable from the
> development environment. Every row is a **prediction**, and the first CI run of
> `database-e2e-report` is what turns it into evidence. Update this file with
> observed results; do not leave predictions standing once facts exist.

**Classified:** 2026-08-14, against commit `0b4d90e`.

---

## Classification

| Suite | Tests | Class | Basis |
|---|---|---|---|
| `app` | 1 | **READY** | Boots `AppModule` and hits the health route. Needs only `DATABASE_URL`. Creates no data |
| `attendance-engine` | 20 | **READY** | Creates its own data, unique suffixes, 19 `deleteMany` cleanups in `afterAll`/`afterEach` |
| `attendance-operational` | 26 | **READY** | Same shape — own data, 21 cleanups |
| `attendance-review` | 23 | **READY** | Own data with 7 unique-id generators, 20 cleanups |
| `permission-propagation` | 12 | **READY** | Does not boot `AppModule`; uses `PrismaModule` + `PermissionBootstrapService` directly. Tenants suffixed `perm-${Date.now()}-${random}` |
| `attendance-integrations-http` | 34 | **NEEDS_ENVIRONMENT** | Stores integration credentials. Needs `SECRET_ENCRYPTION_KEY`, or it exercises the plaintext fallback that never runs in a real environment |
| `attendance-integrations-isolation` | 42 | **NEEDS_ENVIRONMENT** | Same, plus the largest suite — the most likely to expose timing or ordering assumptions |
| `gateway-runtime` | 27 | **NEEDS_ENVIRONMENT** | Same credential-encryption dependency |
| `platform-workflows` | 5 | **NEEDS_TEST_DATA** | Seeds itself through the public endpoint `/public/partners/onboarding/seed-horizon-onboarding`, and has **no `deleteMany` cleanup**. Safe in an ephemeral database; would leak in a reused one |

**Totals:** 190 tests across 9 suites. 5 `READY`, 3 `NEEDS_ENVIRONMENT`,
1 `NEEDS_TEST_DATA`. **None classified `FLAKY`, `BROKEN` or `STALE`** — no
skipped tests, no `TODO`/`FIXME` markers, and every suite reads as maintained.

The `NEEDS_ENVIRONMENT` requirement is already satisfied: the
`database-e2e-report` job sets a synthetic `SECRET_ENCRYPTION_KEY`. They are
listed separately because that dependency is invisible in the suite itself and
would silently degrade if the variable were dropped.

**Nothing was deleted.** A suite that cannot run today is a suite waiting for
infrastructure, not dead code.

---

## What the suites already do well

Worth stating, because it is why this was cheap to enable:

- **They create their own data.** No dependence on `seed:demo`, on a developer's
  records, or on a production snapshot.
- **They collide-proof it.** `Date.now()`, `randomUUID()` and `Math.random()`
  appear across the suites for exactly this reason.
- **They clean up.** 8 of 9 use `afterAll`/`afterEach` with `deleteMany`, in
  dependency-aware order.

That is the discipline `services/api/test/helpers/db-fixtures.ts` generalises,
rather than replaces.

---

## Promotion to a required gate

`database-e2e-report` becomes required when:

1. every `READY` suite passes three consecutive runs
2. `NEEDS_*` suites are fixed, or quarantined **by name** with the reason
   recorded here
3. total runtime stays under ~10 minutes

Until then it uploads its output as an artifact and writes a job summary.

## When a suite fails

Classify before acting — `docs/development/ci.md`:

`MIGRATION_FAILURE` · `SEED_FAILURE` · `CONSTRAINT_FAILURE` ·
`E2E_PRODUCT_FAILURE` · `TEST_INFRA_FAILURE` · `TENANT_ISOLATION_FAILURE` ·
`DATA_CLEANUP_FAILURE`

Only `TEST_INFRA_FAILURE` justifies a retry. **Do not modify product behaviour
to make an e2e suite pass** — if the suite is right, the product is wrong, and
that is a defect to report rather than a test to adjust.
