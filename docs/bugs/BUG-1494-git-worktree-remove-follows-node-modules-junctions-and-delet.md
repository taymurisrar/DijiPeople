---
ID: BUG-1494
aliases: [BUG-1494]
Title: git worktree remove follows node_modules junctions and deletes the primary checkout
Status: VERIFIED
Severity: CRITICAL
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-26
DetectedInSha: 6e67e063
AffectedModules: [scripts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-262
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1494 — git worktree remove follows node_modules junctions and deletes the primary checkout

## Summary

`git worktree remove` deletes the worktree directory recursively. **A junction is
a directory to that recursion**, so the delete walks through it and destroys
whatever it points at.

Task worktrees in this repository routinely junction `node_modules` to the
primary's, because a real `npm ci` per worktree costs minutes. npm workspaces
then puts *its own* links inside `node_modules`. So the delete chains through
**two** levels of link and lands in the real source tree.

On 2026-08-26 this removed **3,072 tracked files** from the user's primary
checkout — `apps/admin`, `apps/web`, `docs` and every workspace npm had linked —
plus every installed dependency and the generated Prisma client. Git reported
only `failed to delete ...: Directory not empty`, which reads like the removal
did nothing at all.

## Expected Behavior

Removing a task worktree removes that worktree. The primary checkout is not
touched, whatever links the worktree happens to contain.

## Actual Behavior

The primary checkout lost 3,072 tracked files and its entire `node_modules`. The
only diagnostic was a message about the *worktree* directory being non-empty —
nothing mentioned the primary.

## Reproduction

```bash
git worktree add ../wt-probe --detach HEAD
# the junction a task worktree normally has:
cmd /c mklink /J ..\wt-probe\node_modules  ..\DijiPeople\node_modules
git worktree remove ../wt-probe --force
git -C ../DijiPeople status --short   # thousands of ` D` entries
```

Verified on 2026-08-26 with a disposable canary: a worktree whose `node_modules`
junction pointed at a directory of five files. `git worktree remove --force`
emptied the canary. The same fixture, removed through the new guard, left all
five files in place.

## Evidence

Immediately after the failed removal, in the primary checkout:

```
=== counts ===
3072          # git status --short
3072          # of which ` D` deletions
=== do the files actually exist on disk? ===
ls: cannot access 'apps/admin/AGENTS.md': No such file or directory
=== node_modules ===
node_modules              : 0 entries
services\api\node_modules : MISSING
playwright  -> UNRESOLVED
next        -> UNRESOLVED
typescript  -> UNRESOLVED
```

The link chain that explains exactly *which* directories were emptied — they are
precisely the npm workspaces:

```
wt-admin-qa/node_modules   -> DijiPeople/node_modules      (junction I created)
  DijiPeople/node_modules/admin   -> apps/admin            (npm workspaces)
  DijiPeople/node_modules/web     -> apps/web
  DijiPeople/node_modules/api     -> services/api
  DijiPeople/node_modules/@repo/* -> packages/*
```

## Root Cause

Two safe-looking things combining into an unsafe one.

Junctioning `node_modules` is an established practice here and is recorded as
such — a fresh `npm ci` per worktree is slow, and the memory note
`fresh-worktree-has-no-node-modules` recommends it for `tsc`/`jest`. Separately,
`git worktree remove` is the documented cleanup step in
`docs/development/git-worktrees.md`.

Neither is wrong alone. The hazard is that a Windows junction is transparent to
a recursive delete, and npm workspaces makes `node_modules` a hub that points
back at the source tree — so the composition reaches somewhere neither step
intended. Nothing in the documentation connected them, and the failure is silent
in the direction that matters: the error names the worktree, never the primary.

## Impact

The user's interactive workspace, which is the one place `AGENTS.md` says must
never be treated as scratch. The *tracked* files were fully recoverable, and only
because that was checked before acting — had the checkout held uncommitted work,
`git restore .` would have destroyed it.

**Correction, 2026-08-27.** This section read "nothing was modified, untracked or
stashed", and that was wrong. The delete also took the **`.env` files**, which are
gitignored and therefore untracked: `services/api/.env`, and the local env files
for `apps/web`, `apps/admin` and `apps/landing`. `git restore .` could not bring
them back for the same reason it could not bring back `node_modules`.

The claim was not harmless. It is precisely why nobody went looking: the record
said there was nothing to recover, so the loss went unnoticed until the owner
tried to build the desktop agent on 2026-08-27 and the build failed on a missing
`.env` — two days later. `node_modules` and the Prisma client were named as
unrecoverable and were regenerated; the env files were not named, and were not.

Restored on 2026-08-27 from the committed `.env*.example` templates, with fresh
local JWT secrets generated. `DATABASE_URL`, `SECRET_ENCRYPTION_KEY` and the
Stripe keys could not be restored from any template and had to be re-supplied by
the owner — anything the old encryption key had encrypted locally is
unrecoverable.

`node_modules` and the generated Prisma client are gitignored, so `restore` could
not bring them back; those needed `npm ci` and `npm run prisma:generate`.

## Affected Areas

- `docs/development/git-worktrees.md` — taught the raw command as the cleanup step
- `.agent/context/repository-health.md` — requires "the task worktree removed"
- `.agent/agents/release-devops.md` — same requirement
- Every task that creates a worktree and junctions its dependencies

## Proposed Resolution

Make the safe path the only documented path, and let it prove itself.

## Acceptance Criteria

- Removing a worktree through the documented route cannot delete the primary.
- The guard refuses the primary worktree and any unregistered path.
- The primary's sentinel paths are verified before *and* after the removal.
- Validation fails if the guard loses either refusal or starts deleting
  recursively.

## Regression Coverage

REG-262 — nine checks in `validate-framework.mjs`, mutation-tested:

- deleting the primary-worktree refusal fails 1 check
- replacing the safe unlink with a recursive delete fails 2 checks

## Dependencies

None.

## Related Items

- [[BUG-1419]] — filed by the QA run this incident happened at the end of

## Resolution

Fixed on `agent/worktree-removal-guard`, 2026-08-26.

`scripts/remove-worktree.mjs` finds every reparse point inside the worktree
*without descending into one*, unlinks each with `rmdirSync`/`unlinkSync` — calls
that cannot follow a link — and only then hands the directory to Git. It refuses
if the path is the primary worktree or is not a registered worktree of this
repository, and it verifies the primary's sentinel paths both before and after
the delete, because the delete is the dangerous step and the whole failure mode
is a delete that silently succeeds against the wrong directory.

Exposed as `npm run worktree:remove`, with `--dry-run`.
`docs/development/git-worktrees.md` and `.agent/context/repository-health.md` now
teach that route and explain why the raw command is unsafe.

Verified end to end against a disposable canary: worktree removed, junction
unlinked, all five canary files intact, primary verified.

One deliberate subtlety in the validation: the "never deletes recursively" check
strips comments before scanning, because the guard names `rm -rf` in its own
header in order to forbid it. Without that, the sentence preventing the mistake
fails the check that enforces it — the same trap as a record breaking the link
check by quoting a wikilink.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `scripts/validate-framework.mjs`, `scripts/remove-worktree.mjs` ran and passed, as part of `node --test scripts/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Live test 2026-08-26, described above. Framework validation: 3954 checks,
mutation-tested.

## History

- 2026-08-26 — incident during SESSION-0059 cleanup; recorded and fixed under
  SESSION-0060.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `scripts/validate-framework.mjs`
- `scripts/remove-worktree.mjs`

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

- Regression — REG-262 (see the regression register)

<!-- GRAPH:END -->
