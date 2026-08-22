---
ID: BUG-0283
aliases: [BUG-0283]
Title: A regenerated Prisma client against an un-migrated database 500s every affected screen
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: cf9ea47
AffectedModules: [services/api, services/api/prisma, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-204
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0283 — A regenerated Prisma client against an un-migrated database 500s every affected screen

## Summary

A development database can be behind the committed migrations indefinitely
without anything breaking, because the generated Prisma client in
`node_modules` is usually just as far behind — it does not select the columns
that do not exist, so the two stale artifacts agree. The moment anyone runs
`prisma generate` for an unrelated reason, the client catches up, the database
does not, and every query touching a new column returns `P2022`.

The observed instance: `GET /api/platform-runtime/plans` returned 500 with
`column PlanPrice.overageUnitAmount does not exist`, thirty minutes after a
`prisma generate` run to clear stale type errors. Four migrations dated
2026-08-20 had never been applied locally.

## Expected Behavior

A developer learns that their database is behind before a screen 500s — ideally
when the API starts, which is the moment the mismatch becomes reachable.

## Actual Behavior

Nothing warns. The failure surfaces as a `PRISMA_KNOWN_REQUEST_ERROR` on
whichever screen happens to touch the newest column first, attributed to that
screen and to whoever was using it.

## Reproduction

1. Leave a development database several migrations behind.
2. Run `npm run prisma:generate` for any reason.
3. Open Platform Admin → Plans. The list 500s with `P2022`.
4. `npx prisma migrate status --config prisma.config.ts` — four migrations
   pending.

## Evidence

- Error reference `admin_ea542453-d96e-4b1b-9204-34e65a1c7d44`,
  2026-08-21T15:43:54Z: `ColumnNotFound PlanPrice.overageUnitAmount`,
  `db.plan.findMany()` in `plans.repository.ts:12`.
- `node_modules/.prisma/client/index.d.ts` mtime 2026-08-21T15:13:56Z — thirty
  minutes before the error.
- `20260820140000_planprice_billing_model_uniqueness_and_overage` adds the
  column and was unapplied, along with the three `identity_*` migrations dated
  the same day.
- `npm run db:preflight` reports exactly this — `MIGRATION_STATUS` — and nothing
  runs it.

## Root Cause

Two independently-cached derivations of one schema, with no check that they
agree. `scripts/check-prisma-client-fresh.mjs` compares the *client* to
`schema.prisma` and runs in `api:check-types`; nothing compares the *database*
to the migration history outside the `db:preflight` script an agent has to
remember to invoke.

## Impact

Development only — deployment runs `prisma migrate deploy` through
`npm run release:api`, so production cannot reach this state. The cost is
diagnostic: the failure looks like a code regression in an unrelated module and
was reported as one.

## Affected Areas

Local development for every workspace that reads the database.

## Proposed Resolution

**Needs a decision on placement, not an ExecPlan.** Options, in increasing
intrusiveness:

1. `predev` on `services/api` runs `prisma migrate status` and prints a loud
   warning when migrations are pending. Non-blocking; a developer mid-branch
   may legitimately be behind.
2. The API logs a startup warning naming the pending migrations.
3. `db:preflight` becomes part of the standard task preamble in
   `.agent/context`, so an agent runs it before touching a database-backed
   screen.

Option 1 plus 3 is the recommendation. Refusing to boot is deliberately not
proposed: a developer who is deliberately on an older database should not be
locked out of the whole API.

## Acceptance Criteria

- Starting the API against a database behind the committed migrations produces
  a warning that names them.
- The warning does not block startup.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

[[BUG-0282]] — the sibling case, where the stale derivation was a generated
manifest rather than a generated client.

## Resolution

Fixed 2026-08-22, branch `agent/backlog-burndown`.

Option 2 of the three the record proposed, because it is the one the acceptance
criteria actually describe: "starting the API against a database behind the
committed migrations produces a warning that names them".

`PrismaService.onModuleInit` compares migration directory names against
`_prisma_migrations` and logs a warning naming each pending migration, what will
fail (`P2022`), and the command that fixes it. Startup continues — a developer
deliberately working against an older database should not be locked out of the
whole API, and refusing to boot over a condition that is often intentional is how
a warning gets ignored.

Option 3 landed alongside it: `AGENTS.md`'s implementation process now says to
run `db:preflight` before touching a database-backed screen, and says why.

Option 1 (`predev`) was not taken. It fires once, before the session that matters,
and the moment the mismatch becomes reachable is startup rather than install.

## QA Retest

```text
services/api  src/common/prisma/migration-drift.spec.ts   18 tests PASS
services/api  full suite                                  1634 tests PASS
```

Scenario `QA-DEPLOY-019`. The integration half — pointing the API at a genuinely
behind database and reading the log — is described in the scenario and was not
run here; the unit coverage asserts the naming, the ordering, and that neither a
missing `_prisma_migrations` table nor a filesystem failure can break startup.
### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-204 names `services/api/src/common/prisma/migration-drift.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — reported by the user from an admin error log; root-caused to
  migration drift made visible by a `prisma generate` run earlier the same
  session.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]], [[database-architecture]], [[platform-admin]]
- Regression — REG-204 (see the regression register)

<!-- GRAPH:END -->
