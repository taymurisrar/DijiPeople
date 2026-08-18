# AGENTS.md — `apps/landing` (public site)

Scope-specific rules for the public marketing site. Read the root
[`AGENTS.md`](../../AGENTS.md) first; this file does not repeat it.

---

## What this app is

Next.js **App Router**, TypeScript, Tailwind CSS v4, port **3000**. Public,
unauthenticated. Routes: `/`, `about`, `features`, `plans`, `partners`,
`contact`, `request-demo`, `subscribe`, `sign`, plus `robots.ts` and
`sitemap.ts`.

```
app/
  _components/  site-shell.tsx, plan-cards.tsx, marketing/
  api/          leads, partners, public, signatures — route handlers
lib/            api.ts, env.ts, plans.ts, plans-server.ts
```

It has **no authenticated session and no tenant context.** Everything it does
goes through the API's public surface.

---

## Security rules (this is an internet-facing surface)

- The only API endpoints this app may call are the genuinely public ones:
  `public-leads`, `public-tenants`, `public-billing` and the signature routes.
  If a feature needs an authenticated endpoint, it does not belong on landing.
- **Never expose tenant existence, tenant counts, tenant names, customer names
  or any tenant-owned data.** Lead and demo-request responses must not confirm
  whether an email, company or subdomain already exists — that is tenant
  enumeration.
- Every public form submission is untrusted. Validation on the API side is the
  real validation; client-side validation is UX. The API's public controllers
  use `PublicRateLimitGuard` (in-memory, 20 writes / 120 reads per IP+path per
  10 minutes) — do not add a public write path that bypasses it.
- No secrets in this app. Anything reachable from the browser is public; only
  `NEXT_PUBLIC_*` variables belong in client code. `lib/env.ts` is the single
  place environment is read.
- Signature routes (`app/api/signatures`, `/sign`) carry contract-signing
  tokens. Treat those tokens as credentials: never log them, never put them in
  a query string that ends up in analytics, never render them in the page.

---

## Content and structure

- Marketing content lives under `app/_components/marketing/`. Use `SiteShell`
  for page chrome rather than a per-page layout.
- Plans and pricing come from the API via `lib/plans-server.ts` /
  `lib/plans.ts`. **Do not hardcode prices, plan names or feature lists** —
  they are platform data owned by `super-admin`/`plans`, and a hardcoded copy
  becomes wrong the moment pricing changes.
- Keep `sitemap.ts` and `robots.ts` current when adding or removing public
  routes.
- Public pages are indexed. Semantic headings, meaningful `<title>`/meta
  description, alt text on images, and real link text are functional
  requirements here, not polish.
- Performance matters more than in the authenticated apps: prefer server
  components, avoid shipping large client bundles, and do not add a client-side
  data fetch where a server render will do.

---

## Testing

This app **has** a jest configuration — `jest.config.js`, modelled on
`apps/web/jest.config.js`, with jest and ts-jest hoisted at the repository root
so nothing is added to this workspace's dependencies.

```bash
npm --workspace landing run test          # jest --config jest.config.js
npm --workspace landing run check-types   # next typegen && tsc --noEmit
npm --workspace landing run lint
npm --workspace landing run build
```

> This section previously read "There is **no jest configuration in this app**"
> and told agents to create one. It was true when written and became false at
> `6c38b94`; three other documents repeated it. Because this file takes
> precedence in its own directory, an agent adding testable logic here was being
> instructed to build a config that already existed — the `doc-code-drift`
> pattern, in the file most likely to be trusted. Corrected 2026-08-16 at
> `78072d2`.

`testMatch` is `**/*.spec.ts` — **`.ts` only**, in a `node` environment with no
jsdom. Component rendering cannot be tested here; extract the logic and test
that. Current specs are `lib/plan-presentation.spec.ts` and
`lib/subscribe-selection.spec.ts`.

CI runs four required jobs over this app — `lint`, `test-landing`, `typecheck`
and `build` — plus the cross-app URL rules in `test-runtime`. Browser coverage
exists in the `e2e/` workspace and starts on landing. That job is named by the
required aggregate but remains fail-open through job-level
`continue-on-error: true`; do not treat the aggregate green as proof that its
browser step passed.

**Untested at every level today:** the `/contact` form, all four
`app/api/**/route.ts` proxies, and the `/subscribe`, `/sign/[token]` and partner
token journeys.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
