---
ID: BUG-1203
aliases: [BUG-1203]
Title: repo-health reports CHANGED_BY_THIS_TASK for another session's merge
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: ddb457ff
AffectedModules: [framework]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: QA-INFRA-002
RegressionId: REG-249
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1203 — repo-health reports CHANGED_BY_THIS_TASK for another session's merge

## Summary

`scripts/repo-health.mjs` reported `MAIN_CHANGE_STATUS = CHANGED_BY_THIS_TASK`
— and a `FAIL` carrying the blocker *"this task's commits are on origin/main"*
— for a task that had provably put nothing on `main`.

## Expected Behavior

`MAIN_CHANGE_STATUS` answers "did **this task** move production", which is not
the same question as "has production moved". Several sessions run here at once,
and another session merging a release advances `main` through no fault of the
task being audited.

A task that put nothing on `main` must report
`UNTOUCHED (baseline <sha>, advanced N commit(s) by other sessions)`, from any
checkout, with or without `--task-branch`.

## Actual Behavior

Run from the primary checkout without `--task-branch`, it reported
`CHANGED_BY_THIS_TASK` and failed the health check — for commits that were not
on `origin/main` at all.

The same command with `--task-branch`, minutes earlier, reported `UNTOUCHED`.
Two contradictory verdicts about the same repository state, decided by whether
a flag was passed.

## Reproduction

1. Have `origin/main` contain a merge of `develop`. Any release produces this.
2. Stand in a checkout whose HEAD is `develop`. The primary checkout normally
   is, and it is where a final health check runs once the task worktree has
   been removed.
3. `node scripts/repo-health.mjs --main-baseline <sha main sat at>`
4. `MAIN_CHANGE_STATUS` reports `CHANGED_BY_THIS_TASK` regardless of what the
   task actually did.

## Evidence

Found on TASK-0022's own final health check, at `ddb457ff`. Two runs, same
repository, same baseline, minutes apart:

```
# from the task worktree, with --task-branch
MAIN_CHANGE_STATUS  UNTOUCHED (baseline 7d91c8a, advanced 28 commit(s) by other sessions)

# from the primary checkout, without it
Repository health — FAIL
MAIN_CHANGE_STATUS  CHANGED_BY_THIS_TASK (baseline 7d91c8a)
  x this task's commits are on origin/main — main is the production deployment
    branch, and only a RELEASE, DEPLOY or HOTFIX_PRODUCTION task may put work there
```

The accusation was false, checked three ways rather than argued:

```
git merge-base --is-ancestor 0e224a69 origin/main   -> not an ancestor
git merge-base --is-ancestor c4035dbb origin/main   -> not an ancestor
git merge-base --is-ancestor ddb457ff origin/main   -> not an ancestor
git rev-parse main                                  -> 7d91c8a0...  (== baseline, unmoved)
```

`origin/main` had advanced 28 commits — all of them TASK-0021's release, merged
through PR #47 by another session.

## Root Cause

`TASK_SHA` fell back to `HEAD` when no `--task-sha` was supplied:

```js
return git(['rev-parse', '--verify', '--quiet', supplied || 'HEAD'], '');
```

The status is decided by containment — does `origin/main` contain this task's
commits — so everything rests on which commits get called "this task's". `HEAD`
is a fair stand-in inside a task worktree, where HEAD *is* the task branch. It
is a bad one in the primary checkout, which sits on `develop`: a release merges
`develop` into `main`, so HEAD becomes an ancestor of `origin/main`, and every
task audited from there inherits the blame.

**The containment logic itself was already correct, and already knew about this
failure.** The comment above it says so in as many words — that the first
implementation *"fired on its own first real run, for a task that had not
touched `main` at all"*, and that *"a production-safety field that cries wolf
when a colleague merges is a field people learn to ignore."* The fallback was
added afterwards and walked straight back into the case the comment describes,
because a comment is not a constraint.

## Impact

`MAIN_CHANGE_STATUS` is one of the six terminal invariants of the completion
contract. `CHANGED` on anything but a `RELEASE`, `DEPLOY` or
`HOTFIX_PRODUCTION` is defined as a **failed** task, so the false positive
fails healthy work — and a reader who believes it goes looking for a production
mutation that never happened.

The timing makes it worse rather than better. It requires `--task-branch` to be
absent, which is most likely at the end of a task once the task branch has been
deleted — exactly when the field is read and acted on.

Severity HIGH rather than CRITICAL: it is loud and wrong rather than silent and
wrong, and nothing it does mutates the repository. The dangerous direction is
the one a careless fix could introduce, which is why the true positive is
pinned as tightly as the false one.

## Affected Areas

- `scripts/repo-health.mjs` — `MAIN_CHANGE_STATUS`, and the blocker it raises
- Any task's `PRE_TASK_REPO_HEALTH` / `POST_TASK_REPO_HEALTH` run without an
  explicit task ref from a checkout on a shared branch

## Proposed Resolution

Extract the decision so it can be tested, and use `HEAD` only when it is not
the production or integration branch. Standing on a shared branch attributes
nothing and leaves the baseline comparison to decide, which correctly reports
`UNTOUCHED` when `main` has merely advanced. An explicit `--task-sha` must
continue to win in every case.

No ExecPlan required: one script, no schema, no runtime surface.

## Acceptance Criteria

- From a checkout on `develop`, a task with no commits on `main` reports
  `UNTOUCHED` and raises no blocker.
- An explicit task ref naming a commit that **is** on `origin/main` still
  reports `CHANGED_BY_THIS_TASK` and still raises its blocker.
- A task worktree with no flags still attributes `HEAD`.
- The behaviour is pinned by a test, not by a comment.

## Regression Coverage

REG-249, test file `scripts/task-sha-ref.test.mjs` — 7 cases over the extracted
decision, wired into the Framework validation CI job.

Mutation-verified rather than merely passing: removing the integration-branch
guard fails 2 cases, and removing the explicit-ref short-circuit fails 1.

## Dependencies

None. The fix is confined to `scripts/`, needs no dependency, migration or
deployment, and nothing else must land first.

## Related Items

- [[TASK-0022]] — the task whose own verification surfaced this
- [[QA-INFRA-002]] — the scenario that re-runs it

## Resolution

`scripts/lib/task-sha-ref.mjs` now owns the decision, and
`scripts/repo-health.mjs` calls it. Verified side by side, same checkout, same
baseline:

```
before  MAIN_CHANGE_STATUS  CHANGED_BY_THIS_TASK (baseline 7d91c8a)
after   MAIN_CHANGE_STATUS  UNTOUCHED (baseline 7d91c8a, advanced 28 commit(s) by other sessions)
```

The true positive still fires: `--task-sha 08d79012`, a commit genuinely on
`origin/main`, still produces `CHANGED_BY_THIS_TASK` and its blocker.

The extraction is the substance of the fix rather than tidying. A long, correct
comment guarding an untested inline decision is a defect waiting for its second
author — which is precisely how this arose.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `scripts/task-sha-ref.test.mjs` ran and passed, as part of `node --test scripts/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

[[QA-INFRA-002]], executed 2026-08-25 — PASS. All four steps: the false
positive is gone, the ancestry checks agree with the reported status, the true
positive still fires with its blocker, and the task-worktree path is unchanged.

## History

- 2026-08-25 — found during TASK-0022's final health check at `ddb457ff`;
  triaged `FIX_NOW` by the Architect and fixed the same day on
  `agent/repo-health-task-sha`, with REG-249 and QA-INFRA-002.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `scripts/task-sha-ref.test.mjs`

Proven by:

- `node --test scripts/…` — 6 of 6 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0091]]
- Regression — REG-249 (see the regression register)

<!-- GRAPH:END -->
