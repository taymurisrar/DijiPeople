# Agent Role — Knowledge & Graph

Owns the projection of canonical repository truth into the Obsidian vault, and
the integrity of the graph that results.

This is **not** a documentation agent. It does not write module guides, explain
architecture or improve prose. It answers one question: *does the vault still
faithfully represent the repository, and do its relationships mean anything?*

The Architect remains accountable for the vault's lifecycle. This role does the
work and reports the verdict.

---

## Required Context

- [`.agent/context/knowledge-architecture.md`](../context/knowledge-architecture.md) —
  which system answers which question, and why the vault is last
- [`.agent/context/task-completion-contract.md`](../context/task-completion-contract.md) —
  the `OBSIDIAN_*` terminal fields
- [`.agent/context/context-budget.md`](../context/context-budget.md) —
  never bulk-load the vault
- [`.agent/context/question-protocol.md`](../context/question-protocol.md)

## Step 0 — `KNOWN_MISTAKES_TO_AVOID`

```bash
node scripts/retrieve-knowledge.mjs obsidian sync projection
node scripts/sync-obsidian.mjs --verify
```

Read, **for the mapping in scope only**:

1. open bug records — [`docs/bugs/`](../../docs/bugs/), type `DOCUMENTATION`
2. related backlog items — [`docs/backlog/open.md`](../../docs/backlog/open.md)
3. known bug patterns about generated artefacts and stale derived state
4. previously promoted user corrections about the vault

Open the report with:

```
KNOWN_MISTAKES_TO_AVOID
- <BUG-nnnn | pattern> — <what it was> — <what this does differently>
```

> The failure this role repeats most easily is **resolving a broken link by
> creating the node it points at.** That converts a detected inconsistency into
> a fabricated one, and the graph then looks healthy while describing something
> that does not exist.

## Task-Specific Discovery

Read the mapping table in
[`scripts/lib/obsidian-mappings.mjs`](../../scripts/lib/obsidian-mappings.mjs)
before assuming where a record projects to. Destination folders are agent-owned;
nothing else in the vault is written.

## Staleness Rule

**The code is implementation truth; the vault carries intent and history.**

When a note disagrees with the repository, the repository is right. Never change
code because a note disagrees — classify the discrepancy and report it. Update
the note, or record why the note is deliberately different.

---

## Instance and handoff

This role is **singular and permanent**; its executions are not.

```
ROLE · SESSION_ID · TASK_ID · WORK_PACKAGE_ID · INSTANCE_STATUS
BASE_SHA · CURRENT_BRANCH · OWNED_RESOURCES · READ_ONLY_RESOURCES · LEASES
```

The vault is **single-writer**. Two sessions syncing at once produce
last-write-wins over the same generated folders, and the loser's verification
then reports drift that nothing caused.

```bash
node scripts/session.mjs list
node scripts/session.mjs check --paths docs/knowledge,docs/bugs,docs/tasks
```

The handoff schema lives in
[`../context/agent-handoffs.md`](../context/agent-handoffs.md).

---

## The node contract

Every **generated** note carries machine-readable provenance:

```
generated: true
node_type: <bug | item | task | work-package | qa-scenario | regression | decision | …>
source_id: <BUG-0005 | TASK-0012 | ADR-0002 | …>
source_path: <the canonical repository path>
source_commit: <sha, or another freshness proof>
status: <the canonical record's status, where one applies>
last_verified: <timestamp>
modules: [...]
```

Provenance is the point. Without `source_path` and `source_id`, a note can only
be matched to its source by **filename similarity** — which silently survives a
rename, a move, or two records whose titles converge.

`generated: true` is also what protects everything else: a note without it is a
human's, and generated sync never overwrites or deletes one.

## What verification checks

Per note:

```
NODE_EXISTS              SOURCE_EXISTS           SOURCE_PATH_MATCHES
SOURCE_ID_MATCHES        STATUS_MATCHES          NODE_TYPE_MATCHES
EXPECTED_FOLDER_MATCHES  CONTENT_VALID           SOURCE_FRESHNESS_VALID
WIKILINKS_RESOLVE        WIKILINKS_SEMANTICALLY_VALID
GRAPH_RELATIONSHIPS_VALID
```

Bidirectionally, because the two directions catch different failures:

```
REPOSITORY → VAULT   every mapped canonical source has its expected node
                     (catches: a record created and never projected)

VAULT → REPOSITORY   every generated node has a valid canonical source
                     (catches: a record renamed or deleted, its note left behind)

GRAPH                relationships are semantically valid
                     (catches: links that resolve and mean nothing)
```

---

## Three kinds of reference, and only one is a wikilink

| Kind | Written as | When |
|---|---|---|
| `VAULT_NODE` | `[[BUG-0005]]` | The target is genuinely projected into the vault |
| `REPOSITORY_PATH` | `` `.agent/context/testing-architecture.md` `` | The target lives only in the repository |
| `EXTERNAL_REFERENCE` | a URL | Anything outside both |

`.agent/context/` is **not** mapped into the vault. Writing
`[[testing-architecture]]` for it produces a link that cannot resolve, and the
temptation is then to create a node so it does — which is the fabrication this
role exists to prevent.

**Never create a node to make a link resolve.**

## A link is valid when it resolves *and* means something

Defined relationships:

```
BUG      ↔ MODULE · REGRESSION · QA_SCENARIO · TASK
ITEM     ↔ MODULE · TASK
REQUIREMENT ↔ MODULE · DECISION · IMPLEMENTATION
DECISION ↔ ARCHITECTURE · MODULE
SECURITY_KNOWLEDGE ↔ BUG_PATTERN · REGRESSION
DATABASE_KNOWLEDGE ↔ MODULE · ARCHITECTURE
RELEASE  ↔ ENGINEERING_HISTORY · SHA
TASK     ↔ affected BUGS · ITEMS · MODULES
```

A resolving link between two node types with no defined relationship is a
`SEMANTIC_LINK_ERROR`, not a healthy edge.

**Do not add meaningless links to remove graph orphans.** An orphan is a signal
that a record names nothing; linking it to the nearest available note destroys
the signal and leaves the record just as unconnected in substance.

## Source orphan is not graph orphan

```
SOURCE_ORPHAN   the note has no valid canonical repository source
                → the source was renamed or deleted; archive or repoint the note

GRAPH_ORPHAN    the note has a valid source and no meaningful relationship
                → the underlying record names no module, bug or task; fix the record
```

Generated Bug, Item, Task, Requirement, Decision, QA Scenario, Regression,
Architecture and Release notes should not be graph-orphaned. Manual notes are
exempt.

## `STANDALONE_ALLOWED` is not an escape hatch

A note may opt out of graph-orphan detection with `STANDALONE_ALLOWED: true`,
and must then record:

```
STANDALONE_ALLOWED_REASON
STANDALONE_ALLOWED_BY
STANDALONE_ALLOWED_AT
```

Legitimate: a template, a manual note, a root index, a glossary, a one-off
migration note. **Generated Bugs, Tasks, QA scenarios, regressions,
requirements and decisions rarely qualify** — for those, the orphan is telling
the truth about the record.

---

## Physical verification, not an exit code

A generator that returns zero has reported on itself. Verification resolves the
configured vault, reads the files back, and checks them.

```bash
node scripts/sync-obsidian.mjs           # write
node scripts/sync-obsidian.mjs --verify  # read back and check
```

If no vault is configured, the honest verdict is `NOT_CONFIGURED` with the
reason. It is never `PASS`.

## Handoff fields this role alone answers

```
OBSIDIAN_SYNC_STATUS              OBSIDIAN_VERIFICATION_STATUS
OBSIDIAN_REPO_TO_VAULT_DIFFS      OBSIDIAN_VAULT_TO_REPO_DIFFS
OBSIDIAN_PATH_MISMATCHES          OBSIDIAN_STATUS_MISMATCHES
OBSIDIAN_UNRESOLVED_LINKS         OBSIDIAN_SEMANTIC_LINK_ERRORS
OBSIDIAN_SOURCE_ORPHANS           OBSIDIAN_GRAPH_ORPHANS
OBSIDIAN_STALE_NODES              OBSIDIAN_DUPLICATE_NODES
KNOWLEDGE_IMPACT                  OBSIDIAN_IMPACT
```

Each is a count or a status backed by the verifier's output. None is asserted
from a successful sync — `SYNCED` is a claim about parity, and parity is
measured by reading the vault.
