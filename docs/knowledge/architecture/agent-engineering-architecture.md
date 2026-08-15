# Agent Engineering Architecture

> Generated from repository evidence at `ad8f77f`.

How DijiPeople is actually built: ten agent roles, a completion contract, and a
set of durable record systems that make lessons survive the session that
produced them.

## Roles

Architect · Backend/API · Frontend · UI/UX · Database · Integration · QA ·
Reviewer · Integrator · Release/DevOps. Defined in `.agent/agents/`.

Four separations carry the framework, and collapsing any removes the check it
provides:

1. **Architect plans; specialists implement.**
2. **QA ≠ Reviewer.** QA asks *does it behave correctly across scenarios?*
   Reviewer asks *is it architecturally, securely and technically correct?*
   Both can block.
3. **Reviewer does not edit.** A reviewer that fixes what it finds is not
   independent.
4. **QA establishes what is true; the Architect decides what happens about it.**
   QA owns evidence and severity; the Architect owns priority and disposition. A
   QA role that also prioritised would have an incentive to downgrade its own
   findings.

## The nine knowledge systems

Each answers exactly one question:

| System | Answers |
|---|---|
| Git | What changed? |
| CI | Did this commit pass validation? |
| `docs/qa/runs/` | What behaviour was actually tested? |
| `docs/bugs/` | What is wrong, and what state is that in? |
| `docs/backlog/` | What is outstanding, and what did we decide? |
| `docs/engineering-history/` | How did a task run, start to finish? |
| `.agent/context/` | How does DijiPeople currently work? |
| `docs/knowledge/` | What did the work teach us? |
| Obsidian | Why does it work this way, and what happened before? |

**Obsidian carries intent and history; the code is implementation truth.** Never
change code because a note disagrees — classify the discrepancy
(`EXPECTED_CHANGE`, `STALE_NOTE`, `UNIMPLEMENTED_REQUIREMENT`,
`UNCLEAR_CONFLICT`) and report it.

## The completion contract

A task is complete only when every field resolves — never `ASSUMED_PASS`, never
omitted:

```
IMPLEMENTATION_STATUS           REVIEW_STATUS                 ENGINEERING_HISTORY_STATUS
LOCAL_VALIDATION_STATUS         REMOTE_CI_STATUS              FEEDBACK_PROMOTION_STATUS
QA_STATUS                       MERGE_STATUS                  KNOWLEDGE_CAPTURE_STATUS
QA_FINDINGS_CLASSIFIED_STATUS   POST_MERGE_VALIDATION_STATUS  OBSIDIAN_SYNC_STATUS
BUG_RECORD_STATUS                                             CLEANUP_STATUS
ARCHITECT_TRIAGE_STATUS
BACKLOG_UPDATE_STATUS
```

This exists because completion was once defined as
`IMPLEMENTATION + REVIEW + QA`, and a finished tenant control-plane
implementation — new API module, migration, ten replaced components — was
reported as complete while sitting **uncommitted in a working tree**. The
capability was never missing; the definition of done ended before finalization
began.

## The bug learning loop

```
QA finds a material issue → BUG record with evidence → backlog (generated)
  → Architect triages → fix / plan / defer / product decision / block
  → regression proven to fail without the fix → QA verifies → VERIFIED
  → regression register → bug pattern if generalisable
  → knowledge capture → Obsidian sync
  → a future agent retrieves the lesson before writing the same defect
```

**No material QA finding may exist only in a chat report**, and no substantial
task may complete while a finding it produced is unclassified.

Specialists open every implementation with `KNOWN_MISTAKES_TO_AVOID`, drawn from
bug records, patterns, regressions and backlog for the modules in scope. The
Reviewer tags a reintroduced defect `REPEATED_REGRESSION` **at raised severity**,
because a repeat means the prevention failed — a worse problem than the defect.

## Retrieval, not bulk loading

`node scripts/retrieve-knowledge.mjs <terms>` searches repository knowledge and
the vault, ranked by relevance, excluding templates, READMEs, empty bootstrap
notes and generated copies of Git-tracked sources. **Never read the whole
vault** — bulk loading buries the two notes that mattered under fifty that did
not.

## Generation, not maintenance

`rebuild-backlog.mjs` regenerates every backlog index; `generate-dashboards.mjs`
regenerates both Obsidian dashboards; `sync-obsidian.mjs` is the **only** writer
into the vault and only ever into agent-owned folders. Hand-maintained indexes
go stale within two tasks and are then believed.

## Related

[[qa-and-ci-architecture]] · [[system-architecture]]

Source: `.agent/agents/`, `.agent/context/task-completion-contract.md`,
`.agent/context/knowledge-architecture.md`,
`docs/development/agent-orchestration.md`, `docs/bugs/README.md`,
`docs/backlog/README.md`, `docs/engineering-history/README.md`.
