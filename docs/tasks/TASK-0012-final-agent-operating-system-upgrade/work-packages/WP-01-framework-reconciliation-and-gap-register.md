---
WP_ID: WP-01
TASK_ID: TASK-0012
TITLE: Framework reconciliation and gap register
STATUS: DONE
OWNER_AGENT: Architect
DEPENDENCIES: []
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-01 — Framework reconciliation and gap register

Work package of [[TASK-0012]].

## Goal

Establish what the framework already does before adding anything, and
record the exact delta against the sixty-five sections of the brief. The brief
describes a target state; large parts of it are already built. Implementing it
without reconciliation first would produce duplicate mechanisms — a second task
system, a second allocator, a second Obsidian verifier — which is the specific
outcome the brief forbids.

Done when every section of the brief carries a verdict: PRESENT, PARTIAL or
ABSENT, with the file that provides it.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `AGENTS.md` — the top instruction tier
- `.agent/context/task-completion-contract.md` — the field vocabulary
- `.agent/context/agent-handoffs.md` — the required-agent matrix
- `scripts/validate-framework.mjs` — the 2,945-check baseline
- `scripts/lib/*.mjs` — the record parsers and the id allocator

OPTIONAL:
- `docs/tasks/TASK-0004`, `TASK-0005`, `TASK-0007` — prior programs, for how decomposition is recorded here

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `docs/tasks/TASK-0012-final-agent-operating-system-upgrade.md` — created
- `docs/knowledge/framework/reconciliation-2026-08-21.md` — the gap register

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The brief describes a target state, not a greenfield build; most sections are partially present | VERIFIED | 2,945 existing checks, 39 existing simulations, 12 existing role/context files |
| A-02 | No in-flight session is already implementing this program | VERIFIED | `session.mjs list` — five active sessions, none on framework scope |

## Implementation State

Reconciliation performed at 4226e53. The gap register is
`docs/knowledge/framework/reconciliation-2026-08-21.md`; the decomposition it
produced is the sixteen-row table in the parent record.

## Validation State

`node scripts/validate-framework.mjs` — 2,945 checks PASS at the base commit, recorded as the baseline every later package is measured against.

## Evidence

- Baseline: `node scripts/validate-framework.mjs` → `Framework validation passed — 2945 checks.` at `4226e53`.
- Inventory: 12 role files, 25 context files, 10 record libraries, 39 numbered simulations.
- Gap register: `docs/knowledge/framework/reconciliation-2026-08-21.md`.

## Questions

None. Every question this package raised was answerable from the repository.

## Handoff

KNOWLEDGE_IMPACT: CURRENT_CONTEXT — the gap register is durable.
OBSIDIAN_IMPACT: NONE — projected with the program in WP-16.
Unblocks WP-02, WP-03, WP-04, WP-05, WP-07 and WP-09 simultaneously.
