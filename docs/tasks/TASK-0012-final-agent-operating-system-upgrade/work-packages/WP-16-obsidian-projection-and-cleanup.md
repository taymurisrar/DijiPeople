---
WP_ID: WP-16
TASK_ID: TASK-0012
TITLE: Obsidian projection, verification and cleanup
STATUS: NOT_STARTED
OWNER_AGENT: Knowledge & Graph
DEPENDENCIES: [WP-04, WP-15]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-16 — Obsidian projection, verification and cleanup

## Goal

Project this program into the vault, verify the result physically
rather than trusting an exit code, and leave the repository clean.

Physical verification means resolving the configured vault, reading the files
back, and checking source paths, node identity, status parity, folder placement,
link targets and link semantics. A generator that returns zero has reported on
itself.

Cleanup then closes the session, releases leases, rebuilds every generated
index, and confirms that the post-integration generators left no tracked file
modified — because a generator run after the final commit is repository work
that has not been integrated.

Done when the ten Obsidian counters are zero, the primary worktree is as the
task found it, and no unexplained dirty file remains.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/sync-obsidian.mjs` and the WP-04 verifier
- `scripts/repo-health.mjs`
- `scripts/session.mjs`

OPTIONAL:
- none

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- No source changes expected — generated indexes and the session record only.

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | A vault may not be configured here, in which case the honest verdict is NOT_CONFIGURED with a reason, not PASS | UNVERIFIED | To be resolved when the vault is probed; a fabricated PASS is the failure being avoided |

## Implementation State

Not started.

## Validation State

Pending: `npm run knowledge:verify`, `npm run repo:health`.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Terminal package.
