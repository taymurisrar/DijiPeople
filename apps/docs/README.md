# `apps/docs`

**This is an unmodified `create-turbo` starter. It is not part of the DijiPeople
product and ships nothing to any user.**

It has one route, no API calls, no authentication, no content system and no
deployment target. The name is the only thing about it that suggests
documentation — repository documentation lives in [`docs/`](../../docs/) and is
not served by any application.

Durable notes on what it costs and what depends on it:
[`docs/knowledge/architecture/docs-application.md`](../../docs/knowledge/architecture/docs-application.md).

## Running it

```bash
npm --workspace docs run dev     # http://localhost:3003
```

Port **3003**, overridable with `DOCS_PORT`. Note that this is the one
application whose port is **not** resolved from `@repo/config` —
`DEFAULT_LOCAL_PORTS` has no `docs` key, so 3003 is hardcoded in this
workspace's `package.json`.

## Two things to know before changing it

- **It is the only consumer of `@repo/ui` in the monorepo.** Removing this app
  leaves that package with zero consumers, so the two decisions are one
  decision. `@repo/ui` is three demo components and is explicitly *not* the
  design system.
- **CI builds and typechecks it on every commit, but never lints it.** The
  `lint` job names `apps/web`, `apps/admin` and `apps/landing` only, while
  `typecheck` and `build` run across all workspaces through Turborepo.

## Why this README was rewritten

It was `create-next-app` boilerplate, and three of its statements were wrong:
it directed the reader to **port 3000** — which is `apps/landing`, a different
application — claimed the app loads the **Inter** font when
[`app/layout.tsx`](app/layout.tsx) loads Geist, and offered `yarn` / `pnpm` /
`bun` commands in a repository that pins `npm@11.9.0` and uses npm workspaces
with Turborepo.

Its `<title>` is still `Create Next App`. That is left alone deliberately: this
file now describes the app honestly, and changing the app itself is a product
decision nobody has taken.
</content>
