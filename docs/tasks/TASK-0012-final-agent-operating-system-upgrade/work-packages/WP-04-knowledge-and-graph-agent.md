---
WP_ID: WP-04
TASK_ID: TASK-0012
TITLE: Knowledge and Graph role and the Obsidian node contract
STATUS: IN_PROGRESS
OWNER_AGENT: Knowledge & Graph
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-04 — Knowledge and Graph role and the Obsidian node contract

## Goal

Create the permanent role that owns canonical-to-vault projection, and
replace filename-similarity verification with provenance the machine can check.

Every generated node must declare where it came from — `source_id`,
`source_path`, `source_commit`, `status` — so the vault can be verified in
both directions and a node whose source was deleted or renamed becomes a
SOURCE_ORPHAN instead of quietly outliving it. Links get the same treatment:
a wikilink is legitimate only for a node actually projected into the vault, and
only when the relationship between the two ends is one the graph defines.

Done when the node contract is enforced, repository paths can no longer be
written as wikilinks, and SOURCE_ORPHAN and GRAPH_ORPHAN are distinct verdicts.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/sync-obsidian.mjs` and `scripts/lib/obsidian-mappings.mjs`
- `scripts/lib/obsidian-config.mjs` — how the vault is resolved
- `.agent/context/knowledge-architecture.md`

OPTIONAL:
- `docs/obsidian-bootstrap/` — the vault skeleton

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/agents/knowledge-graph.md` — new
- `scripts/lib/obsidian-mappings.mjs` — node contract and relationship grammar
- `scripts/verify-obsidian.mjs` — bidirectional and semantic verification

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | A vault may not be configured on every checkout, so verification must degrade to a clear NOT_CONFIGURED rather than fail | VERIFIED | `obsidian-config.mjs` already treats the vault as optional and locally configured |
| A-02 | Manual notes exist in the vault and must never be overwritten by generated sync | VERIFIED | The `generated: true` frontmatter flag is what separates the two populations |

## Implementation State


Role definition complete; verification tooling outstanding.

Done:
- `.agent/agents/knowledge-graph.md` — the permanent role, the node contract,
  the three link kinds, the relationship grammar, and the rule that
  `STANDALONE_ALLOWED` needs a reason, an author and a date.
- Registered in `REQUIRED_AGENTS`.

Outstanding:
- Provenance frontmatter emitted by `sync-obsidian.mjs`.
- Bidirectional verification with the ten counters.
- Semantic link validation against the relationship grammar.
- A vault mapping for `docs/questions`.

## Validation State


- `node scripts/sync-obsidian.mjs --verify` runs against a configured, reachable
  vault and already reports source orphans, graph orphans and content drift.
- The vault is currently behind this branch, which is expected and is WP-16's job.

## Evidence


- Verified the vault is configured and reachable rather than assumed: `--verify`
  returned per-note diffs, including the sixteen new work-package files as
  `expected note is absent from the vault`.
- That output also proves the sync recurses into subdirectories, so the new
  `work-packages/` tree projects without a mapping change.

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: CREATE_NODE.
WP-11 and WP-16 both depend on the counters this package still owes.
