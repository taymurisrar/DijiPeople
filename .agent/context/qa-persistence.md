# QA Persistence — durable test plans, scenarios and coverage

> **Last verified:** 2026-08-16
> **Verified against commit:** 714632d
> **Key source files:** scripts/lib/qa-records.mjs, scripts/rebuild-qa.mjs, scripts/qa-select.mjs, scripts/new-qa-scenario.mjs, scripts/new-test-plan.mjs, docs/qa/test-plans/, docs/qa/scenarios/, docs/qa/coverage-matrix.md, docs/qa/regressions/index.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

QA used to start from nothing on every task. A run file recorded what somebody
tested once; nothing recorded what should **always** be tested for an area. So
the next agent designed its scenarios again, missed the ones the previous agent
had found the hard way, and the regression register was the only memory in the
system.

Three durable artifacts fix that, and one command selects from them.

```
docs/qa/test-plans/       one evergreen plan per product area
docs/qa/scenarios/        reusable, id'd tests
docs/qa/coverage-matrix.md   generated — what is actually covered, per dimension
```

```bash
node scripts/qa-select.mjs services/api/src/modules/auth
```

---

## Test plans

One per area, updated in place, never re-created per task. Twelve exist:

`authentication` · `authorization` · `tenant-isolation` ·
`commercial-onboarding` · `lead-management` · `partner-lifecycle` ·
`tenant-provisioning` · `agent-desktop` · `attendance` · `payroll` ·
`runtime-modules` · `deployment-release`

Required sections — all present, or `rebuild-qa.mjs` fails:

```
Scope · Risks · Preconditions · Test Types · Data Requirements
Security Cases · Negative Cases · State Transitions
Integration Cases · Browser Cases · Regression Links
```

A plan is derived from **evidence** — bug records, the regression register, the
known bug patterns, the code — and never from what the area ought to do. A plan
that describes intended behaviour is a specification wearing a test plan's
filename, and it will be read as coverage.

Each plan **declares** its coverage per dimension:

```
COVERAGE_UNIT · COVERAGE_API · COVERAGE_DATABASE · COVERAGE_INTEGRATION
COVERAGE_E2E · COVERAGE_BROWSER · COVERAGE_SECURITY · COVERAGE_PERFORMANCE
```

with `GOOD` · `PARTIAL` · `GAP` · `NOT_APPLICABLE`.

---

## Scenarios

A scenario is one reusable test with a stable id — `QA-AUTH-001`,
`QA-TENANT-002`, `QA-PAY-003` — so "the tenant-isolation case for error logs" is
a thing that can be selected and re-run, not a thing somebody has to think of
again.

```
SCENARIO_ID  TITLE  AREA  MODULE  TYPE  RISK
AUTOMATION_STATUS  TEST_REFERENCE
RELATED_BUGS  RELATED_REGRESSIONS
LAST_RUN  LAST_RESULT
```

Body: `Preconditions` · `Steps` · `Expected Result` · `Notes`.

**Expected Result is written before the scenario runs.** Deciding what correct
means after seeing output is not testing.

`AUTOMATION_STATUS` is `AUTOMATED` · `PARTIAL` · `MANUAL` ·
`BLOCKED_INFRASTRUCTURE`. The last is a first-class value, not an omission: this
repository has no browser automation and no always-available database, and a
scenario that quietly disappears because it cannot run is how a coverage matrix
comes to describe a system nobody tests.

---

## The checks that make this more than filing

`node scripts/rebuild-qa.mjs` fails on each of these, and each exists because
the corresponding lie is easy to tell:

| Check | Prevents |
|---|---|
| An `AUTOMATED` or `PARTIAL` scenario's `TEST_REFERENCE` must exist on disk | The `declared-but-unwired-step` pattern applied to QA's own records — coverage reported for a test nobody wrote, or one that moved |
| A scenario's `AREA` must match a plan | A scenario nothing ever selects |
| `COVERAGE_X = GOOD\|PARTIAL` requires at least one scenario of the mapped type | A matrix cell with nothing behind it |
| `COVERAGE_X = GOOD` fails if every scenario of that type is `BLOCKED_INFRASTRUCTURE` | Coverage that cannot execute being called good |
| `RELATED_BUGS` must resolve to a real record; `RELATED_REGRESSIONS` to a register entry | Links that decorate rather than connect |
| Duplicate plan or scenario ids | Two records answering to one name |

The first of those is the one that earns its keep. It is how TASK-0004 found
`BUG-0047`: writing `AUTOMATED` scenarios required real test paths, five of the
regression register's did not resolve, and following that back showed six
`VERIFIED` bug records whose fixes had never merged.

---

## Re-run behaviour — QA does not start from zero

Before designing anything, QA loads what already applies:

```bash
node scripts/qa-select.mjs services/api/src/modules/attendance
```

which returns, for the modules in scope:

```
TEST_PLANS           the evergreen plans for the areas touched
SCENARIOS_TO_RERUN   every reusable scenario for those areas
MANDATORY            SECURITY type and CRITICAL risk — never risk-weighted down
REGRESSIONS          the REG-nnn entries those scenarios guard
OPEN_RECORDS_HERE    what is already known to be wrong on this ground
BUG_PATTERNS         the defect classes this repository produces here
COVERAGE_GAPS        the dimensions this change would walk over unprotected
```

Then QA executes the impacted scenarios. Selection is by **module and risk**, not
"everything": a regression suite that runs everything every time gets skipped
when it is slow, which is worse than a smaller one that always runs.

The run states which scenarios it considered and deliberately excluded.

---

## Adaptive behaviour — QA still designs

Selection is a starting point and **never a boundary**.

```
CHANGE_IMPACT + TEST_PLAN + SCENARIOS + REGRESSIONS + BUG_PATTERNS + NEW_BEHAVIOR
    = CURRENT QA SCOPE
```

New behaviour gets new scenarios, designed from the requirement and the risk
areas rather than from the diff. A risk the specialist's handoff omitted is not
thereby untested.

### Promotion

A new scenario becomes permanent when it has durable value:

- it guards a fixed defect;
- it covers a security or tenant-isolation case;
- it is a state transition somebody will get wrong again;
- it is a contract a deployed client depends on.

```bash
node scripts/new-qa-scenario.mjs "<title>" --scope TENANT --area tenant-isolation \
  --type SECURITY --risk CRITICAL --module services/api/src/modules/x \
  --automation AUTOMATED --test services/api/src/modules/x/x.spec.ts \
  --bug BUG-nnnn --regression REG-nnn
node scripts/rebuild-qa.mjs
```

**A one-off check stays in the run file.** Promoting everything turns the
registry into noise and nobody re-runs any of it.

---

## The coverage matrix

[`docs/qa/coverage-matrix.md`](../../docs/qa/coverage-matrix.md) is generated
from the plans' declarations, cross-checked against their scenarios.

It is generated from **declarations, not counts**. A count would report good
coverage for an area with fifty shallow scenarios and none for an area with
three that matter. What the generator does instead is refuse to publish a
declaration the scenarios contradict.

### What a gap obliges

> **When a task touches an area whose coverage on an affected dimension is
> `GAP` or `PARTIAL`, closing it becomes part of that task's scope.**

Where that is too large to absorb, the task files a `TEST_GAP` backlog item
instead — and says so. What it may not do is change the area and leave the gap
unmentioned.

---

## The regression rule

Every fixed material bug gets regression coverage that, where practical:

```
FAILS on the unfixed code   ·   PASSES on the fixed code
```

A test that passes both ways is not a regression test. The chain is linked in
both directions:

```
BUG ↔ REGRESSION ↔ SCENARIO ↔ AUTOMATED TEST ↔ QA RUN
```

`RELATED_BUGS` and `RELATED_REGRESSIONS` on the scenario, `RegressionId` on the
bug record, the test path in the register — and `rebuild-qa.mjs` checks that
each resolves.

**Closed regressions stay in future QA.** A regression whose scenario stops
being selected is a defect waiting to return.

---

## Anti-patterns

- Designing scenarios without running `qa-select` first.
- Marking a scenario `AUTOMATED` and pointing it at a test that does not exist.
- Declaring `COVERAGE_BROWSER: GOOD` in a repository with no browser tooling.
- Rounding `BLOCKED_INFRASTRUCTURE` up to a pass.
- Promoting every one-off check into the registry.
- Writing the expected result after seeing the output.
- Touching an area with a declared `GAP` and not mentioning it.
