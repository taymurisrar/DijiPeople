---
ID: ITEM-0029
aliases: [ITEM-0029]
Title: Validation should require an aliases line on every record
Type: TECH_DEBT
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [scripts, docs/backlog, docs/bugs]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation: docs/knowledge/implementations/2026-08-16-monorepo-app-documentation.md
TargetMilestone:
BlockedBy:
---

# ITEM-0029 — Validation should require an aliases line on every record

## Summary

Records are filed as `BUG-nnnn-<long-slug>.md`, but every note and record refers
to them by the bare id in wikilink form rather than the full slug. Obsidian only
resolves that short form through the `aliases:` frontmatter line. **Six of 65
records were missing it**, so every short-form link to them was dead in the
vault.

## Why It Matters

The whole point of syncing records into Obsidian is that a human can follow the
graph — from a module note to the bug that bit it, from a bug to the item that
generalises it. A record with no alias is reachable only by knowing its full
64-character slug, which nobody does.

It fails silently and asymmetrically: the record itself looks perfectly healthy,
the *other* notes are the ones that appear broken. And nothing in the repository
notices, because `rebuild-backlog.mjs` validates the fields it parses and
`aliases` is not one of them.

The six were `ITEM-0020` … `ITEM-0024` and `BUG-0029` — a contiguous run, so
this was one task's batch rather than random drift. That is the shape a
mechanical check catches cheaply and review does not.

## Evidence

Found while verifying that the notes written by TASK-0002 resolve inside the
vault: 112 wikilinks checked across the seven new application notes, 13
unresolved, every one of them a bare-id link rather than a full-slug link. Six
targets had no alias; the rest resolved.

`node scripts/new-bug.mjs` and `node scripts/new-backlog-item.mjs` **do** emit
the line, so newly scripted records are fine. The gap is in records that were
hand-edited or created before that behaviour existed, and nothing detects it
afterwards.

## Proposed Approach

Add the check to `scripts/lib/backlog-records.mjs` where the frontmatter is
already parsed, so it surfaces through `rebuild-backlog.mjs --check` and
therefore through the `validate` CI job:

- every record has an `aliases:` line;
- it contains the record's own `ID`.

Unlike the absence-claim check in [[ITEM-0011]], this needs no prose
interpretation — it is a field equality test on data already being read, so the
"keep it narrow" warning that constrains that item does not apply here.

## Acceptance Criteria

- A record whose `aliases` line is missing, empty, or does not contain its own
  `ID` fails `node scripts/rebuild-backlog.mjs --check`.
- No false positive across the existing record set.

## Dependencies

None. The six known instances were fixed in the same change that raised this.

## Related Items

[[ITEM-0011]] — the sibling guard for false absence claims ·
bug pattern [[doc-code-drift]] · [[monorepo-application-map]].

## History

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-16 — raised during the Obsidian verification step of TASK-0002, after
  link resolution was checked **in the vault** rather than assumed from a
  successful sync exit code. The six instances were fixed in the same change;
  this item is the guard that stops them recurring.
- 2026-08-16 — Architect triage: `FIX_NOW`. Small, mechanical, and it protects
  the navigability that is the entire reason records are published.

## Resolution

Fixed at the source rather than in the records.

The three records still missing `aliases:` were a symptom: **neither generator
emitted the line**. `new-bug.mjs` and `new-backlog-item.mjs` both now do, so
the next record cannot be born without it — the six records this item counted got
theirs added by hand, which is why the problem kept coming back.

The three affected records were backfilled, and `validate-framework.mjs` gained
a check that every `BUG-*` / `ITEM-*` record carries an `aliases:` line
listing its own id.

The check tests the id is actually *in* the list, not merely that a line exists.
An `aliases:` line naming the wrong id is worse than a missing one, because it
looks deliberate to a reader and still leaves every short-form link dead.

Why this was invisible: the existing wikilink validation deliberately **skips**
`[[BUG-0031]]`-style targets, because they resolve through frontmatter rather
than a filename. That skip is what hid it — and a dead wikilink in Obsidian
renders as ordinary text rather than announcing itself.

## Verification

`npm run validate:framework` — 716 checks passing (was 714).

Verified to fail: removing the `aliases:` line from ITEM-0031 fails
*Every bug and backlog record is reachable by its bare id in Obsidian*, naming
the file.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[BUG-0059]]
- Implementation — [[2026-08-16-monorepo-app-documentation]]
- QA run — [[2026-08-16-monorepo-app-documentation-78072d2]]

<!-- GRAPH:END -->
