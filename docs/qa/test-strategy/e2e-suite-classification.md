# E2E Suite Classification

The database-backed `*.e2e-spec.ts` suites under `services/api/test/`,
classified so the `database-e2e-report` job can be promoted to a required gate
deliberately rather than hopefully. The original classification covered nine
suites; the tree now contains **15**, so the old table is retained as historical
design evidence and the current execution snapshot below is authoritative.

> **First CI run: every suite failed.** The static classification below was
> wrong in one specific way, and the run is what proved it. Both root causes
> were environment, not product — recorded here because the mistake generalises:
> *reading a suite tells you what it creates; only running it tells you what it
> needs.*

**Classified:** 2026-08-14 (static), against `0b4d90e`.
**First observed run:** GitHub Actions run `31840528309`, SHA `f35d696` —
10 suites failed, 190 tests failed, 0 passed.

**Current observed runs:** GitHub Actions runs `32020076245` at `47b127f` and
`32021401010` at final task SHA `03f30cb` — both executed 15 suites / 227 tests
with 8 suites passing and the same 7 failing. Test totals varied by one:
79–80 passed and 147–148 failed. `attendance-operational` regressed from the
discovery run's PASS in both, so
`QA-ATT-007` now preserves it as a failing reusable scenario. The job is still
report-only. Its green job conclusion does not mean the Jest suite passed; that
evidence-integrity defect is `BUG-0049`.

| Current suite | Exact-base result |
|---|---|
| `app` | PASS |
| `attendance-engine` | FAIL |
| `attendance-integrations-http` | FAIL |
| `attendance-integrations-isolation` | FAIL |
| `attendance-operational` | FAIL |
| `attendance-review` | FAIL |
| `commercial-bootstrap` | PASS |
| `gateway-runtime` | FAIL |
| `permission-propagation` | PASS |
| `platform-workflows` | FAIL |
| `tenant-erasure-dry-run` | PASS |
| `tenant-erasure-order` | PASS |
| `tenant-isolation-pattern` | PASS |
| `tenant-provisioning-recovery` | PASS |
| `workspace-domain-isolation` | PASS |

## What the first run revealed

| Root cause | Suites affected | Fix |
|---|---|---|
| `STRIPE_SECRET_KEY is required for Stripe billing.` — booting `AppModule` constructs `StripeBillingService`, which throws at construction | all 8 that boot `AppModule` | `STRIPE_MODE`, `STRIPE_SECRET_KEY` (`sk_test_` prefix enforced), `STRIPE_API_VERSION` added to the job. Synthetic; no test calls Stripe |
| `customerAccount.findFirstOrThrow()` found nothing — a Tenant needs a CustomerAccount, and `seed:config` does not create one | `permission-propagation`, `platform-workflows` | `seed:demo` added after migration |
| `PrismaClientInitializationError` — a bare `new PrismaClient()` is invalid in a repository using `@prisma/adapter-pg` | `tenant-isolation-pattern` (mine) | Construct with `new PrismaPg({ connectionString })`, mirroring `PrismaService` |

The audit that produced the static classification checked
`env.validation.ts` and concluded only `DATABASE_URL` was required under
`NODE_ENV=test`. That was true of the *validation module* and false of the
*application*: a provider can throw at construction without ever being
registered as a required environment variable. **Env validation is not the same
question as "what does booting need".**

---

## Original static classification (2026-08-14)

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

**Historical totals:** 190 tests across 9 suites (10 including
`tenant-isolation-pattern`). These are not the current suite counts.
**None classified `FLAKY`, `BROKEN` or `STALE`** — no skipped tests, no
`TODO`/`FIXME` markers, and every suite reads as maintained.

**Corrected after the first run:** every suite that boots `AppModule` is
`NEEDS_ENVIRONMENT`, not `READY` — the Stripe dependency is invisible in the
suite source and only appears when the module graph is instantiated. The table
above records what each suite *creates and cleans up*, which is still accurate
and still the reason this was cheap to enable; it does not record what booting
the application requires.

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

Until then it uploads its output as an artifact and writes a job summary. The
job must also stop converting a red Jest exit into a green job conclusion;
`BUG-0049` and WP-09 own that evidence-integrity fix after WP-04 makes the suites
genuinely green.

## When a suite fails

Classify before acting — `docs/development/ci.md`:

`MIGRATION_FAILURE` · `SEED_FAILURE` · `CONSTRAINT_FAILURE` ·
`E2E_PRODUCT_FAILURE` · `TEST_INFRA_FAILURE` · `TENANT_ISOLATION_FAILURE` ·
`DATA_CLEANUP_FAILURE`

Only `TEST_INFRA_FAILURE` justifies a retry. **Do not modify product behaviour
to make an e2e suite pass** — if the suite is right, the product is wrong, and
that is a defect to report rather than a test to adjust.
