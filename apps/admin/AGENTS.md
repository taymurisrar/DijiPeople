# AGENTS.md — `apps/admin` (platform admin)

Scope-specific rules for the DijiPeople internal SaaS operations console. Read
the root [`AGENTS.md`](../../AGENTS.md) first; this file does not repeat it.

> **Note:** this file previously contained a copy of the platform-wide rules,
> including a scope statement that said modules such as payroll, attendance and
> recruitment should not be built yet. That is no longer true. Platform-wide
> rules now live in the root [`AGENTS.md`](../../AGENTS.md).

---

## What this app is

Next.js **App Router**, TypeScript, Tailwind CSS v4, port **3002**. This is
DijiPeople's own control plane — **not** a tenant surface. Its users are
platform users (`PlatformUser`, `authSubjectType: 'platform-user'`), not tenant
users.

**This app is the highest-blast-radius surface in the product.** Its endpoints
legitimately read across tenants. Every change here needs to be evaluated for
whether it could leak one tenant's data into a view another party can reach, or
mutate a tenant without authority.

```
app/
  (internal)/   authenticated console: leads, partners, customers, tenants,
                contracts, contract-templates, signature-requests, support,
                plans, subscriptions, invoices, payments, promotions,
                commissions, onboarding, partner-inquiries, notifications,
                templates, settings, security, preferences, profile
  login/ forgot-password/ reset-password/ access-denied/
  api/          Next route handlers — thin proxies to services/api
  _components/  shared components (see below)
lib/            auth, platform RBAC, server-api, formatters, runtime registry
```

---

## Reuse before you build

| Need | Use |
|---|---|
| **Any production table** | **`ProDataTable`** — `app/_components/crm/data-table.tsx` |
| List page | `app/_components/runtime/runtime-module-page.tsx`, `runtime-module-list.tsx` |
| Record page | `runtime-record-route.tsx`, `runtime-record-page.tsx`, `runtime-form.tsx` |
| Commands | `module-action-bar.tsx` — the actions come from the registry, which gives every module Back and Refresh and adds Edit/New/Delete from its `capabilities` |
| Owner / Status / Sub-status | `record-status-group.tsx` — the D365 header group. Do not draw a status badge beside a record title as well |
| Commands on a bespoke detail page | `record-command-bar.tsx`, or `lib/runtime/standard-record-commands.ts` if the page has its own handler |
| Views | `runtime-view-selector.tsx` (includes user-pinned default) |
| Shell / nav | `admin-shell.tsx`, `admin-sidebar.tsx`, `admin-topbar.tsx`, `admin-ui.tsx` |
| Dashboard widgets | `app/_components/dashboard/` + the dashboard widget registry |
| Formatting | `lib/formatters.ts`, `lib/platform-formatters.ts`, `lib/platform-appearance.ts` |

**A module's command bar and its record header are registry decisions, not page
decisions.** `define()` builds both. A detail page that declares its own action
array — as two partner review screens did — loses every default the registry
adds later, which is how seven record pages ended up with a single Back button
and no Refresh at all. Put the actions on the module and take them from
`getPlatformModuleDefinition(key).actions`.

**Never mark a header slot or a form field writable that the API will reject.**
`PlatformRuntimeService` validates with `forbidNonWhitelisted`, so one extra key
fails the whole save with a 400 rather than that field — see BUG-0220, where the
runtime completed the plan form from the Prisma schema and every plan save had
been failing.

`ProDataTable` is the required table for every production Platform Admin screen —
this is stated in
[`docs/platform-admin-runtime-and-workflows.md`](../../docs/platform-admin-runtime-and-workflows.md).
Do not add a second table implementation.

---

## The platform runtime

Platform Admin is metadata-driven in the same spirit as `apps/web`, with its own
registry:

- Client contract: the platform module registry under `lib/runtime/`.
- Server adapter **and authorization boundary**: the API `platform-runtime`
  module (`PlatformRuntimeService`).
- The runtime resolves views, fields, actions, filters, sorting, related
  records, timelines, validation and persistence through module-owned services.
  **It does not maintain a second CRUD data source — do not create one.**
- The generated runtime schema lives in
  `packages/config/platform-runtime-schema.generated.json` and is produced by
  `npm run generate:runtime-schema`. It is validated by
  `npm run test:runtime-schema`, which asserts that every registered module's
  fields exist in Prisma and that sensitive/system-managed fields are neither
  writable nor exportable. **Regenerate and re-run that test after changing a
  platform runtime module or the Prisma models it exposes.**

Module-specific panels extend the record runtime only where a governed workflow
needs extra interaction — contract versions and signing, customer agreement
creation, support activities, tenant operations. They still go through the
normal service/API layer.

---

## Platform authorization

- Platform users authenticate through the API `platform-auth` module with the
  `admin` auth client id; `JwtAuthGuard` routes them to
  `loadPlatformAccessContext` and populates `user.platform`
  (`{ id, role, status }` with `PlatformUserRole` / `PlatformUserStatus`).
- **Client-side role logic lives in `lib/platform-rbac.ts` and is covered by
  `lib/platform-rbac.spec.ts`.** That spec exists because raw string comparisons
  like `role !== "SUPER_ADMIN"` compiled fine while silently locking out
  `PLATFORM_OWNER` across five call sites. Add role checks through the helpers
  in that file and extend the spec — never inline a role string comparison.
- Platform role gating in the UI is a usability affordance. The API is the
  authority. Every platform action must be enforced server-side in the
  `super-admin` / `platform-*` modules.
- Any screen that displays tenant data must display **which tenant** it belongs
  to. Silent cross-tenant aggregation without tenant attribution is a defect.

---

## Data access

- Server components call the API through `lib/server-api.ts` (cookies,
  `X-DijiPeople-App: admin`, refresh on 401, normalised errors via
  `lib/api-error.ts`).
- Route handlers under `app/api/` are thin proxies. No business logic, **no
  authorization decisions**, no tenant selection logic beyond forwarding.
- Tenant addressing helpers: `lib/tenant-slug.ts`, `lib/tenant-url.ts`,
  `lib/domain.ts`.

---

## UI requirements

- Loading, error, empty and access-denied states are mandatory. Use
  `global-error.tsx`, `not-found.tsx`, `/access-denied` and the shared runtime
  states.
- Money, dates and percentages go through `lib/formatters.ts` /
  `lib/platform-formatters.ts`. Invoices and payments are financial records —
  never format currency ad hoc, never round in the UI.
- Platform branding comes from `platform-appearance.ts` /
  `platform-branding-form.tsx` / `platform-defaults-provider.tsx`. Do not
  hardcode colours or product names.
- Destructive platform operations (suspend tenant, cancel subscription, reset
  demo data, delete records) require an explicit confirmation step and must be
  audited server-side.

---

## Testing

```bash
npm --workspace admin run test         # jest, node environment
npm --workspace admin run check-types  # next typegen && tsc --noEmit
npm --workspace admin run lint
npm run test:runtime-schema            # from repo root, after runtime changes
```

`jest.config.js` is scoped to **pure logic** — RBAC helpers and the module
registry. jsdom is not installed, so no rendering tests. `*.spec.ts` only. Path
alias `@/*` maps to the app root. Existing examples: `lib/platform-rbac.spec.ts`,
`lib/auth-config.spec.ts`, `lib/platform-appearance.spec.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
