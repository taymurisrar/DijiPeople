---
ID: ITEM-0099
aliases: [ITEM-0099]
Title: sync-obsidian does not map docs/plans, so every ExecPlan wikilink is an orphan
Type: DOCUMENTATION
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [scripts]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-29
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0099 — sync-obsidian does not map docs/plans, so every ExecPlan wikilink is an orphan

## Summary

`npm run knowledge:verify` fails with `OBSIDIAN_SYNC_STATUS = FAILED` on a
wikilink that is correct. `TASK-0020` links a wikilink naming `EXECPLAN-0022-dlp-desktop-agent-capture`,
that ExecPlan exists at `docs/plans/EXECPLAN-0022-dlp-desktop-agent-capture.md`,
and `sync-obsidian.mjs` does not map `docs/plans/` into the vault — so the note
the link names is never written and the verifier reports it as unresolvable.
The record is right, the plan is right, and the mapping is the gap.

## Why It Matters

It is not the note that is broken; it is the verdict. `OBSIDIAN_SYNC_STATUS` is
a completion-contract field, so every task that runs `knowledge:verify` from now
on inherits a FAILED it did not cause and caps itself at
`COMPLETE_WITH_DOCUMENTATION_WARNING`. This task did exactly that.

A gate that fails for everyone, for a reason belonging to nobody, stops being
read. That is the same failure mode the register records under
`check-that-cries-wolf` (REG-250), arriving from the opposite direction: not a
check that fires when nothing drifted, but a check that fires on something no
task can fix from inside its own scope.

Cost of not doing it is small per task and paid every task, which is the shape
that never gets prioritised on its own — hence a record rather than a mention.

## Evidence

- `npm run knowledge:verify` at `a4503e3b`:
  ```
  OBSIDIAN_SYNC_STATUS = FAILED — 2 problem(s):
    x 00 - Home/Generated/Tasks/TASK-0020-…-triggered-screen.md
      — wikilink EXECPLAN-0022-dlp-desktop-agent-capture (double-bracketed) resolves to no note in the vault
  ```
  Every other counter is zero: 755 generated notes, 0 orphans, 0 stale, 0 parity
  diffs, 0 provenance gaps.
- `docs/plans/EXECPLAN-0022-dlp-desktop-agent-capture.md` — the target exists in
  the repository.
- `git show 42435d59:docs/tasks/TASK-0020-…md | grep -c EXECPLAN-0022` → `2`.
  The link predates the task that found this; it arrived on `develop` with
  `42435d59`, which is TASK-0020's own finalization commit.
- The same problem is reported twice for one link, which suggests the verifier
  counts a wikilink once per occurrence rather than once per unresolved target.
  Worth a look while fixing, but cosmetic beside the mapping.

## Proposed Approach

Two candidate directions, and the choice is a real one rather than a formality:

1. **Map `docs/plans/` into the vault** as a generated folder, the way tasks,
   bugs, QA and knowledge are mapped. ExecPlans are intent, which is exactly what
   Obsidian is for, and this makes the existing links resolve with no record
   edits. It also puts plan bodies in the vault, which is a scope decision
   somebody should make deliberately rather than as a side effect of fixing a
   link.
2. **Treat ExecPlan ids as non-note references**, as REG ids already are — the
   register is one file, not a note per regression, and a wikilinked REG id is a known
   `GRAPH_ORPHAN` for that reason. Under this reading a double-bracketed `EXECPLAN-nnnn` is the
   same mistake and the fix is in the record plus a verifier rule.

Option 2 is the smaller change and consistent with an existing precedent.
Option 1 is more useful if plans are meant to be readable in the vault at all.
No ExecPlan needed for either.

## Acceptance Criteria

- `npm run knowledge:verify` reports `OBSIDIAN_SYNC_STATUS = PASS` on a clean
  `develop` with no other task in flight.
- Whichever direction is taken is asserted, not just applied: either a plan note
  is written into the vault and the verifier resolves the link, or an
  `EXECPLAN-nnnn` wikilink is rejected at record-validation time so it cannot be
  written again.
- The duplicate reporting of one unresolved link is either fixed or explained.

## Dependencies

None. Nothing blocks this and it blocks nothing — it degrades a verdict rather
than a behaviour.

## Related Items

- [[BUG-1261]] — the task that surfaced this. Unrelated in substance; it is
  simply the first task to run `knowledge:verify` after `42435d59` landed.


## Resolution — 2026-08-29

One line in `scripts/lib/obsidian-mappings.mjs`:

```js
{ from: 'docs/plans', to: '06 - Implementation Plans/Generated/ExecPlans',
  nodeType: 'exec-plan' },
```

Seven ExecPlans published on the next sync, and `knowledge:verify` went from
`FAILED` to `PASS`.

**Undeferred because it stopped being cosmetic.** It was filed as LOW, and the
reasoning holds for a vault with two ExecPlans in it. What changed is that plans
are now what other records point at when they explain *why* something was built
a particular way — EXECPLAN-0024 from a session record, EXECPLAN-0025 from
ITEM-0034 — so the missing mapping was breaking the links of the artefacts that
cite it, not just hiding the plans. The graph was missing its most-referenced
node type.

Published as a **sibling** of `knowledge/implementations` rather than into the
same folder. An implementation note is written after the fact and describes what
exists; a plan is written before and describes what is intended. Merging them
would lose which of the two a reader is looking at.

### Two other unresolved links, fixed while the vault was open

Neither was this record's, and both were the same defect in miniature — a
wikilink written to a note nobody created.

- An engineering-history record cited
  `[[trust-the-runtime-invariant-over-a-static-scan]]` and said, two lines
  later, "No new durable note". The lesson was real and worth keeping, so the
  note now exists at `docs/knowledge/framework/`.
- `TASK-0024` was a `GRAPH_ORPHAN`. It declared `AFFECTED_MODULES: [apps/web]`,
  which is a path rather than a module the graph knows. Adding `employees` —
  the module it actually changes — gave it the relationship it already had,
  rather than a link invented to remove a dot.

## History

- 2026-08-25 — created at `a4503e3b`, found while verifying the Obsidian sync for
  BUG-1261. Triaged the same day: DEFER — the finding is real, is not this task's
  to fix inside another session's record, and costs a warning rather than
  behaviour.
- 2026-08-25 — the two wikilinks in `TASK-0020` were changed to relative markdown
  links in the same closure commit, because the check they broke is a *required*
  one and leaving it red would have failed `validate:framework` locally for every
  task after this one. That is the symptom, not this item: option 2 above was
  applied to one record, and the question option 1 asks — whether `docs/plans/`
  belongs in the vault at all — is what stays DEFERRED here. TASK-0020 is DONE,
  so no live work was edited, and nothing was changed silently: it is written
  down twice, here and in the closure commit message.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
