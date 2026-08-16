# Task Orchestration — sizing, work packages and autonomous continuation

> **Last verified:** 2026-08-16
> **Verified against commit:** 6cfac5c
> **Key source files:** scripts/new-task.mjs, scripts/rebuild-tasks.mjs, scripts/lib/task-records.mjs, docs/tasks/README.md, .agent/agents/architect.md, .agent/context/task-completion-contract.md, .agent/context/task-router.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

The Architect is the **task orchestrator**. For every `DijiPeople Task:` it:

1. classifies intent — [`task-router.md`](task-router.md)
2. classifies size — [below](#task-size)
3. retrieves relevant knowledge — `RELEVANT_KNOWLEDGE_RETRIEVAL`
4. inspects the backlog — `BACKLOG_PRECHECK`
5. chooses the specialists the work actually needs
6. creates the execution plan — [`PLANS.md`](../../PLANS.md)
7. executes automatically
8. **continues until the work is complete or genuinely blocked**

Step 8 is the one that has to be stated. An orchestrator that finishes a work
package and then asks whether to carry on has converted a task into a
conversation, and the user pays for the round trip every time.

---

## Task size

Size decides whether the task needs a durable parent record. Classify by
**dependency and architectural scope**, never by file count — a 40-file
rename is SMALL, and a 3-file change to `PermissionsGuard`, `rbac-matrix.ts` and
a seed is not.

| Size | Shape | Parent record |
|---|---|---|
| `SMALL` | One bounded change with one owner | No |
| `MEDIUM` | 2–3 meaningful areas, or work packages with a real dependency between them | Optional — create one if the task will outlive a single session |
| `LARGE` | 4–8 work packages | **Required** |
| `PROGRAM` | Multiple phases, or several parent tasks under one goal | **Required**, plus a parent-of-parents |

The questions that actually decide it:

- How many **architectural layers** must change together — schema, API, runtime
  registry, frontend, integration?
- Is there a **single-writer file** in scope (`schema.prisma`,
  `permissions.ts`, `rbac-matrix.ts`)? Those serialise work regardless of size.
- Does any part **depend on another part's output** to compile or to be
  testable?
- Would a reasonable reviewer want the parts reviewed **separately**?

When genuinely between two sizes, take the larger. An unnecessary parent record
costs one file; a missing one costs the ability to resume after an interruption.

---

## Parent tasks

`LARGE` and `PROGRAM` tasks get a durable record under
[`docs/tasks/`](../../docs/tasks/), created by:

```bash
node scripts/new-task.mjs "<title>" --type FEATURE --size LARGE
```

The record is the task's **state**, not its narrative. It is what lets a new
session — or a different agent — resume without re-deriving what was already
decided. Chat scrollback does not survive; this does.

Required fields, validated by `scripts/rebuild-tasks.mjs --check`:

```
TASK_ID              TASK-nnnn
TITLE                what the task is
TYPE                 the routed keyword — BUG | FEATURE | UI/UX | ...
SIZE                 SMALL | MEDIUM | LARGE | PROGRAM
STATUS               NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE | ABANDONED
PRIORITY             P0 | P1 | P2 | P3
CREATED_AT           ISO date
AFFECTED_MODULES     the modules actually in scope
AGENTS               specialists required
WORK_PACKAGES        the decomposition — see below
DEPENDENCIES         between work packages, and on anything external
CURRENT_PACKAGE      the one executing now
COMPLETED_PACKAGES   WP ids
BLOCKED_PACKAGES     WP ids, each with its block reason
OWNER_DECISIONS      genuine product questions — see below
FINAL_STATUS         resolved only at the end, per the completion contract
```

`docs/tasks/index.md`, `active.md`, `blocked.md` and `completed.md` are
**generated** by `scripts/rebuild-tasks.mjs`. Never hand-edit them — the same
rule the backlog and bug indexes follow, for the same reason.

---

## Work packages

The Architect decomposes a large task into packages that are **meaningful units
of engineering**, each with an owner, a boundary and its own gates.

**Good boundaries** — they follow ownership and dependency:

```
schema · backend · frontend · security · integration
migration · QA · browser E2E · deployment
```

**Bad boundaries** — they follow nothing:

```
files 1-10 · files 11-20 · "part 1" · "the rest"
```

The test is simple: a good work package can be **reviewed on its own** and has
a single specialist who owns it. If describing the boundary requires listing
files, it is not a boundary.

Each package carries:

```
WP_ID          WP-01, WP-02, ...
TITLE
STATUS         NOT_STARTED | READY | IN_PROGRESS | QA | CI | MERGING | DONE | BLOCKED
DEPENDENCIES   WP ids that must reach DONE first
AGENTS         who implements it
BRANCH         agent/<feature>-<scope>
SHA            final task SHA once committed
QA_STATUS
BUGS           BUG-nnnn records it produced
CI_STATUS
MERGE_STATUS
```

`READY` means every dependency is `DONE` and the package can start now.
`NOT_STARTED` means it cannot yet. The distinction is what makes automatic
continuation mechanical rather than a judgement call.

---

## Automatic continuation

When a work package reaches `DONE`:

```
1. mark it COMPLETED_PACKAGES
2. recompute which packages are now READY  (all dependencies DONE)
3. pick the next READY package by dependency order, then priority
4. set CURRENT_PACKAGE and start it
```

**Do not ask "would you like me to continue?"** Continue.

The only reasons to stop are that **every remaining package** is blocked by one
of:

| Reason | Meaning |
|---|---|
| `OWNER_DECISION_REQUIRED` | A genuine product or business question — not a technical one |
| `BLOCKED_EXTERNAL` | Access, infrastructure, a third party, an unavailable CI runner |
| `UNRECOVERABLE_TOOL_FAILURE` | The tooling cannot proceed and retry will not change that |
| `SAFETY_BLOCK` | Continuing risks data loss, a destructive rollback, or losing commits |

**One blocked package never stops an independent one.** If WP-03 is waiting on
an owner decision and WP-04 depends on nothing blocked, WP-04 runs. Stopping the
whole task because one branch of it stalled is the single most expensive
orchestration failure available, because the user pays for the restart of
everything that could have proceeded.

A package that blocks is recorded in `BLOCKED_PACKAGES` with its reason, and
the task continues. Only when `READY` is empty **and** every incomplete package
is blocked does the task itself stop — and it then reports every block at once,
so the user answers everything in one pass rather than one question per session.

---

## Parallelism

The Architect may run independent work packages concurrently **only when
ownership does not conflict.**

**Never parallelise:**

- two writers of `schema.prisma` — the Database agent is the single writer,
  always
- database work and the API work that depends on its regenerated client
- two writers of `permissions.ts` or `rbac-matrix.ts`
- multiple agents making overlapping lifecycle changes to the same task record
- two packages that touch the same file — that is **one** package with one owner

**Prefer sequential when the conflict risk is meaningful.** Wall-clock is not
the constraint that matters here; a bad merge in `schema.prisma` silently
changes the database, and recovering from it costs far more than the
serialisation saved. The full rules are in
[`../../docs/development/parallel-work.md`](../../docs/development/parallel-work.md).

---

## Scope expansion

Implementation regularly reveals that a task is bigger than it looked. Detect it
rather than absorbing it silently:

```
SCOPE_EXPANSION_DETECTED
```

Raise it when the work touches **substantially more modules or architectural
areas** than the plan allocated — a new single-writer file, a migration nobody
planned, a contract consumed by the gateway or the Electron agent, an
authorization change.

Then the Architect **re-decomposes automatically**: add the work packages the
expansion needs, update `DEPENDENCIES`, and carry on. Do **not** ask the user —
unless the expansion introduces a genuine product or business question, which is
an `OWNER_DECISION_REQUIRED`, recorded and reported at the end.

Silently absorbing expansion is what produces a "small fix" that rewrote
authorization. Silently *stopping* on it is what produces a half-migrated
schema.

---

## Assumption register

`LARGE` and `PROGRAM` tasks record the assumptions the plan rests on. Each:

```
ASSUMPTION_ID     A-01, A-02, ...
STATEMENT         what is being assumed
EVIDENCE          what it is based on — a path, a line, a prior record, or "none"
CONFIDENCE        HIGH | MEDIUM | LOW
IMPACT_IF_WRONG   what breaks, and how expensive the recovery is
```

**LOW confidence + high impact requires extra validation before the work
depends on it** — read the code, run the query, check the deployed config.
That combination is precisely the one that produces a task which was
internally consistent and entirely wrong.

An assumption is not an owner question. `OWNER_DECISION_REQUIRED` is reserved
for **genuine product uncertainty** — what the business wants. Anything an agent
can establish by reading this repository is an assumption to be verified, not a
question to be asked. Escalating verifiable facts as questions is how a user
ends up answering things the code already answered.

---

## Concise progress reporting

Large tasks report **checkpoints, not engineering logs.** Detailed evidence
lives in the repository — QA runs, bug records, engineering history, the task
record. Chat carries the state a human needs to decide whether to intervene.

```
DijiPeople Task Progress

Task: TASK-0001 — <title>
Overall: 3/6 work packages complete

Completed:
- WP-01 <title>
- WP-02 <title>
- WP-03 <title>

Current:
- WP-04 <title>
  Implementation: <one line>
  QA: <one line>
  Bugs: <ids, or none>
  CI: <status>

Next:
- WP-05 <title>

Blocked:
- None

Owner decisions:
- 0

Main:
- SYNCED

Deployment:
- NOT_REQUIRED
```

`Main:` is [`MAIN_SYNC_STATUS`](repository-health.md#main_sync_status) and
`Deployment:` is the deployment state — both are there because a task can be
going perfectly while the repository quietly drifts, and that is exactly the
failure a progress report should surface early.

Emit a checkpoint when a work package changes state, not on a timer. Three
sentences of prose around it is fine; three screens of command output is not.

---

## Failure recovery

Every agent follows the same shape. A single failed command does not terminate a
large task.

```
FAILURE
  ↓
CLASSIFY
  ↓
RETRY · FIX · REPLAN · ROLLBACK · CONTINUE_INDEPENDENT_WORK · ESCALATE
```

| Failure | Default response |
|---|---|
| CI red | Classify per [`ci.md`](../../docs/development/ci.md), fix, push, wait again |
| Test failure | Classify regression vs known baseline before changing anything |
| Migration failure | Stop the database path, replan — **never** weaken the migration to pass |
| Protected-main push rejected | The PR recovery flow — [`repository-health.md`](repository-health.md) |
| Local main stale | Synchronise before starting work, not after |
| A work package blocked | Record the reason, continue independent packages |
| Tooling unavailable | `BLOCKED_EXTERNAL`, with the exact command and its output |

`ESCALATE` is the last option, not the first. Escalating a failure an agent
could have classified converts a recoverable problem into a stopped task.

---

## Structured handoffs

A specialist hands off to QA with:

```
IMPLEMENTED              what was built
CHANGED_BEHAVIOR         what now behaves differently, including for existing callers
RISK_AREAS               where this is most likely to be wrong
KNOWN_MISTAKES_AVOIDED   the retrieved defects this deliberately did not repeat
TESTS_ADDED              new coverage, and what it proves
TEST_HOOKS               ids, routes, fixtures and seeds QA can use
UNRESOLVED               what was deliberately left, and why
```

QA uses the handoff to **target** validation — but never as a boundary on it.
A handoff that omits a risk does not make that risk untested; QA designs its own
scenarios and `CHANGED_BEHAVIOR` is an input, not a scope limit. The value of
the handoff is that QA spends its effort where the implementer already knows the
code is thin.

---

## Risk-based QA depth

QA depth matches the risk of the change, not the size of the diff.

| Risk present | QA must include |
|---|---|
| `SECURITY` | Negative authorization **and** cross-tenant isolation — mandatory, never risk-based |
| `DATABASE` | Real PostgreSQL, migrations applied forward, constraints exercised |
| `STATE_MACHINE` | Legal transitions **and** illegal ones rejected |
| `TENANT` | Cross-tenant read, write and enumeration attempts |
| `PUBLIC_API` | Validation, abuse, rate limiting, idempotency |
| `UI` | Browser validation where available; error, loading and empty states |
| `DEPLOYMENT` | Smoke, health, and rollback readiness verified before promotion |

The two rows that are stated as mandatory are mandatory because their failures
are silent: nothing in the product surfaces a cross-tenant leak or an accepted
illegal transition until someone external finds it.
