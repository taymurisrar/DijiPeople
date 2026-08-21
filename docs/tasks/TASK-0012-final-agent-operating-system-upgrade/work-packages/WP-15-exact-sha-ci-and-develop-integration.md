---
WP_ID: WP-15
TASK_ID: TASK-0012
TITLE: Exact-SHA CI and develop integration
STATUS: CI
OWNER_AGENT: Integrator
DEPENDENCIES: [WP-14]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [NONE]
OBSIDIAN_IMPACT: NONE
---

# WP-15 — Exact-SHA CI and develop integration

Work package of [[TASK-0012]].

## Goal

Get a green CI verdict on the exact final SHA and integrate it into
develop without touching main.

The Integrator also runs the semantic conflict check after reconciling with
origin/develop: git merging cleanly says nothing about whether two branches
produced colliding record ids, contradictory index entries or a task
relationship that no longer resolves.

Done when the gate is green at the SHA that is actually on develop, develop
still contains main, and main is where the task found it.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/agents/integrator.md`
- `.agent/context/branch-model.md`
- `docs/development/ci.md`

OPTIONAL:
- `.github/workflows/ci.yml` — for the required gate’s needs list

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- No repository files — this package produces evidence, not source.

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Ref-pushing the branch to develop keeps the integrated tip identical to the CI-verified SHA | VERIFIED | Established practice in this repository; avoids a merge commit CI never saw |
| A-02 | Local main sitting one commit ahead of origin/main is pre-existing user work | VERIFIED | Recorded at session start before any change was made |

## Implementation State

Not started.

## Validation State

Pending: the `CI required gate` conclusion at the final SHA.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Gates WP-16.
