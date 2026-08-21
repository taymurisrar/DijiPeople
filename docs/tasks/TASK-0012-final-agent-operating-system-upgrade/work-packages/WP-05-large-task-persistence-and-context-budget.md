---
WP_ID: WP-05
TASK_ID: TASK-0012
TITLE: Large-task persistence, work-package files and context budget
STATUS: DONE
OWNER_AGENT: Architect
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-05 — Large-task persistence, work-package files and context budget

Work package of [[TASK-0012]].

## Goal

Make a program's state survive the session that started it, and make
context loading a declared budget rather than a habit.

The parent record's table is an index; it cannot hold a context manifest, an
assumption register or an evidence list. This package adds the per-package file
that can, cross-checks it against the table so the two cannot drift, and
recomputes NEXT_READY_WORK_PACKAGE from the dependency graph so continuation is
a computation rather than a judgement an agent can decline to make.

Done when a session can be killed mid-program and the next one resumes from
Markdown alone, without rediscovery.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/task-records.mjs` — the table parser and status vocabulary
- `scripts/lib/backlog-records.mjs` — the shared frontmatter dialect
- `.agent/context/task-orchestration.md` — sizing and continuation rules

OPTIONAL:
- `docs/tasks/TASK-0007` — the largest existing decomposition

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/work-package-records.mjs` — new
- `scripts/check-work-packages.mjs` — new
- `.agent/context/context-budget.md` — new
- `docs/tasks/TASK-0012-.../work-packages/` — sixteen files

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | `recordFilesIn` is non-recursive, so a package subdirectory is not parsed as a task record | VERIFIED | `backlog-records.mjs:313` uses `readdirSync` with no recursion; `check-work-packages` and `tasks:check` both pass with the directory present |
| A-02 | Existing programs must not be forced to backfill invented package files | VERIFIED | A dated grandfather clause covers the three programs created before 2026-08-21 and nothing after |

## Implementation State


Done.

- `scripts/lib/work-package-records.mjs` — the record type, the context
  manifest parser, the assumption register, and `reconcileWithParent`.
- `scripts/check-work-packages.mjs` — validation plus a recomputed
  `NEXT_READY_WORK_PACKAGE`.
- `.agent/context/context-budget.md` — the durable policy.
- Sixteen package files for this program.

The parent record stays canonical. Package files sit in a sibling directory
because `recordFilesIn` does not recurse, so they cannot be mistaken for task
records — verified rather than assumed.

## Validation State


- `node scripts/check-work-packages.mjs` → valid across 12 tasks.
- `node scripts/rebuild-tasks.mjs --check` → 12 tasks valid with the new
  subdirectory present, proving A-01 and A-02.
- `node scripts/rebuild-backlog.mjs --check` → unaffected.

## Evidence


- Seven active parent records had no continuation pointer at all; each now
  declares one, verified against its own dependency graph.
- Three of them compute `NONE` while `IN_PROGRESS` with one `BLOCKED`
  package each — a real signal surfaced by the recomputation, not a defect
  introduced by it.
- The grandfather clause is dated, so it covers exactly the three programs
  created before 2026-08-21 and nothing written afterwards; the exemptions are
  printed on every run rather than applied silently.

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: NONE — projected with the program in WP-16.
Unblocks WP-06, which builds invalidation on `LAST_VERIFIED_SHA`.
