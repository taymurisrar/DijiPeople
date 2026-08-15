# Workspace Routing, Domains and Environments

How a request becomes a tenant, who owns the hostname rules, and what has to be
configured in production before any of it works.

This is the canonical contract. `docs/architecture/tenancy.md` describes how
tenant data is isolated once a tenant is known; this describes how the tenant
becomes known in the first place.

---

## The shape of it

**One deployment serves every customer.** There is no per-customer build, no
per-customer frontend, no per-customer API. A workspace is a hostname that
resolves to a `tenantId`, and every request is then scoped by that id in exactly
the way `AGENTS.md` already requires.

| Surface | Hostname | Purpose |
|---|---|---|
| Platform admin | `admin.<base>` | DijiPeople's own operations console (`apps/admin`) |
| Global sign-in / discovery | `app.<base>` | Sign in without knowing your workspace, then get sent to it |
| API | `api.<base>` | `services/api` |
| Marketing | `<base>` | `apps/landing` |
| Tenant workspace | `<slug>.<tenant-base>` | `apps/web`, one hostname per workspace |
| Tenant custom domain | anything the customer proves control of | `apps/web`, same deployment |

`<base>` and `<tenant-base>` are configured separately so workspaces can live
under a different apex than the marketing site.

---

## Who owns what

There is exactly one owner for each decision. Adding a second one is a
regression even if it compiles.

| Decision | Owner |
|---|---|
| Hostname parsing, reserved labels, slug format, URL construction | `packages/config/platform-domains.js` |
| Hostname → tenant, primary-domain invariant, custom-domain lifecycle | `services/api/src/modules/tenant-domains/tenant-domain.service.ts` |
| Lifecycle → what a visitor sees | `services/api/src/modules/tenant-domains/workspace-resolution.service.ts` |
| Which hostname a request actually arrived on | `services/api/src/modules/tenant-domains/request-hostname.ts` |
| Edge routing for `apps/web` | `apps/web/proxy.ts` + `apps/web/lib/workspace-routing.ts` |
| Platform-authorized domain management | `services/api/src/modules/tenant-control-plane/tenant-domains-admin.service.ts` |

`packages/config/platform-domains.js` is plain JS with no dependencies precisely
so the edge proxy, the API, the admin app and the backfill command all apply the
*same* rules. Never re-implement `${slug}.${baseDomain}` anywhere else.

**`Tenant.slug` is the workspace slug.** There is no separate `workspaceSlug`
column and there must not be one.

---

## Resolving a hostname

1. Normalize: lowercase, strip port, strip trailing dot, trim.
2. If it is a platform hostname (`admin.`, `app.`, `api.`, the apex) → **not a
   workspace**, whatever the database says. Short-circuited before any query.
3. If it is the discovery host → workspace discovery, no tenant.
4. Exact-match `TenantDomain.domain`, a unique indexed column. One query.
5. A `DISABLED` domain resolves to nothing.
6. A non-primary hostname of a live workspace produces a 308 to the primary.
7. Anything unmatched is **workspace not found**. There is no fallback tenant
   outside local development.

### Suffix matching is exact

`maseer.dijipeople.com.attacker.com` must not resolve to `maseer`. The parser
requires the hostname to *end with* `.<tenant-base>` and the remaining label to
contain no dots. A `contains`/`startsWith` check here would hand an
attacker-controlled origin a customer's workspace and its session cookies.
Covered by `packages/config/platform-domains.test.js`.

### The Host header is only trusted behind a declared proxy

`X-Forwarded-Host` and `Forwarded` are believed only when `TRUST_PROXY_HEADERS`
says so, or when Express's own `trust proxy` is set (which `main.ts` configures
for the hosting platform). Otherwise `Host` wins. Only the *first* hop of a
forwarded chain is read. Covered by `request-hostname.spec.ts`.

**No tenant id is ever read from a header, body, query string or path param on an
authenticated endpoint.** The hostname is the only routing input, and it is
resolved against the database.

---

## Reserved labels

`RESERVED_HOST_LABELS` in `packages/config/platform-domains.js` is the single
list. `RESERVED_TENANT_SLUGS` in `services/api/src/common/utils/slug.util.ts`
is derived from it rather than repeated, so the host parser and the slug
validator cannot drift apart. Extend the config list; never add a second one.

Slug rules: lowercase `a-z0-9`, single hyphens, no leading/trailing/doubled
hyphen, 3–50 characters. Input is normalized before validation, so `Maseer` is
accepted and stored as `maseer`.

---

## Environments are separate tenants

A customer's UAT workspace is **a different `Tenant` row** with its own
`environmentType`, its own hostname, its own data and its own gateway pairings.
It is not a flag on one tenant.

If UAT were a flag, test data and production data would share every table, and
tenant isolation — the one invariant this codebase has — would no longer separate
them. `TenantEnvironmentGroup` links a customer's environments for display; it
grants nothing.

`environmentType` is fixed at creation. Promoting UAT to production by
relabelling would reclassify live test data rather than move anything.

**Nothing is cloned between environments.** Not API credentials, gateway
credentials, SMTP secrets, OAuth refresh tokens, Stripe secrets, device
credentials or webhook secrets.

Non-production workspaces carry a visible banner in `apps/web` and an environment
badge on the tenant record in `apps/admin`.

---

## Domain lifecycle

| State | Meaning |
|---|---|
| `PENDING` | Registered, not yet usable |
| `VERIFIED` | Resolvable and servable |
| `FAILED` | A verification attempt did not succeed |
| `DISABLED` | Retained so the name stays claimed, but resolves to nothing |

**System subdomains** (`<slug>.<tenant-base>`) are issued at provisioning. They
become `VERIFIED` only when the platform's wildcard DNS readiness flag is set,
because that flag is the only thing that makes them resolvable — there is no
per-tenant DNS record to create. The readiness surface therefore states a
*platform* fact ("Platform wildcard DNS and TLS are configured"), never a tenant
claim.

**Custom domains** start `PENDING` with a verification token
(`dijipeople-domain-verification=<hex>`, published as a TXT record at
`_dijipeople-challenge.<hostname>`). They cannot become primary until verified.

> **This deployment has no DNS resolver integration.** "Retry verification"
> records the attempt and shows the record the customer must publish. It
> returns `verified: false` honestly rather than marking a domain verified —
> a verified domain is exactly the thing that becomes routable. Automating this
> requires a resolver or provider integration that does not exist yet.

**One primary per tenant**, enforced by a partial unique index
(`TenantDomain_one_primary_per_tenant`). Promotion demotes the old primary in the
same transaction. The system subdomain is never deleted when a custom domain
takes over — it stays as a working secondary so existing links keep resolving.
The primary cannot be disabled; make another hostname primary first.

Hostnames are **globally unique**. Two tenants cannot claim the same one, and the
error never names the tenant that holds it.

---

## What a visitor sees

| Tenant status | Outcome | Page |
|---|---|---|
| `ACTIVE` | `WORKSPACE` | the application |
| `ONBOARDING`, `PROVISIONING`, `PENDING_SETUP`, `PROVISIONING_FAILED` | `PREPARING` | `/workspace/preparing` |
| `SUSPENDED` | `SUSPENDED` | `/workspace/suspended` |
| `INACTIVE`, `DECOMMISSIONING`, `DECOMMISSIONED`, `ARCHIVED`, `CHURNED` | `UNAVAILABLE` | `/workspace/unavailable` |
| unknown hostname | `NOT_FOUND` | `/workspace/not-found` |

An unmapped status falls back to `UNAVAILABLE`, never to `WORKSPACE`.

A valid session presented on another tenant's hostname is refused with
`/workspace/wrong-workspace`. **A session proves who someone is, never which
workspace they may render.**

---

## Generated links

Every workspace URL — invitations, activation, password reset, "Open workspace" —
goes through `TenantDomainService.getWorkspaceUrl(tenantId, path)`. Building
`https://${slug}.dijipeople.com` by hand is how a link ends up pointing at a
hostname the tenant does not own.

---

## Local development

There is no wildcard DNS locally. Two options:

- `maseer.localhost:3001` — most browsers resolve any `*.localhost` to loopback,
  so subdomain routing can be exercised for real.
- `http://localhost:3001` with `DEFAULT_TENANT_SLUG` set.

The default-tenant fallback is **development only**, and development is never
inferred from `NODE_ENV` alone — `resolvePlatformEnvironment` requires an
explicit stage. The guard lives at the reader
(`getDevelopmentFallbackWorkspaceSlug`) so a new caller cannot reintroduce a
production fallback. Covered by `apps/web/lib/workspace-routing.spec.ts`.

---

## Production configuration checklist

Work through this in order. Nothing below is automated by this repository —
DijiPeople does not own DNS or certificate provisioning here.

### 1. DNS

- [ ] `A`/`ALIAS` for the apex `<base>` → landing deployment
- [ ] `CNAME` `app.<base>` → web deployment
- [ ] `CNAME` `admin.<base>` → admin deployment
- [ ] `CNAME` `api.<base>` → API deployment
- [ ] **Wildcard** `CNAME *.<tenant-base>` → web deployment
- [ ] Verify: `nslookup anything-at-all.<tenant-base>` resolves

### 2. TLS

- [ ] Wildcard certificate covering `*.<tenant-base>` issued and installed
- [ ] Certificates for the platform hostnames
- [ ] Verify a workspace hostname over HTTPS with no certificate warning

### 3. Hosting platform

- [ ] Wildcard domain added to the `apps/web` project (Vercel: add
      `*.<tenant-base>`; a per-tenant domain entry is **not** required and must
      not be created per customer)
- [ ] `TRUST_PROXY_HEADERS=true` on the API when it sits behind a proxy
- [ ] Confirm the proxy forwards the original host

### 4. Environment variables

Register any new variable in `packages/config` validation, `turbo.json`
`globalEnv`, `render.yaml` and `docs/environment-variables.md`.

- [ ] `PLATFORM_ENVIRONMENT` — `production` / `staging` / `development`, set
      explicitly. Never rely on `NODE_ENV`.
- [ ] `PUBLIC_BASE_DOMAIN`
- [ ] `TENANT_BASE_DOMAIN`
- [ ] `APP_HOST`, `ADMIN_HOST`, `API_HOST` (only if they differ from the
      derived `app.`/`admin.`/`api.` defaults)
- [ ] `TRUST_PROXY_HEADERS`
- [ ] `DEFAULT_TENANT_SLUG` — **must not be set** in production or staging

### 5. Platform settings

- [ ] Platform Admin → Settings → Tenant provisioning → confirm the resolved
      base domain matches the DNS above (read-only; it comes from configuration)
- [ ] Only after DNS, proxy and TLS are verified: set **Wildcard DNS / proxy /
      TLS ready**. Until this is set, new workspace subdomains stay `PENDING`
      and tenants cannot be activated.

### 6. Existing tenants

- [ ] Dry run: `npm --workspace api run backfill:workspace-domains`
- [ ] Resolve any `UNRESOLVED` rows by assigning a slug in Platform Admin
- [ ] Apply: `npm --workspace api run backfill:workspace-domains -- --apply`
- [ ] Spot-check a workspace URL end to end

### 7. Verify

- [ ] `https://<slug>.<tenant-base>` serves the workspace
- [ ] `https://unknown-name.<tenant-base>` shows *workspace not found*, not a
      workspace
- [ ] `https://app.<base>` signs in and redirects to the right workspace
- [ ] A session on one workspace, opened against another workspace hostname,
      lands on *wrong workspace*
- [ ] `https://admin.<base>` is reachable and is **not** treated as a workspace

---

## Tests

| Concern | Suite |
|---|---|
| Hostname parsing, suffix confusion, reserved labels, slug format | `packages/config/platform-domains.test.js` (`npm run test:platform-domains`) |
| Forwarded-header trust | `services/api/src/modules/tenant-domains/request-hostname.spec.ts` |
| Resolution, slug/hostname validation, primary rules, verification honesty | `services/api/src/modules/tenant-domains/tenant-domain.service.spec.ts` |
| Lifecycle outcomes, cross-tenant and cross-environment session refusal | `services/api/src/modules/tenant-domains/workspace-resolution.service.spec.ts` |
| Hostname uniqueness, one-primary index, environment and gateway isolation, cascade on erase | `services/api/test/workspace-domain-isolation.e2e-spec.ts` (needs `DATABASE_URL`) |
| Edge classification and the development fallback guard | `apps/web/lib/workspace-routing.spec.ts` |
