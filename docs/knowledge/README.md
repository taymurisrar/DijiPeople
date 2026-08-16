# Knowledge Outbox

Git-tracked, controlled engineering knowledge. **This is the source; the
Obsidian vault is a consumer.**

Agents write here — never directly into anyone's vault. A bad generation is then
visible in a diff and reversible with `git checkout`, instead of landing silently
in personal notes.

Written by the [`knowledge-capture`](../../.agent/skills/knowledge-capture.md)
Skill after a task has merged — see the ordering in
[`../../.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).
Published by `node scripts/sync-obsidian.mjs`.

---

## Structure

| Folder | Contains | Vault destination | Lifecycle |
|---|---|---|---|
| `product/` | What a product area or application **is**, and who it serves | `01 - Product/Generated` | **Evergreen** |
| `architecture/` | How a subsystem or application is **built** | `02 - Architecture/Generated` | **Evergreen** |
| `modules/` | Durable per-module knowledge: rules, constraints, gotchas | `03 - Modules/Generated` | **Evergreen** — updated in place |
| `requirements/` | Requirements derived from repository evidence | `04 - Requirements/Generated` | **Evergreen** |
| `decisions/` | Decision records produced by implementation work | `05 - Decisions/Generated` | **Evergreen** |
| `implementations/` | What shipped, when, on which branch, with which QA run | `06 - Implementation Plans/Generated` | **History** — append only |
| `regressions/` | Regression narratives too long for the register | `11 - Agent Knowledge/Regressions/Generated` | **Evergreen** |
| `releases/` | Release summaries | `08 - Releases/Generated` | **History** — append only |
| `dashboards/` | **Generated** by `scripts/generate-dashboards.mjs` — never hand-edit | `00 - Home/Generated` | Regenerated |

The vault destinations come from `DEFAULT_MAPPINGS` in
[`scripts/lib/obsidian-mappings.mjs`](../../scripts/lib/obsidian-mappings.mjs).
**A folder with no mapping is written but never published**, so a new top-level
folder here needs a mapping added there — and that file is shared with
`retrieve-knowledge.mjs`, so a missing mapping also causes duplicate search hits.

> This table previously listed only `modules/`, `decisions/`,
> `implementations/`, `regressions/` and `releases/`, while `product/`,
> `architecture/`, `requirements/` and `dashboards/` all existed on disk. The
> index was behind its own folder. Corrected 2026-08-16.

### Where application knowledge goes

An application gets **at most two** notes: what it is (`product/`) and how it is
built (`architecture/`). Do not create a `docs/knowledge/apps/` folder — it has
no vault mapping, and the existing split already carries the distinction.
Withhold the `product/` note entirely when an application has no product
identity to describe, rather than writing a placeholder.

Evergreen files update in place so the sync maps one source file to one vault
note forever. History files carry a date in the filename and accumulate.

---

## Rules

- **Never paste source code.** Reference `path/to/file.ts:line`. Pasted code
  goes stale silently — the `doc-code-drift` pattern.
- **Durable facts only.** "We fixed a typo in the header" is noise. "Compensation
  reads require a payroll permission because the model carries bank details" is
  knowledge.
- **Module notes are updated, not appended.** A module note that grows a new
  section per change becomes a changelog; git already does that better.
- **Empty is a valid outcome.** If a task taught nothing durable, write nothing
  and say so in the final report.
- **Markdown only.** The sync copies nothing else.

---

## Relationship to other locations

| Location | Holds |
|---|---|
| `docs/architecture/` | How the system is built — human-authored, stable |
| `.agent/context/` | The same, shaped for agent consumption, with verification metadata |
| `docs/decisions/` | Formal ADRs |
| `docs/qa/` | QA runs, regressions, bug patterns |
| **`docs/knowledge/`** | **What implementation work taught us** |
| Obsidian | Product intent, requirements, reasoning, history |

When knowledge here contradicts `.agent/context/`, the context file is stale —
correct it and refresh its verification metadata.
