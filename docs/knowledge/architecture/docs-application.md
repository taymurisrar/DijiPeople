# Docs Application (`apps/docs`)

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `apps/docs/package.json`, `apps/docs/app/layout.tsx`,
> `apps/docs/app/page.tsx`, `apps/docs/next.config.js`, `apps/docs/README.md`,
> `packages/ui/`, `packages/config/index.js`, `package.json`, `turbo.json`,
> `.github/workflows/ci.yml`
>
> This describes the repository; the code is authority over it. If they
> disagree, the code is current truth — report the discrepancy.

## CURRENT

**`apps/docs` is an unmodified `create-turbo` starter. It is not a product
surface and ships nothing to any user.** Every other document in this repository
that calls it "effectively unused" or "not part of the product" is accurate.

What makes it worth a note is not what it does — it is what it still costs, and
what quietly depends on it.

## Identity

| | |
|---|---|
| Purpose | None in the product. Scaffolding left by `create-turbo` |
| Intended users | None. Not internal, not public, not developer-facing |
| Product fit | No relationship to any DijiPeople surface, tenant, or API |
| Maturity | Untouched template. `<title>` is still `Create Next App` (`app/layout.tsx:15-16`) |

There is **no ADR, backlog item or decision anywhere** stating whether it should
be deleted, built out, or kept. It is the only workspace in the monorepo whose
existence is unexplained, and that is the single most useful fact here: an agent
asked to "document the docs app" should not conclude there is a documentation
product to describe.

## Technical architecture

Next.js `16.2.0`, App Router, React 19, TypeScript. `next.config.js` is an empty
object — no configuration of any kind.

The whole application is four files:

| File | Contents |
|---|---|
| `app/layout.tsx` | Root layout, two local Geist fonts, stock `create-next-app` metadata |
| `app/page.tsx` | The starter page — Turborepo logo, two external links, one `@repo/ui` `Button` |
| `app/globals.css` · `app/page.module.css` | Starter styles |

No route handlers, no API calls, no data fetching, no server actions, no
environment variables, no external services, no authentication of any kind.
**It has no auth, no platform auth and no tenant auth — it has no server-side
behaviour to protect.**

### It is the only consumer of `packages/ui`

Verified by searching every `.ts`/`.tsx`/`.json` outside `node_modules`: the only
files referencing `@repo/ui` are `apps/docs/app/page.tsx:2`,
`apps/docs/package.json` and `packages/ui/package.json` itself.

This is the coupling worth knowing. `packages/ui` contains three demo components
(`button.tsx`, `card.tsx`, `code.tsx`) and is explicitly **not** the design
system — the real component kits live in `apps/web/app/components/` and
`apps/admin/app/_components/`. Deleting `apps/docs` therefore leaves
`packages/ui` with zero consumers, and the two decisions must be taken together.

### Its port does not come from `@repo/config`

`apps/docs` starts on **3003**, hardcoded in its own `package.json` as
`next-with-port.mjs dev 3003 DOCS_PORT`. `DEFAULT_LOCAL_PORTS` in
`packages/config/index.js:3-8` contains only `landing`, `web`, `admin` and `api`
— there is no `docs` key, and no `docs` entry in `PRODUCTION_APP_URLS`.

`apps/docs` is consequently the one application whose port is **not** governed by
the shared config, which is the opposite of the rule the rest of the monorepo
follows. `DOCS_PORT` is also absent from `turbo.json` `globalEnv`.

## Routes and surfaces

One route.

| Route | File | Nature | Dependencies | Verified |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Server component (no `'use client'`) | `@repo/ui/button`, `next/image`, local CSS module | `GET /` → **200**, renders the starter page, `<title>Create Next App</title>` |

Verified by running `npm --workspace docs run dev` and requesting the route on
2026-08-16. The `<Image>` elements pass `src="turborepo-dark.svg"` without a
leading slash; Next bypasses the image optimizer for SVG, so these emit as plain
`<img src="turborepo-dark.svg">` and resolve correctly against `public/` at the
root path. **This was checked because it looked like a defect and is not one** —
do not re-raise it.

## Content architecture

**None.** There is no Markdown, no MDX, no content source, no navigation
generation, no search, no code examples and no versioning. The name is the only
thing about this application that suggests documentation.

Repository documentation lives in `docs/` and is not served by any application;
product knowledge lives in the Obsidian vault. Neither is connected to
`apps/docs`.

## API and integration dependencies

**None.** No `fetch`, no API client, no proxy route, no external service.

## Build, deployment and CI

| | |
|---|---|
| Local port | 3003 (`DOCS_PORT` overrides) |
| Build | `next build` via Turborepo |
| Deployment target | **None.** No entry in `render.yaml`, no `vercel.json`, no Dockerfile |
| `release` script | None |

CI coverage is **asymmetric, and the asymmetry is deliberate elsewhere but
undocumented here**:

- **Covered** — the `typecheck` and `build` jobs run across every workspace
  through Turborepo, so `apps/docs` is compiled and built on every push.
- **Not covered** — the `lint` job names `apps/web`, `apps/admin` and
  `apps/landing` explicitly (`.github/workflows/ci.yml`). `apps/docs` is never
  linted in CI, despite declaring a `lint` script.
- **Not covered** — no test job, because there is no test script.

So a dead starter is built on every commit to `main` and every agent branch, and
is the slowest-growing part of `npm run build --concurrency=1` that returns
nothing.

## Testing

No test script, no jest config, no specs, no E2E coverage. Nothing to cover.

## Known issues and backlog

**No bug record and no backlog item exists for `apps/docs`** — verified across
`docs/bugs/` and `docs/backlog/items/`. None is invented here; there is no
product behaviour to be wrong.

One documentation defect was found and **fixed in the same change that created
this note**: `apps/docs/README.md` was unedited `create-next-app` boilerplate
telling the reader to open **port 3000** — which is `apps/landing`, a different
application — and claiming the app loads the **Inter** font when
`app/layout.tsx:5-12` loads Geist. Recorded here rather than as a bug because
the fix landed with the finding; a record opened and closed in one commit is
bookkeeping, not knowledge.

The genuinely open question is not a defect at all: **nothing states whether
this workspace should exist.** That is listed as an owner decision rather than
guessed at.

## Related

[[system-architecture]] · [[monorepo-application-map]] · [[landing-architecture]]
· [[desktop-agent-architecture]]
</content>
