---
ID: BUG-0083
aliases: [BUG-0083]
Title: The Database Agent preflight reports PASS on a database with every migration unapplied
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-20
DetectedInSha: 844b6d3
AffectedModules: [scripts, .agent, services/api]
OwnerAgent: database
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-078
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
ResolvedAt: 2026-08-20
---

# BUG-0083 — The Database Agent preflight reports PASS on a database with every migration unapplied

## Summary

The Database Agent owns a four-link coherence invariant — `schema.prisma →
migration state → generated Prisma Client → local PostgreSQL → application` —
and `scripts/db-preflight.mjs` is the tool that proves it. The tool has four
independent defects that together let the invariant break in the one checkout a
human uses, silently, on every schema-changing task. Most directly:
`DATABASE_AGENT_STATUS = PASS`, exit code `0`, against a database with **213
committed migrations unapplied**.

The user hit the consequence: after TASK-0008 integrated into `develop`,
`npm run start:dev` refused to boot with a stale generated client missing seven
`SubscriptionOrder` fields, and the local database was three migrations behind.

## Expected Behavior

A task that lands a Prisma migration leaves the primary checkout able to run the
application, or reports that it did not. The Database Agent's own gate returns a
failing verdict when any of the four links disagree, and never returns `PASS`
for a link it could not inspect.

## Actual Behavior

Four separate failures, each independently sufficient:

| # | Defect | Effect |
|---|---|---|
| D1 | `PENDING_MIGRATIONS` and `DATABASE_MISMATCH` were absent from the `blocking` list | `DATABASE_AGENT_STATUS = PASS`, exit `0`, on a database with every migration unapplied |
| D2 | `UNKNOWN` fields did not affect the verdict | `PASS` printed directly above the tool's own paragraph "UNKNOWN is not an acceptable resting state" |
| D3 | `DATABASE_URL` read only from `process.env` | `no DATABASE_URL … nothing to compare against` on a machine where the database was running and reachable via `services/api/.env` |
| D4 | The tool is **preflight only** | The invariant is verified *before* the agent writes the migration that breaks it, and never again |

D3 manufactured the `UNKNOWN`s that D2 then waved through, and D4 meant nothing
re-checked after the work. D1 is what remains once a database *is* visible.

A fifth, smaller one: `schemaStatus()` reported `SCHEMA_STATUS = STALE` when the
`prisma` CLI simply could not be invoked (a worktree with no `node_modules`),
accusing a schema nobody had validated.

## Reproduction

```bash
# D1 — the headline
createdb dbcoherence_probe                  # empty; no migrations applied
DATABASE_URL=<probe> node scripts/db-preflight.mjs
#   DATABASE_AGENT_STATUS        PASS
#   MIGRATION_STATUS             PENDING_MIGRATIONS
#   LOCAL_DATABASE_STATUS        DATABASE_MISMATCH
#   exit 0

# D3 — on a machine with a working local database and no exported DATABASE_URL
node scripts/db-preflight.mjs
#   MIGRATION_STATUS             UNKNOWN
#   migrations   DATABASE_URL is not set — nothing to compare the history against
npm run prisma:migrate:status               # …works fine, reads services/api/.env
```

D4, as the user met it, at `844b6d3` on `develop`:

```
npm run start:dev
prisma freshness: THE GENERATED CLIENT IS STALE.
  Missing fields (7):
    - SubscriptionOrder.requestedSlug
    - SubscriptionOrder.ownerEmailVerifiedAt
    …
npx prisma migrate status
  Following migrations have not yet been applied:
    20260819090000_subscription_order_requested_slug
    20260819140000_subscription_order_email_verification
    20260819160000_subscription_order_owner_job_title
```

## Evidence

The same empty probe database, old script versus new, measured directly:

| | old (`844b6d3`) | new |
|---|---|---|
| `DATABASE_AGENT_STATUS` | `PASS` | `BLOCKED` |
| `MIGRATION_STATUS` | `PENDING_MIGRATIONS` | `PENDING_MIGRATIONS` |
| `LOCAL_DATABASE_STATUS` | `DATABASE_MISMATCH` | `DATABASE_MISMATCH` |
| exit code | `0` | `1` |

The old script printed the two failing fields and the passing verdict *in the
same output*. Nothing had to go wrong for the contradiction to appear — it was
the ordinary path.

`scripts/db-preflight.mjs` before the fix:

```js
const blocking = [
  state.schema.status !== 'CURRENT' ? … : null,
  state.prismaClient.status === 'CLIENT_MISMATCH' ? … : null,
  state.migration.status === 'MIGRATION_DRIFT' ? … : null,
].filter(Boolean);                          // PENDING_MIGRATIONS is not here

const agentStatus = blocking.length ? 'BLOCKED' : 'PASS';   // UNKNOWN → PASS
```

TASK-0008's finalization block, recording the gap from the other side —
every field resolved, the checkout unable to boot:

```
PRIMARY_WORKTREE_STATUS           CLEAN
POST_INTEGRATION_GENERATOR_STATUS DONE — backlog, QA, tasks, sessions, dashboards
```

## Root Cause

**The invariant was owned at one end only.**

`db-preflight.mjs` is preflight by name, by its placement in the required-agent
matrix ("before a dependent agent writes code against a stale client"), and by
the fact that none of its seven fields appears in the task completion contract.
So the Database Agent verifies coherence, then breaks it by authoring the
migration, and no gate re-asks. The invariant is a property of a moment nobody
measures.

The verdict logic then made that gap invisible rather than loud. `PASS` was the
default for everything not explicitly enumerated as blocking, so both "behind"
and "could not look" landed on the passing branch.

Repository health does not cover it either, and reasonably believed it did:
`POST_INTEGRATION_GENERATOR_STATUS` is defined over generators that write
**tracked** files. The generated Prisma client is untracked, which makes the one
generator whose staleness stops the API from starting the one generator no
completion field can see.

This is the [[stale-generated-artifact]] class that [[BUG-0060]] and
[[BUG-0068]] already established, arriving a third time through the gate built
to stop it. BUG-0060 fixed the *developer-facing* symptom by adding
`check-prisma-client-fresh.mjs` to `prestart:dev`; BUG-0068 widened it to
fields. Neither made it an *agent-facing* gate, so the guard kept catching the
human instead of the task that caused it.

## Impact

Development-time and framework integrity; no production, tenant or runtime-data
impact. Two costs:

- Every schema-changing task hands the next person a checkout that will not
  boot. The freshness guard names the client, so they run `prisma:generate` —
  and then boot against a database missing the columns the client now declares,
  because nothing named the migrations. That second failure has no guard at all.
- A gate that returns `PASS` on a fully un-migrated database is worse than no
  gate, because the framework reports the invariant as verified.

## Affected Areas

`scripts/db-preflight.mjs`, `.agent/agents/database.md`,
`.agent/context/task-completion-contract.md`, `.agent/context/agent-handoffs.md`,
root `package.json`, `AGENTS.md`.

## Proposed Resolution

Make the check honest, make it visible, and make it run at both ends. No
ExecPlan required — it is confined to the framework's own tooling and docs, and
changes no application behaviour.

## Acceptance Criteria

- `PENDING_MIGRATIONS` / `DATABASE_MISMATCH` / `UNREACHABLE` produce a failing
  verdict and a non-zero exit. **Met.**
- No `UNKNOWN` field can coexist with `PASS`; `INCOMPLETE` is a distinct verdict
  from `BLOCKED`. **Met.**
- `DATABASE_URL` is discovered wherever Prisma itself finds it, including
  `services/api/.env`. **Met.**
- The tool cannot report `STALE` for a schema it failed to validate. **Met.**
- A postflight resolves the invariant against the **primary** checkout after
  integration, and `DATABASE_COHERENCE_STATUS` blocks completion for any task
  that touched schema, a migration or a seed. **Met.**

## Regression Coverage

[REG-078](../qa/regressions/index.md) — `scripts/db-preflight.test.mjs`, run by `npm run test:db-preflight`.
Mutation-tested against a throwaway database rather than asserted: an empty
database with 213 unapplied migrations makes the verdict `BLOCKED` and the exit
code `1`; restoring the old `blocking` list makes the same input report `PASS`
and exit `0`.

## Dependencies

None.

## Related Items

[[BUG-0060]] · [[BUG-0068]] · [[stale-generated-artifact]] · [[doc-code-drift]]
· [[TASK-0008]]

## Resolution

Fixed 2026-08-20 on `agent/db-coherence-postflight`.

1. `scripts/db-preflight.mjs` — `PENDING_MIGRATIONS`, `DATABASE_MISMATCH` and
   `UNREACHABLE` added to `blocking`; `INCOMPLETE` introduced so an `UNKNOWN`
   field can never report `PASS`; `DATABASE_URL` resolved from
   `services/api/.env` as well as the process environment; `SCHEMA_STATUS`
   returns `UNKNOWN` rather than `STALE` when the CLI cannot be invoked; every
   check parameterised by checkout so it can answer about a checkout other than
   the one it is standing in.
2. `--postflight` added, resolving the primary checkout from `git worktree list`
   and emitting `DATABASE_COHERENCE_STATUS`.
3. `npm run db:preflight` / `npm run db:postflight` — the tool had no npm script
   at all, so it was absent from the command surface `AGENTS.md` tells agents is
   exhaustive.
4. `DATABASE_COHERENCE_STATUS` added to the completion contract and enforced by
   `scripts/validate-framework.mjs`.

The user's environment was repaired with the documented non-destructive path:
`prisma:generate`, then `prisma:migrate:deploy` for the three additive
migrations. No reset, no `db push`, no data loss.

## QA Retest

Verified against the live local PostgreSQL and a throwaway probe database.

```
postflight, primary checkout, after repair
  SCHEMA_STATUS          CURRENT     MIGRATION_STATUS       CURRENT
  PRISMA_CLIENT_STATUS   CURRENT     LOCAL_DATABASE_STATUS  CURRENT
  DATABASE_COHERENCE_STATUS  PASS

postflight, empty probe database, 213 migrations unapplied
  DATABASE_COHERENCE_STATUS  BLOCKED     exit 1
```

## History

- 2026-08-20 — reported from the developer terminal as `start:dev` refusing to
  boot after TASK-0008 integrated; diagnosed not as a stale artifact but as the
  gate that was supposed to catch stale artifacts returning `PASS`.
