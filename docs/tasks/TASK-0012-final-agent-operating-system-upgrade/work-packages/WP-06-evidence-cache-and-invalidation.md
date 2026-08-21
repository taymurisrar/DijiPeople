---
WP_ID: WP-06
TASK_ID: TASK-0012
TITLE: Evidence cache and invalidation
STATUS: DONE
OWNER_AGENT: Release/DevOps
DEPENDENCIES: [WP-05]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-06 — Evidence cache and invalidation

Work package of [[TASK-0012]].

## Goal

Stop re-running expensive suites because an unrelated package moved,
and stop reusing results after the code they covered changed.

Both halves matter and they pull in opposite directions, which is why this is
one package. An evidence record names the command, the SHA, the scope it
covered and the result; reuse is legitimate only while no file inside that scope
has changed since.

Done when a database E2E result survives a documentation commit and is
invalidated by a fixture commit, both proven by simulation rather than asserted.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/work-package-records.mjs` — LAST_VERIFIED_SHA lives there
- `scripts/ci-evidence.mjs` — the existing CI evidence capture
- `.agent/context/ci-operations.md`

OPTIONAL:
- `scripts/ci-metrics.mjs` — for how rolling signals are already stored

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/evidence-ledger.mjs` — new
- `scripts/evidence.mjs` — new CLI: record, check, invalidate
- `docs/evidence/` — the ledger

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Scope can be expressed as path globs and resolved against `git diff --name-only` | VERIFIED | Every evidence-producing command in this repo is scoped by workspace or directory |
| A-02 | Evidence must be invalidated by content change, not by elapsed time | VERIFIED | A time-based cache would re-run a green suite that nothing touched, which is the cost being removed |

## Implementation State


Done.

- `scripts/lib/evidence-ledger.mjs` — the record shape, scope matching, and
  `evaluate`, which answers "may I reuse this?" with a reason and the list of
  in-scope files that changed.
- `scripts/evidence.mjs` — record, check, list, invalidate. `check` exits 1
  when evidence is not reusable, so it gates a suite directly:
  `node scripts/evidence.mjs check DB-E2E-001 || npm --workspace api run test:e2e`.
- `docs/evidence/` — the Git-tracked ledger, so a result outlives its session.

Every ambiguity resolves towards re-running: an unresolvable SHA, an empty scope
and a non-PASS result all refuse reuse. The asymmetry is deliberate — re-running
costs minutes, while reusing after an in-scope change costs a false PASS with a
real command behind it, which is the most convincing kind of wrong answer.

Invalidation is by content, never by age. A TTL would expire a green suite that
nothing touched and keep a stale one alive after its fixture was rewritten.

## Validation State


- Both directions executed against real repository history rather than reasoned
  about.
- `--scope` is required by the CLI; a record without one could never be
  invalidated, which would make the laziest evidence the most durable.

## Evidence


- Reuse across an unrelated change: evidence recorded at `4226e53` scoped to
  `services/api/test` stayed REUSABLE with 63 files changed overall and none in
  scope. Exit 0.
- Invalidation on an in-scope change: the same base SHA scoped to
  `scripts,docs/tasks` reported INVALIDATED — 39 in-scope files changed — and
  listed them. Exit 1.
- The three probe records were removed afterwards, under the test-resource
  policy this program also introduces: created, accounted for, cleaned, zero
  unaccounted.

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: NONE.
WP-13 consumes the ledger for QA evidence levels.
