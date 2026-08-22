# Agent health, architecture stewardship and the improvement budget

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** scripts/agent-health.mjs, scripts/backlog-review.mjs, .agent/context/failure-adaptation.md, .agent/context/agent-handoffs.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

Agent health exists to detect **systemic role weakness** — a role that keeps
producing the same class of rework — so the fix can be a role improvement rather
than another individual correction.

It is not a scoreboard. Agents are not ranked, compared or optimised against
these numbers, and no decision is made from a count alone.

---

## What is measured, and from what

Health is derived from durable records. A self-reported metric measures
willingness to report, which is the one thing nobody needs measured.

| Signal | Derived from |
|---|---|
| `TASKS_ASSIGNED` | `AGENTS` on task records |
| `BUGS_OWNED` | `OwnerAgent` on bug records |
| `BUGS_CAUGHT` | `Source` on bug records — which role found it |
| `REPEATED_DEFECT_TYPES` | Same `Type` recurring against the same `OwnerAgent` |
| `USER_QUESTIONS` | `ASKED_BY_AGENT` on question records |
| `UNANSWERABLE_QUESTIONS` | Questions later `WITHDRAWN` — asked what the repo already answered |
| `ADAPTATIONS_CREATED` | Bug patterns and regressions attributed to a role |
| `UNOWNED_FINDINGS` | Records with no `OwnerAgent` |

Signals the records genuinely cannot support — `FIRST_PASS_SUCCESS`,
`HANDOFF_REJECTIONS`, `FALSE_PASS_COUNT`, `CI_FAILURES_CAUSED`,
`CONTEXT_OVERFLOW` — are **not fabricated**. `scripts/agent-health.mjs` reports
them as `NOT_DERIVABLE` with the reason, because a number invented to fill a
column is worse than an empty column: it gets trusted.

```bash
node scripts/agent-health.mjs
node scripts/agent-health.mjs --json
```

---

## What a signal is allowed to cause

```
one incident            →  nothing systemic; fix it and move on
a pattern with evidence →  AGENT_HEALTH_REGRESSION
```

An `AGENT_HEALTH_REGRESSION` runs the same chain as any other systemic change:

```
evidence  →  root cause  →  role improvement
          →  behavioural simulation
          →  Reviewer
          →  framework validation
```

The simulation is the part that matters. A role rule added without a check that
fails when the rule is violated is a rule that will be quietly dropped, and the
metric that prompted it will keep climbing.

**Do not gamify.** A role that starts filing more bugs to raise `BUGS_CAUGHT`,
or asking fewer questions to lower `USER_QUESTIONS`, has made the framework
worse in exactly the way the number cannot see.

---

## Architecture stewardship

Architecture is a continuous responsibility, not a task type. The Architect
considers, on every substantial task:

```
domain boundaries · single sources of truth · duplicated implementation
state machines · failure recovery · data consistency · tenant isolation
scalability · performance · observability · idempotency
operational complexity · future extensibility · technical debt · architecture debt
```

Every substantial task records one verdict:

```
ARCHITECTURE_IMPACT = NONE | IMPROVED | DEBT_CREATED | DEBT_REDUCED | FOLLOW_UP_REQUIRED
```

`DEBT_CREATED` is a legitimate outcome — deadlines are real — but it is only
legitimate **recorded**. Debt created and not written down is indistinguishable
from debt nobody noticed, and it is the Product & Backlog Steward's to track
from the moment it is declared.

`FOLLOW_UP_REQUIRED` must produce a backlog item in the same task. A follow-up
that exists only in a report is not a follow-up.

## The Architect increasingly orchestrates

Specialist-owned work belongs to the specialist:

```
schema and migrations      → Database owns the write
security-sensitive review  → Security owns the adversarial pass
material UI                → UI/UX owns interaction requirements and post-review
QA evidence                → QA owns scenario execution
shared-branch mutation     → Integrator
production promotion       → Release/DevOps
```

The Architect may inspect any boundary. When it *implements* across one anyway,
it records why:

```
ARCHITECT_DIRECT_IMPLEMENTATION_REASON = <why the owning specialist was not used>
```

The field exists because the drift is gradual and invisible: an Architect that
writes the migration itself each time is faster this task and has quietly
removed the review the Database role was providing. Recording the reason makes
the pattern visible before it becomes the norm.

---

## Improvement budget

Agents should notice things worth improving, and should not act on them inside
the current task.

```
IMPROVEMENT_BUDGET = 3 high-value proposals per meaningful task
```

Past three, the rest are deferred. Eleven suggestions is a reading list, not a
recommendation, and it costs the reader more than it returns.

Each carries `PROBLEM`, `EVIDENCE`, `EXPECTED_VALUE`, `EFFORT`, `RISK`, `OWNER`.
Evidence is what distinguishes a proposal from a preference.

```
idea  →  evidence  →  Steward  →  Architect evaluates  →  backlog | decision | reject
```

**Never silently expand the current task.** Scope that widens without being
asked is indistinguishable from a misread brief.
