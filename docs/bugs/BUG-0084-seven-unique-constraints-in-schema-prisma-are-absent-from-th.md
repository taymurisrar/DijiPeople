---
ID: BUG-0084
aliases: [BUG-0084]
Title: Seven unique constraints in schema.prisma are absent from the migration chain
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-20
DetectedInSha: bab45ad
AffectedModules: [contracts, partner-experience, support-cases, approvals, tenant-settings]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0060
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
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
