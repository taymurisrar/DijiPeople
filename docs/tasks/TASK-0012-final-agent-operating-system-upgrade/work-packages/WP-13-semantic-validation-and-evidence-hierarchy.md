---
WP_ID: WP-13
TASK_ID: TASK-0012
TITLE: Semantic record validation, QA evidence hierarchy, id allocation
STATUS: DONE
OWNER_AGENT: QA
DEPENDENCIES: [WP-03, WP-04, WP-07]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [QA_SCENARIO, REGRESSION]
OBSIDIAN_IMPACT: NONE
---

# WP-13 — Semantic record validation, QA evidence hierarchy, id allocation

Work package of [[TASK-0012]].

## Goal

Stop a record's terminal status from contradicting its own prose, put a
floor under what evidence a PASS may rest on, and prove concurrent id allocation
is safe.

The evidence hierarchy L0 to L7 makes the required level explicit per scenario,
and a scenario whose actual level is below its required level cannot PASS — which
is what separates "a static test asserts the shape of the source" from "the
behaviour was observed". Semantic validation stays bounded to unambiguous
contradictions: VERIFIED beside "not yet verified" is a failure; anything
requiring interpretation is not a validator's job.

Done when contradiction detection runs, evidence levels gate PASS, and two
concurrent REG allocations are proven to produce distinct ids.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/qa-records.mjs` — scenario and run vocabulary
- `scripts/lib/backlog-records.mjs` — status vocabulary
- `scripts/lib/id-allocator.mjs` — the existing REG kind

OPTIONAL:
- `docs/qa/regressions/index.md` — the contentOf target

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/qa-records.mjs` — evidence levels
- `scripts/lib/backlog-records.mjs` — contradiction detection
- `scripts/validate-framework.mjs` — the concurrency simulation

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | REG ids already have an allocator entry and need proving, not building | VERIFIED | `ID_KINDS.regression` with a `contentOf` scan of `docs/qa/regressions/index.md` |
| A-02 | Contradiction detection must stay bounded to avoid false positives on ordinary prose | VERIFIED | The brief explicitly rules out speculative NLP checks |

## Implementation State

Done.

- **Evidence hierarchy** — `EVIDENCE_LEVELS` L0-L7 in `qa-records.mjs`, with
  `evidenceRank` and `evidenceSatisfies`. Scenario validation gates
  `LAST_RESULT` against `REQUIRED_EVIDENCE_LEVEL` and
  `ACTUAL_EVIDENCE_LEVEL`. Both fields are optional, because 113 scenarios
  predate them and rejecting those would turn a rule about proof into a bulk
  migration nobody asked for. Only success is gated — reporting a FAIL on weak
  evidence is honest.

- **Semantic contradiction detection** — in `backlog-records.mjs`, bounded to
  two rules over the `Resolution` and `QA Retest` sections.

- **Id allocation** — `REG` already had an allocator entry, so this package
  proved it rather than building a second one, and added `question`.

A real defect surfaced while writing the simulations: the section-extraction
regex used `\s*` after the heading, which is greedy across newlines. For an
*empty* section it swallowed the blank line and the section boundary with it,
so the capture ran on into the next section — meaning an empty
`## Agent Recommendation` silently returned the text of `## Answer` and read
as populated. The empty section is exactly the case these validators exist to
catch, so the greedy version failed in precisely the situation it was written
for. Fixed in all three parsers by matching horizontal whitespace only.

## Validation State

- `node scripts/rebuild-qa.mjs --check` → 19 plans, 113 scenarios, valid.
- `node scripts/rebuild-backlog.mjs --check` → 156 records, 0 structural errors.
- `node scripts/validate-framework.mjs` → 3,059 checks.

## Evidence

- The contradiction detector was run against all 156 live records and produced
  exactly one hit: BUG-0034, `VERIFIED` above a QA Retest section containing
  "Not verified". Reading it showed a **false positive** — the retest ran and
  passed, and the phrase was an honest end-to-end scope limit.
- Rather than accept the noise, the rule was tightened twice: the opening line
  of the section is treated as the verdict, and a negative followed by a scope
  qualifier is a stated gap rather than a contradiction. It now reports zero
  across all 156. Punishing the records that explain their own limits is how a
  validator teaches people to stop writing limits down.
- Simulation 56 pins that false positive permanently, using BUG-0034's actual
  shape, so a future tightening cannot silently reintroduce it.
- Simulation 55 proves the detector still catches the real contradiction, and
  the mutation run proves the check fails when it is disabled.
- Simulation 54 allocates four `regression`, `bug` and `question` ids in
  succession and asserts all are distinct.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: QA_SCENARIO, REGRESSION.
OBSIDIAN_IMPACT: NONE.
Unblocks WP-14.
