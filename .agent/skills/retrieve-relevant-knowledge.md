# Skill — Retrieve Relevant Knowledge

Find what this repository has already learned about the change in front of you,
without reading everything it has ever recorded.

Mechanical by design: the ranking, deduplication and authority order live in
`scripts/retrieve-knowledge.mjs`, so every agent gets the same answer for the
same terms.

---

## Trigger

- **Architect** — `RELEVANT_KNOWLEDGE_RETRIEVAL`, before planning anything
  non-trivial
- **QA** — before designing scenarios
- **Reviewer** — when checking whether a change repeats a known mistake

## Steps

### 1. Name the scope

Before searching, decide what the task actually touches:

- primary module
- related modules
- affected architecture domains
- likely regression categories
- relevant client or product context

Vague terms return vague results. `tenant erasure` is a query; `improve things`
is not.

### 2. Retrieve

```bash
node scripts/retrieve-knowledge.mjs <term> [term…]
node scripts/retrieve-knowledge.mjs --json <term>     # for programmatic use
```

Searches, in authority order — where later **never** overrides earlier:

1. `AGENTS.md` and nested `AGENTS.md` *(read directly; always in scope)*
2. `.agent/context/*`
3. **the current source code** *(read directly — this is implementation truth)*
4. `docs/qa/regressions/index.md`
5. `docs/qa/known-bug-patterns/`
6. `docs/knowledge/*`
7. relevant Obsidian notes, when the vault is configured and readable

The script ranks by relevance, applies a threshold so passing mentions are
dropped, and excludes vault copies of repository knowledge — those are the same
facts at lower authority, and returning both makes the vault look more
informative than it is.

### 3. Read what it returns — and the code

The script points at documents. **It does not replace reading the source.** A
context file describes the repository; the repository decides.

### 4. Record the outcome

```
OBSIDIAN_CONTEXT = AVAILABLE | AVAILABLE_NO_MANUAL_NOTES | UNAVAILABLE
```

And answer, in the plan or QA run:

> **"Have we already learned something about this type of change?"**

"Nothing found" is a legitimate answer *after looking*. Say it explicitly — it
tells the next reader the question was asked.

---

## Rules

- **Never bulk-load the vault.** It buries the two notes that mattered.
- **Obsidian is intent and history; code is implementation truth.** When they
  disagree, classify it — `EXPECTED_CHANGE`, `STALE_NOTE`,
  `UNIMPLEMENTED_REQUIREMENT`, `UNCLEAR_CONFLICT` — and never change code just
  because a note differs.
- **Never edit manual vault notes** during ordinary engineering work. Generated
  folders are agent-owned; everything else is the user's.
- **An unavailable vault never blocks anything.** Record it and continue.

## Known limitation

`.obsidian-sync.local.json` is gitignored and therefore **per-checkout**. A
fresh worktree has no vault configuration, so retrieval there reports
`OBSIDIAN_CONTEXT = UNAVAILABLE` even when the vault exists. Copy the config
into the worktree if vault retrieval matters for that task.

## Expected output

A short list of genuinely relevant documents, the `OBSIDIAN_CONTEXT` value, and
an explicit answer to the "have we learned this before?" question — not a
transcript of everything the search returned.
