---
WP_ID: WP-15
TASK_ID: TASK-0012
TITLE: Exact-SHA CI and develop integration
STATUS: DONE
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

Done.

Three framework defects had to be fixed before the gate could go green, and
each was a deadlock rather than a bug in the work being integrated.

- `DEVELOP_CONTAINS_MAIN` read repository state, not branch state, so once a
  release moved `main` ahead of `develop` it failed on every branch —
  including the branch whose job was to reconcile them. The fix could not
  pass the gate that demanded it.
- The engineering history record cannot be complete before the merge exists,
  and the validator rightly refuses one left with TODOs. It moved to a
  post-integration commit rather than being filled with "PENDING", which
  would have passed the grep and meant the same thing.
- `repo-health` had no way to say a path in the primary checkout belongs to
  another live session, so a concurrent edit blocked completion or had to be
  laundered through `--primary-baseline`.
- `finalize-agent-task` looked for the vault config beside itself, so it
  reported `SKIPPED_NO_LOCAL_CONFIG` from every task worktree.

## Validation State

CI run [32454788133](https://github.com/taymurisrar/DijiPeople/actions/runs/32454788133)
at `f023512` — all 14 jobs green, including `CI required gate`.

The run id and its head SHA were both checked before the verdict was
believed: a cancelled run’s `gh run watch` also exits 0, and three runs were
superseded during this program.

## Evidence

```
CI required gate            success     head f023512
Framework validation        success
API tests · Web · Admin · Landing · Browser e2e · Database e2e   success
Database migration gate · Typecheck · Build · Lint · Runtime schema  success
```

SEMANTIC_CONFLICT_CHECK before the push: all six record validators PASS, and
no duplicate record id is introduced against `origin/develop`.

Integrated by ref-push at `4226e53..f023512`, so the tip `develop` holds is
byte-identical to the tip CI verified. `main` was never written by this task.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: NONE.
OBSIDIAN_IMPACT: NONE.

A-01 and A-02 both held. `main` moved twice during the program, both times by
SESSION-0025 and never by this task; each divergence was reconciled into
`develop` rather than left for the next task to trip over.
