---
ID: BUG-0059
aliases: [BUG-0059]
Title: Vault wikilinks to task records and four module notes resolve to nothing
Status: OPEN
Severity: LOW
Priority: P3
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 7b2a51d
AffectedModules: [scripts, docs/tasks, docs/knowledge]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0029
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0059 — Vault wikilinks to task records and four module notes resolve to nothing

## Summary

`npm run knowledge:verify` exits 1 with twelve unresolved wikilinks, in two
distinct classes. Seven are `TASK-0005`, which cannot resolve because task
records carry no `aliases:` frontmatter line. Five point at module knowledge
notes that were never written. Repository/vault **content parity is clean** —
zero files differ — so this is the only thing keeping the verifier red.

## Expected Behavior

`npm run knowledge:verify` exits 0: every generated note is identical to its
repository source, and every wikilink emitted into the vault resolves to a note
in it.

## Actual Behavior

Parity passes and link resolution fails.

```
vault copy differs : 0   (was 40 before this task's sync)
unresolved wikilink: 12
```

| Target | Count | Why it cannot resolve |
|---|---|---|
| `TASK-0005` | 7 | `docs/tasks/TASK-0005-*.md` has no `aliases:` line |
| `workspace-routing-and-domains` | 2 | no such note under `docs/knowledge/modules/` |
| `notifications` | 1 | no such note under `docs/knowledge/modules/` |
| `settings-and-branding` | 1 | the document exists, but under `docs/architecture/`, which is not a synced mapping |
| `tenant-isolation` | 1 | no such note under `docs/knowledge/modules/` |

## Reproduction

1. `npm run knowledge:sync`
2. `npm run knowledge:verify`
3. Exit code is 1; `grep -c "vault copy differs"` is 0 and `grep -c wikilink`
   is 12.

## Evidence

`docs/tasks/TASK-0005-dijipeople-global-technical-remediation.md:1-12` — the
frontmatter runs `TASK_ID`, `TITLE`, `TYPE`, `SIZE`, `STATUS`, … with no
`aliases:`. Compare `docs/bugs/BUG-0050-*.md:2-3`, which carries
`aliases: [BUG-0050]` and resolves.

`scripts/lib/obsidian-mappings.mjs:50` maps `docs/tasks` →
`00 - Home/Generated/Tasks`, so the note *is* published; only the short-form
link fails.

`docs/knowledge/modules/` contains 19 notes; `notifications.md`,
`tenant-isolation.md` and `workspace-routing-and-domains.md` are not among them.

Two of these — `notifications` and `tenant-isolation` — have been
reported as non-blocking warnings by `scripts/validate-framework.mjs` on every
run for some time, including at `3f9063f` before this task began.

## Root Cause

`ITEM-0029` established that Obsidian resolves a bare-id wikilink only through
the `aliases:` frontmatter line, and fixed the six records then missing it. Its
`AffectedModules` is `[scripts, docs/backlog, docs/bugs]` and its status is
`DONE`. **Task records were never in its scope**, so `docs/tasks` kept emitting
a record type that no short-form link can reach. The generator was not extended
either, so every task record created since inherits the gap.

The four missing module notes are a separate, ordinary content gap: records
link to knowledge that was never captured.

## Impact

Documentation only; no product code, no runtime behaviour, no tenant data. The
practical cost is that `knowledge:verify` cannot be used as a green/red gate
while it is red for a known reason — the exact condition that let the vault
drift 40 files behind unnoticed before this task.

## Affected Areas

`docs/tasks/*`, `scripts/new-task.mjs` and `scripts/rebuild-tasks.mjs`
(whichever owns task frontmatter), `docs/knowledge/modules/`,
`scripts/sync-obsidian.mjs --verify`.

## Proposed Resolution

Two independent pieces, and the first is small:

1. Add `aliases: [TASK-nnnn]` to task record frontmatter and to whatever
   generates it, then extend the `ITEM-0029` validation to every record type
   rather than the two it was written for. Backfill the five existing records.
2. Decide, per missing note, whether to write the module knowledge note or to
   stop emitting the wikilink. `settings-and-branding` is the interesting one:
   the content exists under `docs/architecture/` and the question is whether
   that folder should be a synced mapping at all — that is a decision, not a
   defect, and may warrant an ADR.

No ExecPlan needed for (1). (2) is a product-of-documentation decision.

## Acceptance Criteria

- `npm run knowledge:verify` exits 0.
- A newly generated task record carries an `aliases:` line without hand editing.
- Validation fails if any record type is created without one.

## Regression Coverage

None yet. The natural home is an extension of the `ITEM-0029` alias check to all
record types, proven by generating a task record in a fixture and asserting the
alias is present.

## Dependencies

Supersedes nothing. Extends the scope that [[ITEM-0029]] closed.

## Related Items

[[ITEM-0029]]

## Resolution

Not yet fixed. Filed during the documentation-and-process drift finalization at
`7b2a51d`, which fixed vault **parity** (40 differing files → 0) but did not
take on link resolution: seven of the twelve failures are the unclosed half of
an already-triaged item, and the other five require deciding what to write.

## QA Retest

Pending.

## History

- 2026-08-17 — created from qa run at `7b2a51d`.
