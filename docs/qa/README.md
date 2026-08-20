# QA System

QA in DijiPeople is a first-class engineering role, not a step at the end.

It exists because the defects this repository actually produces — a missing
`tenantId` filter, a permission declared in one family and not the other, a
scope that fails open, sensitive fields behind the wrong authorization — are
**invisible to a passing test suite**. Every one of those shipped past green
tests before the framework existed.

Role definition: [`.agent/agents/qa.md`](../../.agent/agents/qa.md).

---

## Structure

```
docs/qa/
├── README.md                  this file — the loop
├── test-plans/                one evergreen plan per product area — what must ALWAYS be true
├── scenarios/                 reusable, id'd tests — QA-AUTH-001, QA-TENANT-002, …
├── coverage-matrix.md         generated — what is covered, per area, per dimension
├── runs/                      one file per QA execution, timestamped history
├── regressions/index.md       the regression register: what broke, and the test that guards it
├── known-bug-patterns/        defect classes this repository produces, with prevention rules
└── test-strategy/             templates and standing guidance
```

**Runs are history** — timestamped, never edited after the fact.
**Plans, scenarios, regressions and patterns are evergreen** — updated in place
as knowledge improves.
**The coverage matrix and the two indexes are generated** — `node
scripts/rebuild-qa.mjs`. Never edit them by hand.

### Start here, not from a blank page

QA used to design its scenarios from scratch on every task. Before designing
anything:

```bash
node scripts/qa-select.mjs services/api/src/modules/<module>
```

That returns the plans, the reusable scenarios, the regressions they guard, the
open records on the same ground, the bug patterns, and the coverage gaps this
change would walk over unprotected. Execute the impacted scenarios, then design
for what is genuinely new — and promote anything with durable value into
`scenarios/`.

Full rules: [`../../.agent/context/qa-persistence.md`](../../.agent/context/qa-persistence.md).

### And, outside this folder

```
docs/bugs/          one record per defect: evidence, severity, status, resolution
docs/backlog/       what is outstanding and what was decided — indexes generated
```

A QA run records **what was tested**. A bug record records **what is wrong and
what is being done about it**, and it is the one a future agent reads before
touching that module. Every material finding produces both.

They are not alternatives, and neither is optional. See
[`../bugs/README.md`](../bugs/README.md).

---

## The bug learning loop

This is what makes the system stronger over time rather than merely busy. It is
**mandatory for material defects** — not for typos.

```
QA finds a defect
   │
   ├─ 0. Create a durable record — docs/bugs/BUG-nnnn
   │        node scripts/new-bug.mjs "<title>" --severity … --type …
   │        evidence, reproduction, severity, linked QA scenario id
   │        (already recorded? UPDATE that record instead)
   │        then: node scripts/rebuild-backlog.mjs
   │
   ├─ 1. Record it in the QA run (docs/qa/runs/…)
   │
   ├─ 2. Classify against docs/qa/known-bug-patterns/
   │        matches an existing pattern → note which
   │        genuinely new class        → propose a new pattern file
   │
   ├─ 3. Ensure a regression test exists
   │        and PROVE it fails without the fix
   │
   ├─ 4. Add an entry to docs/qa/regressions/index.md
   │
   ├─ 5. Update the pattern's prevention rule if the defect taught us something
   │
   ├─ 6. Feed it forward:
   │        Architect → triages the record (BACKLOG_POST_QA_TRIAGE) and owns
   │                    its priority and disposition. QA never sets those.
   │        Reviewer  → enforces the prevention rule; tags a repeat
   │                    REPEATED_REGRESSION at raised severity
   │        Specialists → load it as KNOWN_MISTAKES_TO_AVOID before coding
   │
   └─ 7. Close the loop on retest:
            Status FIXED → VERIFIED, ResolvedAt set, RegressionId linked
```

Step 0 is what stops a finding evaporating with the session. **A defect listed
only in a report will be found again**, at full cost, by someone who had no way
to know it was already known.

Step 3 is the one most often skipped and the one that matters most. A regression
test that passes both with and without the fix is not a regression test; it is
decoration.

### The full loop, from a user-reported bug

The version above starts at "QA finds a defect". When the **user** reports one,
the loop is longer and every stage is standard behaviour, not a special request:

```
USER REPORTS BUG
   ↓  Architect reproduces and understands it (not just the symptom)
   ↓  QA defines the failing scenario
   ↓  Regression proves the failure BEFORE the fix exists
   ↓  Specialist fixes the ROOT CAUSE
   ↓  QA proves the fix
   ↓  Reviewer checks whether it generalises
   ↓  Bug classified (USER_FEEDBACK_CLASS = BUG_REGRESSION)
   ↓  Regression register updated
   ↓  Known bug pattern updated if reusable
   ↓  Knowledge captured
   ↓  Obsidian synced
   ↓  Future Architect / QA / Reviewer load it automatically
```

The user should never have to say "don't make this mistake again" — the loop is
what makes that unnecessary.

### Root cause over symptom

For any bug task, do **not** patch only the visible failure. Establish:

- the **immediate failure** — what the user saw
- the **root cause** — why it happened
- whether that root cause **affects other modules**
- whether a **shared abstraction is wrong** rather than one call site
- whether the regression test should be **generic or module-specific**

**If the root cause is in shared code, fix it there** — and QA must then test at
least one *additional* affected path where practical. A shared fix verified on
only the reported path is a shared fix that was never really verified.

> This repository has already produced this shape: `readTeam` meaning
> "tenant-wide" was not an approvals bug, it was a scope-resolution bug that
> surfaced in approvals and attendance both.

---

## When a QA run is required

| Change | QA run required? |
|---|---|
| Authorization, permissions, tenant scoping | **Yes, always** |
| Payroll, attendance, timesheet or approval logic | **Yes, always** |
| Schema change or migration | **Yes, always** |
| Integration / gateway / webhook | **Yes, always** |
| New API endpoint or contract change | **Yes** |
| New product screen | **Yes** |
| Localised bug fix with a regression test | Short-form run |
| Copy, styling, comment, docs | No |

The Architect states `QA_REQUIRED` in the plan. When in doubt, run it — an
unnecessary QA run costs minutes; a missing one costs an incident.

### A run **file** is required whenever validation actually happened

Independently of the table above, write a file under `docs/qa/runs/` if the task
involved any of:

- live database validation
- API endpoint checks
- role, permission or security validation
- migration validation
- UI tests
- negative-path tests

**Validation reported only in a chat response is not a QA record** — it is gone
when the session ends, and the next agent working the same module has nothing to
read. A task with extensive validation and no run file cannot record
`QA_STATUS = PASS` under
[`.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

Scaffold one with `node scripts/new-qa-run.mjs`.

---

## Filenames

```
docs/qa/runs/YYYY-MM-DD-<feature-slug>-<short-sha>.md
```

e.g. `docs/qa/runs/2026-08-14-compensation-authorization-13e720e.md`

The short SHA ties the run to the exact code tested. A run without a commit is
not reproducible and is not evidence.

Helper: `node scripts/new-qa-run.mjs <feature-slug>` scaffolds the file with
metadata filled in from git.

---

## Verdicts

| Verdict | Meaning |
|---|---|
| **PASS** | Scenarios designed and executed, all passed, no outstanding known risk |
| **PASS WITH RISKS** | Passed, but with limitations stated explicitly — no live DB, manual only, a scenario unreachable in this environment |
| **FAIL** | A scenario failed, or required coverage was not achievable |

"PASS WITH RISKS" is a legitimate and common outcome in this repository, because
e2e suites need a live database that agent environments often lack. **Use it
honestly rather than reporting a PASS you did not earn.**

---

## What QA must never do

- Report "tested" without a scenario table.
- Report a pass for a suite that was skipped or could not run.
- Decide expected behaviour after seeing the output.
- Skip the regression register for the module under test.
- Approve architecture — that is the Reviewer's call.
