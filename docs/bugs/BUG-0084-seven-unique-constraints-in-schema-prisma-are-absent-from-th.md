---
ID: BUG-0084
aliases: [BUG-0084]
Title: Seven unique constraints in schema.prisma are absent from the migration chain
Status: BLOCKED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-20
DetectedInSha: bab45ad
AffectedModules: [contracts, partner-experience, support-cases, approvals, tenant-settings]
OwnerAgent: architect
ArchitectDisposition: BLOCKED_EXTERNAL
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0060
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-0084 — Seven unique constraints in schema.prisma are absent from the migration chain

## Summary

A database built by applying every migration from empty does not match
`schema.prisma`. Most of the difference is cosmetic — constraint and index
naming — but **seven `@@unique` / `@unique` declarations exist only in the schema
file**. Postgres does not enforce them, so the application believes it has
uniqueness guarantees that the database will not keep.

This is not introduced by any recent work. It is the same drift recorded in
[[ITEM-0060]], measured for the first time against a *virgin* database rather
than a developer's.

## Expected Behavior

`prisma migrate diff` between a fully migrated database and `schema.prisma`
produces no statements. Every constraint the Prisma client relies on exists in
Postgres.

## Actual Behavior

195 statements of drift. Broken down:

| Kind | Count | Meaning |
|---|---|---|
| `RenameIndex` | 55 | Same index, different name — cosmetic |
| `CreateIndex` | 53 | **Declared in the schema, absent from the database** |
| `DropForeignKey` / `AddForeignKey` / `RenameForeignKey` | 54 | Constraint renaming — cosmetic |
| `DropIndex` | 16 | In the database, not in the schema |
| `AlterTable` | 17 | `DROP DEFAULT` / `SET DEFAULT` on `id`, `updatedAt`, `effectiveDate`, `eventHash` |

No `DROP TABLE`, no `DROP COLUMN`, no `DROP TYPE`, no `SET NOT NULL`, and no data
statements. Nothing here destroys anything.

Seven of the 53 missing indexes are **UNIQUE**:

```text
HolidayCalendar_tenantId_name_key                     (tenantId, name)
PartnerOnboardingApplication_invitationTokenHash_key  (invitationTokenHash)
PartnerOnboardingSubmission_applicationId_version_key (applicationId, version)
PartnerPortalUser_invitationTokenHash_key             (invitationTokenHash)
PlatformApprovalRequest_requestNumber_key             (requestNumber)
PlatformApprovalStep_approvalRequestId_stepOrder_key  (approvalRequestId, stepOrder)
SupportCaseIncident_supportCaseId_errorLogId_key      (supportCaseId, errorLogId)
```

## Reproduction

```bash
createdb dijipeople_release_check
cd services/api
DATABASE_URL=...dijipeople_release_check npx prisma migrate deploy --config prisma.config.ts
DATABASE_URL=...dijipeople_release_check npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script --config prisma.config.ts
```

## Evidence

Confirmed against the freshly migrated database rather than inferred from the
diff — `pg_index` shows only the primary key and email uniques:

```text
PartnerPortalUser        -> PartnerPortalUser_pkey [UNIQUE], PartnerPortalUser_email_key [UNIQUE]
PlatformApprovalRequest  -> PlatformApprovalRequest_pkey [UNIQUE]
SupportCaseIncident      -> SupportCaseIncident_pkey [UNIQUE]
HolidayCalendar          -> ... _pkey, _tenantId_name_date_key, _tenantId_code_key   (no _tenantId_name_key)
```

## Root Cause

Long-standing divergence between hand-written migrations and `schema.prisma`,
recorded as [[ITEM-0060]]. Nothing in CI compares a from-empty migration chain
against the schema, so the gap can only widen.

## Impact

Assessed per constraint rather than asserted in aggregate, because the severity
varies a great deal.

**The one that has a live consumer.** `support-cases.service.ts:389` calls
`supportCaseIncident.upsert` keyed on `supportCaseId_errorLogId`. The initial
hypothesis was that this would fail outright, since Postgres rejects
`ON CONFLICT` with no matching constraint. **That was wrong.** A query-log probe
against the migrated database shows Prisma emitting a `SELECT` and then an
`INSERT`, not `ON CONFLICT`:

```text
SQL> SELECT "public"."SupportCaseIncident"."id" FROM "public"."SupportCaseIncident"
     WHERE (("supportCaseId" = $1 AND "errorLogId" = $2) AND 1=1) OFFSET $3
```

So the upsert does not break. It silently degrades from atomic to
read-then-write: two concurrent requests both find nothing and both insert,
producing a duplicate incident link. Low harm, real mechanism.

**`PlatformApprovalRequest.requestNumber`** is the one worth watching. It is a
human-facing identifier, and a unique constraint is exactly what stops two
concurrent creations sharing a number. Without it, nothing does.

**The two `invitationTokenHash` uniques** are the least alarming despite looking
the worst. The values are hashes of random tokens, so accidental collision is not
a realistic event; the constraint's value here is defence in depth.

**`partnerPortalUser.upsert`** at `partner-experience.service.ts:780` keys on
`email`, and `PartnerPortalUser_email_key` **does** exist. Not affected.

## Affected Areas

Contracts and approvals, partner onboarding, support cases, holiday calendars.
Every environment built from these migrations, which now includes any new
production database.

## Proposed Resolution

Add the seven unique indexes in a migration. Additive, and on a database with no
duplicates it is instant.

The reason this needs care rather than a quick patch: `CREATE UNIQUE INDEX` fails
if duplicates already exist, and a failure inside `preDeployCommand` aborts the
deployment. On a new database that cannot happen. On one with history it can, so
the migration should be paired with a duplicate check, and the outcome of that
check decides whether it is safe to run.

The 46 non-unique missing indexes are a performance matter and should be handled
with [[ITEM-0060]] rather than here.

## Acceptance Criteria

- `prisma migrate diff` from a virgin migrated database to `schema.prisma`
  produces no `CREATE UNIQUE INDEX` statements.
- A CI job compares a from-empty migration chain against the schema, so this
  cannot silently regrow.

## Regression Coverage

None yet. The check belongs in CI: build from empty, diff against the schema,
fail on any unique-constraint difference. Deliberately narrower than "fail on any
drift", because the naming drift is large, harmless and would make the gate noise
that people learn to ignore.

## Dependencies

Relates to [[ITEM-0060]], which carries the wider drift.

## Related Items

- [[ITEM-0060]] — the wider schema/migration drift.
- [[TASK-0010]] — go-live readiness; found by its first-deploy dry run.
- [[BUG-0085]] — the other defect the same dry run surfaced.

## Resolution

**Still BLOCKED as of 2026-08-29 — now blocked on one read-only query against
production, with that query written and committed.** The 2026-08-20 triage below
stands as the record of why it was deferred; what follows is what changed.

### The finding was re-derived, and it is still exactly seven

Measured statically at `dca93c47` by
`services/api/src/common/prisma/schema-unique-drift.ts`, which parses every
unique declaration in `schema.prisma`, replays every `CREATE UNIQUE INDEX`,
`ADD CONSTRAINT ... UNIQUE`, rename and drop across all 223 migrations, and
matches the two by **(table, column set)** rather than by name — 55 indexes in
this chain carry a name Prisma would not have chosen, and name matching reports
all of them as missing.

288 schema declarations, 291 unique indexes live in the chain, seven
declarations with no index — the same seven this record listed. The original
measurement applied the chain to an empty database and ran `prisma migrate diff`;
this one reads the SQL text. Two independent methods, one answer, so the finding
is not an artefact of either.

### What is delivered

- `services/api/prisma/checks/bug-0084-unique-constraint-precheck.sql` — the
  read-only query the platform owner runs against production. One summary row
  per constraint plus per-constraint detail queries. NULLs are excluded for
  `PartnerPortalUser.invitationTokenHash`, the one nullable column of the seven,
  because a unique index treats NULLs as distinct and counting them would invent
  duplicates the index would allow.
- `docs/plans/EXECPLAN-0028-bug-0084-missing-unique-constraints.md` — the
  expand/backfill/contract staging, dedupe SQL for the two constraints that have
  a safe remediation, the full `DROP INDEX` rollback, and the phase-2 migration
  drafted but deliberately uncommitted.
- `services/api/src/common/prisma/schema-unique-drift.ts` and its spec — 23
  tests, the second acceptance criterion of this record. It needs no database,
  so it runs in the ordinary unit suite on every push rather than in a job that
  must first stand a Postgres up. Mutation-tested: removing one entry from
  `KNOWN_MISSING_UNIQUE_CONSTRAINTS` fails it.

### Why the migration is not committed

`npm run release:api` is Render's `preDeployCommand`, so a migration that
raises an error aborts the deployment. `CREATE UNIQUE INDEX` raises an error on
a table already holding duplicates. Whether production holds such rows cannot be
determined from the repository, and this session has no production database
access and must not acquire any. A migration committed now would therefore not
fail in review — it would fail during a release, with the API not coming up.

`CREATE UNIQUE INDEX CONCURRENTLY` does not avoid this and is not available
regardless: it cannot run inside a transaction block, Prisma Migrate wraps each
migration file in one, and zero of the 223 migrations in this chain use it. A
`DO $$ ... IF NOT EXISTS (duplicates) THEN CREATE` guard was considered and
rejected — it cannot abort a deploy, but it silently no-ops, leaving the drift
in place while appearing fixed, which is worse than a loud failure in a
controlled window.

### One of the seven is probably wrong in the schema, not missing from the database

`HolidayCalendar_tenantId_name_key` should not be added without a product
decision. `assertNoOverlappingHolidayCalendar`
(`enterprise-configuration.service.ts:2263`) enforces scope plus effective-date
overlap and **never** checks the name, so two calendars named "Standard
Calendar" under different business units are legitimate configuration today. The
chain carries `HolidayCalendar_tenantId_name_date_key` on
`(tenantId, name, date)`, and `date` is a vestigial nullable column that
current code never populates — holidays live in the separate `Holiday` table —
so that index constrains nothing for modern rows and duplicates by
`(tenantId, name)` are not merely possible but expected. The likely correct fix
is to drop the declaration from the schema. That is phase 2b in the plan, and it
needs an ADR.

### What is needed to unblock, and from whom

**The platform owner runs
`services/api/prisma/checks/bug-0084-unique-constraint-precheck.sql` against the
production Neon database and reports the summary table.** It is read-only: no
DDL, no DML, no locks beyond a sequential read. Nobody else can supply this.

- Every row `duplicate_groups = 0` -> the phase 2 migration is safe, and it plus
  the emptying of `KNOWN_MISSING_UNIQUE_CONSTRAINTS` becomes a small
  `RELEASE`-class task.
- Any row above zero -> that constraint takes its phase 1b decision first, on
  the specific rows its detail query returns.

A second, smaller follow-up regardless of the result: `nextVersion` at
`partner-experience.service.ts:568` is read outside the transaction that writes
it, so once `PartnerOnboardingSubmission_applicationId_version_key` exists a
concurrent double-submit raises `P2002` where it previously inserted a
duplicate. There is no `P2002` handling at `partner-experience.service.ts:569`,
so it would surface as a 500. Ship that handling with the migration.

### Assessment, stated plainly

This cannot be shipped safely without first inspecting production data. Leaving
it BLOCKED with the pre-check in hand is the correct outcome, and better than a
migration that breaks a deploy.

---

### Original triage, retained

**Deferred, not fixed.** The triage below is the decision; there is no code
change to describe yet.

### Triage — 2026-08-20

**DEFER. Not a launch blocker.** Recorded here rather than fixed, and the
reasoning is deliberately visible:

- Nothing is broken today. The one live consumer degrades to a race under
  concurrency; it does not fail.
- The gap is pre-existing and identical on `main`, so shipping does not make it
  worse.
- Adding unique indexes is the kind of change that is trivial on an empty
  database and can abort a deployment on a populated one. Doing it in the same
  release as 216 migrations and a first production deploy means a failure would
  have too many candidate causes.

It should be the first migration **after** launch, when the production database
is known and can be checked for duplicates directly.


## QA Retest

Not retested — nothing has changed. The finding itself was established by
measurement rather than inspection: 216 migrations applied to an empty database,
`pg_index` read back directly, and the one live consumer's SQL captured from the
query log. Re-verify by repeating the reproduction above.

## History

- 2026-08-20 — found by applying all 216 migrations to an empty database and
  diffing against `schema.prisma`, during TASK-0010 release verification.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0060]]
- Modules — [[contracts-and-agreements]], [[partners]], [[approvals]], [[settings]]

<!-- GRAPH:END -->
