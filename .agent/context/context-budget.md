# Context budget — what to load, what not to, and why

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** scripts/lib/work-package-records.mjs, scripts/check-work-packages.mjs, scripts/lib/task-records.mjs, scripts/retrieve-knowledge.mjs
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

A long task does not fail because an agent knew too little. It fails because the
agent spent its budget reading everything that looked relevant, then ran out of
room while doing the work — and the next session, having inherited no state,
started the same reading again.

So context is **declared**, and the declaration is part of the work package.

---

## State lives in Markdown, not in the conversation

```
docs/tasks/TASK-nnnn-<slug>.md                     ← the index: table, dependencies, status
docs/tasks/TASK-nnnn-<slug>/work-packages/
  WP-01-<slug>.md                                  ← the state: manifest, assumptions, evidence
  WP-02-<slug>.md
```

The parent record's Work Packages table is an index. It carries id, title,
status and dependencies, and nothing else — a Markdown table cannot hold a
context manifest, an assumption register and an evidence list without becoming
unreadable.

The package file carries the rest. Together they are enough that a session which
is killed mid-program loses nothing but its scrollback.

`node scripts/check-work-packages.mjs` refuses to let the two drift: a package
file whose `STATUS` disagrees with its table row is a failure, because a
resuming session reads the table for *what is left* and the file for *how to do
it*.

**PROGRAM tasks must carry package files.** Records created before 2026-08-21
may opt out with `WORK_PACKAGE_FILES: NOT_REQUIRED — <reason>`; records created
after may not. The clause is dated rather than discretionary because an
open-ended opt-out is an escape hatch with extra steps.

---

## The context manifest

Every substantial package declares three lists and a SHA:

```
REQUIRED:
- `scripts/lib/task-records.mjs` — the table parser
- `.agent/context/task-orchestration.md` — sizing rules

OPTIONAL:
- `docs/tasks/TASK-0007` — the largest existing decomposition, for shape

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — nothing here depends on any of them
- the Prisma schema and `services/api/src/modules/` — no product code in scope

LAST_VERIFIED_SHA: 4226e53
```

`DO_NOT_LOAD` is not decoration. It is the half that saves the budget, and
`check-work-packages.mjs` **fails a package that declares none** — an empty
exclusion list means the agent will fall back to reading whatever looks
relevant, which is the behaviour this exists to stop.

Naming what to skip also settles the argument in advance. "Should I read the bug
backlog first?" is a question that costs tokens every time it is re-asked; a
manifest answers it once, in writing, with a reason.

---

## What an agent loads

```
parent record summary        always
the current work package     always
REQUIRED context             always
OPTIONAL context             only when the work actually reaches it
```

And explicitly **not**:

- the whole repository;
- every bug record, or every backlog item;
- the entire Obsidian vault;
- all historical QA runs;
- the previous conversation.

Before opening anything, know why it is required. An agent that cannot say what
question a file will answer is browsing, not working.

Retrieval is selective: `node scripts/retrieve-knowledge.mjs <module> <feature>`
returns the records that bear on the modules in scope. Never bulk-load the
vault.

---

## Budget by size

| Size | What is loaded |
|---|---|
| `SMALL` | Normal selective context. No task record needed. |
| `MEDIUM` | Task record plus the domain context the change touches. |
| `LARGE` / `PROGRAM` | Parent record, dependency graph, the current package file, and that package's manifest — nothing else by default. |

---

## Summaries go stale; source does not

A package file records `LAST_VERIFIED_SHA`. When a file it summarised has
changed since:

```
invalidate the summary  →  re-read the source  →  update the package file
```

**Repository truth always wins over a stale summary.** A package that carries a
confident three-line description of a service that was rewritten last week is
worse than one that carries nothing, because the description will be believed.

This is the same rule the context layer already states about itself: these
documents describe the repository, they are never authority over it.

---

## Narration is not state

Ordinary execution does not belong in chat. It belongs in the package file,
where the next session can find it.

Chat should carry:

- a question for the user;
- a genuine blocker;
- an important failure;
- the final report.

Everything else — what was tried, what passed, what was decided — is persisted.
A progress narrative that exists only in scrollback is state the framework is
about to lose, and re-deriving it is exactly the cost this document exists to
remove.

---

## Continuation is computed, never decided

`check-work-packages.mjs` recomputes `NEXT_READY_WORK_PACKAGE` from the
dependency graph — every dependency `DONE`, and the package not `DONE`,
`BLOCKED` or `WAITING_USER` — and fails when the declared value disagrees.

That is deliberate. An Architect that *decides* what to do next can decide to
stop; a queue that is empty or non-empty cannot. Context pressure, session
length and token cost are not blockers: persist the state, and the next session
resumes from it.
