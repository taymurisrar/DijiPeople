---
WP_ID: WP-05
TASK_ID: TASK-0012
TITLE: Large-task persistence, work-package files and context budget
STATUS: NOT_STARTED
OWNER_AGENT: Architect
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-05 — Large-task persistence, work-package files and context budget

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

Not started.

## Validation State

Pending: `node scripts/check-work-packages.mjs`, simulations 42 to 45.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. WP-06 builds evidence reuse on the manifest’s LAST_VERIFIED_SHA.
