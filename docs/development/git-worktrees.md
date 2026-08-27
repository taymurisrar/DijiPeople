# Git Worktree Workflow

How to run several agents on DijiPeople at once without them overwriting each
other's working tree.

---

## Current Git setup (verified)

- Remote: `origin` → `https://github.com/taymurisrar/DijiPeople.git`
- Default branch: `main` (also the PR base)
- Other branches: `develop`, `feature/<Name>/<topic>`
  (e.g. `feature/Taimur/employees-enhancement`,
  `feature/Fizza/admin-bug-fixes`)
- **`main` is protected**, with `enforce_admins: true` — a required
  `CI required gate` status check, PR required, force pushes and deletion
  prohibited. **There is no admin bypass; a direct push to `main` fails for
  everyone**, including the repository owner. See
  [`branch-protection.md`](branch-protection.md), and
  [`../../.agent/context/repository-health.md`](../../.agent/context/repository-health.md)
  for recovering commits that reached local `main` by accident.
- **CI exists** — `.github/workflows/ci.yml`, **ten** required jobs behind the
  single `CI required gate` check. See [`ci.md`](ci.md).
  > These two bullets previously read "No CI — there is no `.github/`
  > directory". Both CI and branch protection were added afterwards, and the
  > stale text stayed — the `doc-code-drift` pattern in the framework's own
  > documentation. An agent reading it would have concluded nothing validated
  > its branch, and that a direct push to `main` was available.
- The main checkout frequently carries **substantial uncommitted work**. Check
  `git status` before doing anything — or run `npm run repo:health`, which
  reports that alongside sync state, unfinished Git operations, stale worktrees
  and branch-cleanup candidates.

---

## Why worktrees here

This is a large monorepo. Switching branches in a single checkout invalidates
`node_modules` state, `.next/` build caches, `dist/`, `tsconfig.tsbuildinfo` and
the generated Prisma client — and it destroys any uncommitted work in progress.

A worktree gives each agent its **own directory with its own working tree**,
sharing one `.git`. Agents can work simultaneously, each with its own build
artefacts, without touching the main checkout.

---

## Baseline requirement (learned the hard way)

**A worktree inherits Git commits, not another checkout's uncommitted files.**

This framework — `AGENTS.md`, `PLANS.md`, `.agent/`, the architecture notes —
existed only as *untracked* files in one working tree for its first several
sessions. Every worktree cut from `HEAD` in that period therefore contained
**none of it**. Agents working in those worktrees followed the rules only
because the files happened to sit in the operator's context window; a fresh
Codex session in the same directory would have had nothing to read.

Before starting feature work, confirm the framework is present on the branch you
cut from:

```bash
ls AGENTS.md PLANS.md .agent/agents .agent/context
```

If any are missing, the base branch predates the framework baseline. Rebase onto
a branch that contains it rather than working blind.

## Strategy

Default: **one substantial task → one isolated worktree → multiple logical
commits.** Use per-issue branches inside that worktree only when the diffs must
be reviewed independently.

Use multiple worktrees only for genuinely parallel-safe work — each costs a full
`npm install` plus `prisma generate`, which is not free in a monorepo this size.
Do not create a branch per tiny issue automatically.

---

## Branch naming

```
agent/<feature>-<scope>
```

`<feature>` is the feature slug from the ExecPlan; `<scope>` is the layer or
area.

```
agent/overtime-db
agent/overtime-api
agent/overtime-ui
agent/overtime-rbac
agent/attendance-geofence-api
agent/payroll-journal-export
```

Human work keeps the existing `feature/<Name>/<topic>` convention. The `agent/`
prefix makes machine-produced branches obvious in `git branch -a` and in the
GitHub UI.

---

## Rules

1. **Agents never commit directly to `main`.** No exceptions, including
   "trivial" changes.
2. **One branch per task, one agent per branch.**
3. **One worktree per branch.** Do not check the same branch out twice — Git
   will refuse, and forcing it corrupts state.
4. **Do not create worktrees speculatively.** Create one when a task actually
   starts; remove it when the task is merged or abandoned.
5. **Branch from an up-to-date `main`**, unless the plan explicitly says the
   task depends on another agent's branch.
6. **A worktree contains one task's changes only.** No unrelated edits.
7. **Do not revert, stage or commit files you did not change.** The main
   checkout may hold unrelated in-flight work; so may a shared branch.

---

## Commands for this repository

Repository root: `d:/My Work/hrm-dijipeople/DijiPeople`. Put worktrees in a
sibling directory so they never land inside the repo and get picked up by
tooling, globs or `next build`.

```bash
# from the repository root

# 1. make sure main is current
git fetch origin
git checkout main
git pull --ff-only origin main

# 2. create a worktree with a new branch
git worktree add ../dijipeople-overtime-db  -b agent/overtime-db  origin/main
git worktree add ../dijipeople-overtime-api -b agent/overtime-api origin/main
git worktree add ../dijipeople-overtime-ui  -b agent/overtime-ui  origin/main

# 3. list what exists
git worktree list

# 4. work inside a worktree
cd ../dijipeople-overtime-api
npm install                 # each worktree needs its own node_modules
npm run prisma:generate     # and its own generated Prisma client
```

Branching from another agent's branch (a `DEPENDENCY_BLOCKED` task):

```bash
git worktree add ../dijipeople-overtime-api -b agent/overtime-api agent/overtime-db
```

Cleaning up after merge — **use the script, not `git worktree remove`**:

```bash
cd "d:/My Work/hrm-dijipeople/DijiPeople"
node scripts/remove-worktree.mjs ../dijipeople-overtime-api --branch agent/overtime-api
```

Add `--dry-run` to see what it would unlink and remove without touching
anything.

### Why not `git worktree remove` directly

`git worktree remove` deletes the directory recursively, and **a junction is a
directory to that recursion**. It walks straight through and destroys whatever
the junction points at.

That is not hypothetical here. A worktree's `node_modules` is routinely
junctioned to the primary's, because a real `npm ci` per worktree costs minutes
(see [Baseline requirement](#baseline-requirement-learned-the-hard-way)). And
npm workspaces puts *its own* links inside `node_modules`:

```
node_modules/admin   -> apps/admin
node_modules/web     -> apps/web
node_modules/api     -> services/api
node_modules/@repo/* -> packages/*
```

So the delete chains through **two** levels of link and lands in the real source
tree. On 2026-08-26 that removed **3,072 tracked files** from the primary
checkout — `apps/admin`, `apps/web`, `docs` and every workspace npm had linked —
along with every installed dependency and the generated Prisma client. Git
reported only `failed to delete ...: Directory not empty`, which reads like the
removal did nothing.

`scripts/remove-worktree.mjs` unlinks every reparse point first, using a call
that cannot follow one, then checks the primary still has its sentinel paths
before *and* after handing the directory to Git. It refuses outright if the path
given is the primary worktree or is not a registered worktree at all.

If it ever does happen, the tracked half is fully recoverable — nothing is lost
that Git tracks:

```bash
cd "d:/My Work/hrm-dijipeople/DijiPeople"
git status --short          # confirm every entry is ` D` and nothing is `??`
git restore .               # restores tracked files; overwrites nothing
npm ci                      # node_modules is gitignored, so restore cannot bring it back
npm run prisma:generate     # and neither is the generated client
```

Check `git status` first. `git restore .` is safe *because* every entry is a
deletion; it would discard real edits if any were mixed in.

If a worktree directory was deleted by hand and Git still lists it:

```bash
git worktree prune
```

### PowerShell note

The commands above are identical in PowerShell; only path quoting differs.
Use `Set-Location` instead of `cd` in scripts, and quote paths containing
spaces:

```powershell
Set-Location "d:\My Work\hrm-dijipeople\DijiPeople"
git worktree add "..\dijipeople-overtime-db" -b agent/overtime-db origin/main
```

---

## Per-worktree setup cost

Each worktree is a fresh checkout. Before it can build or typecheck:

```bash
npm install                # npm workspaces install for the whole monorepo
npm run prisma:generate    # generated client is per-checkout, not shared
```

This is not cheap in a monorepo this size. **Do not spin up a worktree for a
task that could have been a five-minute edit in the main checkout on a normal
branch.** Worktrees are for genuinely concurrent work.

---

## Environment in a worktree

`.env` files are gitignored and therefore **not** copied into a new worktree.
Copy the ones the task needs:

```bash
cp "d:/My Work/hrm-dijipeople/DijiPeople/services/api/.env" ../dijipeople-overtime-api/services/api/.env
```

### `prisma generate` needs `DATABASE_URL` even though it does not connect

Verified: `prisma.config.ts` resolves the datasource url eagerly, so codegen in
a fresh worktree fails with
`PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.

For codegen only, a placeholder is sufficient and avoids copying real
credentials into another directory:

```bash
cd services/api
DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
  npx prisma generate --config prisma.config.ts
```

Never commit a real connection string. Anything that actually reaches the
database — migrations, seeds, e2e suites — needs the real value.

Critical caution: **every worktree points at the same `DATABASE_URL` by
default.** That means:

- Two agents running `prisma migrate dev` against the same database will corrupt
  each other's migration state.
- One agent running a demo reset destroys another agent's test data.

Therefore:

- **Only the agent owning the schema task runs migrations.** This is the
  single-writer rule from [`parallel-work.md`](parallel-work.md), applied to the
  database as well as the file.
- If two agents genuinely need to migrate independently, give each its own
  database and its own `DATABASE_URL`.
- Never run `seed:demo:reset` or any destructive seed in a shared environment
  without telling everyone.

---

## Review and integration

1. Each agent finishes its task, runs the relevant validation
   (see [`../../AGENTS.md`](../../AGENTS.md)), and reports.
2. **Reviewer** reviews the branch diff against the plan and the security
   checklist ([`.agent/agents/reviewer.md`](../../.agent/agents/reviewer.md)).
   The Reviewer does not push fixes.
3. Findings go back to the branch owner.
4. When a branch is approved, rebase it on current `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
   Resolve conflicts on the branch, never on `main`.
5. **Integration order follows the plan's dependency graph**, not the order
   branches happened to finish. Schema first, then API, then UI, then wiring.
6. The `INTEGRATION` task lands last, on one branch, and runs the full
   validation set before the PR is opened.
7. Open a PR into `main` (or `develop`, if the team is running a release branch
   for that work). CI runs the `CI required gate` check on the pushed commit.
   **The PR description must still state which local validation commands were
   run and their results**, because CI does not cover e2e, migration application
   or the .NET gateway — see [`ci.md`](ci.md).
8. After merge: validate the merged SHA, capture knowledge, sync Obsidian, then
   remove the worktree, delete the branch and `git worktree prune`. The full
   sequence is in
   [`../../.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `fatal: '<branch>' is already checked out` | That branch has a worktree. `git worktree list` to find it. |
| Type errors referencing Prisma models that exist | Stale generated client — run `npm run prisma:generate` in *that* worktree. |
| `next build` picks up files from another worktree | A worktree was created inside the repo. Move it to a sibling directory. |
| Missing modules after creating a worktree | `npm install` has not been run there. |
| Migration state confusion across worktrees | Two agents migrated the same database. Stop, reconcile with `npm run prisma:migrate:status`, and re-establish a single schema owner. |
