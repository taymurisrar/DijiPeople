# Engineering History — Autonomous framework triage, provisioning recovery and browser E2E

| | |
|---|---|
| **Task Title** | Autonomous framework triage, provisioning recovery and browser E2E |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-15 |
| **Architect Plan** | NOT_APPLICABLE — the one record filed `PLAN_REQUIRED` (BUG-0015) was re-triaged to `FIX_NOW` on inspection: the ExecPlan it asked for was scoped to a schema change for invoice idempotency, and the natural anchors turned out to already exist in the schema, so no migration was needed and the change stayed bounded. Every other change is a guard, a test or a record. |
| **Agents Used** | Architect (triage, the retryable-vs-recoverable decision, the technical/product split on BUG-0016), Backend/API (provisioning recovery, partner guards), Database (constraint anchors, disposable-database strategy), QA (browser suite, DB-backed recovery proof, the A2 false-pass), Reviewer (found BUG-0025), Integrator (worktree, branch, PR, CI, merge), Release/DevOps (branch protection, the report-only browser CI job), Knowledge Capture, Obsidian Sync. **Not used:** Frontend and UI/UX beyond reading — the two frontend records in scope (BUG-0019, BUG-0020) were both triaged `PLAN_REQUIRED` rather than fixed, so no app code was changed. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/autonomous-framework-triage` |
| **Base SHA** | `b2ba38327854699fcb2c2efb5859936d17b40f15` |
| **Final Task SHA** | `93975c91589047e4aeed16fab6e1e961d765bbae` |
| **Target Branch** | `main` |
| **Merge Commit** | `a654c58dac936b677b998edb096d2e77c0b455d0` — PR #4, `agent/autonomous-framework-triage` → `main`. The lint remediation this task produced landed separately as PR #5, `703c4e31f50d1fc027b9e602b9acd4759b9e0a43`. |
| **Final Target SHA** | `a654c58dac936b677b998edb096d2e77c0b455d0` — `main` immediately after PR #4 |

### Commits

```
93975c9 docs(history,qa): record the run, and refresh the dashboards CI found stale
572a3b8 fix(provisioning,partners): make tenant recovery convergent, govern partner review, add browser E2E
```

> **Finalized 2026-08-17.** `Final Task SHA` previously repeated the base SHA,
> under a commit block reading "(none — the branch has no commits beyond its
> base)". Both were false, and both were contradicted by this record's own CI
> section, which names `93975c9` as the SHA PR #4's verdict was read on;
> `git log b2ba383..93975c9` returns the two commits now listed. The record was
> filed before the merge and never returned to — the failure class
> `validate-framework.mjs` now blocks.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                b2ba383 [main]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0   7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-autoframework  b2ba383 [agent/autonomous-framework-triage]
```

### Files Changed

0 file(s) against `origin/main`.

```
(no differences against the base)
```

## Conflicts

**None.** The branch was cut from `origin/main` `b2ba383` and `main` did not
advance during the task, so the merge was a fast-forward-able no-conflict merge.

One near-conflict is worth recording because it was avoided by construction
rather than by luck: the primary checkout was dirty with unrelated `gateway/obj`
build artefacts belonging to someone else's in-flight work. All work was done in
a separate worktree, so nothing of theirs was staged, reverted or committed.

## Conflict Resolutions

No merge conflicts to resolve. Two *design* conflicts were resolved instead, and
they are the ones a future reader will care about:

**1. Make `identities-and-billing` idempotent, or split it into smaller
recoverable steps?** BUG-0015 named both options and left the choice open.

Chosen: **make it idempotent**, keeping it one step. Every sub-operation already
had a natural anchor except invoice creation, and that one is answered by "this
subscription already has an invoice" — so idempotency cost no migration and no
change to the step catalogue.

What splitting would have lost: the step catalogue is consumed by the admin
operations panel, by `TenantProvisioningStep` rows already written for existing
tenants, and by `tenant-apps.service.spec.ts`. Splitting one step into four
would have renumbered every sequence after it and left historical runs
describing a catalogue that no longer exists. What splitting would have *gained*
— finer-grained failure reporting — is available anyway from the exception
message, and is not worth invalidating provisioning history for.

**2. Which half of BUG-0016 is a product decision?** The record filed all three
of its questions as product decisions and was therefore stuck: a HIGH defect
held open indefinitely on a human who had not been asked anything answerable.

Chosen: **fix the two questions the code had already answered elsewhere and
split the third out**. `partnerTransition` already declares `reject` illegal
from `ACTIVE`; `submitOnboarding` already validates the compliance fields. Those
are not policy choices, they are two files disagreeing.

What treating all three as product decisions would have lost: the compliance
gate would have stayed satisfiable without compliance data, and a live partner
would have stayed one mis-clicked review away from `REJECTED`, for as long as
nobody answered a question about referral-link semantics that has nothing to do
with either defect. What the *opposite* error would have lost is larger, and is
why the third question was not guessed: inventing an answer to "what happens to
in-flight attributed leads on demotion" would have written a commercial policy
nobody chose, in code, silently.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-15-browser-e2e-and-provisioning-recovery-572a3b8.md`](../../qa/runs/2026-08-15-browser-e2e-and-provisioning-recovery-572a3b8.md) — `BROWSER_E2E` **PASS** (9/9), provisioning recovery anchors **PASS** (7/7 DB-backed). Tenant activation to `ACTIVE` **NOT REACHED**. |
| **Bug IDs** | Fixed: BUG-0015, BUG-0016, BUG-0023, BUG-0025 (created by this task). Triaged, not fixed: BUG-0019 `PLAN_REQUIRED`, BUG-0020 `PLAN_REQUIRED`, BUG-0021 `FIX_NOW`, BUG-0022 `FIX_NOW`, BUG-0024 `FIX_NOW`. |
| **Backlog Items** | Closed: ITEM-0001 (browser tooling), ITEM-0014 (branch protection). Unblocked: ITEM-0004. Created: ITEM-0016 (the product half of BUG-0016). Triaged: ITEM-0002, 0003, 0005, 0006, 0009, 0010, 0011, 0012, 0013, 0015. `TRIAGE_REQUIRED` went **16 → 0**. |

## CI

| | |
|---|---|
| **CI Run ID** | `31909518722` on `93975c9` (PR #4), `31912199154` on `0f029b1` (PR #5), `31909901730` post-merge on `a654c58` |
| **CI Result** | **PASS** — `CI required gate` green on the exact SHA of each merge. One earlier run failed on `572a3b8` and is left in the history deliberately: framework validation caught a stale Engineering Dashboard, because the dashboard was generated *before* the engineering-history record it counts. Local validation had passed against the same stale pair, so CI caught something the local run structurally could not. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the merged SHAs, not the branch.

**After PR #4 (`a654c58`)**

| Check | Result |
|---|---|
| `node scripts/validate-framework.mjs` | PASS — 503 checks |
| `node scripts/rebuild-backlog.mjs --check` | PASS — 41 records, 0 structural errors |
| `npm --workspace api run test` (CI gate's name exclusion) | PASS — 145 suites, 974 tests |
| `npm run typecheck` | PASS — 8/8 workspaces |
| Post-merge CI on `main` | `CI required gate` **PASS** |

**After PR #5 (`703c4e3`, final)**

| Check | Result |
|---|---|
| `node scripts/validate-framework.mjs` | PASS — 503 checks |
| `node scripts/rebuild-backlog.mjs --check` | PASS — 41 records, 0 structural errors |
| `npm --workspace api run test` (CI gate's name exclusion) | PASS — **1016 tests** (the count rose because PR #6 from another session landed on `main` between the two merges) |
| `npm run typecheck` | PASS — 8/8 workspaces |

**Known baseline, verified unchanged.** The dual-permission wiring invariant
still fails, and its inventory is **identical** to the pre-task baseline —
1560 violation lines, measured on `b2ba383` and on this branch. It is excluded
by name from the required gate.

**A baseline this task did briefly break, and then repaired.** The report-only
`services/api` lint job went from **9 errors / 846 warnings** at `b2ba383` to
**269 errors / 851 warnings** at `a654c58` — 260 prettier violations, all in
files this task added, caused by writing them with LF on a Windows checkout that
normalises to CRLF. Local measurement could not see it clearly because the same
normalisation contaminated the local baseline too; CI on Linux was the only
honest measurement. PR #5 restored it to **9 errors / 846 warnings** — byte-identical
to the baseline. Recorded rather than absorbed, because absorbing it is how a
baseline stops meaning anything.

## Release / Deployment Impact

**Not deployed.** No application code reaches an environment through this task —
nothing was released.

Two repository-policy changes did take effect immediately, and they are the
Release/DevOps content of this record:

**Branch protection on `main`** (ITEM-0014), applied through the GitHub API and
verified by reading the protection object back:

| Setting | Value |
|---|---|
| Require a pull request before merging | on |
| Required approving reviews | **0** — see below |
| Dismiss stale approvals | on |
| Require status checks | on, strict (branch must be up to date) |
| Required check | `CI required gate` |
| Require conversation resolution | on |
| Enforce for administrators | **on** |
| Allow force pushes / deletions | off / off |

Required approvals is 0 rather than the 1 that
`docs/development/branch-protection.md` recommends. GitHub does not permit
self-approval, and this repository has a single maintainer, so requiring an
approval nobody can give would block every merge — including the one carrying
this change. `enforce_admins` is on, so the CI gate itself is not bypassable.
Raising approvals to 1 is a team-size decision and is recorded as an owner
decision (ITEM-0016 §3) rather than silently assumed.

**A new report-only CI job**, `browser-e2e-report`. Deliberately not in
`ci-required`: it needs three servers, a seeded database, browser binaries and a
real login — strictly more environmental surface than any existing gate — and a
gate that is red on arrival for environmental reasons trains people to ignore
CI. Promotion criteria are stated in the job and in
`docs/development/browser-e2e.md`. **It has never run on a CI runner as of this
record**; it was proven locally only.

Rollback class: revert the merge commit for the code; branch protection is
reverted through the GitHub API independently and is not carried by the commit.

## Knowledge Capture

Three durable lessons, all recorded where a future agent will retrieve them
rather than in this file:

1. **`docs/qa/regressions/index.md`** — REG-013, REG-014, REG-015. REG-013 is
   the one worth reading: fixing BUG-0014 made BUG-0015 *worse*, because a
   retry that skipped the only step creating the owner then reported SUCCEEDED.
   A step classified by its least safe member is a step that will one day be
   skipped silently.

2. **`docs/development/browser-e2e.md`** — the tool decision, the report-only
   CI mode and its promotion criteria, the selector policy, and the reason
   retries are 1-in-CI-only rather than the usual thoughtless 2.

3. **The QA run's A2 finding** — a browser assertion that passed for entirely
   the wrong reason, because `fill()` on a `display:none` control leaked its
   text into a neighbouring field. Recorded in the run because it is the exact
   failure mode a browser suite is supposed to eliminate, and a suite that can
   produce one is worse than none.

Two bug patterns are candidates for generalisation and were **not** written,
because both need a second instance before the pattern is real rather than a
retelling: `state-machine-as-setter` (BUG-0016 and BUG-0025 are arguably that
second instance already) and `non-idempotent-work-in-a-non-retryable-step`.
Recorded here as a deliberate omission rather than an oversight.

## Obsidian Sync

**`OBSIDIAN_SYNC = SKIPPED_NO_LOCAL_CONFIG`.**

`node scripts/sync-obsidian.mjs` ran and reported no `.obsidian-sync.local.json`
on this machine, so there is no vault path to publish into. The file is
gitignored by design — a vault path is per-machine and must never reach the
repository — so this is an environment gap, not a failure, and not something a
task can resolve on the owner's behalf.

What the sync *would* publish is committed and current: both generated
dashboards were regenerated and validated (`Obsidian dashboards are current`
passes in framework validation), and every record this task touched carries the
`aliases` frontmatter and `[[wikilink]]` references the vault resolves. Running
the sync on a machine with a configured vault will pick all of it up with no
further work.

Note counts are therefore not reported: reporting them would mean claiming an
observation that was never made.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-autoframework` removed and
pruned; local branches `agent/autonomous-framework-triage` and
`agent/autonomous-framework-lint-followup` deleted after both merged.

Remote branches were **kept**, not deleted — `main` is now protected with
`enforce_admins`, and both PRs are the audit trail for changes that include the
protection itself.

Two things were deliberately left alone throughout:

- the primary checkout's uncommitted `gateway/obj` build artefacts, which belong
  to someone else's in-flight work — all work happened in a separate worktree so
  none of it could be staged;
- the `dijipeople-authz-batch0` worktree on `agent/authz-feature-availability`.

The disposable local database `dijipeople_test` created for the browser and
DB-backed suites is left in place: it holds only synthetic fixture data, it is
named so `assert-test-database.mjs` recognises it as disposable, and dropping it
would make the next run pay the full migrate-and-seed cost again. The
developer's working `dijipeople` database was never touched.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0014]] · [[BUG-0015]] · [[BUG-0016]] · [[BUG-0019]] · [[BUG-0020]] · [[BUG-0021]] · [[BUG-0022]] · [[BUG-0023]] · [[BUG-0024]] · [[BUG-0025]] · [[ITEM-0001]] · [[ITEM-0002]] · [[ITEM-0004]] · [[ITEM-0014]] · [[ITEM-0016]]

<!-- GRAPH:END -->
