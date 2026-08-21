---
WP_ID: WP-03
TASK_ID: TASK-0012
TITLE: Product and Backlog Steward role and backlog ownership
STATUS: DONE
OWNER_AGENT: Product & Backlog Steward
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-03 — Product and Backlog Steward role and backlog ownership

Work package of [[TASK-0012]].

## Goal

Create the permanent role that owns the health of unfinished work, and
give it the fields and detectors it needs to do the job mechanically.

Today a bug record can sit open for ninety days with no owner, no acceptance
criteria and no next action, and nothing in the framework notices. The Steward
owns that, plus prioritisation that weighs blast radius rather than severity
alone — a MEDIUM defect making ninety tests unreliable outranks a standalone
HIGH cosmetic one.

Done when `.agent/agents/product-backlog-steward.md` exists, backlog records
carry ownership and acceptance fields, `backlog:review` detects the eleven
staleness conditions in the brief, and NEXT_BEST_ACTIONS is computed rather than
asserted.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/backlog-records.mjs` — the record vocabulary
- `scripts/backlog-review.mjs` — the existing aging pass
- `docs/backlog/README.md` and `docs/bugs/README.md`
- `.agent/agents/README.md` — the role index

OPTIONAL:
- `docs/backlog/items/` — a sample of live items, for which fields are already populated in practice

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/agents/product-backlog-steward.md` — new
- `scripts/backlog-review.mjs` — extended detectors
- `scripts/lib/backlog-records.mjs` — ownership fields

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Backlog and bug records share one parser, so ownership fields can be added in one place | VERIFIED | `backlog-records.mjs` validates both kinds through one `validate(record, kind)` |
| A-02 | Existing records will not all carry the new fields, so detection must report rather than fail the build | VERIFIED | 87 bug records predate any ownership requirement |

## Implementation State


Done.

- `.agent/agents/product-backlog-steward.md` — the permanent role.
- `scripts/backlog-review.mjs` extended with seven health detectors
  (`OWNERLESS`, `NO_ACCEPTANCE_CRITERIA`, `NO_NEXT_ACTION`,
  `NO_MODULE_LINK`, `NO_QA_RELATIONSHIP`, `NO_LAST_REVIEWED`,
  `STALE_DEFERRED`), three aging buckets, and `NEXT_BEST_ACTIONS`.
- Registered in `REQUIRED_AGENTS`, so deleting the role fails validation.

The ranking weighs blast radius, not severity alone: how many records name this
one as a blocker, how many modules it spans, whether its type undermines later
evidence. Every contribution is printed beside the record, so a disagreement is
about the reasons rather than the number.

Ownership fields are detected, not enforced. 156 records predate every one of
them, and failing the build would make this a detector people disable.

## Validation State


- `node scripts/backlog-review.mjs` on the live backlog → 39 active,
  0 ownerless actionable, 39 without acceptance criteria or next action.
- `node scripts/rebuild-backlog.mjs --check` → 156 records, 0 structural errors.
- `node scripts/validate-framework.mjs` → role checks pass for the new role.

## Evidence


- `NEXT_BEST_ACTIONS` ranked the live backlog and put BUG-0052 (HIGH, security,
  six modules, FIX_NOW) at 75 and ITEM-0034 (HIGH, test gap, two modules) at 48 —
  an ordering severity alone cannot produce.
- ITEM-0073 was filed by this package and carries `LastReviewed`,
  `NextAction` and `AcceptanceCriteria`, demonstrating the fields.
- The detector reports 0 ownerless actionable records: every live record already
  names an owner, so the gap is acceptance criteria and next actions, not
  ownership.

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: CREATE_NODE — the role file projects in WP-16.
Unblocks WP-10 and WP-11.
