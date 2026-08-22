---
ID: BUG-0076
aliases: [BUG-0076]
Title: Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-19
DetectedInSha: 494c44d
AffectedModules: [scripts/repo-health.mjs, scripts/session.mjs]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-18-primary-worktree-repository-health-494c44d.md
RegressionId: REG-065
RelatedBacklogItem: ITEM-0057
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-19
---

# BUG-0076 — Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE

## Summary

`repo-health.mjs` reported the health of **the worktree it happened to be
invoked from**, not of the repository. Agents run it from their own isolated
task worktree, which is by construction clean, so it returned `PASS` while the
user's primary checkout carried uncommitted files. Several consecutive tasks
reported `POST_TASK_REPO_HEALTH = PASS` and `CLEANUP_STATUS = DONE`; the user
then opened GitHub Desktop and found six changed files on `develop`.

## Expected Behavior

Repository health is a property of every framework-managed worktree. Before a
task may report `CLEANUP_STATUS = DONE`, the primary checkout is inspected,
every uncommitted path there carries an owner, and any path nobody can account
for blocks completion.

## Actual Behavior

The primary checkout was never inspected. Three independent defects stacked:

1. **Per-worktree dirtiness was computed and then discarded.** The loop over
   `git worktree list` set `worktree.dirty`, used it only to protect a worktree
   from being proposed for deletion, and then mapped the report to
   `{ path, branch, stale }` — dropping `dirty` before anything could read it.
2. **The one dirty check that was reported described the invoking worktree.**
   `gitLines(['status', '--porcelain'])` runs with `cwd: ROOT`, and `ROOT` is
   the script's own checkout.
3. **That check was gated on the wrong branch.** The condition was
   `porcelain.length && currentBranch === TARGET`, where `TARGET` is `main`.
   The primary checkout sits on `develop`, so a dirty `develop` produced no
   output at all — not even a warning — even when the script *was* run there.

Dirtiness was also only ever a warning, never a blocker, so it could not fail a
task even in the one case it was reported.

A fourth, separate defect produced two of the six files: `session.mjs` resolves
`ROOT` from its own location, so `node scripts/session.mjs start` run in the
primary checkout writes the session record *there*. The session then creates its
task worktree, works in it, commits the real record from it, and never returns.

## Reproduction

1. From the primary checkout on `develop`, run
   `node scripts/session.mjs start "<title>" --branch agent/<x>`.
   The record is written into the primary checkout, untracked.
2. Create the task worktree for `agent/<x>` and do all work there.
3. Run `node scripts/repo-health.mjs` from the task worktree.
4. It reports `PASS`. `DIRTY_PATHS` describes the task worktree. The primary
   checkout's untracked record — and any other uncommitted file there — is
   absent from the report entirely.

## Evidence

Observed state in the primary checkout at `aa33524`, six paths:

```
 M apps/landing/.env.example
 M apps/landing/.env.local.example
 M apps/landing/.env.production.example
 M apps/landing/next-env.d.ts
?? docs/sessions/SESSION-0015-wp-11-provisioning-operations-ux-and-wp-13-qa-campaign.md
?? docs/sessions/SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian.md
```

`scripts/repo-health.mjs` before the fix:

- `worktree.dirty` computed in the worktree loop, consumed only by the staleness
  branch, and excluded from `report.worktrees`.
- `const porcelain = gitLines(['status', '--porcelain'])` — `git()` runs with
  `cwd: ROOT`.
- `if (porcelain.length && currentBranch === TARGET)` — `TARGET` resolves from
  `refs/remotes/origin/HEAD`, i.e. `main`, never `develop`.

`scripts/session.mjs` before the fix:

- `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')`
- `WORKTREE: ${ROOT.replace(/\\/g, '/')}` written into the record.

The stranding is provable from the records themselves. The untracked
SESSION-0016 stub in the primary checkout and the record committed upstream
share `SESSION_ID`, `BASE_SHA` and `STARTED_AT: 2026-08-18T20:06:16.992Z`, and
differ only in `WORKTREE` — `D:/My Work/hrm-dijipeople/DijiPeople` against
`C:/Users/hp/AppData/Local/Temp/claude/wt-framework` — and in content, the
committed one being strictly richer. They are the same record written twice into
two different checkouts.

The reflog shows the primary checkout has only ever been fast-forwarded
(`merge origin/develop: Fast-forward`, `pull --ff-only`), so no agent commit or
checkout ever ran there. `session.mjs start` is the only framework command that
wrote into it.

## Root Cause

`PRIMARY_WORKTREE` did not exist as a concept. Nothing in the framework
distinguished the user's interactive checkout from a task worktree, so nothing
could check it, and "repository health" silently meant "the health of wherever
the agent is standing".

## Impact

Every task run since worktree isolation was adopted. The user's own workspace
accumulated files no report named, some of which — the three landing env
examples — were their own uncommitted configuration work that an agent could
plausibly have reverted while "cleaning up".

Not reachable in production; this is engineering-process surface only.

## Affected Areas

`scripts/repo-health.mjs`, `scripts/session.mjs`,
`.agent/context/repository-health.md`,
`.agent/context/task-completion-contract.md`,
`.agent/agents/release-devops.md`, `.agent/agents/architect.md`, `AGENTS.md`.

## Proposed Resolution

No ExecPlan required — the change extends an existing mechanism rather than
introducing one.

- `repo-health.mjs` keeps the porcelain **lines** per worktree, classifies each
  worktree `PRIMARY` / `TASK` / `OTHER`, attributes every dirty path in the
  primary checkout to `USER`, `SESSION-nnnn`, `GENERATED_BY_FRAMEWORK` or
  `UNKNOWN`, and reports `PRIMARY_WORKTREE_STATUS`.
- `DIRTY_UNEXPLAINED` becomes a **blocker**, not a warning.
- `--primary-baseline` proves which paths predate the task, mirroring
  `--main-baseline`.
- `session.mjs start` detects and reports `PRIMARY_WORKTREE_ARTIFACT`.

## Acceptance Criteria

- `PRIMARY_WORKTREE_STATUS` is reported whichever worktree the check runs from.
- An unexplained dirty path in the primary checkout appears in `blockers`.
- A path proven pre-existing by `--primary-baseline` is `DIRTY_USER_OWNED` and
  does not block.
- An ACTIVE session's record in the primary checkout is attributed to that
  session and is never classified as an orphan.
- A dirty sibling worktree is reported and left untouched.
- `repo-health.mjs` mutates nothing: branch, HEAD and working tree are identical
  either side of a run, including on a dirty tree.

## Regression Coverage

Behavioural simulations 37A–37G, 38 and 39 in `scripts/validate-framework.mjs`,
run against throwaway repositories with real worktrees attached.

Mutation-tested seven ways — the blocker deleted, the status pinned to `CLEAN`,
the per-worktree paths collapsed back to a boolean, `UNKNOWN` silently reclassed
as `USER`, an active session record misread as an orphan, sibling worktrees
dropped from the report, and the `session.mjs` detection pinned to `false`. All
seven mutations are killed by at least one simulation.

The seventh initially **survived**, because the check that covered it read the
source for the identifier rather than executing the behaviour. That is the same
class of defect as this bug, and is why simulation 39 drives `session.mjs`
against a sandbox instead of grepping it.

## Dependencies

None.

## Related Items

[[ITEM-0057]] — the landing env-example domain cutover preserved from the same
dirty state. [[ITEM-0058]] — `next-env.d.ts` generated churn. [[SESSION-0017]].

## Resolution

Fixed on `agent/repo-health-primary-worktree`. `repo-health.mjs` gained
multi-worktree aggregation, ownership attribution and the blocking
`DIRTY_UNEXPLAINED` state; `session.mjs` gained `PRIMARY_WORKTREE_ARTIFACT` and
a `--root` override so the behaviour is executable in tests.

## QA Retest

`docs/qa/runs/2026-08-18-primary-worktree-repository-health-494c44d.md`.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-065 names `scripts/validate-framework.mjs`, and that is what was executed.

```text
node <script>   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-19 — created from user report at `494c44d`.
- 2026-08-19 — root cause established, fixed, mutation-tested, resolved.
