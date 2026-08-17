# PLANS.md — How substantial DijiPeople changes are planned

> **Last verified:** 2026-08-17
> **Verified against commit:** 3f9063f
>
> Every `.agent/agents/*.md` role referenced below was resolved against the
> filesystem at that commit. This file previously routed step 3 of the plan
> lifecycle to a role that had been deleted; `validate-framework.mjs` now fails
> when a referenced role file does not exist.

This file defines the planning contract for AI agents and engineers working in
this repository. Behavioural rules live in [`AGENTS.md`](AGENTS.md); this file
covers **what must be decided before code is written**.

An **ExecPlan** is a written plan produced *before* implementation, checked
against the repository rather than assumed. It exists because the expensive
failures in this codebase are not typos — they are a query that forgot
`tenantId`, a permission declared in one of the two permission systems, a
migration that cannot be rolled back, and a second implementation of something
that already existed.

---

## When an ExecPlan is required

Write a full ExecPlan for:

- **New modules** — a new API module, a new tenant-product module, a new
  platform admin module
- **Cross-module features** — anything touching two or more domains
- **Database migrations with meaningful impact** — new models, destructive
  changes, changed uniqueness or relations, anything needing a backfill
- **Authentication or authorization changes** — guards, sessions, tokens,
  permission keys, RBAC matrix entries, access levels, elevated roles
- **Payroll logic** — runs, periods, components, tax, GL/journal, payslips,
  loans, claims, benefits, compensation
- **Attendance / reconciliation logic** — the attendance engine, punch
  interpretation, session building, geofencing, timesheet generation
- **Tenant provisioning** — tenant creation, domains, seeding, lifecycle,
  subscription state
- **Integrations** — device connectors, the on-premise gateway contract, Stripe,
  email providers, storage
- **Large refactors** — anything touching more than roughly ten files or moving
  a shared abstraction
- **Architecture changes** — new patterns, new shared abstractions, new
  packages, new deployables

### When an ExecPlan is *not* required

A localised bug fix, a copy change, a styling fix, adding a test, or a
single-file change with no schema, permission, contract or cross-app impact.
Still state what you inspected and what you ran.

**If you are unsure, write the plan.** A plan that turns out to be unnecessary
costs minutes; a missing one costs a migration.

---

## ExecPlan structure

Every section below is mandatory. Write "None" with a one-line reason rather
than deleting a section — a deleted section reads as "not considered".

Assertions must be **verified against the repository**, with file paths. "The
service already validates this" is not a finding; `services/api/src/modules/x/x.service.ts:120`
is.

```markdown
# ExecPlan — <title>

## Objective
One paragraph. What will be true when this is done.

## Business requirement
The requirement in product terms. Link the Obsidian feature note or ticket.
Mark anything unconfirmed as `TODO: Confirm product/business rule.` rather than
inventing it.

## Existing behavior
What the system does today, with file references. Include what already works
that must keep working.

## Existing architecture
The modules, services, repositories, registries, components and models
involved, with paths. Which existing patterns this change must follow.

## Requirements
Numbered, testable statements. Each maps to at least one acceptance criterion.

## Dependencies
Other work, decisions, data, credentials or external systems this depends on.
Note anything blocking.

## Files / modules affected
Explicit list, grouped by workspace. Flag single-writer files:
`services/api/prisma/schema.prisma`, `services/api/src/app.module.ts`,
`services/api/src/common/constants/permissions.ts`,
`services/api/src/common/constants/rbac-matrix.ts`.

## Database impact
Models added/changed. Migration name and shape. Indexes. Uniqueness (must
include `tenantId` on tenant-owned models). Backfill script and idempotency.
Expand/backfill/contract staging for anything destructive. `None` if no schema
change.

## Backend impact
Modules, controllers, services, repositories, DTOs. New endpoints with method,
path, request and response shape. Transaction boundaries. Which existing
services are reused rather than reimplemented.

## Frontend impact
Which app. Whether this uses the module runtime / settings runtime or needs a
bespoke screen — and if bespoke, why the runtime cannot express it. Which
shared components are reused. Loading, error, empty and access-denied states.
Responsive and accessibility considerations.

## Permission / RBAC impact
- New or changed permission keys (`common/constants/permissions.ts`)
- New or changed entity/privilege entries (`common/constants/rbac-matrix.ts`)
- Which roles receive them and how the seed grants them
- Endpoint decorators: BOTH `@Permissions(...)` and `@RequirePermission(...)`
- Row-level access levels (`OWN` / `TEAM` / `BUSINESS_UNIT` / `ORGANIZATION` /
  `TENANT`) and where `buildScopedAccessWhere()` is applied
- Whether any elevated-role bypass is involved
- Which keys must be mirrored into `apps/web/lib/security-keys.ts`

## Tenant-isolation impact
For every new or changed query: where `tenantId` comes from (it must be
`request.user.tenantId`), and how the record is verified to belong to the
caller's tenant. Call out any platform-path (cross-tenant) access explicitly and
justify it. State how a reviewer can confirm no cross-tenant read or write is
possible.

## Audit / event / logging impact
Which operations call `AuditService.log()`, with action names, entity types and
what goes in before/after snapshots. Platform events. Notification events.
What must never be logged.

## Integration impact
External systems touched. Contract changes to the .NET gateway, the desktop
agent, Stripe, email or storage. Backward compatibility for already-deployed
gateways and agents.

## Migration / data compatibility
How already-stored data behaves under the new code. How already-deployed
clients behave against the new API. Whether old and new can run simultaneously
during rollout.

## Parallel-safe tasks
Tasks with no shared files and no ordering dependency. Mark `PARALLEL_SAFE`.

## Dependency-blocked tasks
Tasks that cannot start until something else lands, and what unblocks each.
Mark `DEPENDENCY_BLOCKED`.

## Integration tasks
Tasks that join separately built pieces and must run last. Mark `INTEGRATION`.

## Testing strategy
Specific commands (from AGENTS.md — do not invent commands). Which existing
spec files are extended. New spec files and what they assert. Manual
verification steps where automation is not practical, with the exact steps.

## Risks
Ranked. For each: likelihood, impact, and mitigation. Tenant isolation, RBAC,
data loss and payroll correctness go first if in scope.

## Rollback considerations
How to undo this. If a migration is irreversible, say so explicitly and
describe the forward fix. What breaks if the frontend ships without the API, or
the API without the migration.

## Definition of Done
Checklist. Includes: validation commands run and passing; audit in place;
permissions wired in both systems; tenant scoping verified; docs updated;
no unrelated changes in the diff.
```

---

## Plan header block

Every ExecPlan opens with this block, so the orchestration decisions are visible
before the prose:

```markdown
CONTEXT_FILES_REQUIRED:
  - .agent/context/<file>.md          (one line per file the work depends on)

SPECIALIST_AGENTS_REQUIRED:
  - <agent>                            — <why>
DELIBERATELY_NOT_USED:
  - <agent>                            — <why not>

SINGLE_WRITER_FILES:
  - <path>                             (or "none")

QA_REQUIRED: yes | no                  (see docs/qa/README.md for the trigger table)

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/<pattern>.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-nnn — <one line>
```


### Integration and deployment fields

Plans that will be merged or deployed also carry:

```markdown
TARGET_BRANCH:            main | develop | <other>
TARGET_ENVIRONMENT:       LOCAL | PRODUCTION   (staging does not exist yet)
DEPLOYMENT_REQUIRED:      yes | no
DEPLOYMENT_COMPONENTS:    api | web | admin | landing | agent-desktop | gateway
DEPLOYMENT_ORDER:         e.g. database -> api -> web
ROLLBACK_CLASS:           CODE_ONLY | CONFIG | DATABASE_ADDITIVE |
                          DATABASE_DESTRUCTIVE | DATA_MIGRATION |
                          EXTERNAL_INTEGRATION | MULTI_COMPONENT_CONTRACT
INTEGRATOR_REQUIRED:      yes   (mandatory for ANY task modifying tracked files)
RELEASE_DEVOPS_REQUIRED:  yes | no
POST_DEPLOY_QA_REQUIRED:  yes | no
MERGE_STRATEGY:           merge --no-ff | rebase   (never force push)
KNOWN_CONCURRENT_WORK:    branches or worktrees touching the same files
ENVIRONMENT_DEPENDENCIES: new or changed env vars, and where they must be
                          registered (turbo.json globalEnv, render.yaml,
                          docs/environment-variables.md, .env.example)
```

`ROLLBACK_CLASS` is decided during planning, not after something breaks. A plan
proposing a destructive migration must say so here, because that single field
determines whether the release can be undone at all.

`INTEGRATOR_REQUIRED` is **not a judgement call**. Any plan whose execution will
modify a Git-tracked file sets it to `yes`, whether or not the request mentioned
Git. A plan that leaves it `no` is asserting the work will never be committed.
See
[`.agent/context/task-completion-contract.md`](.agent/context/task-completion-contract.md).

`SINGLE_WRITER_FILES` is not advisory. Any task touching one of these is
`DEPENDENCY_BLOCKED` for every other task, by definition:

- `services/api/prisma/schema.prisma`
- `services/api/prisma/migrations/**`
- `services/api/src/common/constants/permissions.ts`
- `services/api/src/common/constants/rbac-matrix.ts`
- `services/api/src/app.module.ts`
- `services/api/src/common/guards/**`
- `packages/config/platform-runtime-schema.generated.json`
- `apps/web/lib/security-keys.ts`

## Evidence labelling

Material conclusions in the plan carry **FACT**, **INFERENCE** or **PROPOSAL**,
each FACT citing a real path. An unlabelled assertion is a defect — the label is
what tells a reviewer which statements to re-check. See
[`.agent/agents/architect.md`](.agent/agents/architect.md).

---

## Task classification

Every implementation task in a plan carries exactly one label.

### `PARALLEL_SAFE`

No shared files with another in-flight task, no ordering dependency, and
independently verifiable.

Typically safe:
- Work in different API modules that do not import each other
- Different frontend module adapters under `apps/web/lib/runtime/modules/`
- Frontend UX preparation against an agreed contract while the backend is built
- Documentation, ADRs, Obsidian notes
- Test-plan authoring
- Security analysis and threat modelling
- Integration investigation and spikes
- .NET gateway work alongside Node work

### `DEPENDENCY_BLOCKED`

Cannot start until something else lands. State what unblocks it.

Always dependency-blocked:
- Any second task touching `services/api/prisma/schema.prisma` or
  `prisma/migrations/` — **schema work is single-writer, always**
- Backend work that needs a regenerated Prisma client after a schema change
- Any second task touching `common/constants/permissions.ts`,
  `common/constants/rbac-matrix.ts`, `src/app.module.ts`, or `common/guards/*`
- Frontend integration against an API contract that is not yet merged
- Seed changes that depend on new models or new permission keys

### `INTEGRATION`

Joins independently built pieces. Runs last, on one branch, by one agent.

- Wiring a new module into `app.module.ts` and navigation
- Connecting a frontend screen to the shipped API endpoint
- End-to-end verification across API + web + admin
- Merging agent branches and resolving conflicts
- Final validation run (`lint`, `typecheck`, tests, targeted build)

---

## Parallelisation discipline

> **Parallelize independent work. Serialize dependent work.**
>
> Do not parallelize a task merely because another agent is available.

Two tasks may run in parallel only if **all** hold:

1. They share no files.
2. Neither needs the other's output (including a regenerated Prisma client).
3. Each can be validated on its own.
4. Neither touches a single-writer file (schema, migrations, permission
   constants, RBAC matrix, `app.module.ts`, guards).

If any fails, they are sequential — even if that is slower.

Full guidance and worked examples:
[`docs/development/parallel-work.md`](docs/development/parallel-work.md).
Branch and worktree mechanics:
[`docs/development/git-worktrees.md`](docs/development/git-worktrees.md).

---

## Plan lifecycle

1. **Architect** writes the ExecPlan, verifying every claim against the
   repository. See [`.agent/agents/architect.md`](.agent/agents/architect.md).
2. A human approves it. **Implementation does not start on an unapproved plan.**
3. **Specialists** take one labelled task each, routed by the kind of work:
   [`backend-api.md`](.agent/agents/backend-api.md),
   [`frontend.md`](.agent/agents/frontend.md),
   [`database.md`](.agent/agents/database.md),
   [`integration.md`](.agent/agents/integration.md), and
   [`ui-ux.md`](.agent/agents/ui-ux.md) (read-only by default).
   > There is deliberately **no** generic `implementer` role. This step used to
   > link `.agent/agents/implementer.md`, which was deleted as superseded by the
   > five specialists above — see the delete/modify case in
   > [`.agent/agents/integrator.md`](.agent/agents/integrator.md). The link
   > outlived the file because nothing validated it; `validate-framework.mjs`
   > now resolves every `.agent/agents/*.md` reference.
4. **Reviewer** reviews the completed change against the plan and the security
   checklist, without modifying code. See
   [`.agent/agents/reviewer.md`](.agent/agents/reviewer.md).
5. Integration tasks run, full validation runs, the plan's Definition of Done is
   checked off.
6. The plan is archived where the team keeps them (Obsidian
   `06 - Implementation Plans/`); durable *decisions* it produced become ADRs in
   [`docs/decisions/`](docs/decisions/).

If reality diverges from the plan during implementation, **update the plan and
say so** in the change summary. A silently abandoned plan is worse than no plan.
