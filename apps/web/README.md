# `apps/web` — the tenant product

The application a tenant's own people use: employees, managers, HR, payroll
operators and tenant admins. Next.js App Router, port **3001**.

This is the largest application in the monorepo. Read
[`AGENTS.md`](AGENTS.md) before changing anything in it — the short version is
that **screens here are declared, not hand-written**, and a bespoke CRUD page
beside the runtime is the primary architectural defect in this codebase.

## Running it

```bash
npm --workspace web run dev          # http://localhost:3001
npm --workspace web run test         # jest
npm --workspace web run check-types  # next typegen && tsc --noEmit
npm --workspace web run lint
npm --workspace web run build
```

Port **3001**, overridable with `WEB_PORT`. It needs the API on port 4000 —
start it with `npm run dev:api`.

## Where things are

| Path | What |
|---|---|
| `app/(authenticated)/` | The product. Everything behind a tenant session |
| `app/(public)/` | Login and other unauthenticated surfaces |
| `app/api/` | Route handlers — **thin proxies only**. The API is the authority on authorization and tenant scope |
| `app/components/` | The shared kit — `ui/`, `data-table/`, `runtime/`, `metadata/` |
| `lib/runtime/` | The metadata-driven module runtime: registries, adapters, resolvers |
| `lib/server-api.ts` | The sanctioned way to reach the API from server code |
| `proxy.ts` | Request interception |

Durable knowledge, kept current with verification metadata:
[`docs/knowledge/modules/tenant-application.md`](../../docs/knowledge/modules/tenant-application.md)
and
[`docs/knowledge/architecture/web-architecture.md`](../../docs/knowledge/architecture/web-architecture.md).

## Why this README was rewritten

It was unedited `create-next-app` boilerplate. It told the reader to open
**port 3000**, which is `apps/landing` — a different application — so anyone
following it would conclude the tenant product was serving the marketing site.
It also offered `yarn` / `pnpm` / `bun` commands in a repository that pins
`npm@11.9.0` and uses npm workspaces with Turborepo.

`apps/docs` and `apps/admin` carried the identical defect; all three are
corrected.
</content>
