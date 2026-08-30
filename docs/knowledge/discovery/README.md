# Discovery Knowledge

The state of the **documentation effort**, not the state of DijiPeople.
Published to `11 - Agent Knowledge/Discovery` in the vault.

Four notes, each answering one question, and the separation between them is what
makes them usable:

| Note | Answers |
|---|---|
| [[discovery-status]] | What is covered, per domain and per discovery phase |
| [[known-gaps]] | What is **established** to be missing or unreachable, with evidence |
| [[contradictions]] | Where two parts of the implementation **disagree with each other** |
| [[pending-verification]] | What discovery **could not settle**, and where to resume |

## Why the last one exists

An unverified suspicion recorded as a finding is worse than no note at all: the
next reader spends their time disproving it instead of investigating something
real. Discovery produced several claims that did not survive checking —
`LegalDocument`, `NotificationTemplate` and `NotificationRule` looked like three
broken features and are three pieces of seed-owned configuration working exactly
as designed.

So a claim is only promoted into [[known-gaps]] or [[contradictions]] once it has
been checked against the source. Everything else stays in
[[pending-verification]] with the evidence gathered so far and the place to
start.

## What does not belong here

- **Defects.** A material finding becomes a record under `docs/bugs/` and enters
  the backlog for triage. A contradiction that is causing a wrong result is a
  bug, not a note.
- **Product intent.** That is `docs/knowledge/product/` and the vault's
  hand-maintained folders.
- **How the system works.** That is `docs/knowledge/architecture/`,
  `docs/knowledge/modules/` and `docs/knowledge/data-model/`.

## Related

[[discovery-status]] · [[known-gaps]] · [[contradictions]] ·
[[pending-verification]] · [[data-model-overview]] · [[domain-map]]
