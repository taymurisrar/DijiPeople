---
TASK_ID: TASK-0019
aliases: [TASK-0019]
TITLE: Release the payment-path and pricing fixes to production
TYPE: RELEASE
SIZE: MEDIUM
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-24
AFFECTED_MODULES: [api:billing, api:super-admin, api:platform-events, apps/admin, apps/landing]
AGENTS: [Architect, QA, Reviewer, Integrator, Release/DevOps]
DEPENDENCIES: origin/develop b9acdf1b
CURRENT_PACKAGE: WP-01
COMPLETED_PACKAGES: []
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0019 — Release the payment-path and pricing fixes to production

## Objective

Promote `develop` to `main` so the fixes to the self-service payment path and
the plan-price catalogue reach production. Finished when production serves the
released commit, the smoke suite passes against it, and the nine Starter prices
lost on 2026-08-24 are active again.

**Authorised by the owner**, explicitly and in those terms. `main` is otherwise
theirs to promote; this task exists because that standing rule was lifted for
this release.

## Objective, stated as the defects it clears

| Record | What production does today | After |
|---|---|---|
| [[BUG-1133]] | Saving one plan price silently deactivates its siblings across billing models and markets | Supersede matches the unique index; only the true slot occupant is retired |
| [[BUG-1134]] | Editing a price with a stale Stripe id returns 500, and the price becomes uneditable | The row is marked unsynced with a readable reason; the edit succeeds |
| [[BUG-1128]] | Every `invoice.paid` is rejected — a customer can pay and no workspace is built | Invoices resolve from either Stripe API shape |
| [[ITEM-0096]] | A CRITICAL notification names no reason and no action | Names the failure, and the path to fix and replay it |
| [[ITEM-0095]] | Home page shows a price with no indication what it buys | Shows the same capability ladder as `/plans` |

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | PR `develop` → `main`, exact-SHA CI verdict, merge | IN_PROGRESS | — | Integrator | develop | b9acdf1b | PASS | — | PASS | — |
| WP-02 | Deployment outcome, smoke, and the release-history record | NOT_STARTED | WP-01 | Release/DevOps, QA | — | — | NOT_RUN | — | NOT_RUN | — |

## Why this release is lower risk than its size suggests

Thirteen commits, but the risk profile is narrow and worth stating before the
merge rather than after:

- **No schema change.** `git diff origin/main..HEAD -- services/api/prisma` is
  empty. No migration runs, so the `P1002` advisory-lock hazard of [[BUG-0905]]
  is not in play at all.
- **No environment or configuration change.** No diff under `packages/`,
  `render.yaml` or `turbo.json`, so nothing needs setting in the dashboard
  before or after.
- **Thirteen code files**, of which five are new or changed specs. The
  application changes are four service files and three frontend components.
- **Additive behaviour.** Every fix widens something that was too narrow — a
  `where` clause, an error path, a payload reader — or adds copy. Nothing
  removes a capability or changes a contract another deployable consumes.

## The deploy repairs the price data by itself

Worth recording, because it changes what has to be done by hand afterwards:
**nothing.**

`render.yaml`'s `preDeployCommand` runs `seed:config`, which calls
`bootstrapCommercialDefaults`. Its slot lookup, `findActiveForSlot`, filters on
the full five-column key — `planId`, `marketId`, `billingCycle`, `currency`,
`billingModel` — and carries a comment about exactly the hazard that caused
[[BUG-1133]]. Where a catalogue slot has no active occupant it creates one.

The nine Starter rows lost on 2026-08-24 are slots with no active occupant, so
the seed will recreate them. That behaviour is already evidenced in production
logs: `2026-08-23T21:54:39` reports `9 price(s) created` after an earlier loss,
and `2026-08-24T18:26:56` reports `0 created, 36 already on catalogue terms`
when the catalogue was whole.

So the ordering is fortunate rather than arranged: the code fix that stops the
loss ships in the same deploy that repairs it, and the repair cannot re-arm the
trap because the supersede is fixed in the same commit.

## Pre-release validation

Run against `b9acdf1b`, the exact commit being promoted.

| Check | Result |
|---|---|
| `api` unit suites | **222 suites, 1,764 tests, 0 failures** |
| `admin` | 30 suites, 236 tests |
| `landing` | 11 suites, 149 tests |
| `web` | 23 suites, 449 tests |
| Typecheck — api, admin, landing | clean |
| `validate:framework` | 3,701 checks |
| `CI required gate` | **PASS** on `b9acdf1b` (run 32776007577) |

**Two suites failed on the first local run and were not dismissed.**
`client-ip.spec.ts` and `request-hostname.spec.ts` failed with
`isForwardedHostTrusted is not a function` — 15 tests. The cause was local: this
worktree's `node_modules` is junctioned to the primary checkout, which is 16
commits stale and predates [[ITEM-0044]]'s `packages/config/forwarded-host.js`,
so `@repo/config` resolved to a copy without the export. Re-pointing the
junction at this worktree's own `packages/config` turned all 15 green, and the
four `@repo/config` typecheck errors disappeared with them.

Recorded because "CI is green, ignore it" would have been the wrong reasoning
even though the conclusion matched: the failure had to be explained before it
could be dismissed.

## Rollback

`main` moves from `6ed7a440` to the merge commit. Reverting is a revert of that
merge and a redeploy; there is no migration to unwind and no configuration to
restore, which is the practical consequence of the two "no change" rows above.

The one irreversible effect is the price repair — but it *restores* catalogue
rows rather than removing any, and every superseded row is retained with
`isActive: false` and a date rather than deleted.

## Repository Health

PRE_TASK_REPO_HEALTH — `PASS_WITH_WARNINGS`. `MAIN_CHANGE_STATUS = UNTOUCHED`
against baseline `6ed7a44`; `UNEXPLAINED_DIRTY_FILES = 0`;
`PRIMARY_WORKTREE_STATUS = DIRTY_USER_OWNED` (two files that predate this work).
The warnings are the user's local `main` and `develop` refs lagging their
remotes, which is expected — their primary checkout is not fast-forwarded
because it holds open files.

POST_TASK_REPO_HEALTH — on completion.

## History

- 2026-08-24 — created at `b9acdf1b` on the owner's explicit authorisation to
  release to `main`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0905]], [[BUG-1128]], [[BUG-1133]], [[BUG-1134]], [[ITEM-0044]], [[ITEM-0095]], [[ITEM-0096]]

<!-- GRAPH:END -->
