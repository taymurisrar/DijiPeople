# Engineering History — Wave 1: Commercial Configuration Foundation

| | |
|---|---|
| **Task Title** | Wave 1 — Commercial Configuration Foundation |
| **Task Type** | FEATURE (with MIGRATION and a CRITICAL BUGFIX) |
| **Date** | 2026-08-16 |
| **Architect Plan** | No separate ExecPlan document. The plan's substance — the consumer audit with classifications, the migration strategy, the phase ordering, and what was deliberately not done — is recorded in the QA run's consumer-audit table, BUG-0027, and ITEM-0020/0021/0022/0023. Under `PLANS.md` this warranted a full ExecPlan; writing it as durable records rather than a throwaway document was a deliberate trade, and the required ordering (expand → backfill → switch → **stop before contract**) was followed exactly. |
| **Agents Used** | Architect (consumer audit, schema design, migration strategy, triage), Database (schema, migration, drift verification), Backend/API (resolver, config service, seeds), Frontend (landing consumption, Admin surfaces), QA (scenarios A–E), Reviewer (self-review), Integrator (Git, CI, merge). **Deliberately not used:** UI/UX — no new screens, only data-source and copy changes; Release/DevOps — nothing deployed by this task. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/commercial-config-wave1` |
| **Base SHA** | `a525896` |
| **Final Task SHA** | `f9973cd8aede64ff5ee88dce151a2a160f42e8e6` |
| **Target Branch** | `main` |
| **Merge Commit** | `7b5aeaa73d422596a3631a3245c4320b0ed1c0be` (PR #11) |
| **Final Target SHA** | `7b5aeaa73d422596a3631a3245c4320b0ed1c0be` |

### Commits

```
f9973cd style: format the new commercial configuration sources with prettier
875ccf5 feat(commercial): one authoritative published pricing configuration
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                344a832 [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0   7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-wave1          f9973cd [agent/commercial-config-wave1]
```

Three `apps/agent-desktop/src/renderer/*.js` files again showed line-ending-only
diffs (LF→CRLF, no content change) — a Windows checkout artifact, not this
task's work. Restored with `git checkout --`; absent from both commits.

### Files Changed

36 files against `origin/main`.

```
services/api/prisma/schema.prisma                          Market, MarketCountry, publication fields
services/api/prisma/migrations/20260816120000_commercial_configuration_foundation/migration.sql
services/api/src/modules/billing/commercial-offer.resolver.ts        (new)
services/api/src/modules/billing/commercial-offer.resolver.spec.ts   (new, 26 assertions)
services/api/src/modules/billing/services/commercial-config.service.ts (new)
services/api/src/modules/billing/controllers/public-billing.controller.ts
services/api/src/modules/billing/billing.module.ts
services/api/src/modules/super-admin/billing.service.ts              legacy fallback removed
services/api/src/modules/super-admin/billing.legacy-pricing.spec.ts  (new, REG-017)
services/api/src/modules/super-admin/markets.catalog.ts              (new)
services/api/src/modules/super-admin/super-admin.service.ts          market + price seeding
scripts/report-legacy-price-conflicts.mjs                            (new)
apps/landing/lib/commercial-config.ts                                (new)
apps/landing/lib/plans.ts                                            currency table deleted
apps/landing/app/{page,plans/page,subscribe/page,subscribe/subscribe-form}.tsx
apps/landing/app/_components/plan-cards.tsx
apps/admin/app/(internal)/plans/[planId]/page.tsx
apps/admin/lib/runtime/platform-module-registry.ts
packages/config/platform-runtime-schema.generated.json               regenerated
docs/  (BUG-0027, BUG-0028, ITEM-0018..0023, QA run, regressions, dashboards)
```

## Conflicts

None. The branch was cut from `origin/main` at `a525896` and `main` did not move
before the merge.

## Conflict Resolutions

None — see above.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-commercial-config-wave1-a525896.md`](../../qa/runs/2026-08-16-commercial-config-wave1-a525896.md) — **PASS** |
| **Bug IDs** | `BUG-0027` re-rated CRITICAL and closed `FIXED`; `BUG-0028` closed `FIXED` |
| **Backlog Items** | `ITEM-0018`, `ITEM-0019` advanced to `VALIDATING`; `ITEM-0020`, `ITEM-0021`, `ITEM-0022`, `ITEM-0023` created |

Five findings. The first is the one that matters:

- **F1 — BUG-0027 was under-rated, and the earlier record was wrong.** It said
  the legacy columns were a display problem because Stripe checkout requires a
  verified `PlanPrice`. True of that one path, wrong about the system:
  `calculateSubscriptionPricing` fell back to the legacy columns and
  `upsertSubscription` wrote the result into `Subscription.basePrice` /
  `finalPrice`, so operator-created subscriptions were billed from them — and
  because the seed created no `PlanPrice` at all, that was the *normal* path,
  not an edge case. Re-rated CRITICAL/P0, with the correction stated in the
  record rather than the record being quietly edited.
- **F2 — `Subscription.planPriceId` was frequently null**, following from F1.
  New subscriptions always reference a price version now. Existing rows are
  **not** backfilled: inferring which version a past subscription was sold under
  would be inventing commercial history.
- **F3 / F4 / F5** — deferred with stated reasons: governed publish/archive
  transitions (ITEM-0022), the contract phase (ITEM-0020), and a mechanical
  currency-literal guard (ITEM-0021).

## CI

| | |
|---|---|
| **CI Run ID** | `31945514062` (task branch, on `f9973cd`) · post-merge run on `7b5aeaa` |
| **CI Result** | **PASS** — `CI required gate` succeeded on `f9973cd`, the exact SHA merged. The one failing job, `Lint services/api`, is report-only and pre-existing; its error count is identical before and after this wave, verified by linting the same files against `origin/main`. The 25 prettier errors this wave *did* introduce were fixed in `f9973cd` rather than left to grow that baseline under cover of a non-gating check. |

**The `Database migration gate` is the significant one here.** It applied the
full committed migration history — including this wave's — to an empty
PostgreSQL 16, then ran `seed:config` and `seed:verify`. No Docker or local
PostgreSQL was available in the development environment, so that job **is** the
real-database validation for this schema change, rather than something inferred
from unit tests.

## Post-Merge Validation

Run against the merged SHA `7b5aeaa`:

| Command | Result |
|---|---|
| Post-merge CI on `main` | **PASS** — `CI required gate`, including the database migration gate |
| `node scripts/validate-framework.mjs` | **PASS** — 503 checks |
| `npm run backlog:check` | **PASS** — 51 records, 0 structural errors |
| `npm run prisma:validate` | **PASS** |
| `commercial-offer` + `billing.legacy-pricing` specs | **PASS** — 2 suites, 32 tests |
| `npm run test:app-urls` | **PASS** — 16, no BUG-0026 regression |
| `npm run test:runtime-schema` | **PASS** — 3 |

## Release / Deployment Impact

**Not deployed by this task.** `ROLLBACK_CLASS = DATABASE_ADDITIVE`.

The migration adds tables, columns, enums and indexes, and backfills data. It
drops nothing, so a code rollback leaves a schema that is a superset of what the
older code expects — the new columns simply go unread. The backfilled
`PlanPrice` rows are `DRAFT` and `isActive = false`, so older code (which filters
on `isActive`) ignores them too.

**One behaviour change an operator will notice:** creating a subscription for a
plan with no published price now fails with an explicit message instead of
silently billing the legacy amount. That is the fix rather than a regression,
but it surfaces as a new error for anyone who relied on the old path.
`npm run seed:config` creates the published prices that make it succeed.

## Knowledge Capture

- `docs/qa/regressions/index.md` — `REG-017` (a duplicate source of truth
  reaching a money path) and `REG-018` (a configuration decision compiled into a
  shipped bundle).
- `REG-018` is filed under the existing `silent-config-fallback` pattern written
  during the BUG-0026 wave. The country-to-currency table is the same failure
  mode as the loopback URL literal, one domain over — which is the evidence that
  the pattern generalises rather than describing a single incident.
- The durable architectural lesson is recorded in `ITEM-0018`: **`PlanPrice`
  already carried version lineage, and the real gap was the publication state
  machine.** Building a second versioning system would have been exactly the
  "second implementation of something that already existed" the architecture
  principles warn about, and the requirement to check was what prevented it.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran against the merged state. The config lives
only in the primary checkout (it is gitignored); it was copied into the task
worktree for the run and removed afterwards.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-wave1` removed after the merge,
verified clean first. Local branches deleted; `agent/commercial-config-wave1`
retained on the remote, referenced by PR #11 and fully merged.

The primary checkout at `D:/My Work/hrm-dijipeople/DijiPeople` was **not**
updated. Its `main` is behind `origin/main` and its working tree carries
unrelated in-flight `gateway/**/obj` changes that are not this task's to touch.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0026]] · [[BUG-0027]] · [[BUG-0028]] · [[ITEM-0018]] · [[ITEM-0019]] · [[ITEM-0020]] · [[ITEM-0021]] · [[ITEM-0022]] · [[ITEM-0023]]

<!-- GRAPH:END -->
