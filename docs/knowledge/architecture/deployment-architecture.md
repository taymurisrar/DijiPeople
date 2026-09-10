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

### Detecting the drift instead of only warning about it (ITEM-0084)

`npm run check:render-config` (`scripts/check-render-config.mjs`) makes the
paragraph above checkable rather than merely advisory. It reads `render.yaml`,
calls the Render API **read-only** (`GET` only — it never writes to Render),
and reports every field where the file and the live service disagree. It
requires `RENDER_API_KEY`; without it, it — and the `RENDER_CONFIG_STATUS` line
`npm run repo:health` prints — say **SKIPPED**, deliberately, rather than
silently reporting nothing.

Run at commit `f26357a8` (2026-09-11), it found real, current drift — not the
already-fixed BUG-0767 shape, but the same structural cause producing a new
instance of it:

- **Scalar fields**: `name` (`dijipeople-api` in the file vs `DijiPeople` on
  the live service), `plan` (`starter` vs `standard`), `buildCommand` (the file
  omits `--include=dev`, which the live service's build actually uses),
  `startCommand` (the file's is workspace-qualified, the live one is not — both
  resolve to the same script but the strings differ), and `healthCheckPath`
  (`/api` declared, **unset** on the live service — the health check running at
  all currently depends on Render's default, not on this file).
- **Env vars**: of the **51** keys `render.yaml` declares, **24** do not exist
  on the live service at all — including the entire email-provider block
  (`EMAIL_PROVIDER`, `EMAIL_SMTP_*`, `EMAIL_FROM*`), the seat-overage review
  thresholds, `TENANT_RETENTION_DAYS`, and the bootstrap
  `PLATFORM_SUPER_ADMIN_*` triple. This is a materially larger drift than the
  "13 of 16" figure BUG-0767 was fixed against — declared keys have grown from
  16 to 51 since, and the fraction missing has stayed almost exactly
  proportional (roughly half), which is the drift-over-time this item
  predicted, observed rather than assumed.
- **Annotated, not counted as drift**: `preDeployCommand` differs only by a
  `NODE_OPTIONS="--max-old-space-size=4096"` prefix on the live command — a
  deliberate memory cap, not an accident. The script shows this under its own
  heading instead of silently normalising it away.
- **Not drift** (not declared in the file at all, so there is no expectation to
  violate): `autoDeploy` (`yes`) and `branch` (`main`) on the live service.

None of this was corrected as part of adding the check — see [[ITEM-0084]] for
why: the item asked for detection, and the live service is production. Fixing
it is a separate, deliberate change with its own review, not a side effect of
writing a script.

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
