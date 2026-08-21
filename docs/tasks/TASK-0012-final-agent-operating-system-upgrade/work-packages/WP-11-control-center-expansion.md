---
WP_ID: WP-11
TASK_ID: TASK-0012
TITLE: Engineering Control Center expansion
STATUS: DONE
OWNER_AGENT: Product & Backlog Steward
DEPENDENCIES: [WP-03, WP-04]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-11 — Engineering Control Center expansion

## Goal

Make one page answer "what is the state of engineering right now"
without opening anything else: active sessions and their leases, ready and
waiting packages, the database writer, the develop queue, open CRITICAL and HIGH,
ownerless and aging work, the ten Obsidian counters, test-resource cleanup
failures, agent-health regressions, and the computed next best actions.

Every number must be derived at generation time. A dashboard that restates what
someone typed is a second source of truth, which is the thing it exists to
prevent.

Done when `knowledge:dashboards` emits all of it and `--check` fails on
staleness.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/generate-dashboards.mjs` — the existing Control Center
- the WP-03 detectors and the WP-04 verifier outputs
- `scripts/session.mjs` — live session and lease state

OPTIONAL:
- `docs/knowledge/dashboards/` — current output, for format

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/generate-dashboards.mjs` — extended

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Every counter has a computable source; none needs manual entry | VERIFIED | Disproven as stated, and resolved: the record-derived counters are published, and branch SHAs, the develop queue, Obsidian parity and test cleanup are live state published as the command that produces them rather than as a stale number |

## Implementation State

Done. `scripts/generate-dashboards.mjs` extended.

Added to **State**: work packages waiting on the user (named, not just counted)
and open questions. Added a **Backlog health** section: ownerless actionable
records, records with no acceptance criteria, records with no next action, the
7/30/90-day aging buckets, and architecture, security and database gap counts.

Everything published is derived at generation time from the records. Nothing
restates a number somebody typed — a dashboard that does is a second source of
truth, which is the thing it exists to prevent.

Scoped to the open bucket, the same population the severity counters beside it
use. Health measured over a different set than the counts next to it invites
arithmetic nobody can reproduce.

## Validation State

- `node scripts/generate-dashboards.mjs` → regenerated; `--check` clean.
- `node scripts/validate-framework.mjs` → 3,078 checks, including simulation 24
  (the Control Center is current) and simulation 61.

## Evidence

- Live output: 0 ownerless actionable records, 39 without acceptance criteria,
  39 without a next action, 8 architecture/tech-debt, 7 security, 2 database.
  The ownership gap was already closed; the actionability gap was not, which is
  a finding the page now surfaces permanently.
- Ranked `NEXT_BEST_ACTIONS` and `AGENT_HEALTH_REGRESSIONS` are linked as
  commands rather than baked in, so the reasons travel with the ranking.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: UPDATE_NODE — the dashboard projects in WP-16.

A-01 resolved: not every counter has a computable source. Branch SHAs, the
develop queue, the Obsidian parity counts and test-resource cleanup are **live
state** — they change between one command and the next, so a number here would
already be stale. Each is published as the command that produces it, which is
the stance this note already took about heartbeats and leases. Dropping them
rather than faking them is the honest reading of "a note cannot be evidence
about a ref".
