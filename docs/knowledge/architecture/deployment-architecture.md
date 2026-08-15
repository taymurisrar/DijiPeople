# Deployment Architecture

> Generated from repository evidence at `ad8f77f`.

## Components and order

Deployment order derives from the dependency graph. The general rule:

```
backward-compatible migration → API → frontends → background work
```

- If a frontend depends on a new API contract, **the API must be compatible
  first**.
- Prefer additive, backward-compatible API changes.
- Field removal or rename uses **expand → migrate → contract**.
- Never deploy breaking database, API and frontend changes simultaneously
  without an explicit coordinated plan and a stated downtime window.

Old frontend against new backend should keep working during rollout.

## Migrations in the release chain

The production path is `prisma migrate deploy`, wrapped by
`npm run release:api`. **`prisma migrate dev` is never run against a deployed
environment** — it is interactive, can author migrations, and can reset the
database.

Before any production migration: inspect the generated SQL, identify destructive
operations and table locks, determine rollback feasibility, confirm the backup
path, and **verify `DATABASE_URL` points at the intended target**. If the target
cannot be confirmed, stop. Migrating the wrong database is unrecoverable in the
way that matters.

## Rollback classes

Determined **before** deploying, not after something breaks:

| Class | Rollback |
|---|---|
| `CODE_ONLY` | ROLLBACK_SAFE — redeploy the previous SHA |
| `CONFIG` | ROLLBACK_SAFE |
| `DATABASE_ADDITIVE` | ROLLBACK_SAFE — new columns unused by old code |
| `DATABASE_DESTRUCTIVE` | **MANUAL_RECOVERY_REQUIRED** — restore from backup |
| `DATA_MIGRATION` | FORWARD_FIX_PREFERRED — reversing transforms loses data |
| `EXTERNAL_INTEGRATION` | FORWARD_FIX_PREFERRED — external state already changed |
| `MULTI_COMPONENT_CONTRACT` | Ordered rollback, reverse of deployment order |

**A destructive migration is not reversible.** Dropping a column is not undone
by redeploying the previous commit.

## Observability: almost none

Verified at this commit — no Sentry, Datadog, OpenTelemetry, Prometheus or
log-shipping dependency exists anywhere in this repository. What exists is
`/api/health`, a second health endpoint under billing, and Render's console.

Two consequences that belong in **every** release record:

- **The deployed SHA is not exposed**, so there is no way to confirm from
  outside which commit is serving traffic. [[ITEM-0010]].
- **Render's `healthCheckPath: /api` can report healthy while the database is
  unreachable.** A 200 from `/api` is not proof the system works.

The broader gap is [[ITEM-0009]]. Neither is fixed by building an observability
platform inside a release task.

## Records

The Integrator records **Git history** under `docs/engineering-history/tasks/`;
Release/DevOps records **deployed state** under
`docs/deployment/release-history/`. A merge commit is not evidence that code is
running. Both are empty until their first real use, which is a true statement
about this repository rather than a gap.

## Related

[[system-architecture]] · [[database-architecture]] ·
[[tenant-workspace-routing]] · [[qa-and-ci-architecture]] ·
[[integration-architecture]]

Source: `.agent/context/deployment-runtime.md`,
`.agent/agents/release-devops.md`, `docs/deployment/`,
`docs/environment-variables.md`.
