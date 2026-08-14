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
  api/                Next route handlers — thin proxies to services/api
  components/         shared components (see below)
  dashboard/          dashboard entry
lib/                  client/server helpers, runtime registries, auth, tenant
```

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
  module-registry.ts            which modules exist
  module-runtime.resolver.ts    resolves a module's runtime shape
  metadata-registry.ts          field/entity metadata
  metadata-layer-resolver.ts    layered metadata (system → tenant → user)
  command-registry.ts           commands available on lists/records
  command-execution.service.ts  how a command runs
  modules/
    standard-module-specs.ts        declarative specs for standard modules
    standard-module-data.adapter.ts generic data adapter
    standard-module-runtime.ts      shared runtime wiring
    <domain>.adapter.ts             per-domain data/metadata adapters
```

Workflow for a new module screen:

1. Add or extend the spec in `lib/runtime/modules/standard-module-specs.ts`.
2. Add a data adapter only if the standard adapter cannot serve it.
3. Register in `module-registry.ts` and, if it needs commands, in
   `command-registry.ts`.
4. Route file renders `StandardModuleListPage` / `StandardModuleRecordPage`.
5. Add navigation in `app/(authenticated)/_components/navigation.ts` (and extend
   `navigation.spec.ts`).

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
  `x-auth-client-id`, refreshes on 401, and normalises errors through
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
catalogs, registries — `*.spec.ts` only, `testEnvironment: "node"`. jsdom and a
rendering library are **not installed**, so do not write component render tests
here; extract the logic and test that instead. Existing examples:
`lib/runtime/command-catalog.spec.ts`,
`lib/runtime/modules/standard-module-views.spec.ts`,
`app/(authenticated)/_components/navigation.spec.ts`,
`app/(authenticated)/settings/_lib/settings-runtime.spec.ts`.

Path alias `@/*` maps to the app root.
