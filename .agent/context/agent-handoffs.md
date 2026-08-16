# Agent Handoffs — the required-agent matrix and rework routing

> **Last verified:** 2026-08-16
> **Verified against commit:** 714632d
> **Key source files:** .agent/agents/architect.md, .agent/agents/qa.md, .agent/agents/reviewer.md, .agent/agents/integrator.md, .agent/agents/release-devops.md, .agent/context/task-orchestration.md, .agent/context/task-completion-contract.md, scripts/validate-framework.mjs
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

**The user talks only to the Architect.** Nobody should ever have to name a
specialist, sequence them, or notice that one did not run. The Architect selects
the agents, dispatches them, validates each handoff, routes rework when a stage
rejects one, and refuses to report completion while a required agent is not
`PASS`.

The failure this exists to prevent is specific: a task completes, the report
reads well, and QA never ran — or ran, found something, and the Reviewer
accepted the implementation anyway because nothing forced it to look at the QA
verdict.

---

## The handoff contract

Every specialist ends its stage with a structured handoff. It is not a summary
for a human; it is the input the next stage accepts or rejects.

```
AGENT_STATUS             PASS | BLOCKED | FAILED
IMPLEMENTED              what was built
CHANGED_BEHAVIOR         what now behaves differently, including for existing callers
FILES_CHANGED            paths
RISK_AREAS               where this is most likely to be wrong
KNOWN_MISTAKES_AVOIDED   the retrieved defects this deliberately did not repeat
TESTS_ADDED              new coverage, and what it proves
TEST_HOOKS               ids, routes, fixtures and seeds the next stage can use
VALIDATION_RUN           the exact commands, and their results
UNRESOLVED               what was deliberately left, and why
HANDOFF_READY            true | false
```

`HANDOFF_READY: false` is a legitimate outcome. It means the stage finished and
its output is not fit to build on — which is information, and is far better than
a `true` that the next stage discovers is wrong.

---

## Acceptance is explicit

The next stage does not merely receive a handoff. It **accepts or rejects** it,
and says which:

```
QA_ACCEPTED_IMPLEMENTATION
REVIEWER_ACCEPTED_QA
INTEGRATOR_ACCEPTED_REVIEW
RELEASE_DEVOPS_ACCEPTED_INTEGRATION
```

Each has a rejecting counterpart — `QA_REJECTED_IMPLEMENTATION`, and so on.

A rejection carries **what would have to change** for acceptance. "Rejected" with
no criterion is a stall, not a gate.

### What each stage is accepting

| Stage | Accepts that… | Rejects when… |
|---|---|---|
| QA ← specialist | the change is testable and `CHANGED_BEHAVIOR` is complete enough to design against | behaviour changed that the handoff does not mention; no test hooks; the branch does not build |
| Reviewer ← QA | validation actually happened, with durable evidence | `QA_STATUS` is `BLOCKED_INFRASTRUCTURE` rounded up to a pass; findings with no record; no run file where one is required |
| Integrator ← Reviewer | there are no unresolved CRITICAL and no HIGH blockers | a blocker is open; a security-sensitive conflict was resolved without review |
| Release/DevOps ← Integrator | the work is genuinely on the integration branch, verified by ref | `MERGE_STATUS` is `BLOCKED_*`; the target ref was never read |

**QA does not accept its own handoff to itself**, and the implementing
specialist never accepts QA's. A stage that accepts its own output is not a
gate.

---

## The required-agent matrix

The Architect maintains one row per role for every substantial task.

| Agent | Required when |
|---|---|
| **Architect** | always |
| **Backend/API** | an API module, service, controller, DTO or guard changes |
| **Frontend** | an app surface changes |
| **UI/UX** | the change alters what a user sees or how they accomplish something |
| **Database** | `schema.prisma`, a migration, a constraint or a seed changes |
| **Integration** | a boundary changes — gateway, desktop agent, Stripe, device ingestion |
| **QA** | always, except for copy/comment/docs-only changes |
| **Reviewer** | always for code; docs-only changes may waive it |
| **Integrator** | **any task that modifies Git-tracked files** |
| **Release/DevOps** | every substantial task, for repository health — including tasks that deploy nothing |

Each carries exactly one status:

```
PASS · NOT_REQUIRED · BLOCKED · FAILED · HANDOFF_REJECTED · UNKNOWN
```

**A task may not reach `COMPLETE` while a required agent is not `PASS`.**
`UNKNOWN` is never a resting state — it means the Architect did not check, which
is the condition this matrix exists to make visible. `NOT_REQUIRED` needs a
stated reason; "QA_NOT_REQUIRED" on a task that changed an API response is a
false gate, not an exemption.

---

## Automatic specialist selection

The Architect runs impact analysis **before** dispatch, and the analysis
determines the roster — never a habit, and never the full roster because it
feels thorough.

```
AFFECTED_APPS            AFFECTED_SERVICES        AFFECTED_MODULES
AFFECTED_DATABASE_MODELS AFFECTED_API_CONTRACTS   AFFECTED_UI
AFFECTED_INTEGRATIONS    AFFECTED_SECURITY_BOUNDARIES
AFFECTED_TESTS           AFFECTED_DEPLOYMENTS
```

Worked examples:

| Change | Roster |
|---|---|
| API lifecycle bug | Backend/API · QA · Reviewer · Integrator · Release/DevOps |
| Prisma model + migration | Database → Backend/API · QA · Reviewer · Integrator · Release/DevOps |
| Tenant-product screen | UI/UX → Frontend · QA · Reviewer · Integrator · Release/DevOps |
| Desktop agent contract | Integration · Backend/API (if the API contract moves) · QA · Reviewer · Integrator · Release/DevOps |
| Documentation only | Architect · Integrator · Release/DevOps — QA and Reviewer `NOT_REQUIRED`, with the reason |

`→` means sequenced: Database before the API work that needs its regenerated
client; UI/UX specifies before Frontend implements.

**Spawning every specialist for every task is a defect, not thoroughness.** So
is omitting one and not saying so — the matrix requires a row either way.

---

## Rework routing

When a stage rejects a handoff, the Architect routes the work back. It does not
ask the user, and it does not accept the rejection as a task outcome.

```
Reviewer rejects the Backend implementation
  → Architect routes back to Backend with the rejection criteria
  → Backend re-implements
  → QA re-runs the impacted scenarios  (qa-select, not everything)
  → Reviewer re-reviews
  → Integrator proceeds only once every required agent is PASS
```

Three rules keep this from looping forever:

- **Every rejection names its acceptance criterion.** A stage that cannot say
  what would satisfy it has found a design problem, not a defect, and that is an
  Architect decision.
- **Rework re-runs the *impacted* scenarios**, selected with
  `node scripts/qa-select.mjs <modules>` — not the whole suite, which is how
  re-validation becomes something people skip.
- **The third rejection of the same handoff is escalated as a design question**,
  not attempted a fourth time.

---

## Completion supervision

Before a work package or a parent task may complete, the Architect validates:

```
REQUIRED_AGENTS        the matrix above, one row per role
AGENT_STATUSES         every row resolved, none UNKNOWN
HANDOFFS               every one accepted, or its rework completed
QA_STATUS              REVIEWER_STATUS
INTEGRATOR_STATUS      RELEASE_DEVOPS_STATUS
```

This is a distinct step from the completion contract's field list. The contract
asks *did each phase produce its output*; this asks *did each agent that should
have run actually run, and did the next one accept it*. A task can satisfy every
contract field while a required specialist was never dispatched — which is the
gap this closes.

---

## Anti-patterns

- Asking the user which agent to use.
- A handoff with `HANDOFF_READY: true` and an empty `CHANGED_BEHAVIOR`.
- Accepting a handoff implicitly by proceeding.
- Rejecting without naming what would be accepted.
- Marking a role `NOT_REQUIRED` with no reason.
- Leaving a role `UNKNOWN` and completing anyway.
- Re-running the entire test suite on every rework instead of the impacted
  scenarios.
- The implementing specialist deciding whether QA's finding counts.
