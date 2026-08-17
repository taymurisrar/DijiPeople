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

### UI/UX hands off differently

The block above is shaped for a stage that *builds* something. UI/UX is
read-only in its default mode, so `IMPLEMENTED`, `FILES_CHANGED` and
`TESTS_ADDED` are empty for it — and a role whose every field is empty reads as
a role that did nothing, which is exactly how its findings used to disappear
between the specialist and the final report.

UI/UX therefore ends its stages with **its own block**, defined in
[`../agents/ui-ux.md`](../agents/ui-ux.md): `UI_UX_AGENT_STATUS`,
`SURFACES_REVIEWED`, `WHAT_WORKS_WELL`, the severity-banded finding fields,
`ACCESSIBILITY_FINDINGS`, `RESPONSIVE_FINDINGS`, `KNOWN_EXISTING_ISSUES` versus
`NEW_FINDINGS`, `SCREENSHOTS_OR_BROWSER_EVIDENCE`, `UI_UX_POST_REVIEW_STATUS`
and `HANDOFF_READY`.

Two rules travel with it:

- **An empty UI/UX handoff is not a `PASS`.** Every finding field empty, with no
  `WHAT_WORKS_WELL` and no `SURFACES_REVIEWED`, means the surface was not
  reviewed. `BLOCKED` is the honest status.
- **A `CRITICAL` or `HIGH` UI/UX finding carries a bug record id.** A severe
  finding that exists only as a sentence in a report is not something the
  project can act on, and the completion contract treats it exactly as it treats
  any unclassified QA finding.

---

## Acceptance is explicit

The next stage does not merely receive a handoff. It **accepts or rejects** it,
and says which:

```
FRONTEND_ACCEPTED_UI_UX
UI_UX_ACCEPTED_IMPLEMENTATION
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
| Frontend ← UI/UX | the specification is buildable: states, responsive intent and accessibility requirements are stated, and the components to reuse are named | a state is unspecified; the design needs a runtime capability that does not exist; no acceptance criteria to build against |
| UI/UX ← Frontend (Stage 2) | the built journey matches what was specified, verified against the running UI | the journey breaks at a viewport; a specified state is missing; an accessibility requirement is unmet; the handoff claims a browser check that did not happen |
| QA ← specialist | the change is testable and `CHANGED_BEHAVIOR` is complete enough to design against | behaviour changed that the handoff does not mention; no test hooks; the branch does not build |
| Reviewer ← QA | validation actually happened, with durable evidence | `QA_STATUS` is `BLOCKED_INFRASTRUCTURE` rounded up to a pass; findings with no record; no run file where one is required |
| Integrator ← Reviewer | there are no unresolved CRITICAL and no HIGH blockers | a blocker is open; a security-sensitive conflict was resolved without review |
| Release/DevOps ← Integrator | the work is genuinely on the integration branch, verified by ref | `MERGE_STATUS` is `BLOCKED_*`; the target ref was never read |

**QA does not accept its own handoff to itself**, and the implementing
specialist never accepts QA's. A stage that accepts its own output is not a
gate.

**Frontend does not accept its own UI/UX post-review** either, for the same
reason. UI/UX appears twice in the table deliberately: once handing a
specification to Frontend, and once judging what Frontend built. Without the
second row the specification is advisory, and an advisory gate is not a gate.

---

## The required-agent matrix

The Architect maintains one row per role for every substantial task.

| Agent | Required when |
|---|---|
| **Architect** | always |
| **Backend/API** | an API module, service, controller, DTO or guard changes |
| **Frontend** | an app surface changes |
| **UI/UX** | the change touches user-facing layout, forms, dialogs, navigation, dashboards, tables, mobile/responsive behaviour, accessibility, onboarding journeys, public landing pages, destructive actions, loading/error/empty states, visual consistency or conversion flows — see [`../agents/ui-ux.md`](../agents/ui-ux.md). Carries **two** statuses: `UI_UX_AGENT_STATUS` and, once Frontend has built, `UI_UX_POST_REVIEW_STATUS` |
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
UI_UX_AGENT_STATUS     UI_UX_POST_REVIEW_STATUS
```

For any task where UI/UX was required, the Architect's final report **quotes the
UI/UX handoff**: surfaces reviewed, the finding counts by severity, the most
important findings with their record ids, and the post-review verdict. "UI/UX
Agent reviewed" is not a report of a review — it is a claim that one happened,
and the user cannot tell the two apart.

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
- Marking UI/UX `NOT_REQUIRED` on a task that changed a form, a navigation, a
  responsive layout or a public page.
- A UI/UX handoff that is `PASS` with every finding field empty.
- A `CRITICAL` or `HIGH` UI/UX finding with no bug record id.
- Reporting "UI/UX reviewed" without showing what it found.
- Frontend reporting complete while its required UI/UX post-review is `FAILED`
  or was never run.
- Re-running the entire test suite on every rework instead of the impacted
  scenarios.
- The implementing specialist deciding whether QA's finding counts.
