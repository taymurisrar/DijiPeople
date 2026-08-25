# Local throwaway databases for schema and migration work

> Written 2026-08-25 during [[TASK-0020]] (WP-01), so the next agent that needs
> to generate a Prisma migration does not have to rediscover where the local
> database is or which names are safe to destroy.

`prisma migrate dev` needs a real PostgreSQL database it is allowed to reset. The
populated dev database must never be that database. This is where the disposable
ones live and how to make another.

## The local server

A PostgreSQL server runs on **`localhost:5432`**. The connection string for it —
role, password, host — is the `localhost` `DATABASE_URL` in
`services/api/.env` (there is also a Neon URL in that file; that one is a managed
provider and off-limits). The role (`dijipeople_user`) has `CREATEDB`, so it can
make and drop its own throwaway databases.

- **`dijipeople`** — the populated dev database. **Never** point migrate, a seed,
  `migrate reset`, or `db push` at it. Reuse its URL only to read the
  server host/role/password when creating a *different* database.

## The disposable-database convention

`scripts/assert-test-database.mjs` is the gate. A database name is accepted as
disposable only when all of these hold (it fails closed):

- host is local (`localhost` / `127.0.0.1`) — never a managed provider;
- the name contains **no** dangerous word (`prod`, `production`, `staging`,
  `stage`, `live`, `main`);
- the name contains a **test marker**: one of `test`, `ci`, `ephemeral`,
  `scratch`, `tmp`.

So `dijipeople_dlp_test` qualifies; `dijipeople_dlp` would not (no marker), and
`dijipeople_main_test` would not (contains `main`).

**One database per line of work, not one shared `dijipeople_test`.** Several
Architect sessions run at once here, and two sessions running `migrate dev`
against the same database race on reset. The existing databases follow this
already — `dijipeople_gl_test`, `dijipeople_rel_test`, `dijipeople_wp_test`,
`dijipeople_test`, and now `dijipeople_dlp_test` (TASK-0020). Name yours for your
task and leave it; it is cheap to keep and safe to drop.

## Making and baselining one

```bash
# 1. Create it (createdb, or CREATE DATABASE over any connection to the server).
#    The role from services/api/.env has CREATEDB.
createdb dijipeople_<scope>_test

# 2. Point DATABASE_URL at it — reuse the local URL, swap only the db name.
#    prisma.config.ts falls back to DATABASE_URL when DIRECT_DATABASE_URL is unset.
export DATABASE_URL="postgresql://<user>:<password>@localhost:5432/dijipeople_<scope>_test"

# 3. Prove it is disposable before anything destructive runs.
node scripts/assert-test-database.mjs

# 4. Bring it to the current schema (applies the full migration history).
cd services/api && npx prisma migrate deploy --config prisma.config.ts

# 5. Now edit prisma/schema.prisma and generate the new migration.
npx prisma migrate dev --name <change> --skip-seed --config prisma.config.ts
```

`--skip-seed` matters: `prisma.config.ts` wires `seed-demo` as the migrate-dev
seed, and you rarely want a full demo seed just to author a migration.

If Postgres is not running or you cannot reach it, ask the owner rather than
guessing — see the memory note "Local Postgres is available on request".

## Related

- [`database-e2e-reproduction.md`](database-e2e-reproduction.md) — the fuller
  recipe (seeds, Stripe placeholders) for running the DB-backed e2e suites.
- `scripts/assert-test-database.mjs` — the gate described above.
- `services/api/prisma/AGENTS.md` — the migration hard rules.
