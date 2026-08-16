# Sessions

One record per Architect session — what it was doing, on which branch, cut from
which base, and what it owned while it ran.

The user may have two, three or more Architect chats open at once. Each is a
session, and this directory is how they stay out of each other's way after the
fact. The rules are in
[`.agent/context/multi-session.md`](../../.agent/context/multi-session.md).

```bash
node scripts/session.mjs start "<title>" --type FEATURE --size LARGE \
  --branch agent/<feature> --base origin/develop --task TASK-nnnn \
  --modules payroll,attendance --paths services/api/prisma/schema.prisma
node scripts/rebuild-sessions.mjs
```

`index.md`, `active.md` and `completed.md` are **generated**. Never edit them —
the same rule the backlog, bug and task indexes follow, for the same reason.

---

## Durable here, live in the Git directory

This directory holds the half of a session that is worth keeping: intent,
branch, base SHA, the modules it touched, the leases it declared. It is
Git-tracked, reviewable in a diff, and published to Obsidian.

The half that has to be true *right now* — heartbeats, which write leases are
held this minute, `DATABASE_WRITER`, the develop merge queue — is **not** here.
It lives under the repository's shared Git directory, because every worktree of
a repository shares one, so a lease taken in one worktree is visible in another
with no commit, no push and no fetch.

```bash
node scripts/session.mjs list      # the live view
```

Putting live state in a tracked file would make each session's ordinary
bookkeeping a merge conflict in every other session's branch — and it still
would not be visible until somebody pushed.

---

## The record

```
SESSION_ID   TASK_ID       TITLE        ARCHITECT_INTENT   STATUS
TASK_TYPE    TASK_SIZE     BASE_BRANCH  BASE_SHA           TASK_BRANCH
TARGET_BRANCH  WORKTREE    AFFECTED_MODULES   WRITE_LEASES
ACTIVE_WORK_PACKAGES   SCHEMA_WRITE   CI_STATUS   MERGE_STATUS
STARTED_AT   LAST_HEARTBEAT   BLOCKERS
```

Body sections: `Intent` · `Scope` · `Concurrency` · `History`.

Statuses: `ACTIVE` · `BLOCKED` · `INTEGRATING` · `COMPLETE` · `ABANDONED`.
`INTEGRATING` is separate from `ACTIVE` because it is the one state in which a
session may write a shared branch, and therefore the one another session must
not enter concurrently.

### Two things the loader refuses

**`TARGET_BRANCH: main` on an ordinary session.** `main` is the production
deployment branch, so merging into it may trigger a release. Only `RELEASE`,
`DEPLOY` and `HOTFIX` sessions may name it — see
[`.agent/context/branch-model.md`](../../.agent/context/branch-model.md).

**Two active sessions on one branch.** That is not a concurrency model; it is
two agents overwriting each other.

Both are enforced by `node scripts/rebuild-sessions.mjs --check`, which runs in
CI, rather than left to be remembered.

---

## Ending a session

```bash
node scripts/session.mjs finish SESSION-nnnn
```

This releases every lease the session held and drops it from the merge queue. A
session that ends still holding the `schema` lease blocks every later database
task, and nothing would tell the next agent why — which is why releasing is the
command's job rather than the caller's.

Then set `STATUS` in the record, add a `History` line, and rebuild.

`SESSION_STATUS` is a field of the
[completion contract](../../.agent/context/task-completion-contract.md).
