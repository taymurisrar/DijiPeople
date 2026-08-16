---
ID: ITEM-0038
aliases: [ITEM-0038]
Title: Record ids collide between concurrent branches
Type: TECH_DEBT
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [scripts, docs/bugs, docs/backlog]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-16
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation: docs/knowledge/implementations/2026-08-17-web-app-documentation.md
TargetMilestone:
BlockedBy:
---

# ITEM-0038 — Record ids collide between concurrent branches

## Summary

`new-bug.mjs` and `new-backlog-item.mjs` allocate the next id by reading the
highest one that exists **in the working tree**. That makes collisions impossible
between sequential agents and does nothing whatsoever about concurrent branches.
**It has now happened twice in two consecutive tasks, on the same day.**

## Why It Matters

`docs/bugs/README.md` states the current guarantee explicitly: "Never
hand-allocate an id — the script reads the highest existing one, **so two agents
cannot collide**." That sentence is false for the way this repository actually
works, which is several agent branches open at once.

The cost is not theoretical. Each occurrence required renaming every affected
record file, rewriting its frontmatter `ID` and `Title`, and updating every
cross-reference across knowledge notes, QA runs, engineering history, task
records, context documents and other records — while **excluding** the records
the other branch legitimately owns.

That last part is the danger. The obvious fix — a find-and-replace across
`docs/` — silently repoints records the branch never touched. In TASK-0002 it
would have corrupted the `hidden-write-on-read` bug pattern, which describes a
defect that task had nothing to do with. Both times the exclusion had to be done
by explicit file list. A third occurrence handled less carefully corrupts the
record system quietly — and a wikilink pointing at the wrong record renders as
ordinary text in Obsidian rather than announcing itself.

## Evidence

**TASK-0002** (2026-08-16): PRs #18 and #20 merged during CI, taking `BUG-0030`
and `ITEM-0025`. Renumbered `BUG-0030..0036 → BUG-0031..0037` and
`ITEM-0025..0027 → ITEM-0026..0028`.

**TASK-0003** (2026-08-17): `main` advanced during CI, taking `BUG-0038` and
`ITEM-0033`. Renumbered `BUG-0038..0045 → BUG-0039..0046` and
`ITEM-0033..0036 → ITEM-0034..0037`.

Both are recorded in their engineering history under Conflict Resolutions.

## Proposed Approach

No ExecPlan needed, but the option chosen is a real decision — record it:

- **Allocate against `origin/main`, not the working tree.** One-line-ish change:
  fetch and read the highest id on the remote default branch before allocating.
  Narrows the window to the time between allocation and push rather than closing
  it, but removes the common case at almost no cost.
- **Reserve a block per branch.** Robust, and heavier than this repository needs.
- **Drop sequential ids for a sortable unique id.** Closes it completely and
  costs the human readability that makes `[[BUG-0031]]` useful — which is the
  whole reason [[ITEM-0029]] exists. Not recommended.
- **Detect rather than prevent:** fail `rebuild-backlog --check` when two records
  share an `ID`, so a collision is caught at merge instead of by a human noticing.
  Cheap, and complements any of the above.

The last one should land regardless of which prevention is chosen — the current
`--check` validates structure and indexes but does **not** assert id uniqueness,
which is why both collisions were found by reading a directory listing rather
than by a tool.

Whatever is chosen, correct the false guarantee in `docs/bugs/README.md`.

## Acceptance Criteria

- Two branches created from the same base cannot produce the same record id, or
  the duplicate fails validation before it can merge.
- `rebuild-backlog --check` fails when two records share an `ID`.
- `docs/bugs/README.md` no longer claims two agents cannot collide.

## Dependencies

None.

## Related Items

[[ITEM-0029]] — the sibling record-integrity guard, and the reason bare-id links
must keep working · bug pattern [[divergent-duplicate-guard]] ·
[[agent-engineering-architecture]].

## History

- 2026-08-17 — raised after the second occurrence in two consecutive tasks.
  TASK-0002 treated the first as bad luck; two in two days is a mechanism.
- 2026-08-17 — Architect triage: `FIX_NOW`. The detection half is small and
  unambiguous; the prevention half is a choice between four options, none large.
- 2026-08-16 — **DONE**, resolved by [[TASK-0004]].

  The option chosen is **none of the four listed**, because all four were framed
  against `origin/main` and the real requirement is wider: several sessions run
  concurrently *on one machine*, in sibling worktrees, and the window that
  matters is between deciding on an id and writing the record — not between
  writing and pushing.

  `scripts/lib/id-allocator.mjs` closes both:

  - **Scans every ref**, not the remote default branch — `git log --all --reflog
    --name-only` in one subprocess, so an id used on any branch, including one
    later reverted, is spent. That is strictly stronger than "allocate against
    `origin/main`" and no slower in practice (~1s).
  - **Reserves before the record exists**, under a `mkdir` lock in the
    repository's shared Git directory. Every worktree shares that directory, so
    a reservation taken in one is visible in another immediately — the mechanism
    "reserve a block per branch" was reaching for, without the bookkeeping.
  - Sequential human-readable ids are **kept**, so `[[BUG-0031]]` still works and
    [[ITEM-0029]] is unaffected.

  Acceptance criteria, each verified:

  1. *Two branches from the same base cannot produce the same id* — simulation
     `4b` in `validate-framework.mjs` commits `BUG-0900` on a sibling branch,
     checks out the first, and asserts the ceiling still sees it. It fails
     against a working-tree scan.
  2. *`rebuild-backlog --check` fails on a duplicate `ID`* — already true via
     `loadRecords`, and now covered by the concurrency simulations.
  3. *`docs/bugs/README.md` no longer claims two agents cannot collide* — the
     false guarantee is replaced, with the reason it was false.

  `node scripts/allocate-id.mjs` exposes the allocator directly for every
  numbered kind: bug, item, task, session, adr, plan, scenario and regression.
</content>
