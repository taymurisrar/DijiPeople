# Frontend Architecture

Three Next.js **App Router** applications plus an Electron desktop agent. All
TypeScript, all Tailwind CSS v4.

| App | Port | Audience |
|---|---|---|
| `apps/landing` | 3000 | Public — marketing, leads, partners, plans, contract signing |
| `apps/web` | 3001 | Tenant users — the product |
| `apps/admin` | 3002 | DijiPeople staff — SaaS operations |
| `apps/docs` | 3003 | Next.js starter; effectively unused |
| `apps/agent-desktop` | — | Electron attendance agent |

`packages/ui` (`@repo/ui`) contains only `button`, `card` and `code`. **It is not
the design system.** Each app owns its shared components. Do not assume a
component library exists across apps.

---

## The metadata-driven module runtime

This is the dominant pattern in `apps/web` and the reason most screens are
declared rather than written. Design contract:
[`module-runtime-overhaul.md`](module-runtime-overhaul.md).

### `apps/web/lib/runtime/`

| File | Role |
|---|---|
| `module-registry.ts` | **Unused scaffolding** — `registerModule` has no production callers. The real declaration point is `modules/standard-module-specs.ts` |
| `module-runtime.resolver.ts` / `module-runtime.types.ts` | Resolves a module's runtime shape |
| `metadata-registry.ts`, `metadata-runtime.resolver.ts` | Field and entity metadata |
| `metadata-layer-resolver.ts` | Layered metadata: system → tenant → user |
| `command-registry.ts`, `command-catalog.ts`, `command-execution.service.ts` | Commands on lists and records |
| `module-data-adapter.types.ts` | The data adapter contract |
| `modules/standard-module-specs.ts` | Declarative specs for standard modules |
| `modules/standard-module-data.adapter.ts` | The generic data adapter |
| `modules/standard-module-runtime.ts` | Shared runtime wiring |
| `modules/<domain>.adapter.ts` | Per-domain data/metadata adapters |
| `rbac-verification.ts`, `role-runtime.ts` | Runtime permission resolution |
| `form-layout-grid.ts` | Form layout computation |

### `apps/web/app/components/runtime/`

`StandardModuleListPage`, `StandardModuleRecordPage`, `ModuleListPage`,
`ModuleRecordPage`, `ModuleListShell`, `ModuleDetailShell`, `ModuleDataTable`,
`ModuleRecordHeader`, `ModuleCommandBar`, `ModuleViewSelector`,
`ModuleRelatedTabs`, `ModuleRelatedSubgrid`, `ModuleEmptyState`,
`ModuleAccessDeniedState`, `ModuleQuickCreatePanel`, `ModuleShareDialog`,
`ModuleAssignDialog`, `ModuleOwnerPicker`, `ModuleWidgetRenderer`,
`ModuleRefreshOverlay`, `ResponsiveRuntimeTabs`, `VisibilityRulesEditor`,
`TenantRuntimeStyleProvider`.

### Adding a module screen

1. Add or extend a spec in `lib/runtime/modules/standard-module-specs.ts`.
2. Add a data adapter only if the standard adapter cannot serve it.
3. Declare the module in `modules/standard-module-specs.ts` — verified as the
   real declaration point. (`module-registry.ts`, `metadata-registry.ts` and
   `command-registry.ts` exist but have no production callers; registering
   there alone is a no-op. Verify before relying on any of them.) If it has
   commands).
4. Render `StandardModuleListPage` / `StandardModuleRecordPage` from the route.
5. Add navigation in `app/(authenticated)/_components/navigation.ts` and extend
   `navigation.spec.ts`.

Bespoke pages are the exception, not the default. **Do not create a second CRUD
data path alongside the runtime** — that is the specific regression
`module-runtime-overhaul.md` exists to prevent.

---

## Platform admin runtime

`apps/admin` runs the same idea with its own registry and components. Design
contract: [`../platform-admin-runtime-and-workflows.md`](../platform-admin-runtime-and-workflows.md).

- Client contract: platform module registry under `apps/admin/lib/runtime/`.
- Server adapter and authorization boundary: the API `platform-runtime` module
  (`PlatformRuntimeService`).
- Components: `RuntimeModulePage`, `RuntimeModuleList`, `RuntimeRecordRoute`,
  `RuntimeRecordPage`, `RuntimeForm`, `RuntimeViewSelector`, `ModuleActionBar`.
- **`ProDataTable`** (`app/_components/crm/data-table.tsx`) is the required table
  for every production admin screen.
- Registered modules include Dashboard, Leads, Partners, Customers, Customer
  onboarding, Tenants, Contracts, Contract templates, Support cases, Monitoring
  incidents, Plans, Subscriptions, Invoices, Payments, Commissions.
- The runtime field contract is generated into
  `packages/config/platform-runtime-schema.generated.json` by
  `npm run generate:runtime-schema` and validated by
  `npm run test:runtime-schema`, which asserts every registered field exists in
  Prisma and that sensitive/system-managed fields are neither writable nor
  exportable.

---

## Settings runtime

Canonical contract: [`settings-and-branding.md`](settings-and-branding.md).
Implementation companion:
[`tenant-settings-attendance-runtime.md`](tenant-settings-attendance-runtime.md).

```
apps/web/app/(authenticated)/settings/
  _lib/settings-navigation.ts          category → group → item catalog
  _lib/settings-page-config.ts
  _lib/settings-adapter-registry.ts
  _lib/settings-runtime.ts
  _lib/require-settings-permission.ts  server-side permission assertion
  _components/                         shared settings surfaces
  [category]/[settingGroup]/[item]/    the generic settings route
```

Backed by the API `settings-runtime` and `tenant-settings` modules, permissioned
by `settings.read` / `settings.update`.

Key rules from the contract: `Location` is the canonical Work Site record; do
not introduce parallel Shift, Work Schedule, Work Calendar, Holiday, User or
Employee concepts; settings pages use the shared controls, `LookupField` for
relationships, and transactional multi-record updates.

---

## Route structure (`apps/web`)

```
app/
  (authenticated)/
    _components/    authenticated-shell-provider, dashboard-sidebar,
                    dashboard-topbar, navigation.ts, permission-gate,
                    notification-bell, resolved-settings-provider, user-menu
    _lib/           business-unit-access.ts, current-employee.ts
    employees/ attendance/ timesheets/ leaves/ payroll/ claims/ loans/
    benefits/ business-trips/ recruitment/ onboarding/ projects/ approvals/
    reports/ inbox/ customers/ users/ settings/ customization/
    me/ my-profile/ my-preferences/ profile/
    manager/ hr/ executive/
    layout.tsx  loading.tsx  error.tsx  page.tsx
  (public)/ activate-account/ partner/ t/ dashboard/
  api/          route handlers — thin proxies to services/api
  components/   shared components
  global-error.tsx  not-found.tsx  layout.tsx  globals.css
```

---

## Shared components (`apps/web/app/components/`)

| Directory | Contents |
|---|---|
| `ui/` | `button`, `empty-state`, `form-control`, `section-card`, `status-pill` |
| `data-table/` | `data-table`, `data-table-toolbar`, `data-table-pagination`, `types`, `utils` |
| `runtime/` | the module runtime components (above) |
| `metadata/` | `runtime-metadata-form-renderer`, `form-layout-grid` |
| `views/`, `view-selector/` | saved views and selection |
| `settings/`, `branding/`, `theme/` | configuration and appearance |
| `notifications/`, `inbox/`, `approvals/` | workflow surfaces |
| `attendance-corrections/`, `location/` | attendance-specific surfaces |
| `entity-data/` | generic entity data surfaces |
| `command-bar/`, `dashboard/`, `errors/`, `feedback/` | supporting |

**Search these before writing anything.** A hand-rolled table, form control or
empty state is a review failure.

---

## Data access

- Server components and server actions → `apps/web/lib/server-api.ts` (admin
  has its own). It attaches auth cookies and `X-DijiPeople-App`, refreshes on
  401 and rewrites cookies, and normalises errors via `lib/api-error.ts`.
- Route handlers under `app/api/` proxy so the browser never contacts the API
  origin directly. **They contain no business logic and make no authorization or
  tenant decisions.** The API is the authority.
- Tenant resolution: `lib/tenant-resolution.ts` (host/query/cookie/fallback
  hints with a `RESERVED_HOST_LABELS` deny list), `lib/tenant-url.ts`,
  `lib/tenant/`.

---

## Permissions in the UI

`apps/web/lib/permissions.ts` and `apps/web/lib/security-keys.ts` hold role and
permission keys. **`security-keys.ts` is a hand-maintained mirror of the API's
`common/constants/permissions.ts` and `rbac-matrix.ts` — there is no
generator.**

`PermissionGate`, navigation visibility and disabled controls are **usability
affordances**. The API enforces. `lib/elevated-roles.ts` mirrors the server's
elevated tenant roles; `apps/admin/lib/platform-rbac.ts` mirrors platform roles
and is spec-covered because inline role string comparisons silently excluded
valid roles in the past.

---

## Appearance and formatting

- Tenant CSS variables: `tenant-runtime-css-variables.ts`,
  `tenant-runtime-style-provider.tsx`, `lib/theme.ts`, `lib/branding.ts`.
  `TenantSettingsProvider` is the single root owner of branding state; server
  rendering resolves public tenant branding for the initial CSS variables, page
  title and favicon.
- Formatting: `lib/date-format.ts`, `lib/formatting-context.ts` so tenant
  regional settings apply. Do not call `toLocaleDateString` ad hoc.
- Admin formatting: `lib/formatters.ts`, `lib/platform-formatters.ts`,
  `lib/platform-appearance.ts`.

---

## Required UI states

Every data surface needs loading, error, empty and access-denied handling:
route-level `loading.tsx` / `error.tsx`, `global-error.tsx`, `not-found.tsx`,
the shared `EmptyState` / `ModuleEmptyState`, `access-denied-state.tsx` /
`ModuleAccessDeniedState` and the `/access-denied` route,
`ModuleRefreshOverlay` for in-place refresh.

---

## Testing

`apps/web/jest.config.js` and `apps/admin/jest.config.js` are deliberately
scoped to **pure logic** — resolvers, merges, catalogs, registries, RBAC
helpers. `testEnvironment: "node"`, `*.spec.ts` only, `@/*` → app root.

**jsdom and a rendering library are not installed**, so component render tests
are not possible today. Extract logic and test that instead.

`apps/landing` **has** a jest configuration — `apps/landing/jest.config.js`,
with `lib/plan-presentation.spec.ts` and `lib/subscribe-selection.spec.ts`, run
by the required `test-landing` CI job. This line previously read "`apps/landing`
has no test configuration"; corrected 2026-08-16 at `78072d2`.

`apps/docs` has none and needs none — it is a stock starter. `apps/agent-desktop`
has none, which is [[ITEM-0028]].

Both jest configs carry a comment explaining why they exist: `tsc` does not
catch an unreachable fallback, a merge that drops a property, or a rule that
matches nobody — all of which happened. That is the kind of defect these suites
target.
