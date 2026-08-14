# Inbox

Dump raw material here. **Do not organise it.**

Meeting notes, half-formed ideas, a client complaint, a bug someone mentioned in
passing, a rough architecture thought at 11pm. Unstructured is fine — structure
is the processing step's job, not yours.

## Processing

Point Codex or ChatGPT at a note and ask it to classify the content into:

- **Requirement** → `04 - Requirements/` using `99 - Templates/Feature.md`
- **Module knowledge** → update the relevant `03 - Modules/` note
- **Decision candidate** → `05 - Decisions/`, promoted to an ADR in the
  repository's `docs/decisions/` once settled
- **Bug** → `07 - Bugs/` using `99 - Templates/Bug.md`
- **Implementation candidate** → the backlog, ready for an Architect

## Rules

- **Raw content is never deleted.** Mark it processed instead:
  `> Processed 2026-08-14 → [[Feature — Overtime approval]]`
  The raw wording is evidence; the structured note is interpretation, and the
  two are not interchangeable.
- Anything that cannot be established from the repository is marked
  `TODO: Confirm product/business rule.` — never guessed.
- Quotes stay quotes. Your interpretation goes in a clearly separate section.

Full workflow: `docs/development/obsidian-workflow.md` in the repository.
