# Agent Roles

Role instructions for AI agents working on DijiPeople. These are **role
definitions**, not runtime configuration — load the relevant file as the agent's
instructions alongside the repository's [`AGENTS.md`](../../AGENTS.md) files.

## Current roles

| Role | File | Writes code? | Purpose |
|---|---|---|---|
| **Architect** | [`architect.md`](architect.md) | No | Requirements → verified ExecPlan |
| **Implementer** | [`implementer.md`](implementer.md) | Yes, one bounded task | Execute a single plan task |
| **Reviewer** | [`reviewer.md`](reviewer.md) | **No** | Independent ranked review |

Deliberately small. Three roles cover the whole loop, and a small set is easier
to keep accurate than a large one that drifts out of sync with the codebase.

## The loop

```
Requirement
    │
    ▼
ARCHITECT ── ExecPlan (PLANS.md) ──▶ human approval
    │
    ▼
IMPLEMENTER × N   one task each, on its own agent/<feature>-<scope> branch
    │             PARALLEL_SAFE tasks may run concurrently
    │             DEPENDENCY_BLOCKED tasks wait
    ▼
INTEGRATION       one agent, one branch, joins the pieces
    │
    ▼
REVIEWER ── ranked findings ──▶ human decision ──▶ merge
```

The Reviewer never fixes what it finds; findings go back to an Implementer or a
human. This separation is the point — a reviewer that edits is not an
independent check.

## Which role to use

- Requirement is vague, or the change touches schema, permissions, payroll,
  attendance, provisioning or integrations → **Architect first**, always.
- Plan exists and is approved → **Implementer**, one task at a time.
- Change is complete → **Reviewer**, before merge.
- Small, local, low-risk fix with no schema/permission/contract impact →
  Implementer directly, then Reviewer.

## Temporary specialist agents

Once this three-role workflow is stable, temporary specialists can be spun up
**for a specific piece of work and then discarded**. They are not permanent
roles and no files for them exist yet, deliberately — an unused role file rots.

A specialist is worth creating when a task needs deep, narrow context that would
bloat the general Implementer's instructions:

| Specialist | Introduce when | Would own |
|---|---|---|
| **Database** | A migration with a backfill, a destructive change, or index/performance work on `schema.prisma` | Schema design, migration staging (expand/backfill/contract), indexes, seed and `verify-seed-config` updates. Single-writer on `schema.prisma` and `prisma/migrations/`. |
| **Backend** | A multi-module API feature with non-trivial transactions or domain rules | NestJS modules, services, repositories, DTOs, transactions, audit wiring, API contracts. |
| **Frontend** | A module runtime or settings runtime surface with real UX depth | Runtime specs and adapters, shared component reuse, states, responsiveness, accessibility. |
| **QA** | A feature whose correctness is hard to see in a diff — payroll, attendance reconciliation, approvals | Test strategy, spec authoring, e2e coverage, edge-case enumeration, manual verification scripts. |
| **Integrations** | Device connector, gateway contract, Stripe or email provider work | Connector registry, gateway runtime contract, webhook idempotency and signature verification, credential encryption, backward compatibility for deployed gateways and agents. |
| **Security** | Auth, session, RBAC or public-surface changes; or a periodic audit | Threat modelling, tenant-isolation audit, permission-matrix consistency, secret handling, public endpoint hardening. |

Rules for specialists:

1. **Do not create one until a real task needs it.** No speculative roles.
2. A specialist file is a *delta* on `implementer.md` (or `reviewer.md`) — it
   states the extra context and extra checks, not a full restatement.
3. Specialists still obey `AGENTS.md`, `PLANS.md` and the single-writer rules.
4. When the work is done, either delete the file or promote it to a permanent
   role with a note in [`docs/decisions/`](../../docs/decisions/) explaining
   why.

## Keeping these accurate

These files describe the repository as it is. When the repository changes in a
way that makes a statement here wrong, fix it in the same change. A role file
that confidently states something false is worse than no role file — that is
exactly what happened with the previous duplicated `apps/*/AGENTS.md`.
