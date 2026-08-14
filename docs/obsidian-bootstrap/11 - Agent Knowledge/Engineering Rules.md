# Engineering Rules

The rules AI agents must follow when working on DijiPeople.

> **The authoritative version lives in the repository**, in `AGENTS.md` (root)
> and the nested `AGENTS.md` files. This note is the human-readable summary and
> the place to capture *why* a rule exists. If the two disagree, the repository
> wins — and this note needs fixing.

---

## Where the rules live

| File | Governs |
|---|---|
| `AGENTS.md` (root) | Product context, architecture principles, tenant isolation, database, backend, frontend, security, testing, process |
| `services/api/AGENTS.md` | NestJS conventions, auth, the three authorization layers, errors, audit, transactions |
| `services/api/prisma/AGENTS.md` | Schema conventions, migrations, destructive changes, seeds |
| `apps/web/AGENTS.md` | Module runtime, settings runtime, shared components, UI states |
| `apps/admin/AGENTS.md` | Platform runtime, `ProDataTable`, platform RBAC |
| `apps/landing/AGENTS.md` | Public-surface security |
| `packages/config/AGENTS.md` | Shared config, environment variables, generated runtime schema |
| `PLANS.md` | When an ExecPlan is required and what it contains |
| `.agent/agents/` | Architect, Implementer, Reviewer role definitions |
| `docs/development/parallel-work.md` | Parallel vs sequential rules |
| `docs/development/git-worktrees.md` | Branch and worktree workflow |

---

## The rules that matter most, and why

### 1. Tenant isolation is enforced only by the query you write

There is **no PostgreSQL row-level security**. There is **no global tenant
Prisma middleware**. `PrismaService` registers a `$use` middleware, but it
applies *business-unit* scoping, not tenant scoping — and on Prisma 7 the `$use`
API no longer exists, so it never runs.

**Consequence:** a repository method that forgets `tenantId` is a cross-tenant
data breach, and nothing will catch it but review.

Rules: `tenantId` always from `request.user.tenantId`; never from client input;
never `findUnique` by bare id on a tenant-owned model; scope writes as well as
reads.

### 2. Two permission systems, and both are enforced

`PermissionsGuard` requires **all** declared `@Permissions('key')` string keys
**and** **at least one** `@RequirePermission(entity, privilege)` matrix
privilege. Declaring only one family is the most common authorization bug here.

Row-level scope is a **third, separate** step done in the service with
`buildScopedAccessWhere()`. Having permission to call an endpoint is not
permission to see every record it could return.

`hasElevatedTenantRole()` skips the entire check. Adding a role key to that list
grants everything.

### 3. Extend the existing architecture; never build a competing one

The repository already has a module runtime, a settings runtime, a permission
matrix, an error catalog, an audit service and a notification orchestrator. A
second implementation of any of them is a regression even if it compiles and
passes review on its own terms.

Specifically: no bespoke CRUD page beside the module runtime, no hand-rolled
table beside `ProDataTable` (admin) or the shared data-table (web), no direct
mailer call beside the notification orchestrator.

### 4. Some files have exactly one writer at a time

`services/api/prisma/schema.prisma`, `prisma/migrations/`,
`common/constants/permissions.ts`, `common/constants/rbac-matrix.ts`,
`src/app.module.ts`, `common/guards/*`,
`packages/config/platform-runtime-schema.generated.json`,
`apps/web/lib/security-keys.ts`.

Two agents in one of these produces conflicts that are painful, or silently
wrong, to merge.

### 5. There is no CI — validation only happens if you run it

No `.github/` workflows exist. Nothing runs lint, typecheck or tests on push.
Agents must run the relevant commands themselves and **state which ran, which
passed, which failed, and which were skipped and why.**

Never report completion while a relevant validation is failing or unrun.

### 6. Plan before substantial changes

New modules, cross-module features, meaningful migrations, auth/RBAC changes,
payroll logic, attendance logic, provisioning, integrations, large refactors and
architecture changes all require an ExecPlan under `PLANS.md`, approved before
implementation.

### 7. Parallelize independent work; serialize dependent work

Never parallelize because agents are available. Tasks are labelled
`PARALLEL_SAFE`, `DEPENDENCY_BLOCKED` or `INTEGRATION`, and the plan must output
all three lists explicitly.

### 8. Agents never commit to `main`

Branch `agent/<feature>-<scope>`. One branch per task, one agent per branch,
worktrees for concurrent work. The main checkout frequently holds uncommitted
human work — check `git status` and never touch files you did not change.

---

## What went wrong before

Worth remembering, because it is the reason this practice exists.

Before this workflow, the only AI instructions were `apps/web/AGENTS.md` and
`apps/admin/AGENTS.md` — byte-identical copies from an early foundation phase.
They told agents **not** to build payroll, recruitment, attendance, leave,
performance or analytics, and described `packages/database`, `packages/types`
and `packages/utils` as populated shared packages.

By the time they were replaced, all of those modules were built and in
production use, and those three directories were empty.

**A confidently wrong instruction file is worse than no instruction file.** When
you change the repository in a way that makes one of these documents wrong, fix
the document in the same change.

---

## The three roles

| Role | Writes code | Purpose |
|---|---|---|
| **Architect** | No | Requirement → verified ExecPlan with file-path evidence |
| **Implementer** | One bounded task | Execute one plan task, reuse existing patterns, validate, report honestly |
| **Reviewer** | **No** | Independent review, findings ranked CRITICAL / HIGH / MEDIUM / LOW |

A passing test suite is not Reviewer approval. Most of the defects worth
catching here — a missing `tenantId`, a half-declared permission, an
irreversible migration — are invisible to the current tests.

Specialists (database, backend, frontend, QA, integrations, security) are
introduced **temporarily**, for specific work, and discarded afterwards. See
`.agent/agents/README.md`.

## Related

[[DijiPeople]] · [[Architecture Index]] · [[Architecture Decision Index]] ·
[[Module Index]]
