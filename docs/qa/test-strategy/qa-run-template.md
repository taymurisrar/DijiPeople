# QA Run — <feature or change>

> Copy to `docs/qa/runs/YYYY-MM-DD-<feature-slug>-<short-sha>.md`, or scaffold
> with `node scripts/new-qa-run.mjs <feature-slug>`.
>
> Fill every section. Write "Not applicable — <reason>" rather than deleting a
> section; a deleted section reads as "not considered".

## Metadata

| | |
|---|---|
| Date / time | |
| Branch | |
| Commit SHA | |
| Worktree | |
| Environment | local / worktree; DB available? external services available? |
| QA agent | |
| Scope | what was and was not covered |

## Requirement

What the change is meant to achieve, in one paragraph. Link the ExecPlan.

## Risk Areas

Where this change could plausibly break something, and why. Reference the
relevant `docs/qa/known-bug-patterns/` entries and any
`docs/qa/regressions/index.md` entries for the modules in scope.

## Scenarios

Expected behaviour is written **before** execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | | happy / negative / boundary / permission / tenant / role / concurrency / idempotency / contract / UI-state / migration / regression | | PASS / FAIL / BLOCKED | test name, output, or file:line |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|

Use the real commands from
[`.agent/context/testing-architecture.md`](../../../.agent/context/testing-architecture.md).
Never invent a script.

### Regression-test proof

For a bug fix or security change, show the new test **failing without the fix**:

| Test | With fix | Without fix (stashed) |
|---|---|---|
| | PASS | FAIL ← required |

A test that passes both ways is not a regression test.

## Manual Validation

What was checked by hand, how, and what was observed. If nothing was manual, say
so.

## Regression Checks

Which `docs/qa/regressions/index.md` entries apply to these modules, and the
result of re-checking each.

| Regression ID | Scenario | Result |
|---|---|---|

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|

For each material bug, run the loop in [`../README.md`](../README.md).

## Known Limitations

What could not be tested here and why — no live database, no external service,
no jsdom for component rendering, environment lacked `.env`. Be specific. This
section is what makes a verdict trustworthy.

## Final QA Verdict

**PASS** / **PASS WITH RISKS** / **FAIL**

One paragraph of justification. If PASS WITH RISKS, list the risks explicitly.

## Follow-up

Anything deferred, with an owner or a recommended next step.
