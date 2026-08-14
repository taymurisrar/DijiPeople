# Knowledge Outbox

Git-tracked, controlled engineering knowledge. **This is the source; the
Obsidian vault is a consumer.**

Agents write here — never directly into anyone's vault. A bad generation is then
visible in a diff and reversible with `git checkout`, instead of landing silently
in personal notes.

Written by the [`knowledge-capture`](../../.agent/skills/knowledge-capture.md)
Skill after a task reaches IMPLEMENTATION / REVIEW / QA complete.
Published by `node scripts/sync-obsidian.mjs`.

---

## Structure

| Folder | Contains | Lifecycle |
|---|---|---|
| `modules/` | Durable per-module knowledge: rules, constraints, gotchas | **Evergreen** — updated in place |
| `decisions/` | Decision records produced by implementation work | **Evergreen** |
| `implementations/` | What shipped, when, on which branch, with which QA run | **History** — append only |
| `regressions/` | Regression narratives too long for the register | **Evergreen** |
| `releases/` | Release summaries | **History** — append only |

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
