---
ID: ADR-0008
aliases: [ADR-0008]
Title: An agent/* branch with no registered session warns, it does not block
Status: ACCEPTED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
---
# ADR-0008 — An `agent/*` branch with no registered session warns, it does not block

## Status

Accepted — 2026-09-11, during the ITEM-0074 remediation.

## Context

`ITEM-0074` recorded that `scripts/allocate-id.mjs` accepted `--session
SESSION-0029` and stamped it into the reservation ledger while no record named
`SESSION-0029` existed yet — the session was registered retroactively, after
`REG-173` had already been allocated under its id. That half is a bug and is
fixed unconditionally: `allocateId()` now resolves `--session` against the
durable records under `docs/sessions/` (working tree and every ref, the same
way ordinary ids are checked for collisions) and refuses to reserve anything
against an id that names no record. See `scripts/lib/id-allocator.mjs`,
`sessionRecordExists()`.

The second half of ITEM-0074 is not a bug fix, it is a policy choice: what
should happen when a task branches as `agent/*` and does **no** work through
the session tooling at all — no `session.mjs start`, no `--session` flag,
nothing? Nothing currently notices. The concrete case: a worktree was reused
after its session closed, a new branch was cut inside it, and an hour of work
proceeded against `package-lock.json` — a high-contention shared file — with
no session record, no lease, and nothing for `session.mjs check --paths` to
find, because nobody ran it.

## Decision

**Warn, never block.** `allocateId()` now checks, on every allocation that
does not itself carry a `--session`: if the current branch matches `agent/*`
and no record under `docs/sessions/` (in the current worktree) names that
branch as its `TASK_BRANCH`, print a `console.warn` naming this ADR and
`ITEM-0074`, and continue exactly as before. The allocation still succeeds; no
exit code changes.

Blocking was the more protective-looking option and was rejected. A quick,
genuinely single-file fix on an `agent/*` branch is legitimate work that this
framework should not obstruct, and the multi-session model already treats
`session.mjs check --paths` as advisory rather than mandatory before *reading*
the repository — only leases make a *write* unsafe. Turning the id allocator
into a hard gate would make `allocateId()`, a small utility called from six
call sites (`allocate-id.mjs`, `new-question.mjs`, `backlog-records.mjs`,
`qa-records.mjs`, `session-records.mjs`, `task-records.mjs`), the single point
that decides whether an entire class of legitimate small tasks can proceed at
all — a much larger blast radius than the defect being fixed.

The id allocator is chosen as the warning's home because it is normally the
**first durable write** a task makes — the moment a bug, item or task record
is about to be created. A warning there is the earliest point in the sequence
of events that actually occurred (branch → an hour of unrecorded work →
close-out) that could have surfaced the gap, and it surfaces it in seconds
rather than at session close.

## Consequences

- `scripts/lib/id-allocator.mjs` gains `currentBranchHasNoSession(root)`. It
  scans only the current worktree's `docs/sessions/` — the branch's own
  session record, if one was started, was written into this same worktree —
  so it adds no ref-walking cost to the common case.
- The warning is silent for anything not on an `agent/*` branch (`main`,
  `develop`, and every sandbox `validate-framework.mjs` exercises under
  `main`/`sibling`), so no existing automation gains new console noise.
- This does not make `session.mjs check --paths` mandatory, and does not add a
  lease requirement to id allocation. It only makes the *absence* of a session
  visible at the moment a durable record is about to be created under that
  branch.
- If this proves insufficient — an agent that never calls `allocateId()`
  directly, e.g. by handwriting a record file — this decision should be
  revisited; that gap is explicitly out of scope here because nothing currently
  detects it at all, warning or otherwise.

## Related

- [`ITEM-0074`](../backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md)
  — the record this decision resolves.
- `scripts/lib/id-allocator.mjs` — `sessionRecordExists()`,
  `currentBranchHasNoSession()`.
- `.agent/context/multi-session.md` — the rules this silently failed to
  enforce.
