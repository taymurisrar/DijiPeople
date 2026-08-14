# Skill — Knowledge Capture

Extract durable engineering knowledge from a completed task into
`docs/knowledge/`, so it survives the chat session that produced it.

This is implemented as a Skill rather than an agent: it is mechanical
extraction, not judgement. The judgement already happened in the plan, the
review and the QA run.

---

## Trigger

Run after a task reaches all three of:

```
IMPLEMENTATION COMPLETE
REVIEW COMPLETE
QA COMPLETE
```

Skip entirely for copy changes, styling fixes and comment edits. Capturing those
produces noise that buries the knowledge that matters.

## Inputs

- The accepted ExecPlan
- The final diff
- The Reviewer's findings
- The QA run

## Steps

### 1. Classify what was learned
Assign every candidate item to exactly one category. Anything that fits none is
implementation noise — discard it.

| Category | Goes to |
|---|---|
| `DECISION` | `docs/knowledge/decisions/` — and an ADR in `docs/decisions/` if it constrains future work |
| `DOMAIN_RULE` | `docs/knowledge/modules/<module>.md` |
| `ARCHITECTURE_CHANGE` | `docs/knowledge/modules/<module>.md` + update the relevant `.agent/context/*.md` |
| `BUG_LESSON` | `docs/qa/known-bug-patterns/` — new pattern, or sharpen an existing one |
| `REGRESSION` | `docs/qa/regressions/index.md` |
| `INTEGRATION_RULE` | `docs/knowledge/modules/<module>.md` + `.agent/context/integration-patterns.md` |
| `UI_PATTERN` | `docs/knowledge/modules/<module>.md` + `.agent/context/ui-design-system.md` |
| `SECURITY_RULE` | `docs/qa/known-bug-patterns/` + the Reviewer checklist |
| `TESTING_RULE` | `.agent/context/testing-architecture.md` |

### 2. Write the implementation record
One file in `docs/knowledge/implementations/`, named
`YYYY-MM-DD-<feature-slug>.md`. This is history — append, never rewrite.

Record what changed, why, the branch, the commit range, the QA run path and the
Reviewer verdict. Keep it short: it is an index into git, not a copy of it.

### 3. Update evergreen module knowledge
`docs/knowledge/modules/<module>.md` is **updated in place**, not appended.
Durable facts only: rules that hold beyond this change, constraints a future
agent must respect, gotchas discovered.

Never paste code. Reference `path/to/file.ts:line`. Pasted code goes stale
silently — that is the `doc-code-drift` pattern.

### 4. Update the context layer if architecture moved
If the change makes an `.agent/context/*.md` statement wrong, correct it **and**
bump its `Last verified` date and commit. If the correction is out of scope for
this task, record a context-update recommendation in the implementation record
instead of leaving a known-false document.

### 5. Feed the QA loop
For a material defect: regression entry, bug pattern, prevention rule. See
[`docs/qa/README.md`](../../docs/qa/README.md).

### 6. Sync
Run `node scripts/sync-obsidian.mjs` to publish `docs/knowledge/` and `docs/qa/`
into the vault's `Generated/` folders. See
[`docs/development/obsidian-workflow.md`](../../docs/development/obsidian-workflow.md).

## Expected output

- One implementation record (new)
- Zero or more module knowledge files (updated in place)
- Zero or more ADRs, bug patterns, regression entries
- Zero or more context files corrected, with refreshed verification metadata
- A one-line summary of what was captured, for the final report

## Stop conditions

- Nothing durable was learned → record nothing and say so. An empty capture is a
  valid outcome and better than manufactured content.
- The task did not complete review and QA → do not capture yet.
- A discovered fact contradicts existing knowledge and you cannot tell which is
  right → record the conflict and flag it; do not overwrite.

## Validation

- Every new file sits under `docs/knowledge/` or `docs/qa/` — agents never write
  directly into the Obsidian vault
- No pasted source code
- Module knowledge updated in place, not duplicated
- Every referenced path exists

## Evidence requirements

The final report's "Knowledge Updated" section lists every file written or
updated, with its category.
