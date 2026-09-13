---
WP_ID: WP-00
TASK_ID: TASK-0031
TITLE: Findings records and owner decisions
STATUS: DONE
OWNER_AGENT: Architect
DEPENDENCIES: []
LAST_VERIFIED_SHA: c494311d
KNOWLEDGE_IMPACT: [DECISION]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-00 — Findings records and owner decisions

Work package of [[TASK-0031]].

## Goal

Turn the second demo walkthrough of the live demo tenant into durable records
and put every open design question to the owner before any code is written.

Done when each finding is a BUG or ITEM record, each owner answer is an ADR or a
recorded decision, and the records are on `develop` with a green gate.

## Context Manifest

REQUIRED:
- `.agent/context/task-router.md`
- `.agent/context/question-protocol.md`
- `docs/bugs/README.md`

OPTIONAL:
- `docs/decisions/README.md` — for the ADR index rows

DO_NOT_LOAD:
- product source under `services/api/src/modules/` and `apps/web/app/` — this package records findings, it does not fix them
- the full bug backlog — only records for the employee record, customization and notifications are relevant

LAST_VERIFIED_SHA: c494311d — re-read any summarised source that changed since.

## Relevant Files

- BUG-3491..BUG-3501 and ITEM-0179..ITEM-0184 under `docs/bugs/` and `docs/backlog/items/`
- ADR-0013..ADR-0017 under `docs/decisions/`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The owner's answers are final for this program | USER_CONFIRMED | Nine decisions, each asked and answered on 2026-09-13 |

## Implementation State

Done. Findings filed, nine owner decisions recorded, five ADRs accepted.

## Validation State

CI run 34725936912 green on the records branch; integrated into `develop` at
`c494311d`.

## Evidence

- `develop` at `c494311d` carries BUG-3491..BUG-3501, ITEM-0179..ITEM-0184 and ADR-0013..ADR-0017.
- CI run 34725936912 — `CI required gate` success.

## Questions

None open. Every question was answered by the owner on 2026-09-13.

## Handoff

KNOWLEDGE_IMPACT: DECISION — five ADRs.
OBSIDIAN_IMPACT: CREATE_NODE — the records and ADRs sync as new notes.

WP-01..WP-06 start from the records and ADRs, not from the walkthrough notes.
