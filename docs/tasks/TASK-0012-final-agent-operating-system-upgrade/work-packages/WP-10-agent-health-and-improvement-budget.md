---
WP_ID: WP-10
TASK_ID: TASK-0012
TITLE: Agent health, architecture debt and improvement budget
STATUS: NOT_STARTED
OWNER_AGENT: Product & Backlog Steward
DEPENDENCIES: [WP-03]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [ARCHITECTURE, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-10 — Agent health, architecture debt and improvement budget

## Goal

Measure where roles systematically fail, track architecture debt as a
first-class outcome, and cap proactive suggestions so improvement does not
become scope growth.

Agent health is evidence, not a scoreboard: the point is detecting that a role
keeps producing the same class of rework, not ranking agents. ARCHITECTURE_IMPACT
becomes a recorded outcome on every substantial task. And IMPROVEMENT_BUDGET caps
proposals at three per task, each carrying problem, evidence, value, effort, risk
and owner — so a good idea becomes a backlog item instead of silently widening
the current task.

Done when health signals are derived from records rather than self-reported, and
a fourth proposal is deferred rather than acted on.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/backlog-review.mjs` — extended in WP-03
- `.agent/context/agent-handoffs.md` — where rejections are recorded
- `scripts/lib/backlog-records.mjs`

OPTIONAL:
- `docs/engineering-history/tasks/` — the record of how past tasks actually ran

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/context/agent-health.md` — new
- `scripts/agent-health.mjs` — new

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Health must be derived from durable records, since a self-reported metric measures willingness to report | VERIFIED | Handoff rejections and bug records are the only tamper-resistant sources available |

## Implementation State

Not started.

## Validation State

Pending: simulations 65 and 66.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Feeds WP-11.
