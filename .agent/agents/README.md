# Agent Roles

Role definitions for AI agents working on DijiPeople. Load the relevant file as
the agent's instructions alongside the repository's `AGENTS.md` files and the
`.agent/context/` documents each role requires.

Full orchestration:
[`docs/development/agent-orchestration.md`](../../docs/development/agent-orchestration.md).

---

## The roles

| Role | File | Writes code? | Owns |
|---|---|---|---|
| **Architect** | [architect.md](architect.md) | No | Requirement → verified ExecPlan, agent selection, task classification |
| **Backend / API** | [backend-api.md](backend-api.md) | Yes | NestJS controllers, services, DTOs, authorization wiring, audit |
| **Frontend** | [frontend.md](frontend.md) | Yes | Next.js routes, runtime specs/adapters, components, UI states |
| **UI/UX** | [ui-ux.md](ui-ux.md) | **No** (read-only by default) | Experience specification and acceptance criteria |
| **Database** | [database.md](database.md) | Yes, single-writer | Prisma schema, migrations, indexes, backfills, seed impact |
| **Integration** | [integration.md](integration.md) | Yes | Connectors, gateway contract, webhooks, queues, idempotency |
| **QA** | [qa.md](qa.md) | Tests only | Scenario design, execution, QA runs, regression register |
| **Reviewer** | [reviewer.md](reviewer.md) | **No** | Independent technical and security assessment |
| **Integrator** | [integrator.md](integrator.md) | Git only | Branches, worktrees, conflict resolution, merges, cleanup |
| **Release / DevOps** | [release-devops.md](release-devops.md) | Config/infra only | Readiness, environments, deployment, rollback, smoke, release records |

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

A task is complete only when all three are true:

```
IMPLEMENTATION COMPLETE
REVIEW COMPLETE
QA COMPLETE
```

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
| Merging any task | + Integrator |
| Anything reaching an environment | + Release/DevOps |

UI/UX is invoked when there is a genuine experience decision — not for adding a
field to an existing runtime spec.

---

## The loop

```
Request
  → Architect (plan, agent selection, task classification)
  → specialists implement on agent/<feature>-<scope> branches
  → QA (independent scenarios, documented run)
  → Reviewer (independent findings)
  → Integration (single owner, combined validation)
  → Knowledge capture → docs/knowledge/
  → Obsidian sync
  → Final report
```

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
carries the security checklist), DevOps (no CI exists), knowledge-writer
(implemented as a Skill instead).
