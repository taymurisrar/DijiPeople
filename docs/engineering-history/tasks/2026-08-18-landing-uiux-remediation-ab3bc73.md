# Engineering History — Landing UI/UX remediation

| | |
|---|---|
| **Task Title** | Complete every documented landing finding — BUG-0061..0066, ITEM-0051, ITEM-0046 |
| **Task Type** | BUGFIX (with UI/UX, QA and a small FRAMEWORK correction) |
| **Date** | 2026-08-18 |
| **Architect Plan** | NOT_APPLICABLE — no change class in [`PLANS.md`](../../../PLANS.md) applies: no schema, migration, auth or permission change. Decomposed into five work packages instead, tracked on TASK-0006. |
| **Agents Used** | **UI/UX (lead, both stages)**, Frontend, Backend/API (BUG-0065), QA, Reviewer, Integrator, Release/DevOps. **Database and Integration not used** — no model, migration or external boundary changed. |

> The generated Git section of this file was rewritten by hand for the same
> reason as its predecessor: `new-engineering-history.mjs` anchors to
> `origin/main`, which is far behind `develop`, so it attributes every commit
> between them to this task. Recorded again in Follow-up.

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/landing-uiux-remediation` |
| **Base SHA** | `257622e` (rebased; started from `c332992`) |
| **Final Task SHA** | `ab3bc73` |
| **Target Branch** | `develop` |
| **Merge Commit** | `ab3bc73` — fast-forward |
| **Final Target SHA** | `ab3bc73` |

### Commits

```
ab3bc73 fix(landing): remediate the public surface — BUG-0061..0066, ITEM-0046, ITEM-0051
```

60 files, +2541 / -357. Product code in `apps/landing` and one file in
`services/api`; the rest is records, scenarios and generated indexes.

## Conflicts

`develop` moved **twice** during this task, both times from other active
sessions. The first rebase (onto `a0ceb3f`) is recorded in the predecessor task;
this one rebased onto `257622e` and produced eight conflicts:

| File | Type |
|---|---|
| `docs/backlog/index.md`, `open.md` | generated index |
| `docs/knowledge/dashboards/*` (2) | generated |
| `docs/qa/coverage-matrix.md`, `scenarios/index.md`, `test-plans/index.md` | generated |
| `docs/tasks/remediation/TASK-0005-inventory.json` | shared hand-maintained inventory |

Plus one **semantic** conflict Git could not see: the other session had taken
`REG-056` for BUG-0034 while this branch was using it for BUG-0061.

## Conflict Resolutions

Generated files: took upstream, then re-ran `rebuild-backlog`, `qa:rebuild` and
`generate-dashboards`. Hand-merging a generated file produces a state no
generator would emit.

Inventory: took upstream's 118 records and re-applied this branch's rows
programmatically rather than by hand.

**The regression-id collision is the one worth reading.** Renumbering
`REG-056..061` to `REG-057..062` looked like a search-and-replace and was not:
the first attempt used a placeholder that still contained the matched text, so
`056→057` was immediately re-matched by `057→058` and all six entries cascaded
into `REG-062`. It was caught by a duplicate-id check rather than by review. The
repair relabelled the six headings **positionally** instead of by mapping, which
cannot cascade.

**What would have made it harder:** if the other session had also edited the
register's existing prose rather than only appending, the positional repair
would not have been safe.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-18-landing-uiux-remediation-verification-c332992.md`](../../qa/runs/2026-08-18-landing-uiux-remediation-verification-c332992.md) — verdict **PASS** |
| **Bug IDs** | BUG-0061..BUG-0066 — all six **VERIFIED**, none reopened |
| **Backlog Items** | ITEM-0046 **DONE**, ITEM-0051 **DONE**, ITEM-0053 created (`PRODUCT_DECISION`) |
| **Regressions** | REG-057..REG-062 |
| **Scenarios** | QA-LANDING-001..006 under new PLAN-013 |

21 verification scenarios, 18 durable Playwright tests, 42 route-viewport
combinations with axe, and real submissions through all three public forms.

## CI

| | |
|---|---|
| **CI Run** | `ab3bc73` |
| **CI Result** | **PASS** — 14 checks, `CI required gate: success`, Browser e2e included |

## Post-Merge Validation

`validate-framework.mjs` 2500/2500 on the rebased tree, landing jest 49/49,
billing 55/55, lint and typecheck clean, production build clean. Verified after
the merge: `develop` at `ab3bc73`, `main` untouched.

## Release / Deployment Impact

Public marketing surface only. No schema, migration, environment variable or
dependency change. `MAIN_CHANGE_STATUS = UNTOUCHED`. Rollback class: revert one
commit.

One behaviour change worth flagging to Release: `/` and `/subscribe` now render
a degraded state instead of a 500 when the plans API is unreachable. Monitoring
that alerted on 5xx from those routes will go quiet — the condition is now
visible in the API logs (`[plans] Could not reach the plans API`) rather than in
the page status.

## Knowledge Capture

Three lessons worth carrying beyond the records.

**A catch-all around a fetch in a server component swallows framework control
flow.** Next signals dynamic rendering, redirects and not-found by *throwing*.
The first version of the BUG-0061 fix caught `DynamicServerError` and logged a
network outage on every production build. `unstable_rethrow` must run before any
network handling. It was caught by reading build output, not by a test.

**An empty state can hide a broken populated one.** The invalid `<dl>` on
`/plans` existed for as long as the plan list was empty, and the previous audit's
own Known Limitation — no seeded commercial data — was the thing concealing it.
Seeding fixtures is not only about coverage; it is about making latent defects
observable.

**Dev-mode artifacts are not defects, and the way to tell is a production
build.** The hydration warning was chased across two routes and two header
implementations before `next build && next start` settled it in one run: zero
occurrences across 42 combinations. Repeated non-reproduction on a dev server is
weak evidence; a production build is strong evidence.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` then `--verify`: **PASS**. 372 notes verified,
1594 wikilinks checked, **0 unresolved**, manual notes untouched. All six bug
records read `Status: VERIFIED` in the vault and none appears in the generated
open view.

## Cleanup

Worktree `dijipeople-landing-fix` removed, branch deleted locally and on the
remote, SESSION-0005 finished and its lease released. The seeded local database
and running dev servers are development state, left in place.

## Follow-up

- `scripts/new-engineering-history.mjs` still derives its base from
  `origin/main` for a task targeting `develop`. Second occurrence; worth fixing.
- `TASK-0005-inventory.json` still has no generator while
  `validate-framework.mjs` requires a row per canonical record. Second task in a
  row to hand-edit a shared JSON array owned by another session's program.
- The regression register has no id allocator, which is how `REG-056` was taken
  twice by two concurrent sessions. `scripts/allocate-id.mjs` already solves
  this for bugs and items.
- ITEM-0053 — privacy and terms copy, blocked on a product decision.
- A Stripe-verified test price would let the `/subscribe` scenario exercise its
  checkout-available branch.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0034]] · [[BUG-0061]] · [[BUG-0065]] · [[BUG-0066]] · [[ITEM-0046]] · [[ITEM-0051]] · [[ITEM-0053]] · [[PLAN-013]] · [[QA-LANDING-001]] · [[SESSION-0005]] · [[TASK-0005]] · [[TASK-0006]]

<!-- GRAPH:END -->
