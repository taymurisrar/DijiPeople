# ExecPlan — {{title}}

> Mirrors the ExecPlan structure defined in `PLANS.md` in the repository.
> `PLANS.md` is authoritative; if the two differ, fix this template.
>
> **Every section is mandatory.** Write "None" with a one-line reason rather
> than deleting a section — a deleted section reads as "not considered".
>
> **Verify every claim against the repository and cite file paths.**
> "The service already validates this" is not a finding;
> `services/api/src/modules/x/x.service.ts:120` is.

**Author:**  **Date:** {{date}}  **Status:** Draft / Approved / In progress / Done
**Related requirement:** `[[Feature — ...]]`

---

## Objective

One paragraph. What will be true when this is done.

## Business requirement

The requirement in product terms. Mark anything unconfirmed as
`TODO: Confirm product/business rule.` rather than inventing it.

## Existing behavior

What the system does today, with file references. Include what already works
that must keep working.

## Existing architecture

Modules, services, repositories, registries, components and models involved,
with paths. Which existing patterns this must follow.

## Requirements

1.
2.

Numbered and testable; each maps to at least one acceptance criterion.

## Dependencies

Other work, decisions, data, credentials or external systems. What is blocking.

## Files / modules affected

Grouped by workspace. **Flag single-writer files:**
`services/api/prisma/schema.prisma`, `prisma/migrations/`,
`services/api/src/common/constants/permissions.ts`,
`services/api/src/common/constants/rbac-matrix.ts`,
`services/api/src/app.module.ts`, `services/api/src/common/guards/*`,
`packages/config/platform-runtime-schema.generated.json`,
`apps/web/lib/security-keys.ts`.

## Database impact

Models added/changed. Migration name and shape. Indexes. Tenant-scoped
uniqueness. Backfill script and its idempotency. Expand/backfill/contract
staging for destructive changes. `None` if no schema change.

## Backend impact

Modules, controllers, services, repositories, DTOs. New endpoints with method,
path, request and response shape. Transaction boundaries. Existing services
reused rather than reimplemented.

## Frontend impact

Which app. Module runtime / settings runtime, or bespoke — and if bespoke, why
the runtime cannot express it. Shared components reused. Loading, error, empty
and access-denied states. Responsiveness and accessibility.

## Permission / RBAC impact

- New/changed keys in `common/constants/permissions.ts`
- New/changed entries in `common/constants/rbac-matrix.ts`
- Roles receiving them, and the `seed-config.ts` grant + `verify-seed-config.ts`
  assertion
- Endpoint decorators: **both** `@Permissions(...)` and `@RequirePermission(...)`
- Access levels and where `buildScopedAccessWhere()` is applied
- Any elevated-role bypass involved
- Keys to mirror into `apps/web/lib/security-keys.ts`

## Tenant-isolation impact

For every new/changed query: where `tenantId` comes from (must be
`request.user.tenantId`) and how ownership is verified. Any platform-path
cross-tenant access, explicitly justified. How a reviewer confirms no
cross-tenant read or write is possible.

## Audit / event / logging impact

Operations calling `AuditService.log()`, with action names, entity types and
snapshot contents. Platform events. Notification events. What must never be
logged.

## Integration impact

External systems touched. Contract changes to the .NET gateway, desktop agent,
Stripe, email or storage. Backward compatibility for already-deployed clients.

## Migration / data compatibility

How stored data behaves under the new code. How deployed clients behave against
the new API. Whether old and new can run simultaneously during rollout.

## Parallel-safe tasks

- `[PARALLEL_SAFE]` — branch `agent/<feature>-<scope>`

## Dependency-blocked tasks

- `[DEPENDENCY_BLOCKED]` — blocked by ..., unblocked when ...

## Integration tasks

- `[INTEGRATION]` — runs after ..., single owner

## Testing strategy

Specific commands from `AGENTS.md` — **do not invent commands**. Existing spec
files to extend. New specs and what they assert. Manual verification steps with
exact steps.

## Risks

Ranked, each with likelihood, impact and mitigation. Tenant isolation, RBAC,
data loss and payroll correctness first if in scope.

## Rollback considerations

How to undo this. If a migration is irreversible, say so and describe the
forward fix. What breaks if the frontend ships without the API, or the API
without the migration.

## Definition of Done

- [ ] Validation commands run and passing (list them)
- [ ] Audit in place
- [ ] Permissions wired in **both** systems, seeded and verified
- [ ] Tenant scoping verified on every new query
- [ ] `docs/architecture/` updated if architecture changed
- [ ] ADR written if a real choice was made
- [ ] No unrelated changes in the diff
- [ ]
