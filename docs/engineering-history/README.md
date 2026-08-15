# Engineering History

One durable record per substantial task: what was planned, who built it, which
branch and worktree it lived on, which conflicts arose and how they were
resolved, which CI run judged it, which commit merged it, and what validated the
result.

```
docs/engineering-history/
├── README.md
└── tasks/YYYY-MM-DD-<task-slug>-<final-sha>.md
```

Scaffold one with:

```bash
node scripts/new-engineering-history.mjs <task-slug>
```

The script derives everything Git already knows — date, branch, base, SHAs,
commits, worktree, changed files. The Integrator adds what Git cannot know:
**why** a conflict was resolved the way it was.

---

## Why this exists

Git answers *what changed*. It does not answer *why this branch existed, what it
was trying to do, which conflicts were judgement calls, and what proved the
merged result was sound.* Those answers lived in chat transcripts, which is to
say they did not survive the session.

The specific failure: a completed tenant control-plane implementation — a new
API module, a migration, ten replaced components — was reported as finished
while entirely uncommitted. Reconstructing what had actually happened required
reading a working tree. There was no record to read.

**Nobody should need chat history to reconstruct a task.**

---

## Ownership

Each section has exactly one owner. That is what stops the record becoming a
narrative nobody is accountable for.

| Owner | Fields |
|---|---|
| **Integrator** | Base Branch · Task Branch · Base SHA · Commits · Worktrees · Files Changed · Conflicts · Conflict Resolutions · CI Run ID · CI Result · Merge Commit · Target Branch · Final Target SHA · Cleanup |
| **QA** | QA Report · Bug IDs · Post-Merge Validation evidence |
| **Architect** | Task Title · Task Type · Architect Plan · Agents Used · Backlog Items |
| **Knowledge Capture** | Knowledge Capture · Obsidian Sync |
| **Release / DevOps** | Release/Deployment Impact |

Release/DevOps documents the **deployed state** in
[`docs/deployment/release-history/`](../deployment/release-history/). The
Integrator documents the **Git history** here. They are different questions —
"what landed on the branch" and "what is running in an environment" — and
conflating them is how a record ends up claiming a SHA is live because it was
merged.

---

## Required fields

Every record carries all of these. Write `NOT_APPLICABLE — <reason>` or
`HISTORY_NOT_AVAILABLE` rather than deleting one: an omitted field reads as
"nothing to say", and `HISTORY_NOT_AVAILABLE` reads as "we looked and could not
establish it". Only the second is honest about a reconstruction.

```
Task Title · Task Type · Date · Architect Plan · Agents Used ·
Base Branch · Task Branch · Base SHA · Commits · Worktrees · Files Changed ·
Conflicts · Conflict Resolutions ·
QA Report · Bug IDs · Backlog Items ·
CI Run ID · CI Result · Merge Commit · Target Branch · Final Target SHA ·
Post-Merge Validation · Release/Deployment Impact ·
Knowledge Capture · Obsidian Sync · Cleanup
```

### Conflicts and Conflict Resolutions

The two fields the script cannot fill, and the reason the document exists in
prose rather than as generated JSON.

Every conflict is classified with the nine-type taxonomy in
[`.agent/agents/integrator.md`](../../.agent/agents/integrator.md) — MECHANICAL,
ADDITIVE SEMANTIC, CONTRACT, BUSINESS LOGIC, DATABASE, SECURITY, GENERATED FILE,
DELETE/MODIFY, RENAME/MOVE — and the record states, for each: which files, which
type, what each side intended, what was chosen, and **what would have been lost
by choosing the other side**.

A resolution recorded as "resolved conflict in `x.ts`" is not a record. The
question a future reader has is why one behaviour survived and the other did not.

> Type 8 is not hypothetical here: a merge once resurrected
> `.agent/agents/implementer.md` after it had been deliberately deleted as
> superseded. `validate-framework.mjs` now fails if it returns.

---

## When a record is required

Required for any task that **modified Git-tracked files** and ran the full
lifecycle — the same trigger that makes the Integrator mandatory. Not for a
question answered in conversation, and not for a read-only investigation.

`ENGINEERING_HISTORY_STATUS` is a field of the task completion contract; a task
that needed a record and has none cannot report `COMPLETE`.

---

## Relationship to other records

| Question | Record |
|---|---|
| What changed, line by line? | Git |
| Did this commit pass validation? | CI |
| What behaviour was tested? | [`docs/qa/runs/`](../qa/runs/) |
| What is outstanding? | [`docs/backlog/`](../backlog/) |
| What did the work teach us? | [`docs/knowledge/`](../knowledge/) |
| **How did this task actually run, start to finish?** | **here** |
| What is deployed where? | [`docs/deployment/release-history/`](../deployment/release-history/) |

This record **links** the others. It does not restate them: a Bug ID, a QA run
path and a CI run id are enough, and copying their contents here creates a
second version that will disagree with the first.
