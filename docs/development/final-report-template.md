# Final Engineering Report — <task>

> Template for the report that closes any substantial agent-driven task. Its
> purpose is auditability: six months from now, this report plus the linked QA
> run and diff should explain what happened without anyone reconstructing it.
>
> Write "Not applicable — <reason>" rather than deleting a section.

## Request

What was asked, in the requester's terms. Link the requirement note if one
exists.

## Architect Summary

The plan's key decisions, and the FACT / INFERENCE / PROPOSAL calls that shaped
them. Link the ExecPlan. Note anything the plan got wrong once implementation
began — a silently abandoned plan is worse than no plan.

## Agents Used

| Agent | Why | Deliberately not used |
|---|---|---|

Naming who was *not* used, and why, is as informative as who was.

## Worktrees / Branches

| Branch | Worktree | Scope |
|---|---|---|

State the base commit and confirm the framework baseline was present on it.

## Implementation

What changed, in engineering terms. Reference the existing patterns reused
rather than describing new ones.

## Files Changed

| File | Reason |
|---|---|

**Separately** list any pre-existing dirty files that were *not* touched, so a
reader can tell your diff from the working tree's noise.

## Architecture Decisions

Decisions made during implementation that were not in the plan, with reasons.
Anything durable becomes an ADR in `docs/decisions/`.

## Tests Added

| Test file | Scenarios covered | Fails without the fix? |
|---|---|---|

The last column is not optional for a bug fix or security change.

## QA Run

Path to `docs/qa/runs/YYYY-MM-DD-<feature>-<sha>.md` and the verdict
(PASS / PASS WITH RISKS / FAIL). If PASS WITH RISKS, restate the risks here.

## Validation

| Command | Result | Explanation |
|---|---|---|

Use the real commands from `.agent/context/testing-architecture.md`. State which
were **not** run and why. Distinguish a pre-existing failure from a new one, with
evidence.

## Reviewer Findings

CRITICAL / HIGH / MEDIUM / LOW, with file and line. Include the verdict and what
was accepted as a follow-up rather than fixed.

## Bugs Found

| Bug ID | Severity | Disposition | Architect triage | Bug pattern | Regression entry |
|---|---|---|---|---|---|

Every row must have a `BUG-nnnn` under `docs/bugs/`. **A defect listed here with
no record is a defect that will be found again** — the report is read once; the
record is read by everyone who touches that module afterwards.

`Disposition` is QA's (`FIXED` / `OPEN` / `DEFERRED` / `BLOCKED` /
`PRODUCT_DECISION` / `ACCEPTED_RISK` / `NOT_A_BUG` / `DUPLICATE`).
`Architect triage` is the Architect's (`FIX_NOW` / `PLAN_REQUIRED` / `DEFER` /
`PRODUCT_DECISION` / `BLOCKED_EXTERNAL` / `ACCEPTED_RISK` / `DUPLICATE` /
`NOT_A_BUG` / `DONE`). Neither role fills the other's column.

## Backlog Changes

| ID | Title | Before → After | Why |
|---|---|---|---|

Records created, advanced or closed by this task, bugs included. State the
counts `node scripts/rebuild-backlog.mjs` reported, and confirm the indexes were
regenerated.

## Regression Coverage

Which `docs/qa/regressions/index.md` entries were re-checked, and which new ones
were added.

## Known Limitations

What could not be verified in this environment — no live database, no external
service, no jsdom. Be specific; this is what makes the verdict trustworthy.

## Knowledge Updated

| File | Category |
|---|---|

Categories: DECISION, DOMAIN_RULE, ARCHITECTURE_CHANGE, BUG_LESSON, REGRESSION,
INTEGRATION_RULE, UI_PATTERN, SECURITY_RULE, TESTING_RULE.

If nothing durable was learned, say so — an empty capture is a valid outcome.

## Obsidian Sync

Whether `node scripts/sync-obsidian.mjs` was run, and which `Generated/` folders
were updated.

## Remaining Risks

Explicitly out of scope, so nobody assumes it was handled.

## Recommended Next Step

**One** recommendation, justified by impact — not a list.

## Task Finalization

**Mandatory.** Every substantial task ends with this block. It is what makes the
difference between "the code is written" and "the work landed" visible at a
glance, and `scripts/validate-framework.mjs` fails if this section is removed.

Generate the facts with `node scripts/finalize-agent-task.mjs`, then evaluate
them against
[`.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

```
TASK_STATUS:
TARGET_BRANCH:
SHARED_TARGET:
TASK_BRANCH:
BASE_SHA:
FINAL_TASK_SHA:
MERGE_SHA:
FINAL_TARGET_SHA:
REMOTE_PUSH:
REMOTE_CI:
CI_RUN_ID:
MERGE_AUTHORIZATION:
POST_MERGE_VALIDATION:
QA_REPORT:
QA_FINDINGS_CLASSIFIED:
BUG_RECORD_STATUS:
ARCHITECT_TRIAGE_STATUS:
BACKLOG_UPDATE_STATUS:
ENGINEERING_HISTORY:
KNOWLEDGE_CAPTURE:
OBSIDIAN_SYNC:
DASHBOARD_STATUS:
WORKTREE_CLEANUP:
BRANCH_CLEANUP:
```

**If any field is unresolved, explain why** — in the field itself, not in a
footnote. An unresolved field is a legitimate outcome; an omitted one is a false
report.

`SHARED_TARGET` and `MERGE_AUTHORIZATION` are what make the CI gate auditable
after the fact. Where `SHARED_TARGET: true`, `MERGE_AUTHORIZATION` must read
`AUTHORIZED` and name the SHA whose CI verdict was read. Anything else means the
merge should not have happened — which is only discoverable later if the report
recorded it.

`TASK_STATUS` is one of `COMPLETE`, `COMPLETE_WITH_UNVERIFIED_CI` (never for a
shared merge), `COMPLETE_WITH_DOCUMENTATION_WARNING`,
`IMPLEMENTATION_COMPLETE_BUT_UNMERGED`, `BLOCKED_FINALIZATION`, `BLOCKED` or
`FAILED`. It is never asserted before the contract has been evaluated.
