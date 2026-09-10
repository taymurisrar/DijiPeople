# Deployment Architecture

> Generated from repository evidence at `11afbd50`.

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

### `render.yaml` describes intent, not the live service

`render.yaml` is what the repository *asserts* the service is configured as.
It is not what Render is actually running, and the two have drifted before
without anything detecting it: the FILE-01/INF-05 remediation
([[SESSION-0097]]) removed a persistent disk from `render.yaml` that had
been declared there since an earlier task and had **never been applied to
the live service** — the API container had no disk attached the entire time,
so every file `StorageService` wrote to `FILE_STORAGE_DIR` was on the
container's ephemeral filesystem and was destroyed on every deploy, restart
and instance replacement. Nothing about the committed file was wrong-looking;
it simply described a configuration step that was never carried out on the
dashboard, and no check compares the two.

**Verify the live service's actual configuration — env vars, disk, deploy
command — against the Render API or dashboard directly before relying on
what `render.yaml` says it should be**, especially before trusting that a
migration will run automatically via `preDeployCommand`. When a schema change
must land ahead of code that depends on it, keep it **expand-only** (additive
columns/enums, no drops, no narrowing, no `NOT NULL` without a default) so it
is safe to apply before the deploy and safe to leave in place if the deploy
or the code rolls back — the object-storage metadata migration
(`20260910121838_add_object_storage_metadata`) was built this way specifically
so its timing relative to the code deploy did not matter.

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
[[integration-architecture]] · [[SESSION-0097]]

Source: `.agent/context/deployment-runtime.md`,
`.agent/agents/release-devops.md`, `docs/deployment/`,
`docs/environment-variables.md`.
