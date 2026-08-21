---
ID: ITEM-0074
aliases: [ITEM-0074]
Title: allocate-id and session tooling accept a session id that does not exist
Type: INFRA
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [framework]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
LastReviewed: 2026-08-21
NextAction: Make allocate-id resolve --session against the session records and refuse an unknown id, then decide whether a branch with no registered session should warn
AcceptanceCriteria: allocate-id.mjs exits non-zero for a --session that names no record, and the reservation ledger never carries an unknown session id
RelatedBug:
RelatedQA:
RelatedADR:
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

## History

- 2026-08-21 — found while closing SESSION-0029, which had to be registered
  retroactively because the work had run without it.
