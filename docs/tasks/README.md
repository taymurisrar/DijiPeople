# Parent Tasks

Durable state for `LARGE` and `PROGRAM` tasks: the decomposition into work
packages, the dependency graph between them, and the reason anything is blocked.

Rules and vocabulary:
[`.agent/context/task-orchestration.md`](../../.agent/context/task-orchestration.md).
Routing:
[`.agent/context/task-router.md`](../../.agent/context/task-router.md).

---

## Why these records exist

A large task outlives the session that started it. Chat scrollback does not
survive a context reset, a crash or a handover — so an orchestrator resuming
work has to re-derive which packages finished, which are blocked, and what was
already decided. It usually re-derives some of it wrongly.

These records are what a new session reads instead. They hold **state**, not
narrative: the narrative belongs in
[`docs/engineering-history/`](../engineering-history/), the evidence in
[`docs/qa/runs/`](../qa/runs/), and the defects in [`docs/bugs/`](../bugs/).

The one question this system answers, that no other system does:

> **What is left, what can start now, and what is waiting on whom?**

---

## Creating one

```bash
node scripts/new-task.mjs "Attendance geofencing" --type FEATURE --size LARGE
```

Then decompose it. Work-package boundaries follow **ownership and dependency**:

```
schema · backend · frontend · security · integration
migration · QA · browser E2E · deployment
```

Never `files 1-10`. A good package can be reviewed on its own and has a single
owning specialist; if describing its boundary requires listing files, it is not
a boundary.

## Rebuilding the indexes

```bash
node scripts/rebuild-tasks.mjs           # rewrite index.md, active.md, blocked.md, completed.md
node scripts/rebuild-tasks.mjs --check   # fail on invalid records or a stale index
```

`index.md`, `active.md`, `blocked.md` and `completed.md` are **generated**.
Editing them by hand is pointless — the next rebuild discards it — and
misleading in the meantime. `--check` runs in `validate-framework.mjs`, so a
stale index fails CI rather than quietly telling people nothing is outstanding.

---

## Work package statuses

```
NOT_STARTED → READY → IN_PROGRESS → QA → CI → MERGING → DONE
                                                      ↘ BLOCKED
```

`READY` and `NOT_STARTED` are deliberately separate. `READY` means every
dependency is `DONE` and the package can start **now** — which is what makes
automatic continuation a lookup rather than a judgement call.

## Automatic continuation

When a package reaches `DONE`, the Architect recomputes what is `READY` and
starts the next one. It does not ask permission to continue.

A task stops only when **every** remaining package is blocked by
`OWNER_DECISION_REQUIRED`, `BLOCKED_EXTERNAL`, `UNRECOVERABLE_TOOL_FAILURE` or
`SAFETY_BLOCK` — and it then reports every block at once, so the user answers
everything in a single pass.

**One blocked package never stops an independent one.**

---

## Validation

`scripts/rebuild-tasks.mjs --check` rejects, among others:

- a `LARGE` or `PROGRAM` record with no work-package decomposition — an
  undecomposed large task cannot be continued automatically, so it is not a
  valid record
- a dependency on a work package that does not exist, which would block forever
  and look like normal waiting
- `COMPLETED_PACKAGES` listing a package whose status is not `DONE`, or
  `STATUS: COMPLETE` while packages are unfinished — the record and the
  orchestrator disagreeing about what is left is the failure mode that makes the
  record worse than useless
- an id that disagrees with its filename
- a duplicate `TASK_ID`
