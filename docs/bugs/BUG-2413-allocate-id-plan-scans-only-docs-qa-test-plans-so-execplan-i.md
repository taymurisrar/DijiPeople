---
ID: BUG-2413
aliases: [BUG-2413]
Title: allocate-id plan scans only docs qa test-plans so ExecPlan ids collide
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: b1c0c481
AffectedModules: [scripts]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2413 — allocate-id plan scans only docs qa test-plans so ExecPlan ids collide

## Summary

Two different record families share the `PLAN-` number space, and the id
allocator sees only one of them.

- **QA test plans** live in `docs/qa/test-plans/`, named `PLAN-001…PLAN-023`.
- **ExecPlans** live in `docs/plans/`, filed as `EXECPLAN-00nn-*.md` and carrying
  `ID: PLAN-nnn` / `aliases: [PLAN-nnn, EXECPLAN-00nn]` in frontmatter.

`ID_KINDS.plan` in `scripts/lib/id-allocator.mjs` points at
`docs/qa/test-plans` only. So allocating a `plan` id hands back a number that an
ExecPlan may already hold, and an ExecPlan author has no allocator kind at all —
which leaves counting files as the only way to pick the `EXECPLAN-00nn` half of
the name.

The allocator exists precisely to stop this. `AGENTS.md`: *"Never allocate a
durable id by counting files… A directory scan cannot see an id a sibling
session already took, which is how this repository twice had to renumber
colliding records."* It has now happened a third time, and this time the
allocator itself issued the collision.

## Expected Behavior

`node scripts/allocate-id.mjs plan` returns a number no existing plan record of
either family holds, and there is a way to allocate an ExecPlan id that is not
"count the files in `docs/plans`".

## Actual Behavior

Two observations, both on 2026-08-30 at `b1c0c481`:

1. **The allocator issued an id already in use.** `allocate-id.mjs plan` returned
   **`PLAN-027`**, which `docs/plans/EXECPLAN-0027-attendance-single-source-of-truth.md`
   already carries as `ID: PLAN-027`.
2. **`EXECPLAN-0028` exists twice.** `docs/plans/` contains both
   `EXECPLAN-0028-bug-0084-missing-unique-constraints.md` (committed `dca93c47`)
   and `EXECPLAN-0028-plan-entitlement-enforcement.md` (committed `84a7e0b5`),
   written by two sessions on 2026-08-29.

## Reproduction

```bash
grep -h '^ID: PLAN-' docs/plans/*.md | sort -u     # PLAN-024 … PLAN-027
node scripts/allocate-id.mjs plan --session SESSION-nnnn --note "probe"
# → PLAN-027, which the grep above already showed in use
```

## Evidence

**The kind definition** — `scripts/lib/id-allocator.mjs:70`:

```
plan: { prefix: 'PLAN', dir: 'docs/qa/test-plans', width: 3 },
```

`docs/plans` appears in no entry of `ID_KINDS` or `PATH_KINDS`, so ExecPlans are
outside the allocator entirely.

**The ledger shows the two halves diverging.** `allocate-id.mjs plan --list`:

```
PLAN-026   plan   SESSION-0076   2026-08-29T16:39:53Z
           — BUG-0084 missing unique constraints: expand/pre-check/contract plan
```

SESSION-0076 *did* allocate an id — `PLAN-026` — for the BUG-0084 ExecPlan. The
file it wrote is named `EXECPLAN-0028-…`. So the allocated id and the filename
number are chosen by different mechanisms, and only the first is coordinated.

**Consequence in the vault.** Neither colliding file carries frontmatter, so
a double-bracket link to `EXECPLAN-0028` resolves to nothing and both notes were
graph orphans —
`sync-obsidian.mjs --verify` reports `OBSIDIAN_SYNC_STATUS = FAILED` on them.
Had they carried `aliases: [EXECPLAN-0028]`, the same link would instead have
been ambiguous between two notes.

**Reservations taken during this investigation:** `PLAN-027` and `PLAN-028`
(SESSION-0081). They were taken to renumber the collision and then abandoned once
the root cause was understood — using them would have made things worse.
`--prune` deliberately does not release a reservation with no record ("a gap in a
sequence is cheaper than a collision"), so they stand as gaps.

## Root Cause

One prefix, two directories, one allocator. `PLAN-` was reused for ExecPlans
without extending `ID_KINDS`, and the `EXECPLAN-00nn` filename component has no
allocation path at all.

## Impact

Durable ids are the thing every other record points at. A collision means
a link to `PLAN-027` or `EXECPLAN-0028` is ambiguous or dead, and renumbering after
the fact requires touching every record that references the old id.

No runtime or customer impact — this is entirely within the agent framework's
record system. It is MEDIUM rather than LOW because it is silent: the allocator
returns a plausible number and nothing fails until somebody follows a link.

## Affected Areas

- `scripts/lib/id-allocator.mjs` — `ID_KINDS.plan`.
- `scripts/allocate-id.mjs` — the `plan` kind and its `--list` ledger.
- `docs/plans/` — two files currently sharing `EXECPLAN-0028`.
- `docs/qa/test-plans/` — the family the allocator does see.

## Proposed Resolution

A direction, not a patch:

1. **Separate the number spaces.** Give ExecPlans their own kind and prefix —
   `execplan: { prefix: 'EXECPLAN', dir: 'docs/plans', width: 4 }` — and stop
   ExecPlans carrying `ID: PLAN-nnn`. Cleanest, and it makes the filename
   component allocated rather than counted.
2. **Or make `plan` scan both directories** and keep one shared sequence.
   Smaller change, but leaves two record families indistinguishable by id, which
   is what made this hard to see.

Option 1 needs a decision on whether existing ExecPlan `ID: PLAN-nnn` values are
rewritten or grandfathered, and rewriting them touches the bug records that cite
them. Worth an ADR rather than a quiet fix.

Renumbering the two colliding files is a **separate, smaller** piece of work and
belongs to the sessions that own them.

## Acceptance Criteria

- `allocate-id.mjs` cannot return an id already held by any plan record in either
  directory.
- An ExecPlan author can allocate the number in its filename rather than counting
  files.
- `docs/plans/` contains no two files sharing a number.

## Regression Coverage

None yet. The durable check is a test that allocates against a fixture holding
records in both directories and asserts the result collides with neither —
`scripts/lib/id-allocator.mjs` is already unit-testable, and this is exactly the
invariant the allocator exists to provide.

## Dependencies

None.

## Related Items

[[BUG-0084]] and [[BUG-1952]] — the two bugs whose ExecPlans collided.
Pattern: [[divergent-duplicate-guard]] — one rule (id allocation) implemented in
two places that drifted.

## Resolution

Not fixed.

## QA Retest

Not retested.

## History

- 2026-08-30 — found while reconciling two graph orphans reported by
  `sync-obsidian.mjs --verify`. The orphans were the symptom; this is the cause.
- 2026-08-30 — triaged **PLAN_REQUIRED**. Both resolution options change how
  durable ids are issued, and option 1 additionally decides whether existing
  `ID: PLAN-nnn` values on ExecPlans are rewritten — which touches every bug
  record citing them. That is an ADR-shaped decision, not a one-line fix to the
  kind table.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
