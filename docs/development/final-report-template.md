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

| ID | Severity | Bug pattern | Regression entry |
|---|---|---|---|

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
