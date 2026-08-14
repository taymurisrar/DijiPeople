# ADR-0001 — AI-assisted engineering workflow for DijiPeople

## Status

Accepted — 2026-08-14

## Context

DijiPeople is a large multi-tenant monorepo: 68 API modules, a ~11,800-line
Prisma schema with 285 models and 191 migrations, three Next.js apps, an
Electron agent and a .NET gateway. AI coding agents are being used on it
routinely.

The only AI instruction files present were `apps/web/AGENTS.md` and
`apps/admin/AGENTS.md` — byte-identical 164-line copies describing an early
foundation phase. They instructed agents **not** to build payroll, recruitment,
attendance, leave, performance or analytics, and described
`packages/database`, `packages/types` and `packages/utils` as populated shared
packages. All of those modules now exist and are in active use; those three
package directories are empty and are not npm workspaces.

Analysis also established several properties that agents were likely to get
wrong:

- Tenant isolation is enforced **by convention** in service and repository
  query sites. There is no PostgreSQL row-level security and no global tenant
  Prisma middleware.
- `PrismaService` registers a `$use` middleware applying business-unit scoping,
  but `@prisma/client@7.8.0` no longer exposes `$use`
  (`PrismaClient.prototype.$use === undefined`), so it does not run. It reads
  like an active defence layer and is not one.
- Two permission systems run simultaneously — string permission keys checked
  against `user.permissionKeys`, and an entity/privilege/access-level matrix
  checked against `user.rolePrivileges` — and `PermissionsGuard` requires all of
  the former and any of the latter.
- `hasElevatedTenantRole()` short-circuits the permission guard entirely.
- There is **no CI**; nothing runs lint, typecheck or tests automatically.

## Decision

Adopt a documented, repository-resident AI engineering workflow:

1. **`AGENTS.md` at the root** as the primary agent instruction file,
   documenting this repository specifically, with nested `AGENTS.md` files at
   `services/api/`, `services/api/prisma/`, `apps/web/`, `apps/admin/`,
   `apps/landing/` and `packages/config/`. The stale `apps/web` and
   `apps/admin` files are replaced with scope-specific content; the
   platform-wide material moves to the root.
2. **`PLANS.md`** defining when an ExecPlan is required and what it must
   contain, with tasks classified `PARALLEL_SAFE`, `DEPENDENCY_BLOCKED` or
   `INTEGRATION`.
3. **Three agent roles** in `.agent/agents/` — Architect (plans, does not
   implement), Implementer (one bounded task), Reviewer (reads, ranks findings,
   never edits). Specialist roles are documented as *temporary* and are not
   created until a task needs one.
4. **Single-writer files** declared explicitly: `schema.prisma`,
   `prisma/migrations/`, `common/constants/permissions.ts`,
   `common/constants/rbac-matrix.ts`, `app.module.ts`, `common/guards/*`,
   the generated platform runtime schema, and
   `apps/web/lib/security-keys.ts`.
5. **Git worktrees** with `agent/<feature>-<scope>` branches for concurrent
   work; agents never commit to `main`.
6. **`docs/`** gains `architecture/` snapshots, `decisions/` (ADRs),
   `features/` and `development/`, indexed by `docs/README.md`, with an
   explicit boundary against Obsidian.
7. **Obsidian** as the external knowledge base for product knowledge, business
   requirements, reasoning, decisions in narrative form, meetings and client
   feedback — seeded from `docs/obsidian-bootstrap/`, with **no application
   dependency on it**.

## Reasons

- The existing instructions were actively wrong in ways that would cause an
  agent to refuse or misdirect real work. Correcting them was the highest-value
  single change available.
- The properties most likely to cause a security regression here (convention-only
  tenant isolation, dual RBAC, the inert Prisma middleware, the elevated-role
  bypass) are invisible in a diff and unguessable from general HRM experience.
  They had to be written down.
- With no CI, validation discipline can only come from instructions and honest
  reporting. Both are now explicit requirements.
- A three-role workflow is small enough to stay accurate. The previous failure
  mode was documentation drifting out of sync with the code, so fewer, more
  accurate files was preferred over a larger set.
- Separating Reviewer from Implementer preserves an independent check; a
  reviewer that fixes what it finds is not a check.
- Worktrees are the only practical way to run concurrent agents in a monorepo
  this size without invalidating build caches and the generated Prisma client.

## Alternatives Considered

**Keep and extend the existing `apps/*/AGENTS.md`.** Rejected: they were
duplicated, wrong about current scope, and wrong about repository structure.
Extending them would have preserved the errors.

**A single root `AGENTS.md` with no nested files.** Rejected: backend, Prisma
and frontend conventions differ enough that one file would be too long to be
read in full, and Codex/Claude both support nested scope files.

**A larger permanent agent roster (database, backend, frontend, QA, security,
integrations from day one).** Rejected: unused role files rot, and the same
drift that broke the previous instructions would recur. Specialists are
documented as temporary and created on demand.

**Adding CI as part of this work.** Rejected as out of scope — it changes the
development process and belongs in its own decision. It is recorded as a known
gap.

**Fixing the inert Prisma `$use` middleware.** Rejected as out of scope for a
workflow setup: it is a runtime behaviour change with real security
implications and needs its own plan. It is documented as a risk instead.

**Storing everything in Obsidian.** Rejected: technical truth must live next to
the code it describes, versioned with it. Obsidian holds what code cannot
express.

## Consequences

**Positive**

- Agents get repository-specific instructions instead of generic ones.
- Tenant isolation and RBAC are now explicit review gates, not assumptions.
- Parallel work has clear rules and named single-writer files.
- Documentation has an index and an authority order.

**Negative / costs**

- These documents must be maintained. A stale `AGENTS.md` is worse than none —
  as this repository has already demonstrated.
- Worktrees cost `npm install` and `prisma generate` per checkout.
- The ExecPlan requirement adds up-front time to substantial changes.

**Neutral**

- No application code, schema or runtime behaviour changed as part of this
  decision.

## Migration / Compatibility Impact

None. Documentation and instruction files only. No source, schema, migration,
dependency or configuration change.

The previous `apps/web/AGENTS.md` and `apps/admin/AGENTS.md` content is
superseded; their platform-wide material now lives in the root `AGENTS.md`, and
each file carries a note explaining the change. The existing
`apps/*/CLAUDE.md` files (`@AGENTS.md`) are unchanged, and a root `CLAUDE.md`
follows the same convention.

## Security / Tenant Impact

No change to runtime security posture. The workflow **documents** existing risks
rather than altering them:

- Tenant isolation remains convention-only. This is now stated in
  `AGENTS.md`, `docs/architecture/tenancy.md` and the Reviewer checklist.
- The Prisma `$use` business-unit middleware remains inert. Agents are told not
  to rely on it.
- The dual permission system and the elevated-role bypass remain as they are,
  and are now called out at every relevant point.

Each of these deserves its own remediation decision. None was made here.

## Agent Rules

1. Read the root `AGENTS.md` plus every nested `AGENTS.md` covering directories
   you touch, before writing code.
2. Write an ExecPlan per `PLANS.md` for any change in the listed classes.
3. Never treat the Prisma `$use` middleware as active scoping.
4. Never assume tenant isolation is enforced by anything other than the query
   you are writing.
5. Declare both `@Permissions(...)` and `@RequirePermission(...)` on new
   endpoints, and apply row-level scope in the service.
6. Do not edit a single-writer file unless your task owns it.
7. Do not commit to `main`; use `agent/<feature>-<scope>` branches.
8. Do not claim completion without stating which validation commands ran and
   what they returned.
9. Do not create `packages/database`, `packages/types` or `packages/utils`
   content without a new ADR.
10. When you change architecture, update the matching document in
    `docs/architecture/` in the same change.

## Related Modules

All. The `services/api` permission constants, `common/prisma`, `common/guards`
and `services/api/prisma` are the areas most directly governed.

## Related Features

None — this is a process decision.
