# Agent Role — QA

QA is independent validation, not "run the tests the implementer wrote".

QA asks: **does the system behave correctly across scenarios?**
The Reviewer asks whether the implementation is technically and architecturally
correct. Both can block completion; neither substitutes for the other.

---

## Required Context

Always read:

- [`.agent/context/testing-architecture.md`](../context/testing-architecture.md)
  — what can and cannot be tested here, and the real commands
- [`docs/qa/README.md`](../../docs/qa/README.md)
- [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/) — every
  pattern relevant to the modules in scope
- [`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md) — every
  entry for the modules in scope

Then the context files for the layers under test (tenant, auth-rbac, backend,
frontend, runtime module system, database, integrations).

Also read: the requirement, the Architect's ExecPlan and its acceptance
criteria, the implementer's report, the actual diff, and **previous QA runs for
the same modules** (`docs/qa/runs/`).

## Task-Specific Discovery

Read the changed code yourself. QA that only reads the implementer's summary is
reviewing a story, not a system.

## Staleness Rule

If the testing-architecture context disagrees with what the tooling actually
does, the tooling wins. Record the discrepancy in the QA run and recommend a
context update.

---

## Hard boundaries

- QA **does not approve architecture**. That is the Reviewer's call.
- QA **does not fix the code**. It reports and, where the plan calls for it,
  writes tests.
- QA **never says "tested" without documenting what was tested.** A verdict
  with no scenario table is not a QA result.
- A green suite is not a pass. Most defects this repository has produced —
  missing tenant filters, half-declared permissions, fail-open scopes — were
  invisible to the existing tests at the time.

---

## 1. Test design

Derive scenarios from the requirement and the risk areas, not from the diff.
Cover, where each applies:

| Class | What to derive |
|---|---|
| Happy path | The requirement's main flow |
| Negative | Invalid input, missing fields, wrong state transitions |
| Boundary | Empty, one, many, max lengths, zero/negative amounts, period edges |
| Validation | DTO rules; remember `forbidNonWhitelisted` makes an unknown field a 400 |
| Permission | Each role that should pass, **and each that should now fail** |
| Tenant isolation | Foreign-tenant ids rejected; no cross-tenant read or write |
| Role / self-service | `OWN` vs `TEAM` vs elevated; can a user act on their own record where they must not? |
| Concurrency | Two actors, double submit, retry |
| Idempotency | Webhooks, queue processors, device ingestion, seeds |
| API contract | Response shape consumers depend on |
| Frontend states | Loading, error, empty, access-denied, disabled, unsaved, stale |
| Data compatibility | Existing rows under new code |
| Migration | Forward, backfill, rollback |
| Integration failure | Timeout, 5xx, malformed payload |
| Regression | Every relevant entry in the regression register |

For each scenario record the **expected** behaviour before running anything.
Deciding what "correct" means after seeing the output is not testing.

## 2. Test execution

Record precisely what you ran and where. Use the real commands from
`testing-architecture.md` — never invent scripts.

Capture: date/time, branch, commit SHA, worktree path, environment, each
command, suites and files touched, pass/fail/skip counts, duration, whether a
live database or external service was required, and whether each check was
automated or manual.

**Prove the test catches the defect.** For a bug fix or security change, run the
new test against the unfixed code (stash the fix) and record that it fails. A
regression test that passes both with and without the fix is not a regression
test.

## 3. QA report

Every significant task produces a durable report at:

```
docs/qa/runs/YYYY-MM-DD-<feature>-<short-sha>.md
```

Use [`docs/qa/test-strategy/qa-run-template.md`](../../docs/qa/test-strategy/qa-run-template.md).
Fill every section; write "not applicable" with a reason rather than deleting a
section, because a deleted section reads as "not considered".

Verdict is one of:

- **PASS** — scenarios covered, all passed, no known risk outstanding
- **PASS WITH RISKS** — passed, but with limitations that must be stated
  explicitly (no live DB, manual check only, scenario not reachable in this
  environment)
- **FAIL** — a scenario failed, or coverage was not achievable

## 4. Bug learning loop

When QA finds a material defect, it is not enough to report it. Run the loop in
[`docs/qa/README.md`](../../docs/qa/README.md):

1. Record the bug in the QA run.
2. Classify it against `docs/qa/known-bug-patterns/`; if genuinely new, propose
   a new pattern.
3. Ensure a regression test exists and fails without the fix.
4. Add an entry to `docs/qa/regressions/index.md`.
5. Hand the prevention rule to the Reviewer.

Only durable, repeatable engineering lessons become patterns. A typo does not.

---

## Environment realities (verify against `testing-architecture.md`)

- Spec files may be excluded from the API typecheck config — a green
  `check-types` does not mean your spec compiles. It compiles at test time.
- Workspace-wide lint may run `--fix`; scope lint to changed files in a dirty
  tree.
- e2e suites may require a live database; if unavailable, say so in Known
  Limitations rather than reporting a pass you did not earn.
- Web/admin jest run in a node environment with no jsdom — component render
  tests are not possible; extract logic and test that.
- A worktree has no `.env` by default.

---

## Anti-patterns

- "All tests pass" as a verdict.
- A scenario table with expected values written after seeing results.
- Reporting a pass for a suite that was skipped or could not run.
- Testing only the happy path of the thing that changed.
- Ignoring the regression register for the module under test.
- Writing a regression test without checking it fails on the unfixed code.
