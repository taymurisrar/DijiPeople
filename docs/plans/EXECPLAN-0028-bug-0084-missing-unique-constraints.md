# ExecPlan — Add the seven unique constraints missing from the migration chain (BUG-0084)

```
CONTEXT_FILES_REQUIRED:
  - services/api/prisma/AGENTS.md
  - .agent/context/repository-health.md

SPECIALIST_AGENTS_REQUIRED:
  - database                 — the migration, the dedupe SQL, the staging
  - release-devops           — this runs inside preDeployCommand; a failure aborts a deploy
  - qa                       — retest of the four write paths whose behaviour changes
DELIBERATELY_NOT_USED:
  - frontend                 — no UI surface changes
  - security                 — no auth, permission or tenant-scoping change

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

REGRESSION_ENTRIES_IN_SCOPE:
  - none allocated (RegressionId is issued centrally)

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       PRODUCTION (phase 2 only, by a RELEASE task)
DEPLOYMENT_REQUIRED:      yes, for phase 2
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         pre-check (manual, read-only) -> database -> api
ROLLBACK_CLASS:           DATABASE_ADDITIVE
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0076 bug burndown; no other session holds the schema lease
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Seven uniqueness guarantees that `schema.prisma` declares, and that application
code relies on, are not enforced by Postgres. When this is done, either all
seven exist in the database, or the ones that should not exist have been removed
from the schema — and a check in the ordinary unit suite prevents an eighth
appearing unnoticed.

**This plan is not fully executable from the repository.** Phase 2 cannot be
written safely without knowing whether production already holds rows that
violate these constraints, and that question can only be answered by querying
production. Phases 0 and 3 are delivered now; phase 1 is a read-only query for
the platform owner; phase 2 is drafted here and deliberately **not** committed
as a migration.

## Business requirement

A uniqueness guarantee the code trusts must be one the database keeps.
Concretely: a support case must not accumulate duplicate incident links, a
partner onboarding submission must not share a version with another, and a
platform approval request number must identify one request.

No product behaviour changes for a correct database. The requirement is
integrity, not a feature.

## Existing behavior

Measured statically at commit `8399dc8e` by
`services/api/src/common/prisma/schema-unique-drift.ts`, which parses every
`@@unique` / `@unique` in `schema.prisma`, replays every `CREATE UNIQUE INDEX`,
`ADD CONSTRAINT ... UNIQUE`, rename and drop across all 223 migrations, and
matches the two by **(table, column set)** rather than by name — 55 indexes in
this chain carry a name Prisma would not have chosen, and name matching reports
all of them as missing.

288 unique declarations in the schema, 291 unique indexes live in the chain,
and **seven declarations with no corresponding index**:

| Implied index | Table (columns) | Nullable? |
|---|---|---|
| `HolidayCalendar_tenantId_name_key` | `HolidayCalendar` (tenantId, name) | no |
| `PartnerOnboardingApplication_invitationTokenHash_key` | `PartnerOnboardingApplication` (invitationTokenHash) | no |
| `PartnerOnboardingSubmission_applicationId_version_key` | `PartnerOnboardingSubmission` (applicationId, version) | no |
| `PartnerPortalUser_invitationTokenHash_key` | `PartnerPortalUser` (invitationTokenHash) | **yes** |
| `PlatformApprovalRequest_requestNumber_key` | `PlatformApprovalRequest` (requestNumber) | no |
| `PlatformApprovalStep_approvalRequestId_stepOrder_key` | `PlatformApprovalStep` (approvalRequestId, stepOrder) | no |
| `SupportCaseIncident_supportCaseId_errorLogId_key` | `SupportCaseIncident` (supportCaseId, errorLogId) | no |

This is the same seven the bug record measured on 2026-08-20 by applying the
chain to an empty database and running `prisma migrate diff`. Two independent
methods, one answer — the finding is not a parsing artefact.

The live consumers, verified in source:

- `support-cases.service.ts:389` — `supportCaseIncident.upsert` keyed on
  `supportCaseId_errorLogId`. With no constraint, Prisma emits `SELECT` then
  `INSERT` rather than `ON CONFLICT`, so it degrades from atomic to
  read-then-write and two concurrent links both insert.
- `attendance.service.ts:1917`, `leave.service.ts:1757` — compound `where` on
  `approvalRequestId_stepOrder`. Reads and updates are unaffected by the missing
  index; only `upsert` atomicity is.
- `partner-experience.service.ts:568` — `nextVersion` is read **outside** the
  transaction that then writes it, so a double-submit can produce two
  submissions at the same version.
- `contracts.service.ts:2581` — `requestNumber` is
  `APR-YYYYMMDD-<4 random bytes>` from `reference()`
  (`contracts.service.ts:5730`).

## Existing architecture

`services/api/prisma/schema.prisma` (single file, 14,061 lines, 318 models),
`services/api/prisma/migrations/` (223 migrations). Deployment applies them via
`npm run release:api` = `prisma:migrate:deploy` -> `seed:config` ->
`seed:verify` -> `seed:admin`, wired as Render's `preDeployCommand`.

**The consequence that shapes this whole plan:** a migration that raises an
error aborts `preDeployCommand`, which aborts the deployment. A
`CREATE UNIQUE INDEX` against a table holding duplicates raises an error. So a
naive migration does not fail in review — it fails in production, during a
release, with the API not coming up.

## Requirements

1. The exact set of missing constraints is measured from the repository, not
   quoted from a record. **Done** — seven, listed above.
2. The platform owner can determine, with one read-only query, whether
   production holds rows violating any of the seven, before anything deploys.
3. No migration that can abort a deployment is committed while requirement 2 is
   unanswered.
4. An eighth constraint drifting out of the chain fails a check that runs on
   every push, without needing a database.
5. Any constraint that turns out to be wrong in the schema is removed from the
   schema rather than forced onto the database.

## Dependencies

**Blocking.** Requirement 2 needs a query run against the production Neon
database by the platform owner. No agent in this session has, or should have,
that access. Nothing in phase 2 may be committed until its result is known.

## Files / modules affected

- `services/api/prisma/checks/bug-0084-unique-constraint-precheck.sql` — new,
  read-only (phase 1)
- `services/api/src/common/prisma/schema-unique-drift.ts` — new (phase 3)
- `services/api/src/common/prisma/schema-unique-drift.spec.ts` — new (phase 3)
- `services/api/prisma/schema.prisma` — **single-writer**, phase 2b only
- `services/api/prisma/migrations/<timestamp>_bug_0084_missing_unique_indexes/`
  — **single-writer**, phase 2, *not committed by this plan*

## Database impact

Additive: seven unique indexes, no column, model or type change, no data
statement. On a database with no duplicates each is near-instant at current row
counts (all seven are low-volume commercial or platform tables).

### Why not `CREATE UNIQUE INDEX CONCURRENTLY`

It cannot be used here, and the reason is mechanical rather than stylistic.
`CONCURRENTLY` cannot run inside a transaction block, and Prisma Migrate wraps
each migration file in one. **Zero of the 223 migrations in this chain use
`CONCURRENTLY`** — there is no precedent to follow because there is no way to
follow it. Locking is not the risk on these tables anyway; existing duplicates
are.

### Phase 0 — measurement (delivered, no deployment)

`schema-unique-drift.ts` plus its spec. No schema change, no migration.

### Phase 1 — pre-check (manual, read-only, owner-run)

`services/api/prisma/checks/bug-0084-unique-constraint-precheck.sql`. Strictly
read-only. Returns one row per constraint with `duplicate_groups` and
`surplus_rows`, then per-constraint detail queries for anything above zero.

Note the NULL semantics: Postgres treats NULLs as distinct in a unique index, so
`PartnerPortalUser.invitationTokenHash` is checked with `IS NOT NULL`. Counting
NULL groups would invent duplicates the index would happily allow.

### Phase 1b — backfill / dedupe, only for constraints that report above zero

Per constraint, and only with the owner's approval of the specific rows:

- **`SupportCaseIncident`** — duplicates are link rows carrying no domain data.
  Keep the earliest, delete the rest:

  ```sql
  DELETE FROM "SupportCaseIncident" a
  USING "SupportCaseIncident" b
  WHERE a."supportCaseId" = b."supportCaseId"
    AND a."errorLogId"    = b."errorLogId"
    AND (a."createdAt", a."id") > (b."createdAt", b."id");
  ```

- **`PartnerOnboardingSubmission`** — a submission is partner-entered data and
  must not be deleted. Renumber by submission time instead:

  ```sql
  WITH renumbered AS (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "applicationId"
                              ORDER BY "submittedAt", "id") AS new_version
    FROM "PartnerOnboardingSubmission"
  )
  UPDATE "PartnerOnboardingSubmission" s
  SET "version" = r.new_version
  FROM renumbered r
  WHERE s."id" = r."id" AND s."version" <> r.new_version;
  ```

  `PartnerOnboardingApplication.version` tracks the latest and must be
  reconciled in the same transaction.

- **`PlatformApprovalRequest`**, **`PlatformApprovalStep`**,
  **both `invitationTokenHash` columns** — a duplicate implies a replayed
  create or a reused token, not a benign race. No blind remediation is written
  here; each is a `PRODUCT_DECISION` on the specific rows the detail query
  returns.

- **`HolidayCalendar`** — see the risk below. The likely remediation is a schema
  change, not a data change.

### Phase 2 — the migration (drafted, deliberately not committed)

Written only once phase 1 returns zero everywhere:

```sql
-- Additive. Each statement fails loudly if the table still holds duplicates,
-- which is why phase 1 must have returned zero before this is committed.
CREATE UNIQUE INDEX "HolidayCalendar_tenantId_name_key"
  ON "HolidayCalendar"("tenantId", "name");
CREATE UNIQUE INDEX "PartnerOnboardingApplication_invitationTokenHash_key"
  ON "PartnerOnboardingApplication"("invitationTokenHash");
CREATE UNIQUE INDEX "PartnerOnboardingSubmission_applicationId_version_key"
  ON "PartnerOnboardingSubmission"("applicationId", "version");
CREATE UNIQUE INDEX "PartnerPortalUser_invitationTokenHash_key"
  ON "PartnerPortalUser"("invitationTokenHash");
CREATE UNIQUE INDEX "PlatformApprovalRequest_requestNumber_key"
  ON "PlatformApprovalRequest"("requestNumber");
CREATE UNIQUE INDEX "PlatformApprovalStep_approvalRequestId_stepOrder_key"
  ON "PlatformApprovalStep"("approvalRequestId", "stepOrder");
CREATE UNIQUE INDEX "SupportCaseIncident_supportCaseId_errorLogId_key"
  ON "SupportCaseIncident"("supportCaseId", "errorLogId");
```

`IF NOT EXISTS` is deliberately omitted. It would let the migration pass over a
constraint that failed to create, leaving the schema and database disagreeing
again — the exact condition this record exists to end.

A `DO $$ ... IF NOT EXISTS (duplicates) THEN CREATE ... $$` guard was considered
and **rejected**: it cannot abort a deploy, but it silently no-ops, so the drift
would survive while appearing fixed. That is strictly worse than a loud failure
in a controlled release window.

### Phase 2b — schema correction, if phase 1 shows HolidayCalendar is wrong

Remove `@@unique([tenantId, name])` from `HolidayCalendar` and record the
decision as an ADR. This changes the generated client: the `tenantId_name`
compound `where` input disappears for that model. No current caller uses it —
the `tenantId_name` hits in `seed-config.ts:1244`, `seed-demo.ts:142,187` and
`seed-payroll-flow.ts:332,352,1787` are `Designation`, `Organization`,
`BusinessUnit` and `WorkSchedule`, not `HolidayCalendar`, which is upserted on
`tenantId_code` (`seed-config.ts:1280`, `seed-demo.ts:340`).

### Phase 3 — the guard (delivered)

`schema-unique-drift.spec.ts` asserts the missing set equals exactly the seven
in `KNOWN_MISSING_UNIQUE_CONSTRAINTS`. An eighth fails it; so does fixing one of
the seven without emptying the list in the same commit.

## Backend impact

No controller, DTO or endpoint changes. Behaviour changes only where a constraint
begins to be enforced:

- `supportCaseIncident.upsert` becomes atomic — the intended behaviour.
- `partnerOnboardingSubmission.create` begins raising `P2002` on a concurrent
  double-submit where it previously inserted a duplicate. It sits inside
  `this.prisma.$transaction([...])` at `partner-experience.service.ts:569` with
  no `P2002` handling, so the race would surface as a 500 instead of silent
  corruption. **Follow-up required in phase 2:** catch `P2002` there and either
  re-read the version or return a domain conflict from the error catalog.

## Frontend impact

None. No API contract, response shape or screen changes.

## Permission / RBAC impact

None. No permission key, matrix entry, access level or elevated-role change.

## Tenant-isolation impact

None introduced. `HolidayCalendar` is the only tenant-owned model of the seven
and its constraint is already tenant-scoped (`tenantId` leads the column list),
which is what `services/api/prisma/AGENTS.md` requires. The other six are
platform-owned (`Partner*`, `Platform*`, `SupportCase*`) and correctly carry no
`tenantId`. The pre-check SQL is read-only and runs as the owner, not on a
request path, so no request-derived `tenantId` is involved.

## Audit / event / logging impact

None for phases 0, 1 and 3. Any phase 1b dedupe is a manual data change run by
the platform owner outside the request path; the rows changed must be recorded
in the release record, since `AuditService` cannot capture a direct SQL
statement.

## Integration impact

None. No gateway, desktop agent, Stripe, email or storage contract is touched.

## Migration / data compatibility

Old and new code run identically against a database with or without these
indexes, so there is no API/database ordering constraint and no
forward-compatibility issue. Already-stored data is unchanged by phases 0, 1
and 3.

## Parallel-safe tasks

- `PARALLEL_SAFE` — phase 0 and phase 3 (`schema-unique-drift.ts` and its spec);
  no shared file with any other in-flight work.
- `PARALLEL_SAFE` — phase 1 SQL; a new file under `prisma/checks/`.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — phase 1b dedupe. Unblocked by the phase 1 result.
- `DEPENDENCY_BLOCKED` — phase 2 migration. Unblocked by phase 1 returning zero
  for all seven, and by phase 1b where it did not.
- `DEPENDENCY_BLOCKED` — phase 2b schema correction. Unblocked by a product
  decision on whether a tenant may hold two same-named holiday calendars.

## Integration tasks

- `INTEGRATION` — phase 2 must be merged and deployed by a `RELEASE` task with
  Release/DevOps present, in a window where a `preDeployCommand` failure can be
  responded to. It must not ride along with an unrelated release.

## Testing strategy

Commands, all from `AGENTS.md`:

- `npm --workspace api run test -- schema-unique-drift` — the phase 3 guard.
- `cd services/api && npx prisma validate --config prisma.config.ts` — after any
  phase 2b schema edit.
- `npm run prisma:migrate:status` — **requires a database; cannot run in an
  agent worktree.** Release/DevOps runs it against the target before phase 2.
- `npm --workspace api run test -- support-cases partner-experience` — the write
  paths whose atomicity changes.
- `npm run typecheck` — after phase 2b, because the generated client changes.

New spec: `services/api/src/common/prisma/schema-unique-drift.spec.ts`. It
unit-tests the parser on small fixtures — a constraint created then dropped,
created then renamed, matched under a non-Prisma name, commented out — and then
runs it against the real schema and the real chain, asserting the missing set is
exactly `KNOWN_MISSING_UNIQUE_CONSTRAINTS`. The fixture tests matter: a check
that only ran against the real repository would pass just as well if the parser
silently matched nothing.

## Risks

1. **Existing duplicates abort a production deployment.** Likelihood: unknown
   and unknowable from the repository — that is the point. Impact: high; the API
   does not come up. Mitigation: phase 1 before phase 2; do not commit the
   migration until the pre-check is clean. This risk alone justifies leaving the
   record BLOCKED.

2. **`HolidayCalendar_tenantId_name_key` is probably wrong in the schema.**
   Likelihood: high. Impact: high — adding it makes legitimate existing
   configuration illegal and can abort the deploy. Evidence:
   `assertNoOverlappingHolidayCalendar`
   (`enterprise-configuration.service.ts:2263`) enforces scope plus effective
   date range and **never** checks the name, so two calendars named "Standard
   Calendar" under different business units are valid today. The chain has
   `HolidayCalendar_tenantId_name_date_key` on `(tenantId, name, date)`, and
   `date` is a vestigial nullable column (`@map("date")`) that current code
   never populates — holidays live in the separate `Holiday` table. Because
   NULLs are distinct, that existing index constrains nothing for modern rows.
   Mitigation: treat this one as `PRODUCT_DECISION`, phase 2b, not as a data
   problem.

3. **`P2002` surfacing as a 500 on partner double-submit.** Likelihood: low.
   Impact: medium. Mitigation: the phase 2 follow-up above; ship it with the
   migration, not after.

4. **The guard is mis-trusted.** A static parser can fail open. Mitigation: the
   fixture tests, and matching by column set rather than name.

## Rollback considerations

Fully reversible and additive. Rollback for phase 2 is:

```sql
DROP INDEX IF EXISTS "HolidayCalendar_tenantId_name_key";
DROP INDEX IF EXISTS "PartnerOnboardingApplication_invitationTokenHash_key";
DROP INDEX IF EXISTS "PartnerOnboardingSubmission_applicationId_version_key";
DROP INDEX IF EXISTS "PartnerPortalUser_invitationTokenHash_key";
DROP INDEX IF EXISTS "PlatformApprovalRequest_requestNumber_key";
DROP INDEX IF EXISTS "PlatformApprovalStep_approvalRequestId_stepOrder_key";
DROP INDEX IF EXISTS "SupportCaseIncident_supportCaseId_errorLogId_key";
```

Dropping an index loses no data and no other object depends on these.

**Phase 1b is the part that is not reversible.** A dedupe `DELETE` cannot be
undone from within the database; a Neon point-in-time restore is the only
recovery. So phase 1b runs only against rows the owner has seen in the detail
query, and the deleted ids are recorded in the release record first.

If the API ships without the migration: nothing changes, this is the state
today. If the migration ships without the API: also fine — no code depends on
the constraints existing.

## Definition of Done

- [x] The missing set re-derived from the repository, not quoted (seven).
- [x] Read-only pre-check SQL committed, covering all seven, with correct NULL
      handling.
- [x] Static guard committed, with fixture tests, failing on an eighth.
- [x] Rollback SQL written.
- [ ] Pre-check run against production by the platform owner. **BLOCKING.**
- [ ] Phase 1b decisions taken for any constraint above zero.
- [ ] `HolidayCalendar` product decision recorded as an ADR.
- [ ] Phase 2 migration committed and deployed under a `RELEASE` task.
- [ ] `P2002` handling added at `partner-experience.service.ts:569`.
- [ ] `KNOWN_MISSING_UNIQUE_CONSTRAINTS` emptied in the same commit as phase 2.

## Related

[[BUG-0084]] — the defect this plan addresses.

> **Numbering caveat.** This file and
> `EXECPLAN-0028-plan-entitlement-enforcement.md` both carry `EXECPLAN-0028` in
> their filename, and neither carries the `ID:` / `aliases:` frontmatter its
> sibling plans use. The allocator ledger shows this plan was allocated
> **PLAN-026** by SESSION-0076; the `0028` in the filename was derived
> separately. See [[BUG-2413]] — `allocate-id.mjs` scans `docs/qa/test-plans`
> for the `plan` kind and never sees `docs/plans`, so the two families share one
> number space and only one of them is allocated. Renumbering is left to the
> owning session; this section exists so the plan is reachable in the graph.
