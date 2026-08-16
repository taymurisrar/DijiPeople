# Agent Roles

Role definitions for AI agents working on DijiPeople. Load the relevant file as
the agent's instructions alongside the repository's `AGENTS.md` files and the
`.agent/context/` documents each role requires.

Full orchestration:
[`docs/development/agent-orchestration.md`](../../docs/development/agent-orchestration.md).

A prompt beginning `DijiPeople Task:` activates the whole framework. Routing —
which keyword or inferred intent leads to which role — is in
[`../context/task-router.md`](../context/task-router.md); sizing, work packages
and automatic continuation are in
[`../context/task-orchestration.md`](../context/task-orchestration.md).

---

## The roles

| Role | File | Writes code? | Owns |
|---|---|---|---|
| **Architect** | [architect.md](architect.md) | No | **Task orchestration**: routing, sizing, ExecPlan, decomposition, continuation, triage |
| **Backend / API** | [backend-api.md](backend-api.md) | Yes | NestJS controllers, services, DTOs, authorization wiring, audit |
| **Frontend** | [frontend.md](frontend.md) | Yes | Next.js routes, runtime specs/adapters, components, UI states |
| **UI/UX** | [ui-ux.md](ui-ux.md) | **No** (read-only by default) | Experience specification and acceptance criteria |
| **Database** | [database.md](database.md) | Yes, single-writer | Prisma schema, migrations, indexes, backfills, seed impact |
| **Integration** | [integration.md](integration.md) | Yes | Connectors, gateway contract, webhooks, queues, idempotency |
| **QA** | [qa.md](qa.md) | Tests only | Scenario design, execution, QA runs, regression register |
| **Reviewer** | [reviewer.md](reviewer.md) | **No** | Independent technical and security assessment |
| **Integrator** | [integrator.md](integrator.md) | Git only | Branches, worktrees, conflicts, **PR lifecycle**, merges, **protected-branch recovery**, cleanup |
| **Release / DevOps** | [release-devops.md](release-devops.md) | Config/infra only | **Repository health**, readiness, environments, deployment, rollback, smoke, release records |

---

## Separation of duties

Three separations carry the framework. Collapsing any of them removes the check
it exists to provide.

- **Architect plans; specialists implement.** An implementer that re-plans
  mid-task loses the verification the plan encoded.
- **QA ≠ Reviewer.** QA asks *does it behave correctly across scenarios?*
  Reviewer asks *is it architecturally, securely and technically correct?* A
  green suite is not architectural approval; a clean read is not scenario
  coverage. **Both can block.**
- **Reviewer does not edit.** A reviewer that fixes what it finds is no longer
  independent.

A fifth was added with repository-health ownership:

- **Release/DevOps detects and classifies repository state; the Integrator
  acts on it.** A role that diagnoses and then acts on its own diagnosis has no
  check on a wrong diagnosis — which matters most in exactly the situation this
  separation covers: a push has just been rejected, local `main` is ahead, and
  the tempting single-step "fix" is a force push. `scripts/repo-health.mjs`
  therefore reports and never mutates.

A fourth separation was added with the durable bug and backlog systems:

- **QA establishes what is true; the Architect decides what happens about it.**
  QA owns evidence, reproduction and severity. The Architect owns priority and
  `ArchitectDisposition`. A QA role that also prioritised would have an incentive
  to downgrade its own findings; a developer who could defer would have an
  incentive to defer the bug they would otherwise fix. Neither incentive exists
  while the two roles are apart.

All finishing means the **work** is sound. It does not mean the **task** is
finished — that is defined by
[`.agent/context/task-completion-contract.md`](../context/task-completion-contract.md),
which additionally requires finding classification, triage, merge, post-merge
validation, engineering history, knowledge capture, Obsidian sync and cleanup:

```
IMPLEMENTATION_STATUS           REVIEW_STATUS                 ENGINEERING_HISTORY_STATUS
LOCAL_VALIDATION_STATUS         REMOTE_CI_STATUS              FEEDBACK_PROMOTION_STATUS
QA_STATUS                       MERGE_STATUS                  KNOWLEDGE_CAPTURE_STATUS
QA_FINDINGS_CLASSIFIED_STATUS   POST_MERGE_VALIDATION_STATUS  OBSIDIAN_SYNC_STATUS
BUG_RECORD_STATUS                                             CLEANUP_STATUS
ARCHITECT_TRIAGE_STATUS
BACKLOG_UPDATE_STATUS
```

> This document used to stop at implementation, review and QA. That wording is
> precisely what allowed a finished tenant control-plane implementation — a new
> API module, a migration, ten replaced components — to be reported as complete
> while it sat uncommitted in a working tree.

---

## Ownership of the durable records

Each record type has exactly one owning role. Shared ownership of a record means
nobody maintains it.

| Record | Owner | Contributors |
|---|---|---|
| [`docs/bugs/BUG-nnnn`](../../docs/bugs/) | **QA** — evidence, reproduction, severity, status | Architect sets `Priority` and `ArchitectDisposition`; specialists fill Resolution |
| [`docs/backlog/items/ITEM-nnnn`](../../docs/backlog/items/) | **Architect** | Anyone may raise one; the Architect triages |
| [`docs/backlog/*.md`](../../docs/backlog/) indexes | **generated** — `scripts/rebuild-backlog.mjs` | Nobody edits these by hand |
| [`docs/qa/runs/`](../../docs/qa/runs/) | **QA** | — |
| [`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md) | **QA** | — |
| [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/) | **QA** | Reviewer proposes; Architect confirms generality |
| [`docs/engineering-history/tasks/`](../../docs/engineering-history/tasks/) | **Integrator** — branches, conflicts, merge, SHAs, CI | QA supplies run and bug ids; Architect supplies plan and agents |
| [`docs/deployment/release-history/`](../../docs/deployment/release-history/) | **Release / DevOps** | QA supplies the deployment run |
| [`docs/knowledge/`](../../docs/knowledge/) | **Knowledge Capture** Skill | Every role feeds it |
| Obsidian `Generated/` folders | **`scripts/sync-obsidian.mjs`** — the only writer | — |
| Obsidian everything else | **the user** | Agents read; agents never write |

Two boundaries worth stating plainly, because they are the ones most easily
collapsed:

- **The Integrator documents Git history; Release/DevOps documents deployed
  state.** A merge commit is not evidence that code is running.
- **QA does not prioritise; specialists do not triage.** See the fourth
  separation above.

---

## Choosing agents

The Architect names the specialists a task actually needs and states which are
deliberately unused. **Do not invoke every role for every task** — that produces
documentation nobody reads and hides the roles that mattered.

| Change | Typically needs |
|---|---|
| Backend bug fix, one module | Backend/API → QA → Reviewer |
| New API endpoint | Architect → Backend/API → QA → Reviewer |
| Schema change + API | Architect → Database → Backend/API → QA → Reviewer |
| New product screen | Architect → (UI/UX) → Frontend → QA → Reviewer |
| Device/gateway/webhook work | Architect → Integration → QA → Reviewer |
| Authorization change | Architect → Backend/API (+ `authorization-dry-run`) → QA → Reviewer |
| Copy or styling fix | Frontend → Reviewer |
| **Any task that modified tracked files** | **+ Integrator — mandatory, not on request** |
| Anything reaching an environment | + Release/DevOps |

UI/UX is invoked when there is a genuine experience decision — not for adding a
field to an existing runtime spec.

---

## The loop

```
Request
  → relevant knowledge retrieval
  → Architect: BACKLOG_PRECHECK, then plan, agent selection, classification
  → specialists implement on agent/<feature>-<scope> branches,
      each opening with KNOWN_MISTAKES_TO_AVOID
  → local validation
  → QA (independent scenarios, documented run)
  → QA finding extraction → BUG-nnnn records → backlog rebuild
  → Architect: BACKLOG_POST_QA_TRIAGE
      → FIX_NOW / PLAN_REQUIRED / DEFER / PRODUCT_DECISION / BLOCKED_EXTERNAL
  → QA retest
  → Reviewer (independent findings, REPEATED_REGRESSION checks)
  → Integrator (push, CI verdict, conflict classification, merge)
  → post-merge validation against the merged SHA
  → engineering history record → docs/engineering-history/tasks/
  → Knowledge capture → docs/knowledge/
  → backlog rebuild
  → Obsidian sync (records, knowledge, dashboards)
  → worktree and branch cleanup
  → Final report, ending in ## Task Finalization
```

Every phase from the Integrator onwards is **mandatory for any task that
modified Git-tracked files**, and runs without being asked for.

---

## Context is mandatory

Every role lists **Required Context** — `.agent/context/*` files it must read
before working. Those documents describe the repository; they are never
authority over it. When code and context disagree, **the code is current
truth**: follow the code, report the discrepancy, and update or flag the context
file.

---

## Skills vs agents

**Agents** define ownership and judgement. **Skills** define repeatable
procedures an agent invokes. A Skill never replaces a role's judgement — see
[`.agent/skills/README.md`](../skills/README.md).

---

## Adding a role

Only when a real task repeatedly needs context that would bloat an existing
role. A speculative role file rots, and a confidently wrong instruction file is
worse than none — which is exactly what happened to the duplicated
`apps/*/AGENTS.md` files this framework replaced.

Candidates deliberately **not** created yet: security specialist (the Reviewer
carries the security checklist) and knowledge-writer (implemented as a Skill
instead). DevOps was on this list while no CI existed; it is now the
Release/DevOps role above.
