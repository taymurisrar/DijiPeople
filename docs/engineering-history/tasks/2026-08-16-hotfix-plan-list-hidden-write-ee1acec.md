# Engineering History — Hotfix: Plan list GET mutates commercial pricing (BUG-0030)

| | |
|---|---|
| **Task Title** | Production hotfix — plan list GET mutates commercial pricing |
| **Task Type** | BUGFIX (P0) + MIGRATION + ARCHITECTURE |
| **Date** | 2026-08-16 |
| **Architect Plan** | No separate ExecPlan. A production P0 with a known reproduction; the analysis that would have filled a plan — six candidate causes tested and dispositioned, the `ensure*` audit with classifications, and the PlanPrice identity decision — is recorded in BUG-0030 and the QA run instead. |
| **Agents Used** | Architect (root cause, `ensure*` audit, triage), Database (constraint semantics, migration, real-PostgreSQL evidence), Backend/API (bootstrap relocation, idempotency), QA (scenarios A–G), Reviewer (self-review), Release/DevOps (deployment ordering), Integrator (Git, CI, merge). **Deliberately not used:** Frontend — no API contract change, so no consumer needed to change. |

## Production defect

```
GET /api/platform-runtime/plans  ->  409 DATABASE_DUPLICATE_RECORD
P2002 on ("planId", "billingCycle", "currency")
constraint: PlanPrice_active_plan_cycle_currency_key
```

Call stack: `PlatformRuntimeService.list -> SuperAdminService.listPlans ->
ensureDefaultPlans -> ensureAuthoritativePlanPrices -> planPrice.create()`.

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/hotfix-plan-list-hidden-write` |
| **Base SHA** | `78072d2` |
| **Final Task SHA** | `12b67a237944734a7029319513f831055308b529` |
| **Target Branch** | `main` |
| **Merge Commit** | `ee1acec9bdbe8d8cd1fb40790f71e09871952dcd` (PR #18) |
| **Final Target SHA** | `ee1acec9bdbe8d8cd1fb40790f71e09871952dcd` |

### Commits

```
12b67a2 fix(super-admin): stop the plan list GET from writing commercial pricing
```

### Files Changed

17 files.

```
services/api/src/modules/super-admin/commercial-bootstrap.ts            (new)
services/api/src/modules/super-admin/plan-read-path-purity.spec.ts      (new)
services/api/src/modules/super-admin/super-admin.service.ts             read paths cleaned
services/api/test/commercial-bootstrap.e2e-spec.ts                      (new, real PostgreSQL)
services/api/prisma/migrations/20260816200000_planprice_market_aware_active_uniqueness/
services/api/prisma/seed-config.ts                                      bootstrap invoked here
scripts/report-planprice-conflicts.mjs                                  (new, read-only)
.github/workflows/ci.yml                                                real-PG spec promoted to gate
docs/  (BUG-0030, ITEM-0025, QA run, hidden-write-on-read pattern, regressions)
```

## Conflicts

None. Branch cut from `origin/main` at `78072d2`; `main` did not move.

## Conflict Resolutions

None — see above.

## Root cause

Three causes. Concurrency was the least of them.

1. **Check/constraint divergence (primary).** The bootstrap checked
   `{ planId, marketId, currency, billingInterval }`; the database enforces
   `UNIQUE (planId, billingCycle, currency) WHERE isActive = true`. Disagreement
   on the market, on `billingInterval` versus `billingCycle`, and on `isActive`
   — simultaneously. Any pre-existing active price under a different or null
   market defeated the check and violated the index, every time.
2. **Check-then-create race (secondary).** No atomicity, so concurrent readers
   could both insert. Would have been intermittent; production was reliable.
3. **The index became structurally wrong in Wave 1.** It predates markets, and
   every seeded market defaults to USD, so it cannot tell two legitimate market
   prices apart.

All of it was reachable only because `listPlans` and `getPlanDetail` called a
mutating initializer.

**Ownership.** The `listPlans -> ensureDefaultPlans` hidden write pre-dates
Wave 1 and already created `Plan` rows on read. Wave 1 extended that chain into
`PlanPrice` — the one table with a partial unique index. The pattern was
inherited; making it fail was introduced by Wave 1.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-hotfix-plan-list-hidden-write-78072d2.md`](../../qa/runs/2026-08-16-hotfix-plan-list-hidden-write-78072d2.md) — **PASS** |
| **Bug IDs** | `BUG-0030` created and closed `FIXED` (CRITICAL/P0) |
| **Backlog Items** | `ITEM-0025` created (`PLAN_REQUIRED`) |

Three findings: BUG-0030 `FIXED`; five further hidden writes `DEFERRED`
(ITEM-0025); P2002 error mapping `ACCEPTED_RISK` — misleading on a GET, but
correct for genuine create/update requests, and with the hidden write removed
there is no longer an internal writer on that path to misreport.

## CI

| | |
|---|---|
| **CI Run ID** | `31955962245` (task branch, on `12b67a2`) · post-merge run on `ee1acec` |
| **CI Result** | **PASS** — `CI required gate` on `12b67a2`, the exact SHA merged. The one failing job, `Lint services/api`, is report-only and pre-existing. |

**The real-PostgreSQL spec was promoted into the `database-migration` required
gate** rather than left in the report-only e2e job. Verified in the job's step
list: *"Commercial bootstrap and PlanPrice uniqueness (real PostgreSQL)" —
success*, alongside the migration applying to an empty PostgreSQL 16 and
`seed:config` / `seed:verify` running against it.

That promotion is the point. The defect was a partial-index behaviour and a
race, neither of which a mocked Prisma can demonstrate — which is exactly how it
reached production. Leaving the evidence in a non-gating job would have repeated
the mistake.

## Post-Merge Validation

Against the merged SHA `ee1acec`:

| Command | Result |
|---|---|
| Post-merge CI on `main` | **PASS** — including the database gate |
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks |
| `npm run backlog:check` | **PASS** — 55 records, 0 structural errors |
| `npm run prisma:validate` | **PASS** |
| Read-path purity + Wave 1/2 regression specs | **PASS** — 4 suites, 43 tests |
| `npm --workspace landing run test` | **PASS** — 38 |
| `npm run test:app-urls` | **PASS** — 16 |

## Release / Deployment Impact

`ROLLBACK_CLASS = DATABASE_ADDITIVE`. A new index is created and the superseded
one dropped; no table, column or row is touched.

**Ordering matters and is already correct.** `npm run release:api` runs
`prisma:migrate:deploy -> seed:config -> seed:verify -> seed:admin`. The
migration must precede the API rollout, and `seed:config` — which now performs
the commercial bootstrap that used to happen on read — runs after it.

Rolling the API back without rolling back the migration is safe: the older code
would find the market-aware index strictly more permissive than the one it
expects, so nothing it previously accepted is now rejected.

**Deployment is required for the production fix to take effect.** Nothing was
deployed by this task.

## Knowledge Capture

- `docs/qa/known-bug-patterns/hidden-write-on-read.md` (**new**) — a GET that
  calls an `ensure*` initializer. Records both failure modes (concurrency, and
  the more dangerous deterministic check/constraint divergence), why the pattern
  is attractive, and why a repository mock is insufficient to test it.
- `docs/qa/regressions/index.md` — `REG-020`.
- Durable rules: reads do not initialise state; an application-level existence
  check must name exactly the columns of the constraint that protects the table,
  including partial-index predicates; and a unique violation is never success
  until the winning row has been read and verified.

## Obsidian Sync

Run against the merged state — see the final report.

## Cleanup

Worktree and local branches removed after the merge — see the final report.
