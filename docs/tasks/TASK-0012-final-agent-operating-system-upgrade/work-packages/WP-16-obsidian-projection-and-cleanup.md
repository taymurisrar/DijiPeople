---
WP_ID: WP-16
TASK_ID: TASK-0012
TITLE: Obsidian projection, verification and cleanup
STATUS: IN_PROGRESS
OWNER_AGENT: Knowledge & Graph
DEPENDENCIES: [WP-04, WP-15]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-16 — Obsidian projection, verification and cleanup

Work package of [[TASK-0012]].

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
| A-01 | A vault may not be configured here, in which case the honest verdict is NOT_CONFIGURED with a reason, not PASS | VERIFIED | A vault is configured and reachable, so the branch was never taken; the rule stays in the role definition for checkouts without one |

## Implementation State

Projection and physical verification done; final cleanup pending integration.

The vault at `D:/My Work/hrm-dijipeople/DijiPeople-Vault` was synced and then
read back. Four defect classes surfaced and each was fixed at source rather than
worked around — the full account is in the engineering history record.

Briefly: the relationship grammar was an allow-list describing its author's
guess rather than the graph, and produced 607 errors that were almost all good
links; duplicate detection fired on folder READMEs and then on all sixteen work
packages, because `deriveSourceId` read `TASK_ID` before `WP_ID`; `readKey`
carried the same greedy-`\s*` defect the section parsers had, so a note read
its status as the following line; and the seventeen graph orphans were resolved
by declaring the relationship each already had, never by adding a link.

## Validation State

`node scripts/sync-obsidian.mjs --verify` against the real vault, reading the
files rather than trusting the exit code.

## Evidence

```
OBSIDIAN_SYNC_STATUS          PASS
OBSIDIAN_REPO_TO_VAULT_DIFFS  0     OBSIDIAN_VAULT_TO_REPO_DIFFS  0
OBSIDIAN_PARITY_DIFFS         0     OBSIDIAN_MISSING_PROVENANCE   0
OBSIDIAN_PATH_MISMATCHES      0     OBSIDIAN_NODE_TYPE_MISMATCHES 0
OBSIDIAN_STATUS_MISMATCHES    0     OBSIDIAN_SEMANTIC_LINK_ERRORS 0
OBSIDIAN_SOURCE_ORPHANS       0     OBSIDIAN_GRAPH_ORPHANS        0
OBSIDIAN_DUPLICATE_NODES      0     OBSIDIAN_STALE_NODES          0
OBSIDIAN_UNRESOLVED_LINKS     0     OBSIDIAN_GRAPH_NODES        511
```

511 generated nodes, 97 legitimately `STANDALONE_ALLOWED` (navigation
aggregates, by name and with that reason). Manual notes untouched — the sync
writes only into the mapped agent-owned folders.

A-01 resolved: a vault **is** configured and reachable here, so `NOT_CONFIGURED`
never had to be used. It stays in the role definition as the honest verdict for a
checkout without one, because the failure being avoided is a fabricated `PASS`.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: CREATE_NODE — done and verified.
Remaining: session close, lease release and aggregate repository health, once
WP-15 has integrated.
