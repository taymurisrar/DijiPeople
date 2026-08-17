# Branch Model — `develop` integrates, `main` deploys

> **Last verified:** 2026-08-16
> **Verified against commit:** 714632d
> **Key source files:** scripts/repo-health.mjs, scripts/lib/session-records.mjs, scripts/lib/session-registry.mjs, .github/workflows/ci.yml, docs/development/branch-protection.md, .agent/agents/integrator.md, .agent/agents/release-devops.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

```
main        production deployment branch   ← only RELEASE / DEPLOY / HOTFIX_PRODUCTION
  ↑
develop     autonomous integration branch  ← every ordinary task
  ↑
agent/*     isolated implementation branches
```

**`DEFAULT_TARGET_BRANCH = develop`.**

Ordinary work — `BUG`, `FEATURE`, `UI/UX`, `QA`, `E2E`, `ARCHITECTURE`,
`DATABASE`, `INTEGRATION`, `SECURITY`, `PERFORMANCE`, `KNOWLEDGE`, `FRAMEWORK`,
`BACKLOG`, `AUDIT` — integrates into `develop` and never touches `main`.

---

## Why `main` is different

**Any mutation of `main` may trigger a production deployment.** That is the
entire reason for the split. Before this model, every task merged into `main`,
so every documentation fix, every framework change and every small bug fix was a
production event whether or not anybody intended one.

```
MAIN_MUTATION_FORBIDDEN = true   for every ordinary task
```

Forbidden for an ordinary task, without exception:

```
push main · merge into main · cherry-pick onto main
open a PR targeting main · reset main
```

**The Architect may not silently reclassify a normal task as a production
deployment.** Promotion to `main` requires the task to *be* a `RELEASE`,
`DEPLOY` or `HOTFIX_PRODUCTION` — which is a classification the user's request
supports, not one an agent reaches for because integration would be simpler.

This is machine-checked. `scripts/lib/session-records.mjs` rejects a session
record whose `TARGET_BRANCH` is `main` unless its `TASK_TYPE` is a production
type, and `node scripts/rebuild-sessions.mjs --check` runs in CI.

---

## Develop

`develop` is the **autonomous integration branch**. The user has authorised:

- autonomous integration into `develop`;
- **no mandatory human PR approval**;
- **no mandatory PR** for ordinary integration.

```
DEVELOP_PR_REQUIRED       = false
DEVELOP_VALIDATION_REQUIRED = true
```

The second line is the one that matters. Dropping the PR requirement removes a
*process* step, not a *validation* step. Every integration still runs the local
gates relevant to the change, and CI still runs — `.github/workflows/ci.yml`
triggers on `push` to `'**'`, so a pushed `develop` is validated whether or not
a PR exists.

### When to open a PR anyway

A PR to `develop` needs no approval and is still worth opening for:

- security changes;
- database and migration changes;
- architecture changes;
- large cross-module tasks;
- a risky or contested conflict resolution;
- anything whose review trail has audit value.

`.github/workflows/ci.yml` already lists `develop` in its `pull_request`
branches, so such a PR gets the full `CI required gate` run.

### Only the Integrator writes `develop`

Specialists never push a shared branch. Concurrent integration is serialised
through the merge queue and its integration lock — see
[`multi-session.md`](multi-session.md).

---

## `DEVELOP_SYNC_STATUS`

Reported by `node scripts/repo-health.mjs`, computed from refs.

| State | Meaning |
|---|---|
| `SYNCED` | local and `origin/develop` identical |
| `AHEAD` | integrated work has not been pushed |
| `BEHIND` | the remote moved; fast-forward before integrating |
| `DIVERGED` | both moved — the Integrator reconciles, never by force push |
| `INTEGRATION_PENDING` | queued or mid-integration |
| `REMOTE_ONLY` | develop exists on the remote and is not checked out here — the ordinary case in a task worktree |
| `NOT_PRESENT` | no `origin/develop` at all |
| `PUSH_FAILED` · `FETCH_FAILED` · `UNKNOWN` | as for `MAIN_SYNC_STATUS` |

A completed ordinary task finishes with `DEVELOP_SYNC_STATUS = SYNCED` where a
local `develop` exists, and with the integrated SHA actually on
`origin/develop` — verified by reading the ref, never inferred from what a push
printed.

`repo-health.mjs` also reports **`DEVELOP_BEHIND_MAIN`**. An integration branch
far behind production is not an integration branch; cutting work from it
produces conflicts that have nothing to do with the task. This repository has
been in exactly that state: `develop` sat 201 commits behind `main`, last touched
2026-05-08, before TASK-0004 fast-forwarded it.

---

## `MAIN_SYNC_STATUS` and `MAIN_CHANGE_STATUS`

Two different questions, and conflating them is how a task that merged into
production reports a clean bill of health.

| Field | Question |
|---|---|
| `MAIN_SYNC_STATUS` | Is local `main` in step with `origin/main`? |
| `MAIN_CHANGE_STATUS` | Did **this task** move production? |

An ordinary task must finish with **both**:

```
MAIN_SYNC_STATUS   = SYNCED
MAIN_CHANGE_STATUS = UNTOUCHED
```

```bash
node scripts/repo-health.mjs --main-baseline <sha-at-task-start> [--task-sha <sha>]
```

| Value | Meaning |
|---|---|
| `UNTOUCHED` | `origin/main` does not contain this task's commits. It may have *advanced* — another session merging is ordinary — and the report says by how many |
| `CHANGED_BY_THIS_TASK` | This task's commits are on `origin/main`. **A failed ordinary task** |
| `REWRITTEN` | `origin/main` no longer contains the recorded baseline. Nothing in this framework does that |
| `UNKNOWN` | No baseline was supplied |

**The test is containment, not equality.** The first implementation compared the
baseline with `origin/main` and reported `CHANGED` whenever `main` had moved —
and it fired on its own first real run, for a task that had not touched `main`
at all, because a concurrent session merged two PRs during it. A
production-safety field that cries wolf when a colleague merges is one people
learn to ignore, which is worse than not having it.

Without a baseline the field is `UNKNOWN`, deliberately. Deriving `UNTOUCHED`
from "main looks synced" would pass a task that merged into `main` and pushed —
precisely the event the field exists to catch.

---

## Release and hotfix

### Release

```
develop → Release/DevOps readiness → release validation
        → main → production deployment → post-deploy smoke → health
        → release record → Obsidian
```

Only Release/DevOps authorises promotion, and only after the readiness inputs in
[`../agents/release-devops.md`](../agents/release-devops.md). `main` remains
protected: PR required, `CI required gate` required, `enforce_admins: true`, no
force pushes, no deletion. **None of that is weakened by this model** — the
model reduces how often `main` is touched, it does not make touching it easier.

### Hotfix

`HOTFIX` does not mean "skip the gates". Urgency narrows scope; it never
narrows evidence. A production hotfix still runs the owning specialist, QA, the
Reviewer, the Integrator and Release/DevOps, and still needs a regression that
fails without the fix.

**After a hotfix, `develop` must be reconciled** so it contains the production
fix:

```
hotfix branch → main (production)
             → develop (reconciliation, same task, before it completes)
```

A fix that exists on `main` and not on `develop` is reintroduced by the next
ordinary integration. `NO_PRODUCTION_ONLY_DIVERGENCE` is a completion condition
of every hotfix, not a follow-up.

---

## Branch protection, as configured

`main` — classic branch protection, verified at this commit:

```
required_status_checks   strict: true · contexts: ["CI required gate"]
required_pull_request_reviews  required_approving_review_count: 0
enforce_admins           true      ← no administrative bypass
allow_force_pushes       false
allow_deletions          false
required_conversation_resolution  true
```

`develop` — the intended configuration:

```
required_status_checks         null    ← no required check on direct push,
                                          so the Integrator can push after
                                          local validation; CI still runs
required_pull_request_reviews  null    ← no PR, no approvals
enforce_admins                 true    ← the two prohibitions below bind everyone
allow_force_pushes             false
allow_deletions                false
```

A required status check on a branch with no PR requirement **blocks direct
pushes**, because the commit being pushed has no completed check yet. That would
reintroduce the mandatory-PR requirement by the back door, which is why
`required_status_checks` is null here and `DEVELOP_VALIDATION_REQUIRED` is
enforced by the framework instead.

Verify with:

```bash
node scripts/verify-branch-policy.mjs
```

> **Note on the repository ruleset.** `taymurisrar/DijiPeople` carries one
> ruleset, "No push" (id `15523234`), whose `include` condition is the literal
> string `refs/heads/"main", "develop"`. That is not a valid ref pattern and
> matches **no branch**, so the ruleset — which would otherwise require one
> approving review — is inert. `main` is protected solely by classic branch
> protection. Recorded rather than corrected: repairing the pattern would impose
> a review requirement on `main` that does not exist today and on `develop`
> that this model explicitly excludes. See
> [`../../docs/development/branch-protection.md`](../../docs/development/branch-protection.md).

---

## Anti-patterns

- Targeting `main` because `develop` was behind. Fast-forward `develop`.
- Reclassifying an ordinary task as a release to justify touching `main`.
- Reporting `MAIN_CHANGE_STATUS = UNTOUCHED` with no baseline.
- Adding a required status check to `develop` and then wondering why the
  Integrator cannot push.
- Leaving a hotfix on `main` only.
- Weakening `main`'s protection to make any of the above easier.
