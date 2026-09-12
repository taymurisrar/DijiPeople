# Parallel streams collide on every id that has no allocator

**2026-09-12 · SESSION-0103 · framework**

Eight work packages ran as concurrent streams, each in its own worktree. Every
id type that lacks an allocator collided, every time, and the collisions were
invisible until integration because a branch cannot see what its siblings wrote.

This is not a mistake any individual stream made. It is what "the next free
number" means when four branches ask at once.

## What collided

| Id type | Collisions | Allocator |
|---|---|---|
| `REG-nnn` | Four streams each filed a `REG-413` | none |
| `ADR-nnnn` | Three streams each wrote an `ADR-0009` | none |
| `EXECPLAN-nnnn` | Four streams each wrote an `EXECPLAN-0037` | none |
| `BUG-nnnn`, `ITEM-nnnn` | none | `scripts/allocate-id.mjs` |

The pattern is exact: the record types with an allocator never collided, and
every type without one collided in proportion to how many streams needed it.

`docs/decisions/README.md` already carried a note about an `ADR-0006` collision
on 2026-09-11 and advised reading the index before choosing a number. That advice
does not work for concurrent streams — none of them had merged, so the index
looked identical and free to all three.

## Why renumbering afterwards is expensive

Renaming the file is the cheap half. The expensive half is that **a bare id in a
record body is not self-describing**. Forty-seven references across twenty-one
files cited `ADR-0009` or `EXECPLAN-0037`, and nothing in the citation says which
of the three decisions it meant. Each had to be resolved by working out which
stream owned the citing record.

An automated rename cannot do this safely. The renamer written for this task
deliberately refused to guess: it rewrote each renamed file's own self-references
and then *reported* every remaining mention for a human decision, rather than
picking one. That refusal is the correct behaviour and worth keeping.

## The regression register cannot be merged textually

Worse than collisions, and it destroyed content before it was caught.

`docs/qa/regressions/index.md` is one file with a heading per regression. Git's
conflict region ends at the last differing line, which does not respect an
entry's boundaries, so a resolver that stitches the two sides together can:

- drop an entry's body entirely, leaving a bare heading;
- transplant the trailing `Active` row of the entry *above* the insertion point
  onto the entry below it.

Both happened. The first was caught only by counting fields per entry after the
merge — the file still looked plausible, and both `rebuild-qa --check` and a
duplicate-id scan passed. The merge was aborted and redone.

**Treat the register as an append-only list of self-contained blocks.** Take our
copy verbatim, read the incoming branch's copy separately with `git show`, and
append only the blocks we do not already hold. Never resolve its conflict
markers.

One refinement that is not obvious: decide "already held" by **id as well as
body**. A branch cut before a later correction carries a stale copy of an entry
that already exists — same id, different text — and matching on body alone reads
that as new and renumbers a regression that is already present, producing two
ids for one defect. When the id is already ours, ours is the newer text by
construction, because ours is the side that has absorbed every merge so far.

## What to do instead

- **Reserve ranges up front.** Before starting parallel streams, hand each one a
  disjoint block of `REG`, `ADR` and `EXECPLAN` numbers. This is what actually
  worked here once it was adopted mid-task: later streams were told to start at
  REG-470, REG-480 and REG-490 and collided with nothing.
- **Better, give these ids an allocator.** `scripts/allocate-id.mjs` already
  scans every branch and reserves before the record exists. The three types that
  collided are exactly the three it does not cover. That is the durable fix and
  it is not written yet.
- **Verify structure after every merge of a generated or list-shaped record
  file**, not just that the validators pass. Count entries and count fields per
  entry. A validator that checks references and statuses will not notice that one
  entry lost its body.

## Related

[[SESSION-0103]] · [[TASK-0030]] · [[ADR-0009]] · [[ADR-0010]] · [[ADR-0011]]
