# Questions

Durable questions raised by a specialist and routed through the Architect to the
user. The rules live in
[`.agent/context/question-protocol.md`](../../.agent/context/question-protocol.md);
this page describes the record tree.

`index.md` and `open.md` are **generated**. Rebuild them with
`node scripts/rebuild-questions.mjs`; never edit them by hand.

## Why a record rather than a chat message

A question asked in chat and answered in chat is lost the moment the session
ends, so the next session asks it again. A user who answers the same product
question three times is right to conclude the framework remembers nothing.

A record survives, carries who asked and what it blocks, and — once answered —
points at the ADR that makes the decision retrievable by a task nobody has
written yet.

## Lifecycle

```
OPEN        raised, waiting on the user; the blocked package sits in WAITING_USER
ANSWERED    answered, with the reasoning and (for durable categories) an ADR
WITHDRAWN   the asker resolved it from the repository after all
SUPERSEDED  a later question or decision replaced it
```

## Raising one

```bash
node scripts/new-question.mjs "<the question>" \
  --category USER_DECISION_REQUIRED --agent Backend/API \
  --task TASK-nnnn --wp WP-nn --blocking PACKAGE
node scripts/rebuild-questions.mjs
```

Then name the `QUESTION-nnnn` in the waiting work package's `## Questions`
section. A `WAITING_USER` package that names no question is rejected by
`node scripts/check-work-packages.mjs` — without the reference, "waiting" and
"stalled" look identical.

## What the validator enforces

`node scripts/rebuild-questions.mjs --check` fails on:

- an `OPEN` question with no `## Agent Recommendation` — routing options to the
  user without a recommendation moves the analysis onto them;
- an `OPEN` question that already records an `ANSWER` — somebody answered it and
  never closed it, so a package is waiting for nothing;
- an `ANSWERED` question with an empty `## Answer` section — the verdict without
  the reasoning is how a settled decision gets reopened;
- an `ANSWERED` question in a durable category with no `DECISION_ID`, because
  that answer will not be found by the next task that needs it;
- a `DECISION_ID` that is not an `ADR-nnnn`;
- stale indexes.

## Fields

| Field | Notes |
|---|---|
| `QUESTION_ID` | `QUESTION-nnnn`, allocated by `scripts/allocate-id.mjs` |
| `CATEGORY` | One of the ten in the protocol document |
| `ASKED_BY_AGENT` | The specialist; a question with no asker cannot be routed back |
| `TASK_ID` / `WORK_PACKAGE_ID` | What it arose in |
| `BLOCKING` | `NONE`, `PACKAGE` or `TASK` — decides what stops |
| `ANSWER` | The verdict; the `## Answer` section carries the reasoning |
| `DECISION_ID` | The `ADR-nnnn` that made it durable |
| `KNOWLEDGE_IMPACT` | Normally `DECISION` |
