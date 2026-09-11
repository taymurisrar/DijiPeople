---
ID: ITEM-0074
aliases: [ITEM-0074]
Title: allocate-id and session tooling accept a session id that does not exist
Type: INFRA
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [framework]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-21
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
LastReviewed: 2026-09-11
NextAction:
AcceptanceCriteria: allocate-id.mjs exits non-zero for a --session that names no record, and the reservation ledger never carries an unknown session id
RelatedBug:
RelatedQA:
RelatedADR: ADR-0008
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0074 — allocate-id and session tooling accept a session id that does not exist

## Summary

`scripts/allocate-id.mjs` takes `--session SESSION-nnnn` and records it in the
reservation ledger without checking that the session exists. During SESSION-0029
it was passed `SESSION-0029` while no such record had been created, and it
allocated `REG-173` under that id without complaint.

More broadly: a task can branch and work with no registered session at all.
`session.mjs check --paths` only helps when somebody runs it, and nothing else
notices.

## Why It Matters

The session record is what makes concurrent work safe here — it is how leases,
the single-writer database rule and `session.mjs check --paths` know what is in
flight. An unregistered session is invisible to all three, so the protections
are not bypassed so much as never engaged.

The concrete case: a worktree was reused after its session had been closed, a
new branch was cut inside it, and work proceeded for an hour against
`package-lock.json` — a high-contention shared file — with nothing recording
that anyone held it. No collision happened. Nothing would have reported one.

It also corrupts attribution after the fact. The reservation ledger now carries
`REG-173` against a session that did not exist when the id was taken, so the
provenance trail points at a record written later.

## Evidence

- `scripts/lib/id-allocator.mjs` — `allocateId(root, kind, { sessionId })`
  stores `sessionId` in the ledger entry and never resolves it against
  `docs/sessions/`.
- `scripts/session.mjs finish SESSION-0029` returned `unknown session:
  SESSION-0029` **after** `allocate-id.mjs regression --session SESSION-0029`
  had already succeeded — the two disagree about whether that session exists.
- No check anywhere asserts that the current branch has a session record.

## Proposed Approach

Two changes, and the first is small:

1. `allocate-id.mjs` resolves `--session` against the session records and exits
   non-zero when it names nothing. The allocator already loads the repository to
   scan refs, so this costs a lookup.
2. Decide, deliberately, whether operating on an `agent/*` branch with no
   session record should warn or block. Blocking is tempting and probably wrong
   — a quick fix on a branch is legitimate — but a warning at the point of the
   first durable write would have caught this within seconds.

An ExecPlan is not needed for (1). (2) is a policy question worth a short
decision record, because it changes what every task must do first.

## Acceptance Criteria

- `node scripts/allocate-id.mjs bug --session SESSION-9999` exits non-zero and
  allocates nothing.
- A valid session id still allocates exactly as before.
- The reservation ledger cannot come to contain a session id that no record
  matches.

## Dependencies

None.

## Related Items

- [[SESSION-0029]] — the session this was found in, registered after the fact.
- `.agent/context/multi-session.md` — the rules this silently failed to enforce.

## Resolution

Both changes landed in `scripts/lib/id-allocator.mjs`.

1. `allocateId(root, kind, { sessionId })` now calls `sessionRecordExists(root,
   sessionId)` before reserving anything. That function scans for a
   `docs/sessions/<sessionId>-*.md` file the same way ordinary ids are checked
   for collisions — the current working tree, plus every local and remote ref
   via `namesInRefs` — so a session record committed on another branch is still
   found, and one that has never existed anywhere is refused. A refusal throws
   before `withLock`/the reservation write runs, so the ledger is never touched.
   `scripts/allocate-id.mjs`'s existing top-level `catch` turns that into exit
   code 1 with the message on stderr, unchanged.

   This lives in the shared `allocateId()` rather than only in the CLI, so
   `new-bug.mjs`, `new-backlog-item.mjs` and `new-task.mjs` — which also pass
   `--session` through to the same allocator (`backlog-records.mjs`,
   `task-records.mjs`) — are covered too, not only direct `allocate-id.mjs`
   invocations.

2. The policy question — whether an `agent/*` branch with no registered
   session should warn or block — is decided in
   [`ADR-0008`](../../decisions/ADR-0008-unregistered-agent-branch-warns-not-blocks.md):
   **warn, never block.** `currentBranchHasNoSession(root)` checks the current
   branch against `TASK_BRANCH` in the working tree's own `docs/sessions/`
   records; when the branch is `agent/*` and unmatched, `allocateId()` prints a
   `console.warn` naming the ADR and this item, and the allocation proceeds
   exactly as before. This fires for every kind except `session` itself (a
   brand-new session legitimately allocates its own id before its record
   exists), and only when the caller passed no `--session` at all.

Tests: `scripts/validate-framework.mjs`, "v2 behavioural simulations", gained
simulations 1b–1d in the existing sandbox — a `--session SESSION-9999` refusal
that leaves the reservation ledger unchanged, and a `--session SESSION-9001`
backed by a real durable record still allocating. See `npm run
validate:framework` results in the closing task report.

## History

- 2026-08-21 — found while closing SESSION-0029, which had to be registered
  retroactively because the work had run without it.

- 2026-09-11 — resolved. `allocateId()` refuses an unresolvable `--session`
  before reserving anything, and warns (never blocks) when an `agent/*` branch
  carries no session record at all, per ADR-0008.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
