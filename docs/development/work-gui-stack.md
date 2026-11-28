# Work GUI stack

A guarded, repeatable local stack for the browser journeys
([`browser-e2e.md`](browser-e2e.md), Flow R and Flow S) that needs **no
Playwright MCP server** - the repo's own Playwright runner drives it from the CLI.

`scripts/work-gui-stack.mjs` creates (or reuses) one throwaway PostgreSQL
database, migrates and seeds it, then starts the API and the tenant web app on
ports that are not the developer's own.

## Commands

```bash
node scripts/work-gui-stack.mjs up [--reseed]   # database, seeds, workspace host, API :4099, web :3011
node scripts/work-gui-stack.mjs status          # pids, ports, database identity
node scripts/work-gui-stack.mjs env --export    # the E2E_* lines the specs need
node scripts/work-gui-stack.mjs down            # stops ONLY the pids in the pid file

# then, from e2e/ with the same Node 22:
eval "$(node ../scripts/work-gui-stack.mjs env --export)"
unset ELECTRON_RUN_AS_NODE
node ../node_modules/@playwright/test/cli.js test tests/flow-r-work-journeys.spec.ts --reporter=line
```

Configuration (environment, all optional): `GUI_PG_ADMIN_URL` (default:
`DATABASE_URL` with the database swapped to `postgres`), `GUI_DB_NAME` (default
`dp_master_utf8_gui`), `GUI_STACK_DIR` (logs, `pids.json`, `state.json`; default
`<os tmp>/dijipeople-gui-stack`), `GUI_NODE` (else `$N22`, else the running
node), `GUI_API_PORT` (4099), `GUI_WEB_PORT` (3011), `GUI_TENANT_SLUG`
(`dijipeople-demo`), `GUI_DEMO_PASSWORD` (`DemoUser@12345`, the seed's own
default; throwaway database only).

## What `up` does

1. Creates the database with `ENCODING 'UTF8' TEMPLATE template0` if absent.
2. `prisma migrate deploy`, `seed-config`, `seed-demo` (transpile-only). The
   demo seed already creates the role users the specs sign in as
   (`employee@`, `manager@`, `hr@`, `ceo@dijipeople.local`) with their roles; `up`
   verifies each has a role and refuses to continue if not.
3. Upserts the `TenantDomain` row `<slug>.localhost` (without it the workspace
   host answers "We could not find this company portal").
4. Starts the API (`ts-node` transpile-only) and `next dev`, cross-linked through
   environment variables (`CORS_ALLOWED_ORIGINS`, `WEB_APP_URL`,
   `NEXT_PUBLIC_API_BASE_URL`, `TENANT_BASE_DOMAIN=localhost`). **No `.env` file is
   written anywhere.** Waits for `/api/health` and the tenant login page.
5. Prints `DATABASE IDENTITY VERIFIED: <name> encoding=UTF8`.

## Safety guards

- The database name must match `[a-z0-9_]+` and end in `_gui` or `_e2e`, and
  `SHOW server_encoding` on it must be `UTF8`; otherwise nothing runs. This is
  the same rule `e2e/fixtures/work-database.ts` enforces.
- Children get `DATABASE_URL` set to the throwaway database, and
  `DIRECT_DATABASE_URL` and `ELECTRON_RUN_AS_NODE` removed.
- Refuses port 4000, and refuses to start if a port is held by anything not in the
  pid file.
- `down` kills only recorded pids, after checking each is still `node.exe`
  (`taskkill /T /F`). It never kills by image name and deletes nothing but the
  pid file.

## Rules of use

- **One stack at a time**, and do not run it beside memory-heavy suites (full
  API jest, `next build`): `next dev` and ts-node are large, and a starved
  Postgres presents as a product failure.
- The login throttle is 20 POSTs per 10 minutes; if it trips, `down` then `up`
  restarts the API (the window is in memory).
- `next dev` may rewrite tracked files (`AGENTS.md` copies, `next-env.d.ts`);
  check `git status` afterwards and do not commit those.
- Flow S tests that need a second tenant skip unless `E2E_OTHER_TENANT_SLUG` /
  `E2E_OTHER_WEB_URL` are set; this script provisions one tenant.
