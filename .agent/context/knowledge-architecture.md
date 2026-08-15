# Knowledge Architecture

> **Last verified:** 2026-08-15
> **Verified against commit:** ad8f77f
> **Key source files:** scripts/retrieve-knowledge.mjs, scripts/sync-obsidian.mjs, scripts/rebuild-backlog.mjs, scripts/generate-dashboards.mjs, .obsidian-sync.example.json, docs/knowledge/README.md, docs/qa/README.md, docs/bugs/README.md, docs/backlog/README.md, docs/engineering-history/README.md, .agent/context/README.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

Nine knowledge systems, each answering **one** question. Using the wrong one is
how agents end up trusting a stale note over the source, or re-deriving
something that was already written down.

## CURRENT

| System | Answers | Authority over |
|---|---|---|
| **Git** | *What changed?* | Diffs, commits, branches, history, authorship, merge ancestry, exact changed files |
| **CI** | *Did this commit pass automated validation?* | Build, typecheck, tests, framework validation, deterministic gates |
| **QA runs** | *What behaviour was actually tested?* | Scenarios, environment, commands, manual checks, regression evidence, failures, limitations |
| **`docs/bugs/*`** | *What is wrong, and what state is that in?* | Defects: evidence, severity, status, disposition, resolution |
| **`docs/backlog/*`** | *What is outstanding, and what did we decide about it?* | Priorities, dispositions, blocked work, open product decisions. Indexes are **generated** |
| **`docs/engineering-history/*`** | *How did a task actually run, start to finish?* | Branches, worktrees, conflicts and their resolutions, merge SHA, CI run |
| **`.agent/context/*`** | *How does DijiPeople currently work?* | Agent-facing technical architecture — the primary context |
| **`docs/knowledge/*`** | *What did we learn, in a Git-tracked form?* | Durable module rules, decisions, implementation history. Agent-owned |
| **Obsidian vault** | *Why does it work this way, and what happened before?* | Requirements, product intent, meetings, client feedback, long-term project memory |

### The three record systems, and why they are three

They overlap enough to look redundant and are not:

| | Answers |
|---|---|
| `docs/qa/runs/` | *What was tested, in what environment, with what result* — history, never edited |
| `docs/bugs/` | *What is wrong and what is happening about it* — evergreen, updated in place |
| `docs/qa/regressions/index.md` | *What broke once and which test stops it returning* — evergreen |
| `docs/qa/known-bug-patterns/` | *Which defect **classes** we produce, and how to prevent them* — evergreen |

One defect touches all four: the run that found it, the record that tracks it,
the regression that guards it, and — where the failure mode generalises — the
pattern that stops the next one. Each carries something the others do not.

### Never substitute one for another

- **Git is not replaced by notes.** A note saying "we changed X" is not evidence;
  `git log` is. Never use Obsidian as source control.
- **CI is not replaced by a local run.** See
  [`task-completion-contract.md`](task-completion-contract.md).
- **QA is not replaced by a chat message.** Validation that exists only in a
  conversation is gone when the session ends.
- **`.agent/context` is not a dumping ground.** See
  [Context promotion](#context-promotion) below.

---

## Code is implementation truth

Obsidian holds **business intent and historical reasoning**. It does not hold
authority over what the code does.

When an Obsidian requirement disagrees with the current implementation, the
Architect classifies the discrepancy — it is never resolved silently:

| Classification | Meaning | Action |
|---|---|---|
| `EXPECTED_CHANGE` | The note describes what this task is meant to change | Proceed; the note is the target state |
| `STALE_NOTE` | The code moved on and the note was not updated | Follow the code. Recommend a note update; do not edit manual notes as a side effect |
| `UNIMPLEMENTED_REQUIREMENT` | The note describes something genuinely not built | Report it. Do **not** build it unless it is in scope |
| `UNCLEAR_CONFLICT` | Cannot tell which is right | **Stop and ask.** Do not guess at product intent |

**Never change code merely because a note says something different.** The note
may predate a deliberate decision, describe a rejected option, or record what a
client asked for before it was scoped.

---

## Selective retrieval, not bulk loading

Reading the whole vault into every task is expensive, drowns the signal, and
makes agents confidently cite notes irrelevant to the change in front of them.

The Architect runs `RELEVANT_KNOWLEDGE_RETRIEVAL` before planning anything
non-trivial — see [`../agents/architect.md`](../agents/architect.md).

### Priority order

Later sources never override earlier ones:

1. `AGENTS.md` and nested `AGENTS.md`
2. `.agent/context/*`
3. **the current source code**
4. `docs/qa/regressions/index.md`
5. `docs/qa/known-bug-patterns/`
6. `docs/knowledge/*`
7. relevant Obsidian notes, where available

### Obsidian retrieval categories

Retrieve by module, feature, business term, client, bug class or architecture
topic — never by "read everything":

| Folder | Retrieve when |
|---|---|
| `01 - Product` | Product framing or area ownership is in question |
| `02 - Architecture` | A cross-cutting design constraint applies |
| `03 - Modules` | The task touches that module |
| `04 - Requirements` | Business rules or intent are in question |
| `05 - Decisions` | A design constraint may already be decided |
| `07 - Bugs` | The area has failed before |
| `00 - Home/Generated/Backlog` | Something is already known to be outstanding here |
| `09 - Meetings` | A scope or priority decision is unclear |
| `10 - Client Feedback` | The change is user-facing |
| `11 - Agent Knowledge` | QA runs, regressions, bug patterns, engineering history |

`node scripts/retrieve-knowledge.mjs <terms…>` does this mechanically across
both the repository and the vault.

### What retrieval deliberately excludes

Retrieval is judged on precision, not recall. It filters out:

- **folder READMEs and templates** — vault scaffolding matches almost any generic
  term, and returning it made an empty vault look populated;
- **bootstrap and empty notes** — a note with a title and no content is noise
  with a filename;
- **generated vault copies of Git-tracked sources** — the repository copy is
  searched already, at higher authority. Returning both double-counts one fact
  and makes the vault look more informative than it is.

The exclusions are derived from the sync mappings rather than guessed, so adding
a mapping cannot silently reintroduce duplicates.

### When the vault is unavailable

Set `OBSIDIAN_CONTEXT = UNAVAILABLE`, continue on repository knowledge, and say
so in the report. **This never blocks development.** The repository is
self-sufficient by design; Obsidian is an enrichment layer.

---

## Read/write separation

**Agents write** durable generated knowledge to `docs/knowledge/*` and
`docs/qa/*`, in Git, where a bad generation is visible in a diff and revertible.
`node scripts/sync-obsidian.mjs` then publishes it into the vault's `Generated/`
folders.

**Agents read** manual notes selectively, and **never edit them during ordinary
engineering work**. If a manual note is wrong, recommend the change; do not
make it.

```
Generated folders  → agent-owned  → written by sync, safe to overwrite
Manual folders     → user-owned   → read-only to agents
```

Agents never write directly into the vault. The only writer is
`sync-obsidian.mjs`, and it only ever touches `Generated/` paths.

### Manual vs Generated, explicitly

**User-owned. Agents read these and never write them:**

`00 - Home/Inbox/` · `09 - Meetings/` · `10 - Client Feedback/` ·
`99 - Templates/` · every hand-authored note in `01 - Product`,
`02 - Architecture`, `03 - Modules`, `04 - Requirements`, `05 - Decisions`,
`06 - Implementation Plans`, `07 - Bugs`, `08 - Releases` **outside** their
`Generated/` subfolder.

**Agent-owned. Rewritten on every sync; never hand-edit:**

every `*/Generated/` subfolder, plus the QA subtree under
`11 - Agent Knowledge/QA/**`.

If a manual note is wrong, **recommend the change; do not make it.** A user's
note may predate a deliberate decision, describe a rejected option, or record
what a client asked for before it was scoped — none of which an agent can tell
from the note alone.

To annotate a generated note, write a sibling **outside** `Generated/` and link
to it. A generated note that relates to a manual one links to it rather than
absorbing its content: merging the two destroys the distinction between what
someone decided and what a script derived.

### Bugs and backlog in the developer context

**Do not copy bug records into `.agent/context/`.** Specialists retrieve the
relevant ones dynamically — that is what `KNOWN_MISTAKES_TO_AVOID` is for, and
what keeps the block short enough to be read.

A bug is promoted into `.agent/context/` only when it has stopped being a bug
and become a **stable architectural rule agents repeatedly need** — the same
four conditions as any other context promotion, below. "Tenant filtering is not
authorization" belongs in context. "`findForUser` forgot the tenant comparison
on the support branch" belongs in `docs/bugs/`, where it already is.

A context layer that absorbs every defect stops being the fast path it exists to
be, and the bugs it absorbs go stale in the one place agents trust most.

---

## Context promotion

Not every durable fact belongs in `.agent/context/`. Promote only when **all**
hold:

- it describes **current technical architecture**
- agents **repeatedly** need it
- it is **implementation-facing**
- it **changes how specialists must work**

Everything else — meetings, client feedback, historical narrative, broad
requirements — stays in Obsidian or `docs/knowledge/`. A context layer that
absorbs everything stops being the fast path it exists to be.

---

## Knowledge noise

Knowledge Capture **rejects**:

- temporary debugging steps
- one-off console output
- facts trivially findable in source ("`EmployeesService` has a `findByTenant`
  method")
- large diffs pasted into notes — that is what Git is for
- redundant test logs
- speculative assumptions not verified against the repository

Capture a fact only if a future agent would make a **worse decision** without
it. An empty capture is a valid, and frequently correct, outcome.
