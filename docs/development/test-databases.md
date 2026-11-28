# Test databases: isolated and UTF-8

Database-backed specs (`services/api/test/*.e2e-spec.ts`) run against a real
PostgreSQL. Two properties of that database matter, and a spec can now declare
them instead of failing 40 tests later with an unrelated-looking error.

## 1. The database must be a throwaway one

A spec may create tenants, plans, roles and (rarely) touch global state. It must
never run against a shared or production-like database because a stray
`DATABASE_URL` pointed there. The convention is the **name**: an isolated test
database contains `_e2e`, `_gui` or `_utf8` (for example `dp_master_e2e_test`,
`dp_master_utf8`).

`assertIsolatedUtf8Database(prisma)` in `services/api/test/helpers/test-database.ts`
reads `current_database()` and `SHOW server_encoding` and throws a clear error when
the name does not match `/(_e2e|_gui|_utf8)/`.

## 2. Some specs need UTF-8

A SQL_ASCII, LATIN1 or WIN1252 cluster cannot store Arabic or CJK text and renders
database errors in a way a Windows client cannot even print. Specs with non-ASCII
fixtures, or that assert on a rolled-back import's error text, need UTF-8.

Create one (as a superuser, once per cluster):

```sql
CREATE DATABASE dp_master_utf8 ENCODING 'UTF8' TEMPLATE template0;
```

`TEMPLATE template0` is required: the default template inherits the cluster's
encoding. Then apply the migrations to it (`npm run prisma:migrate:deploy` with the
new `DATABASE_URL`) and run the spec with that URL:

```bash
DATABASE_URL=postgresql://<user>@<host>:<port>/dp_master_utf8 \
  npm --workspace api run test:e2e -- --runInBand test/work-alm-success.e2e-spec.ts
```

## Opting a spec in

```ts
import { describeWithDatabase } from './helpers/db-fixtures';

describeWithDatabase({ requireUtf8: true })('my suite', () => { /* ... */ });
```

`requireUtf8` (UTF-8 and an isolated name) and `requireIsolated` (isolated name
only) register a first `beforeAll` that runs before the spec's own setup. With no
options `describeWithDatabase()` behaves exactly as before, so existing specs are
unchanged.

Specs that need UTF-8 today: `customization-package-alm.e2e-spec.ts` (rollback case)
and `work-alm-success.e2e-spec.ts` (non-ASCII export/import round trip).

## Scoped cleanup rule

A spec removes exactly what it created, scoped by the tenant (or id) it created:
`DbFixtures.cleanup()`, `HttpActors.cleanup()`, and `deleteMany({ where: { tenantId } })`
for rows that do not cascade. Never `deleteMany({})` on a table. A spec that must
touch **global** state (the entitlement enforcement mode is one) injects it
(`jest.spyOn(service, 'mode')`) rather than writing the row, saves and restores any
environment variable it sets in a `finally`, and ends with a test that asserts the
global state equals what it was at the start. Such specs are unsafe in parallel and
must run with `--runInBand` (see the header of `entitlement-enforce.e2e-spec.ts`).
