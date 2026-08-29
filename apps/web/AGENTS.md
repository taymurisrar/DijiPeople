# AGENTS.md — `apps/web` (tenant product)

Scope-specific rules for the authenticated tenant-facing application. Read the
root [`AGENTS.md`](../../AGENTS.md) first; this file does not repeat it.

> **Note:** this file previously contained a copy of the platform-wide rules,
> including a scope statement that said modules such as payroll, attendance,
> leave and recruitment should not be built yet. That is no longer true — those
> modules are implemented and in active use. Platform-wide rules now live in the
> root [`AGENTS.md`](../../AGENTS.md).

---

## What this app is

Next.js **App Router**, TypeScript, Tailwind CSS v4, port **3001**. It is the
product tenant users log into: employees, managers, HR, payroll and tenant
administrators. It talks to `services/api` and owns no business rules of its
own.

```
app/
  (authenticated)/    product routes; per-domain folders + _components / _lib
  (public)/           unauthenticated product routes
  activate-account/   account activation flow
  partner/            partner-facing experience
  t/                  tenant-resolved entry routes
  workspace/          workspace-state pages — proxy.ts rewrites here when a
                      hostname cannot be resolved to a live tenant
  api/                Next route handlers — thin proxies to services/api
  components/         shared components (see below)
  dashboard/          dashboard entry
lib/                  client/server helpers, runtime specs, auth, tenant
```

`workspace/` was missing from this listing until 2026-08-17. It is not
incidental: workspace resolution is the **first** thing `proxy.ts` does, and
these pages are what a request gets when it fails closed. Read `proxy.ts` and
`lib/workspace-context.ts` before changing anything in that path.

---

## Reuse before you build

Search these first. A hand-rolled table, form control, empty state or dialog is
a review failure.

| Need | Use |
|---|---|
| Table | `app/components/data-table/` (`data-table.tsx`, `data-table-toolbar.tsx`, `data-table-pagination.tsx`) or `app/components/runtime/module-data-table.tsx` inside the runtime |
| List page | `app/components/runtime/standard-module-list-page.tsx`, `module-list-page.tsx`, `module-list-shell.tsx` |
| Record page | `app/components/runtime/standard-module-record-page.tsx`, `module-record-page.tsx`, `module-detail-shell.tsx`, `module-record-header.tsx` |
| Form fields | `app/components/metadata/runtime-metadata-form-renderer.tsx`, `form-layout-grid.tsx`, `app/components/ui/form-control.tsx` |
| Buttons / cards / status / empty | `app/components/ui/` — `button.tsx`, `section-card.tsx`, `status-pill.tsx`, `empty-state.tsx`; runtime variant `module-empty-state.tsx` |
| Commands / action bar | `app/components/runtime/module-command-bar.tsx`, `module-command-action-dialog.tsx`, `lib/runtime/command-registry.ts` |
| Views / view selector | `app/components/views/`, `app/components/view-selector/`, `module-view-selector.tsx` |
| Related records | `module-related-tabs.tsx`, `module-related-subgrid.tsx` |
| Permission gating | `app/(authenticated)/_components/permission-gate.tsx` |
| Notifications | `app/components/notifications/`, `notification-bell.tsx` |
| Branding / theme | `app/components/branding/`, `app/components/theme/`, `tenant-runtime-style-provider.tsx` |
| Errors | `app/components/errors/`, route-level `error.tsx`, `global-error.tsx` |

`packages/ui` (`@repo/ui`) contains only `button`, `card` and `code`. **It is not
this app's design system.** Do not migrate components into it without an ADR.

---

## The module runtime is the default way to build a screen

New tenant-product modules are **declared, not hand-written**. The pieces:

```
lib/runtime/
  command-execution.service.ts  how a command runs
  visibility.resolver.ts        rule-based visibility (fails closed)
  modules/
    standard-module-specs.ts             11 specs
    payroll-foundation-runtime-specs.ts  12 specs
    standard-module-runtime.ts           the engine — buildStandardModuleRuntimeContext
    standard-module-route-helpers.ts     buildStandardRouteRuntime, the route glue
    standard-module-data.adapter.ts      generic data adapter (write/command path)
    employee-*.ts                        the one bespoke domain, by design
```

> **These five modules are inert scaffolding — do not "register" anything in
> them.** `module-registry.ts`, `metadata-registry.ts`, `command-registry.ts`,
> `module-runtime.resolver.ts` and `metadata-layer-resolver.ts` have **zero call
> sites**. This section previously told you to register a module in the first
> and third; that step has no effect. `getEntityMetadata` *is* called twice but
> the map is never populated, so it always returns `null` and callers fall
> through to a default. Corrected 2026-08-17 at `1af3690` —
> see `BUG-0044` and `ITEM-0036`.
>
> The **only live registry** in this app is
> `app/(authenticated)/settings/_lib/settings-adapter-registry.ts`, which holds
> 82 of the app's 105 module specs and validates itself at module load.

Workflow for a new module screen — the steps that actually work:

1. Add or extend the spec in `lib/runtime/modules/standard-module-specs.ts` (or
   `payroll-foundation-runtime-specs.ts`). `moduleKey` must match `routeBase` —
   the adapter derives `"/api" + routeBase` when `apiPath` is absent, and
   command handlers are selected by `moduleKey` **string equality**.
2. Add the Next route handlers under `app/api/<resource>/` — thin proxies.
3. List page: fetch with `apiRequestJson`, build with `buildStandardRouteRuntime`,
   render `StandardModuleListPage`.
4. Record pages (`[id]`, `[id]/edit`, `new`): `buildStandardRouteRuntime` +
   `resolveStandardActiveForm`, render `StandardModuleRecordPage`.
5. Add navigation in `app/(authenticated)/_components/navigation.ts` (and extend
   `navigation.spec.ts`).
6. Add a data adapter only if the standard adapter cannot serve it. Note it
   already carries nine hardcoded `moduleKey` branches — adding a tenth is the
   accretion `ITEM-0036` exists to stop.

Write a bespoke page **only** when the runtime genuinely cannot express the
requirement, and state that explicitly in the plan. Do not create a second CRUD
data path alongside the runtime — that is the specific failure mode
[`docs/architecture/module-runtime-overhaul.md`](../../docs/architecture/module-runtime-overhaul.md)
exists to prevent.

---

## Settings

Settings screens go through the settings runtime, not bespoke pages:

```
app/(authenticated)/settings/_lib/
  settings-navigation.ts          category → group → item catalog
  settings-page-config.ts         page shape
  settings-adapter-registry.ts    which adapter serves which item
  settings-runtime.ts             runtime resolution
  require-settings-permission.ts  server-side permission assertion
```

Backed by the API `settings-runtime` and `tenant-settings` modules.
[`docs/architecture/settings-and-branding.md`](../../docs/architecture/settings-and-branding.md)
is the **canonical contract** for settings ownership, information architecture,
the User/Employee boundary, work-configuration records and attendance schedule
resolution precedence. Read it before adding a settings surface. Do not
introduce parallel Shift, Work Schedule, Work Calendar, Holiday, User or
Employee concepts.

`Location` is the canonical Work Site record — do not create a second one.

---

## Data access

- **Server components and server actions** call the API through
  `lib/server-api.ts`, which attaches the auth cookies and
  `X-DijiPeople-App`, refreshes on 401, and normalises errors through
  `lib/api-error.ts`. Use it; do not call `fetch` against the API directly.
- **Route handlers under `app/api/`** are thin proxies that exist so the browser
  never talks to the API origin directly. Rules:
  - No business logic.
  - **No authorization decisions.** Never decide "this user may do X" here. The
    API is the only authority. A proxy that filters or permits is a second
    source of truth and a security hole.
  - No tenant resolution beyond forwarding what the request already carries.
  - Forward the API's error contract through rather than flattening it.
- Tenant resolution helpers live in `lib/tenant-resolution.ts`,
  `lib/tenant-url.ts`, `lib/tenant/`. Reserved host labels are enumerated in
  `RESERVED_HOST_LABELS` — extend that set rather than special-casing hosts.

---

## Permissions in the UI

- `lib/permissions.ts` and `lib/security-keys.ts` hold role and permission keys.
  **`lib/security-keys.ts` is a hand-maintained mirror of the API's
  `common/constants/permissions.ts` and `rbac-matrix.ts`. There is no
  generator.** When you add a key here, copy it exactly, and only add what the
  UI actually needs.
- `PermissionGate`, navigation visibility and disabled controls are **usability
  affordances only**. Every gated action must be independently enforced by the
  API. Never treat a hidden button as a security control.
- Elevated-role helpers live in `lib/elevated-roles.ts` and mirror the API's
  elevated tenant roles. Keep them in sync when the API list changes.

---

## UI requirements

- **Loading, error and empty states are mandatory** for every data surface. Use
  the route-level `loading.tsx` / `error.tsx` conventions already present under
  `(authenticated)/`, and the shared `EmptyState` / `ModuleEmptyState`
  components. `module-refresh-overlay.tsx` covers in-place refresh.
- **Access denied** uses `access-denied-state.tsx` /
  `module-access-denied-state.tsx` and the `/access-denied` route — not a blank
  page or a thrown error.
- **Responsive**: Tailwind v4. Every screen must work at tablet and mobile
  widths. The runtime shells and `responsive-runtime-tabs.tsx` handle the common
  breakpoints — reuse them rather than adding new breakpoint logic.
- **Theming**: colours come from tenant CSS variables
  (`tenant-runtime-css-variables.ts`, `tenant-runtime-style-provider.tsx`,
  `lib/theme.ts`). Do not hardcode brand colours; do not bypass the theme
  toggle.
- **Formatting**: dates, numbers and currency go through
  `lib/date-format.ts` / `lib/formatting-context.ts` so tenant regional settings
  apply. Never call `toLocaleDateString` ad hoc.
- **Accessibility**: every control labelled; dialogs focus-trapped and
  dismissible with Escape; tables keyboard-navigable; status conveyed by text as
  well as colour (`StatusPill` already does this); images have alt text.

---

## Testing

```bash
npm --workspace web run test         # jest, node environment
npm --workspace web run check-types  # next typegen && tsc --noEmit
npm --workspace web run lint
```

`jest.config.js` is deliberately scoped to **pure logic**: resolvers, merges,
catalogs, registries — `*.spec.ts` only (**`.spec.tsx` is not matched**),
`testEnvironment: "node"`. jsdom and a rendering library are **not installed**,
so do not write component render tests here; extract the logic and test that
instead.

> **Know what this leaves uncovered before relying on it.** 17 specs exist. The
> config cannot reach any page, any client component, `proxy.ts`,
> `lib/server-api.ts` or any of the 416 route handlers — and `apps/web` has
> **zero browser coverage**, so those surfaces have no test mechanism at all.
> See `ITEM-0034`. Do not read `ITEM-0001` (browser tooling, `DONE`) as coverage
> of this app.

Existing examples:
`lib/runtime/command-catalog.spec.ts`,
`lib/runtime/modules/standard-module-views.spec.ts`,
`app/(authenticated)/_components/navigation.spec.ts`,
`app/(authenticated)/settings/_lib/settings-runtime.spec.ts`.

Path alias `@/*` maps to the app root.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
