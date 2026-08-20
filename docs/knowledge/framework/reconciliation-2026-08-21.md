---
TITLE: Agent operating system — reconciliation against the TASK-0012 brief
TASK: TASK-0012
WP: WP-01
CREATED_AT: 2026-08-21
VERIFIED_AGAINST_COMMIT: 4226e53
---

# Framework reconciliation — 2026-08-21

The TASK-0012 brief describes a target state in sixty-five sections. A large
part of it is already built. This document records which part, so the program
extends what exists instead of growing a second copy of it — the specific
outcome the brief forbids, and the one this repository has already paid for
once with two competing record systems.

Every verdict below was re-derived at `4226e53`, not recalled.

## Baseline

| Measure | Value at `4226e53` |
|---|---|
| Framework checks | 2,945, all passing |
| Numbered behavioural simulations | 39 |
| Agent role files | 11 under `.agent/agents/` |
| Context documents | 24 under `.agent/context/` |
| Record libraries | 10 under `scripts/lib/` |
| Durable id kinds with an allocator | 9, including `regression` |
| Obsidian vault | configured and reachable; sync recurses into subdirectories |

## Verdicts

`PRESENT` means the mechanism exists and is enforced. `PARTIAL` means it exists
but does not cover what the brief asks. `ABSENT` means nothing provides it.

### Already present — extend, do not rebuild

| Brief section | Provided by |
|---|---|
| §2 Architect is the only user-facing agent | `.agent/agents/architect.md`, `agent-handoffs.md` |
| §14 Atomic id allocation, including `REG` | `scripts/lib/id-allocator.mjs` — `ID_KINDS.regression` scans `docs/qa/regressions/index.md` via `contentOf` |
| §20 SOURCE_ORPHAN vs GRAPH_ORPHAN | `scripts/sync-obsidian.mjs` — both counters emitted and distinguished; simulation 34 covers it |
| §21 STANDALONE_ALLOWED | `sync-obsidian.mjs:228` — per-note opt-out already exists |
| §42 KNOWLEDGE_IMPACT / OBSIDIAN_IMPACT on handoffs | 14 and 13 files respectively |
| §47 Multi-session, leases, single-writer database | `scripts/session.mjs`, `.agent/context/multi-session.md` |
| §48 Primary vs task worktree health | `scripts/repo-health.mjs`, simulation 38 |
| §49 Post-integration generator audit | `POST_INTEGRATION_GENERATOR_STATUS` in the completion contract |
| §51 Simulations as a concept | 39 already exist, several executing rather than grepping |
| §56 `main` untouched on ordinary tasks | `branch-model.md`, enforced on the session record |

The most important entry is §14. The brief asks for an allocator for numbered
shared resources "including REG"; one already exists and covers every kind. The
work is proving it under concurrency, not building it.

### Partial — the mechanism exists but not the coverage

| Brief section | What exists | What is missing |
|---|---|---|
| §12 QA evidence | QA scenarios and runs are durable records | No L0–L7 hierarchy; nothing stops a PASS resting on a static source-shape test |
| §17 Obsidian node contract | Notes are generated and diffed against source | No `source_id` / `source_path` / `source_commit` / `last_verified` provenance; parity is content equality, not identity |
| §19 Semantic wikilinks | Links are counted for orphan detection | Resolution is not checked, and no relationship grammar exists |
| §22 Bidirectional verification | `--verify` reports repo→vault absence and content drift | Vault→repo, path mismatch, status mismatch, duplicates and staleness are not separately reported |
| §23 Large-task persistence | Parent record with a work-package table | A table row cannot hold a manifest, assumption register or evidence list |
| §38 Failure adaptation | `FAILURE_CLASS` appears in one file | No taxonomy, no ADAPTATION_ACTION, no evidence requirement before a systemic rule change |
| §45 Semantic record validation | Structural validation is thorough | Contradiction between terminal status and prose is not detected |

### Absent — genuinely new

Confirmed by a token search across `AGENTS.md`, `.agent/**` and `scripts/**`
returning zero files:

`ARCHITECT_DIRECT_IMPLEMENTATION_REASON` · `ARCHITECTURE_IMPACT` ·
`IMPROVEMENT_BUDGET` · `ADAPTATION_ACTION` · `EXTERNAL_RESEARCH_MODE` ·
`EVIDENCE_CHAIN_STATUS` · `SECURITY_EVIDENCE_LEVEL` · `REQUIRED_EVIDENCE_LEVEL` ·
`TEST_ARTIFACT_POLICY` · `UNACCOUNTED_TEST_RESOURCES` · `NEXT_BEST_ACTIONS` ·
`AGENT_HEALTH` · `CONTEXT_MANIFEST` · `SEMANTIC_CONFLICT_CHECK` ·
`UI_PATTERN_CATALOG` · `LIVE_CAPABILITY_STATUS`

Plus the two permanent roles — Product & Backlog Steward and Knowledge & Graph —
and the question/escalation protocol with its `WAITING_USER` states.

## Decisions this reconciliation forced

**The parent task record stays canonical.** Work-package files are added as a
sibling directory rather than a replacement tree, because `recordFilesIn` is
non-recursive and the existing record is already parsed, validated and indexed.
The table remains the index; the files carry the state; `check-work-packages.mjs`
refuses to let them drift.

**Programs that predate the convention are grandfathered by date, not by
opt-out.** Backfilling package files for TASK-0004, TASK-0005 and TASK-0007
would mean inventing context manifests and evidence lists nobody produced, and
fabricated state reads as proof. The exemption requires a reason and is honoured
only for records created before 2026-08-21, so it covers exactly the three
programs that exist today and nothing written afterwards.

**`WAITING_USER` is not a kind of `BLOCKED`.** TASK-0004 sits `BLOCKED` on an
owner decision with eleven packages behind it — the shape the brief is trying to
eliminate. Separating the two lets one unanswered question stall one package
while every independent package continues.

**`NEXT_READY_WORK_PACKAGE` is recomputed, never trusted.** Continuation follows
the declaration, so a stale pointer sends the next session to a package whose
dependencies are unmet, or to nothing at all while work remains. The checker
recomputes it from the dependency graph and fails on disagreement.

## What this changed immediately

Seven active parent records had no continuation pointer at all. Each now
declares one, and each declaration is verified against its own dependency graph.
Three of them — TASK-0008, TASK-0009, TASK-0010 — compute `NONE` while sitting
`IN_PROGRESS` with a single `BLOCKED` package each, which is a real signal the
Product & Backlog Steward inherits in WP-03 rather than a defect introduced here.
