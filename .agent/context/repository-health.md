# Repository Health — sync state, protected-branch recovery and deployment drift

> **Last verified:** 2026-08-16
> **Verified against commit:** 6cfac5c
> **Key source files:** scripts/repo-health.mjs, scripts/finalize-agent-task.mjs, .agent/agents/release-devops.md, .agent/agents/integrator.md, docs/development/branch-protection.md, docs/development/git-worktrees.md, .github/workflows/ci.yml
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

**Release/DevOps owns repository health. The Integrator owns Git mechanics.**
Both run on every substantial task — including tasks that deploy nothing.

The split matters when something goes wrong: Release/DevOps *detects and
classifies* the repository state; the Integrator *performs* the branch, merge
and recovery operations. A role that both diagnoses and acts on its own
diagnosis has no check on a wrong diagnosis.

```bash
node scripts/repo-health.mjs          # human-readable
node scripts/repo-health.mjs --json   # machine-readable, for a report block
```

It **reports only**. It never fetches destructively, never pushes, never
resets, never deletes — for the same reason `finalize-agent-task.mjs` does not:
a script that acts on a checklist acts on a *wrong* checklist just as readily.

---

## The fields Release/DevOps owns

```
PRE_TASK_REPO_HEALTH      POST_TASK_REPO_HEALTH     MAIN_SYNC_STATUS
REMOTE_STATE              STALE_BRANCHES            STALE_WORKTREES
UNFINISHED_GIT_OPERATIONS DEPLOYMENT_DRIFT
```

`STALE_WORKTREES` and `STALE_BRANCHES` are counts plus the candidate list;
`UNFINISHED_GIT_OPERATIONS` is the set of in-flight Git operations, and empty is
the only healthy value before new work starts. `DEPLOYMENT_DRIFT` is classified
[below](#deployment-state-and-drift).

## The two mandatory checkpoints

| Field | When | Fails the task if |
|---|---|---|
| `PRE_TASK_REPO_HEALTH` | Before creating a branch or worktree | The task would start from a stale or broken base |
| `POST_TASK_REPO_HEALTH` | After the merge, before the final report | The repository is left in a state a human must clean up |

Both are fields of
[`task-completion-contract.md`](task-completion-contract.md). Neither may be
omitted, and `POST_TASK_REPO_HEALTH` must be `PASS` for a substantial task to
report `COMPLETE`.

### Pre-task

```bash
git status
git status -sb
git fetch --prune
git branch -vv
git worktree list
```

Detect, before any branch is created:

- local `main` ahead, behind or diverged
- a dirty `main`
- an unfinished merge, rebase, cherry-pick or revert
- stale worktrees — a registered worktree whose directory is gone, or whose
  task merged long ago
- stale merged branches
- remote changes since the last fetch

**A task worktree is never cut from a stale `main`.** The base must be the
current shared-target SHA. Cutting from a stale base produces a branch that
conflicts on merge for reasons that have nothing to do with the task, and the
conflict resolution then risks reverting somebody else's work.

### Post-task

The same sweep, plus: the merge actually landed, `MAIN_SYNC_STATUS = SYNCED`,
the task worktree removed, merged local task branches deleted, and no unfinished
Git operation left behind.

---

## `MAIN_SYNC_STATUS`

The state of local `main` against `origin/main`, computed from refs — never
inferred from what a push printed.

```bash
git rev-parse main
git rev-parse origin/main
git rev-list --left-right --count origin/main...main
```

| State | Meaning |
|---|---|
| `SYNCED` | Local and remote SHAs are identical |
| `AHEAD` | Local commits not on the remote |
| `BEHIND` | Remote commits not local |
| `DIVERGED` | Both, from a shared base |
| `PUSH_BLOCKED_BY_POLICY` | A push was rejected by branch protection |
| `PUSH_FAILED` | A push failed for another reason — auth, network, a hook |
| `FETCH_FAILED` | The remote state could not be read at all |
| `MERGE_PENDING` | A PR is open and awaiting CI or merge |
| `UNKNOWN` | State could not be determined — never a resting state |

**The only acceptable terminal state after a completed substantial task is
`SYNCED`**, with the invariant:

```
local main SHA == origin/main SHA == the expected merged SHA
```

All three. Comparing only the first two passes happily when the merge that
landed was somebody else's.

### `AHEAD` — determine *why* before doing anything

| Cause | Response |
|---|---|
| Intended task commits, unmerged | Move them onto a task branch; use the PR flow — [below](#protected-branch-recovery) |
| Accidental or generated commits | **Verify before discarding.** Read every commit. Never discard unverified work |
| Already on the remote via another merge | Reconcile — usually a fast-forward or a no-op after fetch |

**Never simply force push.** Not to resolve `AHEAD`, not to "clean up", not
under time pressure.

### `BEHIND`

A clean local `main` behind the remote fast-forwards safely:

```bash
git fetch origin
git merge --ff-only origin/main
```

If local work prevents the fast-forward, **preserve the work first** — that is
the `AHEAD` or `DIVERGED` path, not a reason to overwrite.

### `DIVERGED`

The Integrator owns reconciliation. Establish, with commands rather than
assumptions:

```bash
git merge-base main origin/main                       # the shared base
git log --oneline origin/main..main                   # local-only commits
git log --oneline main..origin/main                   # remote-only commits
```

Then reconcile per repository policy — never by force push — and **re-run tests
and CI after semantic reconciliation.** A merge that resolved cleanly is not
evidence that the combined behaviour is correct.

### Unfinished Git operations

```bash
ls .git/MERGE_HEAD .git/CHERRY_PICK_HEAD .git/REVERT_HEAD
ls -d .git/rebase-merge .git/rebase-apply
```

**Do not begin new work while `main` is mid-operation.** The Integrator either
completes it or aborts it, based on evidence of what it was doing — read the
commits, read the conflicted files — and **documents the recovery**. An aborted
rebase nobody recorded looks identical to work that was never started.

---

## Protected branch recovery

`main` is protected. Verified at this commit:

```
required_status_checks   strict: true · contexts: ["CI required gate"]
required_pull_request_reviews    required_approving_review_count: 0
enforce_admins           true
allow_force_pushes       false
allow_deletions          false
required_conversation_resolution  true
```

`enforce_admins: true` means **there is no administrative bypass**, including
for the repository owner. A direct push to `main` fails for everyone.

### Recognising it

A push rejected with any of:

```
GH006
Protected branch update failed
Changes must be made through a pull request
Required status check ... is expected
```

is classified:

```
PROTECTED_BRANCH_REQUIRES_PR
```

**This is a recoverable policy outcome, not an error and not a terminal
failure.** Do not ask the user what to do; do not retry the same push; do not
leave local `main` stuck `AHEAD`. Branch protection working correctly is not an
incident — failing to recover from it is.

Direct pushing to `main` is **not** the normal workflow, and the recovery below
is not a workaround for protection. The normal workflow is a task branch and a
PR from the start; the recovery exists for when commits have already landed on
local `main` by accident.

### The recovery, in order

1. **Capture the current local `main` SHA.** Write it down before anything else
   — it is the reference every later verification is against.
2. **Fetch origin.**
3. **Identify commits that exist locally but not on `origin/main`:**
   ```bash
   git log --oneline origin/main..main
   ```
4. **Verify they are intended task commits.** Read them. A commit nobody can
   account for is not pushed and not discarded — it is reported.
5. **Create a correctly named recovery branch pointing at those commits:**
   ```bash
   git branch agent/<task>-recovery main
   ```
   Branching, not cherry-picking: it preserves the commits exactly, including
   their parents.
6. **Push the recovery branch.**
7. **Open a PR.**
8. **Run required CI** — it starts on push.
9. **Wait for the exact-SHA verdict.** A verdict on an earlier commit of the
   same branch is a verdict about different code.
10. **Merge through the protected-branch flow.**
11. **Fetch `origin/main`.**
12. **Update local `main` safely** — `git merge --ff-only origin/main` after
    resetting local `main` to the shared base only if it is provably
    equivalent. Never `--force`, never `reset --hard` onto unverified state.
13. **Verify no commits were lost:**
    ```bash
    git log --oneline <captured-sha>..origin/main   # every local commit present
    git rev-list --left-right --count origin/main...main   # must be 0 0
    ```
14. **Clean up** the recovery branch and worktree.
15. **Record the event in engineering history** — see
    [below](#recording-a-recovery).

### Prohibited during recovery

- **Never force-push `main`.** Protection blocks it, and needing it means the
  diagnosis was wrong.
- **Never cherry-pick blindly.** Cherry-picking rewrites commits and loses
  parents; use a branch pointing at the real commits.
- **Never `reset --hard` away commits that have not been verified as already
  present on the remote.**
- **Never discard a commit to make the state tidy.** Preserve all intended work,
  every time.

### Recording a recovery

A recovery is operational history worth having. Record it under
[`docs/engineering-history/tasks/`](../../docs/engineering-history/tasks/) with
what actually happened:

```
Attempt      direct push to main
Result       GH006 — protected branch update failed
Local main   N commits ahead of origin/main
Recovery     created agent/<task>-recovery at <sha>
             pushed · opened PR #<n> · CI <run id> passed
             merged via the protected-branch flow
             local main fast-forwarded to origin/main
Final        local main == origin/main == <sha>   ·   0 commits lost
```

---

## PR ownership

The Integrator owns the PR lifecycle **automatically**. For any protected or
shared branch:

```
task branch → push → PR → CI → exact-SHA PASS → merge → verify target
```

The user should never need to create or merge a PR by hand, and should never be
asked to. `gh` is available in this environment — see
[`../../docs/development/agent-tooling-matrix.md`](../../docs/development/agent-tooling-matrix.md).

### Waiting for CI

**"Waiting on CI" is not a place to stop.** Capture the exact SHA, find its run,
and watch it:

```bash
gh run list --branch <branch> --limit 5
gh run watch <RUN_ID> --exit-status
```

or poll with a bounded number of attempts. If CI fails: diagnose, fix, push,
wait again. If the runner infrastructure is genuinely unavailable, record
`BLOCKED_EXTERNAL` or `BLOCKED_CI_TIMEOUT`, and **continue any independent work
package** rather than stopping the task.

The shared-target rule is unchanged by any of this: a merge into `main` requires
`REMOTE_CI_STATUS = PASS` on the exact SHA being merged. See
[`task-completion-contract.md`](task-completion-contract.md).

### Verifying protection

Periodically confirm `main` still has: PR required, the `CI required gate`
required status check, force pushes prohibited, deletion prohibited.

```bash
gh api repos/<owner>/<repo>/branches/main/protection
```

If protection has **unexpectedly disappeared**, that is a security finding:
create a `SECURITY`/`RELEASE` backlog item. Where admin access allows safe
restoration under the policy already documented in
[`../../docs/development/branch-protection.md`](../../docs/development/branch-protection.md),
Release/DevOps may restore it automatically — and records every change made.
Changing protection to make a merge easier is never in scope.

---

## Stale branch and worktree cleanup

After a merge, Release/DevOps and the Integrator check merged local task
branches, merged remote task branches, and stale worktrees.

**Safe to delete:**

- a **local** `agent/*` branch fully merged into `main`, with no worktree
  attached and no unique commits
- a worktree whose directory is gone (`git worktree prune`)
- a clean worktree whose task merged

**Never delete:**

- an active branch, or one with a worktree attached
- an unmerged branch, or one with commits not present on the target
- a `release/*` branch
- any branch with unique commits — regardless of age
- a human-created branch (`feature/<Name>/<topic>`) — those are not the
  framework's to clean up

Verify before deleting, rather than trusting a name:

```bash
git branch --merged main
git log --oneline main..<branch>     # must be empty
git worktree list                    # must not list it
```

**Remote branch deletion is more conservative than local.** Delete a merged
remote `agent/*` branch only where repository policy says to; otherwise report
it as a cleanup candidate. Nothing is lost by leaving a merged remote branch,
and a wrongly deleted one may be somebody's open PR.

---

## Deployment state and drift

Release/DevOps always owns deployment. **Developers and specialist agents never
deploy production changes independently.**

Track, per configured environment — `development`, `staging`, `production`:

```
EXPECTED_SHA        what should be running (the merged target SHA)
DEPLOYED_SHA        what is actually running
DEPLOYMENT_STATUS   the deployment state machine in release-devops.md
MIGRATION_STATUS    none | additive | destructive, with rollback class
SMOKE_STATUS
HEALTH_STATUS
ROLLBACK_SHA        the last known good
LAST_VERIFIED       when this was actually checked, not when it was assumed
```

### Drift classification

```
EXPECTED_SHA != DEPLOYED_SHA   →   drift
```

| State | Meaning |
|---|---|
| `IN_SYNC` | Verified equal |
| `RELEASE_PENDING` | Merged, deployment not yet run — expected, not drift |
| `DRIFT_DETECTED` | They differ and no deployment is pending |
| `DEPLOY_FAILED` | A deployment ran and did not succeed |
| `ROLLBACK_REQUIRED` | The deployed state is bad and must be reverted |
| `UNKNOWN` | Could not be determined |

**`UNKNOWN` is the honest answer here far more often than it looks.** Verified
at this commit: this repository **does not expose the deployed SHA**
([`ITEM-0010`](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md)),
so `DEPLOYED_SHA` frequently cannot be read at all. Record `UNKNOWN` and say
why. **Never report an environment as current on the basis that a merge
happened** — a merge is Git state, not deployed state.

### Promotion

Where configured:

```
merge → staging deploy → smoke → browser E2E → release gate
      → production → production smoke → health verification
```

**Do not promote past a failed stage.** Respect the deployment architecture that
exists in [`deployment-runtime.md`](deployment-runtime.md) and
[`../../docs/deployment/`](../../docs/deployment/) — **do not invent deployment
APIs that do not exist.** Where a capability is absent, the honest report is
that it is absent.

### Recovery

Maintain `CURRENT_SHA`, `LAST_KNOWN_GOOD_SHA`, `ROLLBACK_SUPPORTED` and
`MIGRATION_REVERSIBILITY`. On a failed deployment, diagnose automatically; if
rollback is safe and configured, roll back automatically.

**If a rollback could lose data, do not perform it.** A destructive migration is
not undone by redeploying the previous commit. Record
`OWNER_DECISION_REQUIRED` or `BLOCKED_EXTERNAL`, keep the environment in the
safest reachable state, and report. The rollback classification table in
[`../agents/release-devops.md`](../agents/release-devops.md) decides which case
applies, and it is determined **before** deploying, not after something breaks.
