---
ID: BUG-0086
aliases: [BUG-0086]
Title: Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-20
DetectedInSha: d6aa738
AffectedModules: [services/api/prisma]
OwnerAgent: release-devops
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-203
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0086 — Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint

## Summary

Production deploys on Render run `prisma migrate deploy` inside
`preDeployCommand`, and that step now fails with `P1002` while trying to take the
migration advisory lock. The API's `DATABASE_URL` points at Neon's **pooled**
endpoint — the hostname carrying the `-pooler` infix — which is PgBouncer in
transaction pooling mode. `prisma migrate deploy` serialises concurrent migrators
with a *session-scoped* advisory lock (`pg_advisory_lock`), and session-scoped
locks cannot be held across a transaction pooler, because consecutive statements
are not guaranteed to reach the same backend connection. The lock is therefore
not slow to acquire, it is unobtainable, and the ten-second timeout is reached
every time. The repository has no separate direct-connection URL for migrations,
so no configuration currently makes this step succeed while `DATABASE_URL`
remains pooled.

## Expected Behavior

`npm --workspace api run release` — and therefore every production deploy —
applies pending migrations and continues into the seed and legal-publication
steps. Migration commands connect over a **direct** (non-pooled) Postgres
connection, because they require session-level state that a transaction pooler
does not preserve.

## Actual Behavior

`prisma migrate deploy` reads the schema, reports the migration directory, then
fails after roughly ten seconds:

```
Error: P1002
The database server was reached but timed out.
Context: Timed out trying to acquire a postgres advisory lock
(SELECT pg_advisory_lock(72707369)). Timeout: 10000ms.
```

The Render build is marked failed. Because the failure happens in
`preDeployCommand`, nothing after the migration step in the `release` chain
executes.

## Reproduction

1. Configure `DATABASE_URL` on the Render service `dijipeople-api` to a Neon
   connection string whose host contains the `-pooler` infix (Neon's
   "Connection pooling — enabled" string).
2. Trigger a deploy of `services/api`.
3. `preDeployCommand` runs `npm --workspace api run release`, whose first step is
   `npm run prisma:migrate:deploy`
   (`services/api/package.json:46` then `services/api/package.json:31`).
4. Observe the datasource line naming the pooled host, then
   `217 migrations found in prisma/migrations`, then `Error: P1002` after ~10s.
5. The deploy aborts; the previously deployed revision keeps serving.

The failure is deterministic — a property of the endpoint type, not a race or a
transient network condition. Re-running the deploy reproduces it.

## Evidence

Render deploy log, 2026-08-20, timestamps in UTC:

```
2026-08-20T20:26:29Z  Datasource "db": PostgreSQL database "neondb", schema
                      "public" at "ep-<redacted>-pooler.<region>.aws.neon.tech"
2026-08-20T20:26:29Z  217 migrations found in prisma/migrations
2026-08-20T20:26:39Z  Error: P1002
2026-08-20T20:26:39Z  Context: Timed out trying to acquire a postgres advisory
                      lock (SELECT pg_advisory_lock(72707369)). Timeout: 10000ms.
2026-08-20T20:26:39Z  ==> Build failed
```

The endpoint identifier is redacted above deliberately; it is half of a
connection string and this record must not carry one.

Configuration that produces it:

- `services/api/prisma/schema.prisma:11-13` — the `datasource db` block declares
  `provider` only. There is no `url` and no `directUrl`.
- `services/api/prisma.config.ts:12-13` — the datasource url is supplied as
  `url: env('DATABASE_URL')`. This single value is used by every Prisma CLI
  invocation in the repository, migrations included.
- `render.yaml:8` — `preDeployCommand: npm --workspace api run release`.
- `services/api/package.json:46` — `release` begins with `prisma:migrate:deploy`.

Confirmed absent: a repository-wide search for `directUrl`, `DIRECT_URL`,
`DIRECT_DATABASE_URL`, `pooler` and `pgbouncer` across `*.md`, `*.ts`, `*.json`
and `*.yaml` returns no configuration match. The only `P1002` occurrences are
runtime error-classification branches
(`services/api/src/common/filters/http-exception.filter.ts:503`,
`services/api/src/common/guards/jwt-auth.guard.ts:442`,
`services/api/src/modules/error-logs/error-logs.service.ts:356`), which map the
code to `DATABASE_CONNECTION_FAILED` for API responses and are unrelated to the
migration path.

## Root Cause

`prisma migrate deploy` acquires a session-level Postgres advisory lock before
applying migrations, so two concurrent deploys cannot apply the same migration
twice. Session-level advisory locks are bound to a backend connection and persist
across transactions.

Neon's pooled endpoint is PgBouncer in transaction pooling mode, where a client
connection is mapped to a backend connection only for the duration of a
transaction. A session-scoped lock therefore cannot be established and held for
the life of the migration run. This is a documented limitation of transaction
pooling — not a Neon defect and not a Prisma defect.

Because `prisma.config.ts` supplies one url for all Prisma CLI operations and the
schema declares no `directUrl`, migrations inherit whatever `DATABASE_URL` the
runtime uses. When that value is the pooled endpoint, the migration step cannot
succeed at any timeout value.

A stale advisory lock left by an interrupted earlier migration would produce the
same `P1002` symptom and should be excluded during triage, but it does not
explain a deterministic failure against a pooled host.

## Impact

- **Every production release is blocked.** No migration can be applied while
  `DATABASE_URL` is pooled, and `preDeployCommand` aborts the deploy.
- **The rest of the release chain never runs.** `seed:config`, `seed:verify`,
  `seed:admin`, `seed:legal` and `legal:publish -- --confirm` all sit after
  `prisma:migrate:deploy` in `services/api/package.json:46`. A deploy that fails
  here leaves configuration seeding and legal-document publication unperformed.
- **Production availability is not affected.** Render retains the previously
  deployed revision when a build fails. At the time of detection the live API
  answered `GET /api` with `status: ok` on commit `b4d2b56`.
- **Reachable in production: yes** — this is production configuration, and
  production is the only environment currently using Neon.

## Affected Areas

- `services/api/prisma.config.ts` — single datasource url for all CLI operations
- `services/api/prisma/schema.prisma` — datasource block without `directUrl`
- `services/api/package.json` — the `release` chain and `prisma:migrate:deploy`
- `render.yaml` — `preDeployCommand`, and the `DATABASE_URL` declaration
- `docs/environment-variables.md`, `docs/deployment/environments.md` — neither
  documents a direct-versus-pooled distinction
- Deployment of every future migration, on any environment that adopts a pooler

## Proposed Resolution

Separate the migration connection from the runtime connection so the choice is
explicit rather than incidental. A direction, not a patch:

1. Introduce a dedicated migration URL — `DIRECT_DATABASE_URL` — and have Prisma
   CLI operations use it, falling back to `DATABASE_URL` where it is unset so
   local development is unaffected.
2. Declare it in `render.yaml` with `sync: false`, and register it in
   `packages/config` validation, `turbo.json` `globalEnv` and
   `docs/environment-variables.md`, as the Security checklist in `AGENTS.md`
   requires for any new environment variable.
3. Document the direct-versus-pooled distinction in
   `docs/deployment/environments.md` so the next environment does not repeat it.

**Interim unblock, available without a code change:** set `DATABASE_URL` on
Render to Neon's direct (non-pooled) endpoint. A single long-lived Render service
does not need the pooler, so this is a legitimate resting state rather than only
a workaround — but it leaves the trap in place for whoever re-enables pooling
later, which is why the code change is still wanted.

No ExecPlan is required: no schema change, no migration, no destructive
operation. This is configuration plus documentation.

## Acceptance Criteria

1. `npm --workspace api run release` completes on a Render deploy with Neon
   configured, applying pending migrations and continuing through
   `legal:publish`.
2. Migrations connect over a direct endpoint even when the runtime
   `DATABASE_URL` names a pooled one, verified from the datasource line in the
   deploy log.
3. `DIRECT_DATABASE_URL` (or the agreed name) is declared in `render.yaml`,
   registered in `packages/config` validation and `turbo.json` `globalEnv`, and
   documented in `docs/environment-variables.md`.
4. Local development with a single `DATABASE_URL` and no direct URL set continues
   to work unchanged.
5. `docs/deployment/environments.md` states which operations require a direct
   connection and why.

## Regression Coverage

A regression test must fail without the fix. The testable invariant is
configuration, not runtime behaviour: **the URL used for migrations must not name
a pooled endpoint.**

Proposed shape — a unit-level assertion over the resolved migration url that
rejects a host containing `-pooler` (or a `pgbouncer=true` parameter) when
`PLATFORM_ENVIRONMENT` is production-like, mirroring how `assertAuthEnvironment`
refuses unsafe auth configuration at boot rather than failing later. A `REG-nnn`
entry is to be allocated when that test lands; there is no regression id yet, and
this section must not claim one before it exists.

## Dependencies

None blocking. The interim unblock is a Render dashboard change owned by the
user; the durable fix is a repository change and can proceed independently.

## Related Items

- [[BUG-0085]] — the other defect found in the same `release` chain during a
  first deploy; that one aborted on missing bootstrap variables, this one on the
  migration step immediately before those.
- [[SESSION-0024]] — the session that recorded this bug.

## Resolution

Fixed 2026-08-22, branch `agent/backlog-burndown`.

`DIRECT_DATABASE_URL` names the migration connection. `prisma.config.ts` prefers
it and falls back to `DATABASE_URL` when unset, so local development and CI — one
plain Postgres, no pooler — set nothing and behave exactly as before.

The resolution and the pooled-endpoint test live in `packages/config/database-urls.js`
rather than in the Prisma config, so `validateDeploymentEnv` can apply the same
rule at API boot and a unit test can assert it without a database. A url that
carries the `-pooler` infix, or sets `pgbouncer=true`, is recognised as pooled.

When the url migrations *would* use names a pooled endpoint, config load fails
immediately with a message naming the variable to set — rather than the deploy
failing ten seconds later with an advisory lock id and no explanation.

Registered where the Security checklist requires: `render.yaml` with
`sync: false`, `turbo.json` `globalEnv`, `docs/environment-variables.md`, and
`services/api/.env.production.example`. `docs/deployment/environments.md` gained
a table of which operations need a direct connection and why, so the next
environment does not repeat it.

### Production configuration — checked 2026-08-22, SESSION-0040

`prisma migrate status` against production reports **217 of 217 `main`
migrations applied**, and the host it names carries no `-pooler` infix.

So production's `DATABASE_URL` is the **direct** endpoint today, and migrations
have been resolving to it all along. `DIRECT_DATABASE_URL` is therefore not
required on Render right now, and an earlier note in this session's history
record saying it "must be set before the next production deploy" was wrong — it
inferred the pooled configuration from this record's report rather than checking
what production is set to.

The fix is not thereby pointless, and the conditional is the part to keep: the
pooled endpoint is the better choice for a runtime that opens many short-lived
connections, and the moment anybody makes that change for performance,
migrations break. What this record's fix buys is that they break *at config
load, naming the variable to set*, instead of ten seconds into
`preDeployCommand` on a `P1002` naming an advisory lock id — and that
`DIRECT_DATABASE_URL` is already declared in `render.yaml`, `turbo.json` and the
environment documentation, so setting it is a dashboard change rather than a
code change made under deployment pressure.

## QA Retest

Verified against the real Prisma CLI rather than by reading:

```text
DATABASE_URL=<pooled>                              prisma validate  FAILS, naming DIRECT_DATABASE_URL
DATABASE_URL=<pooled> DIRECT_DATABASE_URL=<direct> prisma validate  PASSES
DATABASE_URL=<local>  (no override)                prisma validate  PASSES
packages/config/database-urls.test.js              18 tests PASS
```

Scenario `QA-DEPLOY-018`. The production half — a Render deploy applying
migrations through the direct endpoint and continuing into seeding and legal
publication — is not retested here and belongs to a deployment QA run against the
service, because this branch cannot reach that environment.
### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-203 names `packages/config/database-urls.test.js`, and that is what was executed.

```text
node --test   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-20 — created from user report at `d6aa738`.
- 2026-08-20 — root cause established from the Render deploy log and the
  datasource configuration; no fix applied, by instruction.
- 2026-08-20 — triaged `FIX_NOW`. `DEFER` was considered and rejected: the
  validator pairs that disposition with `Status: DEFERRED`, which would file a
  release-blocking defect in the deferred bucket and misrepresent it. The user
  has deliberately held the fix for a follow-up task, but that is scheduling,
  not a decision that the project accepts this state — so the record says what
  should happen and the `Resolution` section says what has not happened yet.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[database-architecture]]
- Regression — REG-203 (see the regression register)

<!-- GRAPH:END -->
