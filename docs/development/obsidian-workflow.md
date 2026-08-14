# Obsidian Workflow

How product thinking flows into the repository, and how engineering knowledge
flows back out — without either becoming a copy of the other.

**The application never depends on Obsidian.** The vault lives outside the
repository and nothing in the runtime reads it.

---

## The loop

```
   HUMAN INPUT                          ENGINEERING
   ───────────                          ───────────
   meeting, idea, client
   feedback, rough thought
          │
          ▼
   00 - Home/Inbox/          ◄──────────  you dump raw material here
          │
          │  AI processing (see below)
          ▼
   04 - Requirements/                    Architect reads the requirement
   03 - Modules/                                │
   05 - Decisions/                              ▼
          │                              specialists implement
          │                                     │
          │                                     ▼
          │                              QA + Reviewer
          │                                     │
          │                                     ▼
          │                              knowledge-capture Skill
          │                                     │
          │                                     ▼
          │                              docs/knowledge/  ◄── controlled source
          │                              docs/qa/              (git-tracked)
          │                                     │
          │                                     │  node scripts/sync-obsidian.mjs
          ▼                                     ▼
   hand-written notes            ──►  */Generated/ folders in the vault
   (never touched by sync)             (overwritten freely)
```

---

## 1. Human input — the Inbox

Create `00 - Home/Inbox/` in the vault. Drop anything in, unstructured:
meeting notes, a client complaint, a half-formed feature idea, a bug someone
mentioned in passing.

**Do not organise it.** Organising is the job below.

## 2. AI processing

Point Codex or ChatGPT at an Inbox note and ask it to classify the content into:

- **Requirement** → a new note in `04 - Requirements/` using
  `99 - Templates/Feature.md`
- **Module knowledge** → an update to the relevant `03 - Modules/` note
- **Decision candidate** → a note in `05 - Decisions/`, promoted to an ADR in
  `docs/decisions/` once settled
- **Bug** → `07 - Bugs/` using `99 - Templates/Bug.md`
- **Implementation candidate** → a line in the backlog, ready for an Architect

Rules for that processing step:

- **Never delete raw Inbox content.** Mark it processed instead — prepend
  `> Processed YYYY-MM-DD → [[target note]]` and leave the original intact.
  The raw wording is evidence; the structured note is interpretation.
- Anything that cannot be established from the repository is marked
  `TODO: Confirm product/business rule.` rather than guessed.
- Quotes stay quotes. Interpretation goes in a clearly separate section.

## 3. Engineering

The requirement note becomes the input to the Architect. From there the flow is
[`agent-orchestration.md`](agent-orchestration.md).

## 4. Knowledge capture

After review and QA complete, the
[`knowledge-capture`](../../.agent/skills/knowledge-capture.md) Skill writes into
`docs/knowledge/` — **in the repository, not the vault**.

This is deliberate. `docs/knowledge/` is git-tracked, reviewable in a diff, and
survives a bad generation. Agents never write into the vault directly.

## 5. Sync

```bash
node scripts/sync-obsidian.mjs --dry-run   # see what would change
node scripts/sync-obsidian.mjs             # write it
```

Properties, by design:

- **Idempotent** — running twice changes nothing the second time.
- **Update-safe** — the same source file always maps to the same target note.
  Evergreen notes update in place.
- **Duplicate-safe** — no timestamp suffixes for module or decision notes. QA
  runs already carry their date in the filename, so history accumulates
  naturally.
- **Non-destructive** — everything lands under a `Generated/` subfolder.
  **Hand-written notes outside `Generated/` are never touched.**
- **Markdown only** — no other file type leaves the repository.

## 6. Feedback loop

Future agents read repository context (`.agent/context/`, `docs/`) plus the
requirement notes that originated in the vault. Knowledge earned in one task is
available to the next without anyone re-explaining it.

---

## Which folders are generated, which are yours

| Vault folder | Owner |
|---|---|
| `00 - Home/`, `00 - Home/Inbox/` | **You** |
| `01 - Product/`, `02 - Architecture/` | **You** |
| `03 - Modules/` | You — except `03 - Modules/Generated/` |
| `04 - Requirements/` | **You** (AI-assisted from Inbox) |
| `05 - Decisions/` | You — except `05 - Decisions/Generated/` |
| `06 - Implementation Plans/` | You — except `.../Generated/` |
| `07 - Bugs/`, `09 - Meetings/`, `10 - Client Feedback/` | **You** |
| `08 - Releases/` | You — except `.../Generated/` |
| `11 - Agent Knowledge/QA/**` | **Generated** — do not hand-edit |
| `11 - Agent Knowledge/Regressions/Generated/` | **Generated** |
| `99 - Templates/` | **You** |

If you want to annotate a generated note, do it in a sibling note outside
`Generated/` and link to it. Edits inside `Generated/` are overwritten on the
next sync.

---

## Knowledge boundaries

| Obsidian | Repository |
|---|---|
| Product knowledge, business requirements | Source code, schemas, migrations |
| Architectural *reasoning* | Architectural *description* (`docs/architecture/`, `.agent/context/`) |
| Decision narrative and discussion | Settled ADRs (`docs/decisions/`) |
| Meeting notes, client feedback | Tests and executable configuration |
| Ideas, drafts, open questions | `AGENTS.md`, `PLANS.md`, agent roles |

**Do not turn Obsidian into a copy of the source code.** Reference files by
path; never paste code. Pasted code goes stale silently — that is the
`doc-code-drift` bug pattern applied to your notes.
