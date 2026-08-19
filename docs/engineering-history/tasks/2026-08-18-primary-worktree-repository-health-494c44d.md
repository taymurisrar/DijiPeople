# Engineering History — Primary worktree repository health

| | |
|---|---|
| **Task Title** | Primary worktree repository health and repository-health ownership |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-19 |
| **Session** | [[SESSION-0017]] |
| **Architect Plan** | NOT_APPLICABLE — the change extends `repo-health.mjs` and `session.mjs` rather than introducing a mechanism, and touches no schema, contract or deployed surface. `PLANS.md` requires an ExecPlan for none of the classes here. |
| **Agents Used** | Architect (orchestration, triage), Release/DevOps (LEAD — repository and worktree health), Integrator (Git state and reconciliation), QA (behavioural simulations, mutation testing), Reviewer (preservation of user work). **Not used**: Backend/API, Frontend, UI/UX, Database, Integration, Security — no product code, no schema, no auth surface, no tenant boundary, no external integration was touched. `apps/landing/next-env.d.ts` is a one-line generated-file correction, not a frontend change. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/repo-health-primary-worktree` |
| **Base SHA** | `494c44de866a885c083084d81303fa3707b48002` |
| **Target Branch** | `develop` |
| **Preserve Branch** | `preserve/landing-env-domain-cutover` @ `2472df3` |

`main` was not touched. `MAIN_CHANGE_STATUS = UNTOUCHED` against baseline
`b90f33e`, verified by `repo-health.mjs --main-baseline`.

### Files changed

31 files, +4086 / −78 against `origin/develop`.

```
scripts/repo-health.mjs                          multi-worktree aggregation, ownership, blockers
scripts/session.mjs                              PRIMARY_WORKTREE_ARTIFACT, --root
scripts/validate-framework.mjs                   simulations 37A-37G, 38, 39
.agent/context/repository-health.md              the primary worktree is first-class
.agent/context/task-completion-contract.md       four new contract fields
.agent/agents/release-devops.md                  LEAD for worktree health
.agent/agents/architect.md                       report worktree state, register from the task worktree
AGENTS.md                                        contract fields; schema figures re-derived
apps/landing/next-env.d.ts                       drop the import of a file that does not exist
docs/bugs/BUG-0076-...                           the defect record
docs/backlog/items/ITEM-0057-...                 landing env domain cutover - PRODUCT_DECISION
docs/backlog/items/ITEM-0058-...                 next-env.d.ts churn - DEFER
docs/qa/regressions/index.md                     REG-065
docs/qa/scenarios/QA-DEPLOY-015-...              the reusable scenario
docs/qa/runs/2026-08-18-...                      this run
docs/sessions/SESSION-0017-...                   the session record
docs/tasks/remediation/TASK-0005-inventory.json  three new canonical rows
+ regenerated indexes and dashboards
```

## What the task was asked to do

Reconcile a dirty primary worktree — six files the user found in GitHub Desktop
on `develop` — **and** find out why previous tasks reported
`POST_TASK_REPO_HEALTH = PASS` and `CLEANUP_STATUS = DONE` while it was dirty.

The instruction was explicit that nothing be blindly reset, that user work be
preserved, and that other sessions' work be left alone.

## What the six files actually were

Established by evidence before anything was touched.

| File | Classification | Owner | Action |
|---|---|---|---|
| `apps/landing/.env.example` | `USER_CHANGE` | user | preserved on a branch, tracked file restored |
| `apps/landing/.env.local.example` | `USER_CHANGE` (accidental clobber) | user | same |
| `apps/landing/.env.production.example` | `USER_CHANGE` | user | same |
| `apps/landing/next-env.d.ts` | `GENERATED_STALE` | Next dev server | regenerated with `next typegen`, committed |
| `SESSION-0015-....md` | `ACTIVE_SESSION_RECORD` | SESSION-0015, another live chat | **left untouched** |
| `SESSION-0016-....md` | `SUPERSEDED_STUB` | SESSION-0016 | removed; authoritative copy already committed upstream |

The evidence that mattered:

- **No incoming commit touched the three env files.**
  `git log develop..origin/develop --` on those paths was empty, so nothing
  upstream explained them.
- **The reflog shows the primary checkout has only ever been fast-forwarded** —
  `merge origin/develop: Fast-forward` and `pull --ff-only`, twenty entries
  deep. No agent ever committed or checked out there, so no agent edited those
  files.
- The edits **delete a house-style explanatory comment** added two days earlier
  by `5b602be`, strip the trailing newline from all three files, and overwrite
  `.env.local.example` with content byte-identical to `.env.example` (both 430
  bytes, blob `c9415cd`). None of that is behaviour an agent following
  `AGENTS.md` produces.
- Mtimes 13:17:39, 13:18:57 and 13:19:18 on 2026-08-18 — ninety seconds apart,
  sequential hand edits. The sessions active in that window were working on
  billing and outbox in their own worktrees.
- `SESSION-0016`'s untracked stub and the record committed upstream share
  `SESSION_ID`, `BASE_SHA` and `STARTED_AT: 2026-08-18T20:06:16.992Z`. They
  differ only in `WORKTREE` and in richness. **The same record, written twice
  into two different checkouts.**

## Root cause

Three defects in `repo-health.mjs`, stacked, plus one in `session.mjs`.

1. **Computed, then discarded.** The worktree loop set `worktree.dirty` for
   every worktree, consumed it only in the staleness branch, and then mapped the
   report to `{ path, branch, stale }`. The value existed and nothing could read
   it.
2. **Scoped to the invoking worktree.** `gitLines(['status', '--porcelain'])`
   runs with `cwd: ROOT`, and `ROOT` is the script's own checkout — for an
   agent, its isolated and therefore clean task worktree.
3. **Gated on the wrong branch.**
   `if (porcelain.length && currentBranch === TARGET)`, where `TARGET` comes
   from `refs/remotes/origin/HEAD` and is `main`. The primary checkout sits on
   `develop`. A dirty primary therefore produced **no output at all**, not even
   a warning, even when the script was run there.

Dirtiness was also only ever a warning, and a warning cannot fail a task.

4. **`session.mjs` resolves `ROOT` from its own location.** Registering a
   session from the primary checkout writes the record there; the session then
   creates its task worktree, works in it, commits the real record from it, and
   never returns. SESSION-0015 and SESSION-0016 both did this.

Of the seven RCA classes the task named, the evidence selects
`PRIMARY_WORKTREE_NOT_INSPECTED`, `ONLY_TASK_WORKTREE_INSPECTED`,
`REPO_HEALTH_CHECK_TOO_NARROW` and `MULTI_WORKTREE_STATUS_NOT_AGGREGATED`.
`POST_INTEGRATION_GENERATOR_DIRTIED_PRIMARY` did **not** occur here —
`repo-health.mjs` and the rebuild scripts were re-run against the primary
checkout and mutated nothing — but the loophole was real and is now closed by
contract.

## What changed

`repo-health.mjs` keeps the porcelain **lines** per worktree; classifies each
worktree `PRIMARY` / `TASK` / `OTHER`; attributes every dirty path in the
primary checkout to `USER`, `SESSION-nnnn`, `GENERATED_BY_FRAMEWORK` or
`UNKNOWN`; and reports `PRIMARY_WORKTREE_STATUS`, `TASK_WORKTREE_STATUS`,
`UNEXPLAINED_DIRTY_FILES` and `OTHER_DIRTY_WORKTREES`. `DIRTY_UNEXPLAINED` is a
**blocker**. Unfinished Git operations are aggregated across worktrees, because
`--git-common-dir` cannot see a rebase abandoned in a sibling checkout.

`--primary-baseline` proves which paths predate the task, exactly as
`--main-baseline` proves `MAIN_CHANGE_STATUS`. Without it the report says the
distinction cannot be made rather than assuming the flattering reading.

`session.mjs start` reports `PRIMARY_WORKTREE_ARTIFACT` when it writes a record
into a checkout the session will not work in, with the steps to correct it.

Both scripts gained `--root`, so the behaviour is executable in tests rather
than only greppable — which turned out to matter.

## Two defects found in this change, by hand, not by test

Recorded because both were the kind a green test suite would have shipped.

- **Worktree-to-session attribution returned a finished session.** Sessions
  reuse worktrees, so a path maps to many records; keeping the last one read is
  alphabetical order, not chronological. The primary checkout was attributed to
  SESSION-0013, which had finished. Fixed to prefer `ACTIVE`, then the newest
  id.
- **An active session's record was classified as an orphan.** `activeSessionIds`
  was built from the *committed* records in this checkout, and SESSION-0015's
  record exists only as an untracked file in the primary worktree — so the
  framework reported another chat's live session as abandoned. That is an
  invitation to delete it. Fixed to read `STATUS` from the file as it exists in
  the primary checkout.

The second is the more serious: the first version of a fix for "don't destroy
other people's work" would itself have suggested destroying another session's
work.

## Conflicts

None. The branch was cut from `origin/develop` @ `494c44d` and integrated by
ref-push while `develop` was still at that SHA.

`docs/qa/regressions/index.md` and
`docs/tasks/remediation/TASK-0005-inventory.json` are single-writer files that
SESSION-0015 also holds work against on `agent/provisioning-ops-and-qa`. That
branch is not yet integrated, so there was no conflict here; whichever
integrates second resolves by appending, since both changes are additive.

## Conflict Resolutions

None required.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-08-18-primary-worktree-repository-health-494c44d.md` — **PASS** |
| **Scenarios** | 19, all PASS; durable form [[QA-DEPLOY-015]] |
| **Bug IDs** | [[BUG-0076]] created and fixed |
| **Backlog Items** | [[ITEM-0057]] created (`PRODUCT_DECISION`), [[ITEM-0058]] created (`DEFER`) |
| **Regression** | [[REG-065]] |

### Mutation testing

Seven mutations, each reintroducing a specific form of the defect. All seven
killed.

The seventh **survived the first run**: the check covering `session.mjs` read
the source for `PRIMARY_WORKTREE_ARTIFACT` and `strandedInPrimary`, both of
which the mutation left in place while removing their effect. That is the same
defect class as BUG-0076 — a value computed and not used — reproduced inside its
own fix. Simulation 39 was added to drive `session.mjs` against a sandbox
repository instead, which kills it.

## CI

The `CI required gate` verdict is read on the **exact SHA integrated**, workflow
`CI`, branch `agent/repo-health-primary-worktree`. The first push of this branch
(`0f6c660`) failed `Framework validation` for exactly one reason — this history
record still carried the generator's unresolved placeholder lines, which the
framework refuses to let a task complete with. That is the check working.

## Post-Merge Validation

Run against the integrated `develop` SHA, not the task branch:
`node scripts/validate-framework.mjs`, `rebuild-backlog.mjs --check`,
`rebuild-sessions.mjs --check`, `rebuild-qa.mjs --check`,
`rebuild-tasks.mjs --check`, and `repo-health.mjs` against every worktree.

Not run: `lint`, `check-types`, `test`, `build`. This change touches no
TypeScript, no workspace package and no build input; the three changed files
under `scripts/` are plain Node ESM with no compile step. Running the API or web
suites would have produced a green result that says nothing about this change.

## Release / Deployment Impact

None — not deployed. `main` untouched, no migration, no environment variable, no
runtime code path. Rollback class: revert the commit.

## Knowledge Capture

`.agent/context/repository-health.md` gains "The primary worktree is
first-class", covering the three-value worktree taxonomy, the
`PRIMARY_WORKTREE_STATUS` vocabulary, per-path ownership, stranded session
records, and post-integration generators as repository work.
`.agent/context/task-completion-contract.md`, `.agent/agents/release-devops.md`,
`.agent/agents/architect.md` and `AGENTS.md` carry the rules that follow.

The durable lesson, worth more than the fix: **a value that is computed and then
dropped from the report is indistinguishable from a value that was never
computed**, and every structural check passes over it. It appeared twice in one
task — once as the bug, once inside the test written to prevent it.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` and `node scripts/verify-obsidian.mjs` run
after integration; results in the session record and the final report.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/dijipeople-repo-health` removed after
integration; local branch retained until the remote branch is confirmed merged.
`preserve/landing-env-domain-cutover` is **kept deliberately** — it is the only
copy of the user's env-example work and is referenced by ITEM-0057.

The primary checkout ends holding SESSION-0015's record and nothing else. That
record belongs to a session live in another chat and is classified
`DIRTY_OTHER_SESSION_OWNED`: reported, deliberately not touched.
