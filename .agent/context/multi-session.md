# Multi-Session Safety — concurrent Architect sessions

> **Last verified:** 2026-08-16
> **Verified against commit:** 714632d
> **Key source files:** scripts/lib/agent-state.mjs, scripts/lib/session-registry.mjs, scripts/lib/session-records.mjs, scripts/lib/id-allocator.mjs, scripts/session.mjs, scripts/allocate-id.mjs, scripts/rebuild-sessions.mjs, docs/sessions/README.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

**The user may have two, three or more Architect chats open at once, and the
framework is expected to cope.** Each chat is a *session*. Sessions run in
separate worktrees, on separate branches, and must not corrupt each other's
durable state.

This is not hypothetical. While TASK-0004 was being planned, a second session
checked out `main` in the primary worktree and reset it to `origin/main`
underneath the first — and the repository already carries two commits titled
"renumber colliding record ids", the second of them saying "(second
occurrence)".

---

## The two kinds of state

The whole design rests on this split. Getting it wrong is what produced the id
collisions.

| | **Durable narrative state** | **Live coordination state** |
|---|---|---|
| Where | `docs/sessions/`, `docs/tasks/`, `docs/bugs/` | the repository's shared Git directory |
| Tracked | yes | **no** |
| Answers | what was this session doing, and why | who holds the schema lease *right now* |
| Visible to a sibling session | only after a push and a fetch | **immediately** |
| Survives the machine | yes | no |

`git rev-parse --git-common-dir` returns **one directory for every worktree of a
repository**. A lease taken in `dijipeople-framework/` is visible instantly in
`dijipeople-bugs/`, with no commit, no push and no fetch. That property is what
makes coordination possible at all, and it is why live state lives there and not
in `docs/`.

Putting live state in the working tree would make each session's ordinary
bookkeeping a merge conflict in every other session's branch — and it still
would not be visible until somebody pushed.

```
<git-common-dir>/dijipeople/
  id-reservations.json   ids spent but not yet written to a record
  sessions.json          live sessions and their heartbeats
  leases.json            write leases on high-risk shared resources
  merge-queue.json       the serialised develop integration queue
  *.lock                 mkdir-based mutexes, one per table
```

---

## Atomic id allocation

Every durable id was allocated as `max(ids visible in the working tree) + 1`.
That is correct for one agent on one branch and wrong for everything else: two
sessions on two branches see the same highest id, both take the next one, and
the collision surfaces at merge time — after both records have been written,
linked and referenced.

```bash
node scripts/allocate-id.mjs bug --session SESSION-0003 --note "cross-tenant read"
node scripts/allocate-id.mjs backlog
node scripts/allocate-id.mjs task
node scripts/allocate-id.mjs scenario --scope AUTH
node scripts/allocate-id.mjs --list
node scripts/allocate-id.mjs --prune
```

Three properties, and all three are necessary:

1. **Every ref is scanned, not the working tree.** `git log --all --reflog
   --name-only` over the record directories, in one subprocess, finds every id
   ever used on any branch — including on branches that were later reverted,
   because records elsewhere still link to those ids.
2. **The id is reserved before the record exists.** Between deciding on
   `BUG-0048` and writing `BUG-0048-….md` there is a window in which a second
   session sees nothing. The reservation ledger closes it.
3. **The ledger and its lock are in the shared Git directory**, so a sibling
   worktree sees the reservation.

**Reservations are never lowered and never expire.** A session that aborts
burns an id, leaving a gap in a sequence. That is far cheaper than reuse, which
costs a merge conflict in a durable record and then a renumber that invalidates
every link pointing at it.

The scaffolding scripts call the same allocator, so `node scripts/new-bug.mjs`
and a human running `allocate-id.mjs` cannot collide either.

Kinds: `bug` · `item`/`backlog` · `task` · `session` · `adr` · `plan` ·
`scenario` (scoped) · `regression`. Date-named records — `qa-run`, `history`,
`release` — cannot collide on a counter but two sessions can still choose the
same filename on the same day, so they get **uniqueness verification** instead:

```bash
node scripts/allocate-id.mjs qa-run --slug 2026-08-17-payroll-abc1234.md
```

---

## Sessions

Every substantial task registers a session before it plans anything.

```bash
node scripts/session.mjs start "<title>" \
  --type FEATURE --size LARGE \
  --branch agent/<feature> --base origin/develop \
  --task TASK-0004 --modules payroll,attendance \
  --paths services/api/prisma/schema.prisma
node scripts/rebuild-sessions.mjs
```

That writes the durable record under [`docs/sessions/`](../../docs/sessions/)
and registers the live entry. The record carries:

```
SESSION_ID   TASK_ID       TITLE        ARCHITECT_INTENT   STATUS
TASK_TYPE    TASK_SIZE     BASE_BRANCH  BASE_SHA           TASK_BRANCH
TARGET_BRANCH  WORKTREE    AFFECTED_MODULES   WRITE_LEASES
ACTIVE_WORK_PACKAGES   SCHEMA_WRITE   CI_STATUS   MERGE_STATUS
STARTED_AT   LAST_HEARTBEAT   BLOCKERS
```

`TARGET_BRANCH` defaults to `develop` and is **validated**: a session whose
`TASK_TYPE` is not `RELEASE`, `DEPLOY` or `HOTFIX` may not name `main`, and
`rebuild-sessions.mjs --check` fails if one does. See
[`branch-model.md`](branch-model.md).

Two live sessions on one branch is rejected by the same check — that is not a
concurrency model, it is two agents overwriting each other.

### Heartbeats

```bash
node scripts/session.mjs heartbeat SESSION-0003
```

A session that stops heartbeating is **reported, never reaped**. "Probably
dead" and "definitely finished" are different facts, and dropping the first one
releases leases a live-but-busy session still needs. The stale window is
deliberately generous: a session waiting on CI is still alive.

Ending a session releases every lease it held and removes it from the merge
queue:

```bash
node scripts/session.mjs finish SESSION-0003
```

A session that ends still holding the schema lease would block every future
database task until a human worked out why.

---

## Active-session awareness

**Before planning, and before changing any file, the Architect inspects what is
already in flight.**

```bash
node scripts/session.mjs list          # sessions, leases, DATABASE_WRITER, merge queue
node scripts/session.mjs check --session SESSION-0003 \
  --paths services/api/prisma/schema.prisma,apps/web/lib/runtime/index.ts
```

`check` classifies the proposed work against live state:

| Classification | Means | What the Architect does |
|---|---|---|
| `SAFE_PARALLEL` | Nothing in flight conflicts | Proceed |
| `SERIALIZE` | A lease is held on ground this needs | Take a different work package; retry later |
| `DEPENDENCY_WAIT` | This depends on another session's output | Sequence behind it, explicitly |
| `SHARED_FILE_CONFLICT` | Another session is editing the same file | **One work item, one owner** — merge the packages, do not race |
| `REBASE_REQUIRED` | The base is behind the integration target | Rebase before starting, not after |
| `BLOCKED_BY_ACTIVE_SESSION` | A globally exclusive resource is held | Do not plan around it. Run something else |

The distinction that matters is `SERIALIZE` versus `BLOCKED_BY_ACTIVE_SESSION`:
the first means "wait for the lease, then proceed"; the second means another
session owns this ground outright.

**A blocked resource never stops an independent work package.** The correct
response to a denied lease is to run a different package — never to wait, and
never to take the lease anyway.

---

## Write leases

Leases cover the shared resources where two concurrent editors produce a
conflict that is **silent** rather than loud: a merged `schema.prisma` that
compiles but describes a database nobody intended, a permission registry where
one side's keys vanished, a generated index that disagrees with its records.

Ordinary source files are deliberately **not** leased. Leasing everything would
serialise all work and teach agents to bypass the mechanism.

| Resource | Covers |
|---|---|
| `schema` | `services/api/prisma/schema.prisma`, `prisma/migrations/` |
| `permissions` | `permissions.ts`, `rbac-matrix.ts`, `common/security/`, `common/guards/` |
| `runtime-registries` | `apps/web/lib/runtime/`, `apps/admin/app/_lib/runtime/`, the generated runtime schema |
| `workspace` | `package.json`, `package-lock.json`, `turbo.json` |
| `ci` | `.github/workflows/` |
| `framework` | `.agent/`, `AGENTS.md`, `PLANS.md` |
| `record-indexes` | the generated backlog, task, QA and dashboard indexes |
| `deployment` | `render.yaml`, `docs/deployment/` |

```bash
node scripts/session.mjs lease acquire schema --session SESSION-0003 \
  --reason "add ProbationReview and its migration"
node scripts/session.mjs lease release schema --session SESSION-0003
```

**Reading is never leased.** Only writing is coordinated.

### The database is single-writer across all sessions

`schema` is `exclusiveGlobally`. Two migration directories created in parallel
apply in timestamp order on a fresh database and in creation order on a
developer's — which is how a migration history stops being reproducible, and
`database-migration` is a required CI job precisely because that must never
happen.

A denied `schema` lease is `BLOCKED_BY_ACTIVE_SESSION`, not `SERIALIZE`.
`node scripts/session.mjs list` prints `DATABASE_WRITER` on its own line.

---

## The develop merge queue

Two sessions pushing `develop` at the same moment either reject noisily — which
is recoverable — or fast-forward over a state the other had already validated
against, which is silent and means the validation was about different code.

```bash
node scripts/session.mjs queue add --session SESSION-0003 --branch agent/x --sha <sha>
node scripts/session.mjs queue next      # exits 1 while something else is integrating
node scripts/session.mjs queue claim --branch agent/x
node scripts/session.mjs queue validating --branch agent/x
node scripts/session.mjs queue done --branch agent/x --sha <merged>
```

`QUEUED → READY → INTEGRATING → VALIDATING → DONE`, plus `BLOCKED`.

`claim` **is** the integration lock: it fails while another branch is
`INTEGRATING` or `VALIDATING`. Only the Integrator claims it, and only the
Integrator writes a shared branch — specialists never do.

The flow the Integrator runs while holding it:

```
fetch develop → verify the target SHA → integrate → resolve conflicts
  → targeted validation → push develop → verify origin/develop
  → release the claim → next queued branch
```

---

## What each role does with this

**Architect** — registers the session, runs `check` before planning, records the
overlap classification in the plan, and re-runs `check` when scope expands.

**Specialists** — acquire the lease for any leased resource they will write,
release it when done, and never write a shared branch.

**Integrator** — owns the merge queue and the integration lock; the only role
that writes `develop` or `main`.

**Release/DevOps** — reports `DEVELOP_SYNC_STATUS`, `MAIN_CHANGE_STATUS`, stale
leases and the integration lock through `node scripts/repo-health.mjs`. It
detects; the Integrator acts.

---

## Anti-patterns

- Allocating an id by reading a directory. Use the allocator.
- Deleting a lock by hand because a command said the lock was held. That is how
  two writers end up inside the same critical section.
- Waiting on a denied lease instead of running an independent package.
- Reaping a stale session's leases to unblock yourself.
- Putting live coordination state in a tracked file.
- Two sessions "carefully coordinating" on one file instead of merging the work
  into one package with one owner.
