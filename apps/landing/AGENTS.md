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

There is **no jest configuration in this app**. Validation is:

```bash
npm --workspace landing run check-types   # next typegen && tsc --noEmit
npm --workspace landing run lint
npm --workspace landing run build
```

If you add pure logic worth testing (a plan-shaping function, a form
normaliser), put it in `lib/`, and add a jest config modelled on
`apps/web/jest.config.js` as part of that change rather than leaving it
untested.
