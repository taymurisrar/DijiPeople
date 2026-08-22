---
WP_ID: WP-10
TASK_ID: TASK-0012
TITLE: Agent health, architecture debt and improvement budget
STATUS: DONE
OWNER_AGENT: Product & Backlog Steward
DEPENDENCIES: [WP-03]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [ARCHITECTURE, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-10 — Agent health, architecture debt and improvement budget

Work package of [[TASK-0012]].

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


Done.

- `.agent/context/agent-health.md` — what is measured and from what,
  `ARCHITECTURE_IMPACT`, `ARCHITECT_DIRECT_IMPLEMENTATION_REASON`, and
  `IMPROVEMENT_BUDGET`.
- `scripts/agent-health.mjs` — derives eight signals from durable records and
  reports seven more as `NOT_DERIVABLE` with the reason.

Two corrections were made after seeing real output. The repeat detector counts
only *active* records — counting closed history forever made every long-serving
role look worse the longer it had worked, which is backwards. And role names are
canonicalised, because six spellings across the tree were splitting single roles
into two with unrelated histories.

## Validation State


- `node scripts/agent-health.mjs` on the live tree → 13 canonical roles,
  3 `AGENT_HEALTH_REGRESSIONS`, 6 `ROLE_NAME_ALIASES`, 0 unowned findings.
- `node scripts/rebuild-backlog.mjs --check` → 156 records valid after ITEM-0073.

## Evidence


- Before the two corrections the same command reported 19 regressions across 17
  role names — noise produced by counting closed history and by treating
  `release-devops` and `release/devops` as different roles. After: 3
  regressions across 13 roles, each a live pattern.
- Seven signals are reported `NOT_DERIVABLE` with a reason rather than
  estimated, because a number invented to fill a column gets trusted.
- The normalisation was filed as ITEM-0073 rather than hidden: normalising in the
  script makes the metric right and leaves the records wrong.

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: ARCHITECTURE, CURRENT_CONTEXT.
OBSIDIAN_IMPACT: NONE.
Unblocks WP-11, which surfaces `AGENT_HEALTH_REGRESSIONS` on the Control Center.
