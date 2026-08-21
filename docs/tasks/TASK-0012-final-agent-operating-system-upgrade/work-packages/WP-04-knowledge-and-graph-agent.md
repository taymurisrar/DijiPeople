---
WP_ID: WP-04
TASK_ID: TASK-0012
TITLE: Knowledge and Graph role and the Obsidian node contract
STATUS: DONE
OWNER_AGENT: Knowledge & Graph
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-04 — Knowledge and Graph role and the Obsidian node contract

Work package of [[TASK-0012]].

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



Done.

- `.agent/agents/knowledge-graph.md` — the permanent role.
- `scripts/lib/obsidian-node.mjs` — the node contract: provenance rendering,
  parsing, and one-pass git freshness metadata.
- `scripts/lib/obsidian-mappings.mjs` — `nodeType` per mapping, `nodeTypeFor`
  (which separates a work package from its parent task), the
  `NODE_RELATIONSHIPS` grammar, and a `docs/questions` mapping.
- `scripts/sync-obsidian.mjs` — writes the rendered form instead of copying
  bytes, and verifies provenance, source path, node type, status parity,
  duplicate source ids, semantic links, repository paths written as wikilinks,
  and `STANDALONE_ALLOWED` exemptions that name no author or reason.

The freshness stamp is the commit that last touched the *source file*, not HEAD.
Stamping HEAD would change every note on every run, so every verification would
report total drift and the first response would be to stop reading the output.

## Validation State



- `node scripts/sync-obsidian.mjs --dry-run` → 511 notes to write, 6 skipped as
  empty. The whole population re-renders once for the contract.
- Round-trip proof: `renderNote` then `readProvenance` on BUG-0001 returns
  `node_type: bug`, `source_id: BUG-0001`, `status: VERIFIED` — all derived
  from the record rather than asserted.
- `node scripts/validate-framework.mjs` → 3,009 checks.

## Evidence



- Provenance is derived from the record's own fields: BUG-0001 renders
  `status: VERIFIED` and `modules: [services/api/src/modules/employees]`.
- Write and verify share one `publishedForm`, so they cannot disagree. Two
  copies would present as permanent, unfixable "vault differs from source" —
  a failure nobody could act on.
- The vault is configured and reachable, verified by running `--verify` and
  getting per-note diffs rather than a configuration error.
- Physical verification against the real vault is WP-16.

## Questions

None yet.

## Handoff



KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: CREATE_NODE.
Unblocks WP-11 (the counters) and WP-16 (projection and physical verification).
