# `apps/admin` — platform admin

DijiPeople's own SaaS operations console, used by DijiPeople staff across all
tenants — not by tenant users. Next.js App Router, port **3002**.

Read [`AGENTS.md`](AGENTS.md) before changing anything here. Note that this app
has its **own** component kit — `ProDataTable` is the table for every production
admin screen — and it is not the same kit as `apps/web`.

Platform admin is a **separate identity** from a tenant user: its own auth
client, its own JWT secrets and its own cookie names. A tenant token is not
valid here and never should be.

## Running it

```bash
npm --workspace admin run dev          # http://localhost:3002
npm --workspace admin run test         # jest
npm --workspace admin run check-types  # next typegen && tsc --noEmit
npm --workspace admin run lint
npm --workspace admin run build
```

Port **3002**, overridable with `ADMIN_PORT`. It needs the API on port 4000 —
start it with `npm run dev:api`.

Durable knowledge:
[`docs/knowledge/modules/platform-admin.md`](../../docs/knowledge/modules/platform-admin.md).

## Why this README was rewritten

It was unedited `create-next-app` boilerplate directing the reader to **port
3000**, which is `apps/landing` — a different application — and offering
`yarn` / `pnpm` / `bun` commands in a repository that pins `npm@11.9.0` and uses
npm workspaces with Turborepo. `apps/docs` and `apps/web` carried the identical
defect; all three are corrected.

This file is a pointer, not a specification. The authority for how to work in
this app is `AGENTS.md`; the authority for what it does is the code.
</content>
