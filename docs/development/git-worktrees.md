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
- **No worktrees are currently in use** — `git worktree list` shows only the
  main checkout.
- **No CI** — there is no `.github/` directory. Nothing validates a branch
  automatically.
- The main checkout frequently carries **substantial uncommitted work**. Check
  `git status` before doing anything.

---

## Why worktrees here

This is a large monorepo. Switching branches in a single checkout invalidates
`node_modules` state, `.next/` build caches, `dist/`, `tsconfig.tsbuildinfo` and
the generated Prisma client — and it destroys any uncommitted work in progress.

A worktree gives each agent its **own directory with its own working tree**,
sharing one `.git`. Agents can work simultaneously, each with its own build
artefacts, without touching the main checkout.

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

Cleaning up after merge:

```bash
cd "d:/My Work/hrm-dijipeople/DijiPeople"
git worktree remove ../dijipeople-overtime-api
git branch -d agent/overtime-api
git worktree prune          # if a directory was deleted manually
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
   for that work). Because there is no CI, **the PR description must state which
   validation commands were run and their results.**
8. After merge: remove the worktree, delete the branch, `git worktree prune`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `fatal: '<branch>' is already checked out` | That branch has a worktree. `git worktree list` to find it. |
| Type errors referencing Prisma models that exist | Stale generated client — run `npm run prisma:generate` in *that* worktree. |
| `next build` picks up files from another worktree | A worktree was created inside the repo. Move it to a sibling directory. |
| Missing modules after creating a worktree | `npm install` has not been run there. |
| Migration state confusion across worktrees | Two agents migrated the same database. Stop, reconcile with `npm run prisma:migrate:status`, and re-establish a single schema owner. |
