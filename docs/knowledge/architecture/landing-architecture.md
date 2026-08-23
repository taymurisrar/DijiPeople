# Landing Architecture (`apps/landing`)

> **Last Verified:** 2026-08-23 (Route surface only — see below)
> **Verified Against SHA:** `cbf9090e`
> **Source Paths:** `apps/landing/next.config.ts`, `apps/landing/lib/env.ts`,
> `apps/landing/app/api/**/route.ts`, `apps/landing/jest.config.js`,
> `packages/config/index.js`, `services/api/src/common/guards/public-rate-limit.guard.ts`,
> `.github/workflows/ci.yml`, `render.yaml`
>
> This describes the repository; the code is authority over it.
>
> **Scope of the 2026-08-23 pass.** Only **Route surface** was re-derived, from
> a browser sweep of every route against a production build and against
> production itself. The remaining sections still carry their 2026-08-16
> verification at `78072d2` and were not re-checked — moving the header date
> without saying so would have vouched for claims nobody looked at, which is the
> `doc-code-drift` this file already carries one instance of.

## CURRENT

Next.js **16.2.2**, App Router, React 19, Tailwind CSS **v4**, TypeScript.
Port **3000** (`LANDING_PORT` overrides). Light mode only — there is no
`prefers-color-scheme` block.

`next.config.ts` does three things, and one of them is load-bearing: it calls
`validateDeploymentEnv(process.env, { app: 'landing' })` **at module scope**, so
a production-like build fails rather than shipping a missing or loopback app
URL. That is the [[BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in]]
fix, and it must not be moved into a function.

### It does not use `@repo/ui`

Verified: zero references. Every primitive — fields, selects, section shells,
page shells — is hand-rolled locally and **duplicated across several form files
with divergent implementations**. That is the opposite of the rule in `apps/web`
and `apps/admin`, and it is why two forms hitting the same endpoint can disagree
about validation. Landing's only shared-package dependency is `@repo/config`.

### Server/client split

Every `page.tsx` and `layout.tsx` is a server component. There are exactly
**nine** `'use client'` files, and all client-side fetching is confined to the
three token flows (`/sign`, `/partners/onboarding`, `/partners/activate`) plus
the lead, inquiry and subscribe forms.

## Route surface

Fifteen page routes plus `robots.ts` and `sitemap.ts`:
`/`, `/about`, `/features`, `/plans`, `/contact`, `/request-demo`, `/partners`,
`/partners/onboarding/[token]`, `/partners/activate/[token]`, `/subscribe`,
`/subscribe/success`, `/subscribe/cancel`, `/sign/[token]`.

`app/error.tsx`, `app/loading.tsx` and `app/not-found.tsx` all exist at the
root, and there is one `layout.tsx`.

> This paragraph previously read "**There is no `error.tsx`, `loading.tsx` or
> `not-found.tsx` anywhere in the app**" and went on to call the boundary
> "genuinely absent". That was true when written and became false before
> 2026-08-23. The correction matters more than the usual `doc-code-drift` entry,
> because the file this note said did not exist is the one that caused
> BUG-0907 — an agent reading this would have ruled out the actual cause.

### A root `loading.tsx` turns `notFound()` into a soft 404

Worth knowing before adding a dynamic route here, because nothing about the
symptom points at the cause.

`app/loading.tsx` puts a Suspense boundary above **every** route. Next therefore
flushes the shell as soon as the request arrives — and the HTTP status goes out
with that first flush, before the dynamic segment has run. A later `notFound()`
can no longer change the status, and in practice does not replace the fallback
either: the client keeps showing the loading UI.

`/legal/<unknown>` consequently answered `200 OK` and sat on "Loading" forever,
while `/this-page-does-not-exist` — refused by the router before any streaming
begins — correctly returned 404. Same app, same not-found page, two different
outcomes, and the difference is *where in the pipeline the refusal happens*.

Established by experiment: rebuilding with `app/loading.tsx` removed turns the
same URL into a 404, and restoring it brings the soft 404 back.

**The fix is a static param list, not deleting the boundary.**
`legal/[slug]/page.tsx` already enumerates every legitimate slug in
`generateStaticParams`, so `export const dynamicParams = false` moves the
refusal to the routing layer where it belongs and leaves the loading UI for the
routes that want it. Any new dynamic route under this layout needs the same
treatment, or its `notFound()` will be equally inert. See REG-239.

`sitemap.ts` omits `/request-demo` and `/partners`, both indexable conversion
pages.

## The public proxy map

Four route handlers under `app/api/`, all **pure forwarders**. None reads a
token, checks a role, resolves a tenant or filters a response — so none violates
the root `AGENTS.md` rule against re-implementing authorization in a proxy.

| Landing route | Proxy | Upstream | Serving controller | Rate limited |
|---|---|---|---|---|
| `/request-demo`, `/contact` | `app/api/leads/route.ts` | `POST /public/leads` | `PublicLeadsController` | **yes** |
| `/partners*` | `app/api/partners/` — optional catch-all | `/public/partners/*` | `PublicPartnersController` | **yes** |
| `/sign/[token]` | `app/api/signatures/` — optional catch-all | `/public/signatures/*` | `ContractsController` (public block) | **yes** |
| `/subscribe` | `app/api/public/subscribe/route.ts` | `POST /public/subscribe` | `PublicBillingController` | **no** |

Two calls bypass the proxies entirely because they are server-side:
`lib/plans-server.ts` → `GET /public/plans` (**not** rate limited) and
`lib/commercial-config.ts` → `GET /public/commercial-config` (rate limited).

### The permitted-endpoint list in `apps/landing/AGENTS.md` is wrong in both directions

It names `public-tenants`, which **nothing in landing calls**, and omits
`public/partners` and `public/commercial-config`, which it does call. An
allow-list that misses two live callers and lists one dead one cannot be used as
a review gate. Corrected in this change.

## Rate limiting does not work the way the topology implies

`PublicRateLimitGuard` keys on `request.ip` + `request.path`, 20 non-GET / 120
GET per 10-minute fixed window, held in a module-level `Map`.

**None of the four landing proxies forwards `X-Forwarded-For` or `X-Real-IP`.**
The API therefore sees the landing server's egress IP for every visitor, and all
landing traffic shares one bucket. Both consequences are real:

- one visitor submitting 20 forms returns HTTP 429 to **every** visitor for up
  to ten minutes;
- on landing-proxied paths the guard cannot distinguish an attacker from a
  customer, so it is not an abuse control there at all.

Recorded as [[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]].
Separately, `POST /public/subscribe` carries no guard at all —
[[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting]].

The guard's state is also a module-level `Map`, so limits multiply by instance
count and reset on every deploy.

## Environment resolution

`lib/env.ts` is genuinely the single place application code reads environment —
six `process.env` references exist in the whole app, in two files.

API base URL resolves through `@repo/config` (`NEXT_PUBLIC_API_BASE_URL` →
`NEXT_PUBLIC_API_URL` → `API_BASE_URL` → `API_URL`, then a derived origin that
**throws** in production when unset). `REQUIRED_APP_URLS.landing` is
`['landing', 'web']`, so a production landing build must have both.

**Two residues of the BUG-0026 class survive**, invisible to both guards because
neither is a loopback literal: `app/robots.ts` hardcodes the production sitemap
URL, and `app/layout.tsx` hardcodes `openGraph.url` — while `metadataBase` two
lines above is correctly config-driven. `scripts/check-no-hardcoded-urls.mjs`
only looks for loopback addresses, so it cannot catch either.

`NEXT_STANDALONE` is read by `next.config.ts` but is **not registered in
`turbo.json` globalEnv**, so Turborepo can cache across differing values.

## Testing — the context layer was wrong about this

`apps/landing` **has** a jest config, a `test` script and two spec files
(`lib/plan-presentation.spec.ts`, 27 tests; `lib/subscribe-selection.spec.ts`,
12 tests), and CI runs them in a **required** `test-landing` job. Four documents
claimed otherwise and all four were corrected in this change — the file's own
`jest.config.js` header explains that it exists because BUG-0028 shipped.

Landing is covered by four required CI jobs: `lint`, `test-landing`, `typecheck`
and `build`, plus the URL rules in `test-runtime`.

Browser E2E exists (Playwright, `e2e/` workspace) and starts on landing for both
flows. The `browser-e2e` job is named by the required aggregate but remains
fail-open through job-level `continue-on-error`; inspect the browser summary
rather than inferring PASS from the aggregate.

Gaps, verified: no component/DOM tests (no jsdom installed, deliberately); no
tests for any of the four proxies; **`/contact` is untested at every level**; and
`/subscribe`, `/sign`, and both partner token flows have no browser coverage.

## Deployment

**Vercel — confirmed, but still not reproducible from this repository.**

The repository itself is silent: `render.yaml` defines only `dijipeople-api`,
there is no `vercel.json`, no Dockerfile, and landing has no `release` script
(unlike web and admin). `docs/deployment/environments.md` therefore records the
target as "presumed Vercel, not in-repo".

**The presumption is now confirmed from outside the repository.** The GitHub
pull-request checks on this branch include three Vercel deployments —
`Vercel – diji-people-landing`, `Vercel – diji-people-web` and
`Vercel – diji-people-admin` — each reporting a deployment under the
`taimurisrar806-2915s-projects` Vercel account. A Vercel GitHub integration is
therefore building and deploying all three frontends on every push.

Two consequences worth carrying:

- **`apps/docs` has no Vercel project**, consistent with it not being deployed
  anywhere.
- The build configuration — install scope, build command, env values — lives in
  the Vercel dashboard and **cannot be read from here**. That is what makes
  [[ITEM-0024]] (undeclared `lucide-react`) undecidable from the repository: if
  Vercel installs the whole workspace it resolves by hoisting; if it installs
  only `apps/landing` the build fails. The integration builds successfully
  today, which is evidence for the former — but it is inference, not
  configuration anyone can read.

One consequence is undecidable from here and matters: `lucide-react` is imported
by a marketing component but **not declared** in `apps/landing/package.json`
([[ITEM-0024]]). It resolves only by workspace hoisting from `apps/admin`.
Whether the real deployment installs the whole workspace or only this app
decides whether that is latent or fatal.

## Related

[[landing-website]] · [[monorepo-application-map]] · [[system-architecture]] ·
[[api-architecture]] · [[deployment-architecture]] · [[qa-and-ci-architecture]] ·
[[leads]] · [[partners]] · [[contracts-and-agreements]] · [[billing]]
