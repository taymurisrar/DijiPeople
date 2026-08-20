---
WP_ID: WP-08
TASK_ID: TASK-0012
TITLE: Agent role enhancements across the permanent set
STATUS: DONE
OWNER_AGENT: Architect
DEPENDENCIES: [WP-02, WP-03, WP-04, WP-05]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT, UI_CONVENTION, DATABASE, SECURITY]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-08 — Agent role enhancements across the permanent set

## Goal

Fold the new mechanisms into the eleven existing role files and settle
the ownership boundaries the brief redraws: UI/UX becomes interaction design and
UX governance with a running-app verification stage, Database becomes the
exclusive lifecycle owner across four stages, Security gains an evidence-level
floor that stops a CRITICAL authorization defect reaching VERIFIED on a static
test, Backend gains the determinism questions for lookup logic, Integration
gains external capability status, and the Architect gains architecture
stewardship plus ARCHITECT_DIRECT_IMPLEMENTATION_REASON.

Done when each role file names what it owns, what it hands off, and which of the
new fields it must produce — without restating cross-role invariants that belong
in the context layer.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/agents/*.md` — all eleven existing role files
- `.agent/context/agent-handoffs.md` — the handoff contract
- the four packages this depends on, for the vocabulary they introduced

OPTIONAL:
- `.agent/context/ui-design-system.md` — for the pattern catalog’s existing home

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/agents/*.md` — thirteen files after the two new roles

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Rules belong at one ownership layer; duplicating an invariant into ten role files is how they drift | VERIFIED | AGENTS.md already states this as a placement rule |

## Implementation State

Done. All ten existing role files extended, and the two new ones already
carry their sections.

- **Architect** — orchestration over implementation,
  `ARCHITECT_DIRECT_IMPLEMENTATION_REASON`, `ARCHITECTURE_IMPACT`, the
  question protocol, computed continuation, and the thirteen-role roster.
- **Backend/API** — the six determinism questions for lookup logic, and the
  contract-change handoff fields.
- **Frontend** — `UI_PATTERN_USED`, `SHARED_UI_CONVENTIONS_APPLIED`,
  `CONVENTION_EXCEPTIONS`, and browser evidence over source reading.
- **UI/UX** — the full interaction-design and governance scope, the pattern
  catalogue, and Stage 2 against the running product.
- **Database** — four lifecycle stages, exclusive write, and the rule that
  `prisma validate` is not semantic proof.
- **Security** — `SECURITY_EVIDENCE_LEVEL` with the CRITICAL floor, and the
  nine-case tenant matrix.
- **Integration** — `LIVE_CAPABILITY_STATUS` and the provider boundary record.
- **QA** — the L0-L7 hierarchy, test-resource accounting, evidence reuse.
- **Integrator** — `SEMANTIC_CONFLICT_CHECK` and allocator-only ids.
- **Release/DevOps** — measured CI signals and the janitor's three conditions.

Appended rather than woven in, so the diff is reviewable and nothing already in
these files was disturbed. Cross-role invariants are pointed at, never restated:
a rule copied into eleven files disagrees with itself within a month.

## Validation State

- `node scripts/validate-framework.mjs` → 3,059 checks; the per-role checks
  (Required Context, Staleness Rule, session awareness, KNOWLEDGE_IMPACT) pass
  for all thirteen roles.
- Every `.agent/context/*.md` reference in a role file resolves — the validator
  checks this, and it is how a role pointing at an uncommitted context file has
  twice been caught.

## Evidence

- `REQUIRED_AGENTS` now lists thirteen roles, so deleting either new role is a
  validation failure rather than a silent regression to eleven.
- The two roles this program created were written before this package and are
  covered by the same per-role checks, not exempted from them.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: CURRENT_CONTEXT, UI_CONVENTION, DATABASE, SECURITY.
OBSIDIAN_IMPACT: UPDATE_NODE.
Unblocks WP-14.
