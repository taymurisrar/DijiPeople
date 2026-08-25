---
TITLE: Authoring a Prisma migration with migrate diff when the repo has schema drift
TASK: TASK-0020
WP: WP-01
CREATED_AT: 2026-08-25
VERIFIED_AGAINST_COMMIT: c0932f17
---

# Authoring a migration with `migrate diff` around schema drift — 2026-08-25

Produced by [[TASK-0020]] WP-01, while adding the DLP capture tables.

## The problem

`npm --workspace api run prisma:migrate:dev` could not author the migration in
this environment for two compounding reasons:

1. **`migrate dev` is interactive-only here.** It detects a non-interactive
   terminal and exits rather than prompting — so it never writes a migration.
2. **The repo carries pre-existing schema/migration drift.** Running `migrate
   dev` (or `migrate diff --from-migrations`) reported seven unique constraints
   on unrelated tables (`HolidayCalendar`, `PartnerOnboardingApplication`,
   several `Platform*`) that `schema.prisma` declares but no migration creates.
   A migration generated that way would silently bundle those unrelated
   constraints into the DLP migration.

## The technique

Author the migration as the diff between the **committed** schema and the
**edited** schema, so the shared drift cancels and only the intended delta
remains:

```bash
git show HEAD:services/api/prisma/schema.prisma > /tmp/old-schema.prisma
# edit prisma/schema.prisma with the new models/columns
cd services/api
npx prisma migrate diff \
  --from-schema /tmp/old-schema.prisma \
  --to-schema prisma/schema.prisma \
  --script > migration.sql
mkdir -p prisma/migrations/<YYYYMMDDHHMMSS>_<name>
mv migration.sql prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
npx prisma migrate deploy --config prisma.config.ts   # applies + records it
npx prisma migrate status --config prisma.config.ts   # confirms "up to date"
```

Because both `--from-schema` and `--to-schema` contain the same drift relative
to the migration history, the diff between them is exactly the new models,
columns and indexes — nothing else. Verified against a local throwaway database
(`docs/development/local-throwaway-database.md`),
never the populated dev DB.

Prisma 7.8 note: the flags are `--from-schema` / `--to-schema`; the older
`--from-schema-datamodel` was removed.

## Why it matters

A migration is the one artifact that cannot be fixed by editing a file after it
applies anywhere. A migration that quietly adds a `@@unique` to
`PartnerOnboardingApplication` because a generator swept in unrelated drift is a
production incident waiting on the first duplicate row — and it would have been
attributed to whoever's task happened to author the next migration. Isolating
the delta keeps a migration about exactly the change its name claims.

Related: the tenant-erasure lesson from the same task — a new tenant-owned model
must be registered in `TENANT_ERASURE_DELETE_ORDER`, or
`tenant-erasure.constants.spec` fails in CI (it re-derives the list from the
schema). Forensic tables especially must be erased with the tenant.
