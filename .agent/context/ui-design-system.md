# UI and Design System

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** apps/web/app/components/ui/button.tsx, apps/web/app/components/ui/form-control.tsx, apps/web/app/components/ui/empty-state.tsx, apps/web/app/components/ui/section-card.tsx, apps/web/app/components/ui/status-pill.tsx, apps/web/app/components/data-table/data-table.tsx, apps/web/app/components/data-table/types.ts, apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx, apps/web/app/components/metadata/form-layout-grid.tsx, apps/web/app/globals.css, apps/admin/app/globals.css, apps/web/lib/branding.ts, apps/web/lib/theme.ts, apps/web/lib/formatting-context.ts, apps/web/lib/date-format.ts, apps/web/app/components/runtime/tenant-runtime-css-variables.ts, apps/web/app/components/runtime/tenant-runtime-style-provider.tsx, apps/web/app/components/runtime/responsive-runtime-tabs.tsx, apps/web/app/(authenticated)/_components/access-denied-state.tsx, apps/admin/app/_components/crm/data-table.tsx, packages/ui/src/, packages/eslint-config/base.js
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

There is no cross-app design system. `apps/web` and `apps/admin` each own a
private kit, share **zero** code (`grep -rn "@/app/components" apps/admin`
returns nothing), and use disjoint CSS token namespaces.

### `packages/ui` is NOT the design system

`packages/ui/src/` contains exactly three files — `button.tsx`, `card.tsx`,
`code.tsx` — all create-turbo boilerplate (its `Button` calls `alert()`).
Package `@repo/ui` (`packages/ui/package.json:2`). Imported from **one** place
in the repo: `apps/docs/app/page.tsx:2`. Zero references in web, admin, landing,
agent-desktop. Dead scaffolding.

### `apps/web/app/components/ui/` — the tenant kit (5 files, 75 importers)

| File | Exports |
|---|---|
| `button.tsx` | `ButtonProps` (`:54`), `Button` (`:130`) |
| `empty-state.tsx` | `EmptyState` (`:3`) |
| `form-control.tsx` | `LookupOption` (`:14`), `SelectField` (`:159`), `DateField` (`:380`), `TimeField` (`:428`), `TextField` (`:470`), `NumberField` (`:558`), `TextAreaField` (`:615`), `CheckboxField` (`:662`), `MultiSelectField` (`:726`), `LookupField` (`:807`) |
| `section-card.tsx` | `SectionCard` (`:3`) |
| `status-pill.tsx` | `StatusPill` (`:3`) |

**`Button`** — 14 variants (`:5-19`): `primary, secondary, outline, ghost, soft,
success, success-soft, warning, warning-soft, danger, danger-soft, link, pill,
card`. 9 sizes (`:21`): `xs, sm, md, lg, xl, icon-xs, icon-sm, icon-md,
icon-lg`. Defaults `primary`/`md` (`:137-138`). An `href` renders a `next/link`
(`:196-225`); `href` + disabled renders `<span aria-disabled="true">`
(`:203-211`). `loading` swaps in a lucide `Loader2` (`:154`). `card`/`pill`
ignore `size` (`:120-121`, `:179-185`). Class joining is a local 3-line `cn()`
(`:56-58`) — no `clsx`, no `cva` in web.

**`form-control.tsx` is a field library, not one control.** Shared
`BaseFieldProps` (`:25-35`): `label, hint, warning, error, required, touched,
dirty, validationStatus, className`. `FieldShell` (`:37`) renders label,
required asterisk and hint tooltip and wires `aria-describedby` by cloning the
child (`:94-102`). `SelectField` and `LookupField` are custom `createPortal`
comboboxes with viewport-aware positioning (`:134-157`, `:901-943`). `TextField`
has a `"cnic"` variant with masking and validation (`:480`, `:496-527`).

**`StatusPill`** — `tone: good | muted | neutral | danger | warning | info`,
default `neutral` (`:3-9`). Tone always carries text.

### `apps/web/app/components/data-table/` (5 files)

`types.ts` — `DataTableColumn<T>` (`:43-64`): `key`, `entityField?`, `header`,
`sortable?`, `filterable?`, `filterType?` (`text|select|multiSelect|date|number`),
`searchable?`, accessor overrides, required `render: (row) => ReactNode`. 15
filter operators (`:13-28`); `VALUELESS_FILTER_OPERATORS` (`:31`) covers
`isEmpty`/`isNotEmpty`. `DataTableProps<T>` at `:145`.

`data-table.tsx:28` — `DataTable<T>`, `"use client"`. **`mode?: "client" |
"server"`, default `"client"` (`:42`).**
- *Client*: search → filter → sort → slice in memory (`:178-188`, `:215-219`).
- *Server*: URL is the source of truth. Sort reads
  `?orderBy="<field> <dir>"` (`:67-84`), header clicks `router.push` (`:294-310`);
  filters push `${key}Filter`, `${key}FilterOperator`, `${key}FilterTo`
  (`:333-358`) with the key resolved as `filterParamKey ?? entityField ?? key`
  (`:325-327`). In-memory filter/sort is skipped (`:181-183`).

Also: row selection with indeterminate header checkbox (`:494-509`), pointer
column resize with double-click reset (`:102-121`, `:559-580`), sticky
filter/sort persisted to `localStorage` under
`dijipeople:data-table:<entity|pathname>` — client mode only, gated on
`preferences.enableStickyFilters` (`:133-176`), density class
`data-table-density-<compact|spacious>` (`:426-428`).

`data-table-pagination.tsx:16` is entirely URL/link driven (`buildHref`
`:35-48`), options default `[10,25,50,100]`. `data-table-toolbar.tsx:16` writes
filter values into the query string (`:47-61`).

### `apps/web/app/components/metadata/` (2 files)

`runtime-metadata-form-renderer.tsx` (2,406 lines) exports `FieldValueMap`
(`:44`) and `RuntimeMetadataFormRenderer` (`:113`), a discriminated union
(`:70-96`) dispatching to `RuntimeFormMetadataRenderer` (`:203`) when `entity`
is present, else `CustomizationFormRenderer` (`:146`).

The `dataType` → control mapping is one ternary chain in `EditableField`,
`:1138-1265`:

| `dataType` | Control | Line |
|---|---|---|
| `optionset` | `SelectField` | `:1138` |
| `multi-optionset` | `MultiSelectField` | `:1150` |
| `lookup` | `LookupField` | `:1158` |
| `date` | `DateField` (honours `minDate`/`maxDate`) | `:1178` |
| `time` | `TimeField` | `:1191` |
| `boolean` | `CheckboxField` | `:1200` |
| `number`/`decimal`/`currency` | `NumberField` | `:1209` |
| `multiline-string`/`json` | `TextAreaField` | `:1229` |
| everything else | `TextField` via `inputTypeForField` (`:2017`) | `:1253` |

One field is special-cased by logical name: `eligibilityRules` →
`EligibilityRulesField` (`:1222`, `:1328`). Read-only rendering is a separate
`ReadOnlyField` (`:1918`).

`form-layout-grid.tsx` — `FormGrid` (`:42`), `FormGridItem` (`:80`),
`formGridStyle`/`formGridItemStyle` (`:159`, `:165`). A `ResizeObserver` reduces
column count by container width (`:113-157`) and emits
`--dp-form-grid-columns` / `--dp-form-grid-column` / `--dp-form-grid-column-span`,
consumed at `apps/web/app/globals.css:417-518`.

### Other `apps/web/app/components/` directories

`approvals` (1), `attendance-corrections` (4), `branding` (3), `command-bar` (2),
`dashboard` (6), `entity-data` (2), `errors` (5 — `ErrorProvider`/`useErrorHandler`
at `errors/error-provider.tsx:30`,`:87`), `feedback` (3 — `ConfirmDialog`,
`SessionExpiredDialog`), `inbox` (2), `notifications` (5 — side-toast/top-alert),
`runtime` (36 — see `runtime-module-system.md`), `settings` (7), `theme` (1),
`view-selector` (1), `views` (3).

### Tailwind v4

Resolved `tailwindcss@4.2.4`. **There is no `tailwind.config.*` anywhere** —
configuration is CSS-first. Build wiring is only
`apps/web/postcss.config.mjs` (and admin/landing) declaring
`@tailwindcss/postcss`. Entry: `apps/web/app/globals.css:1` →
`@import "tailwindcss";`.

`apps/web/app/globals.css`:
- `:root` raw tokens `:3-51` — `--brand-*` (`:4-15`),
  `--color-success|warning|danger|info` (`:16-19`), `--font-family` (`:20`),
  `--font-scale` (`:21`), `--radius-sm|md|lg` (`:22-24`), `--density` (`:25`),
  `--dp-*` (`:26-32`), then semantic aliases `--background` (`:33`),
  `--foreground` (`:34`), `--surface` (`:35`), `--surface-strong` (`:36`),
  `--border` (`:37`), `--accent` (`:38`), `--accent-strong` (`:39`),
  `--accent-soft` (`:40`), `--muted` (`:41`), `--sidebar-muted` (`:42`),
  `--danger` (`:43`), `--dp-mix-base` (`:50`).
- `@theme inline` `:53-88` turns those into utilities — `--color-background`,
  `--color-foreground`, `--color-surface`, `--color-surface-strong`,
  `--color-border`, `--color-accent`, `--color-accent-strong`,
  `--color-accent-soft`, `--color-muted`, `--color-danger`, `--font-sans`,
  `--font-serif`, plus a `--text-2xs … --text-5xl` ramp with line heights
  (`:67-87`; `--text-sm: 0.85rem` is non-default). This is why `bg-surface`,
  `text-muted`, `border-border`, `bg-accent-soft` resolve with no config file.
- `.dp-theme-scope` remaps semantics from `--dp-*` with `color-mix` (`:218-228`);
  dark mode is `html[data-theme="dark"] .dp-theme-scope` (`:241-373`).

`apps/admin/app/globals.css` is a separate namespace: `--admin-background`
(`:6`), `--admin-surface` (`:7`), `--admin-border` (`:8`), `--admin-text` (`:9`),
`--admin-muted-text` (`:10`), `--admin-success|warning|danger|info` (`:11-14`),
`--admin-radius-*` (`:15-18`), `--admin-shadow-*` (`:19-20`), `--admin-font-*`
(`:21-22`), `--admin-base-font-size` (`:23`); its `@theme inline` (`:26-31`)
exposes only four vars.

### Tenant theming — two separate variable systems

1. **Branding (app-wide, ~35 vars).** `buildBrandingCssVariables`
   (`apps/web/lib/branding.ts:505-555`) emits `--brand-*`, `--color-*`,
   `--font-family`, `--font-scale`, `--radius-*`, `--density` and the full
   `--dp-*` set (`--dp-primary`, `--dp-surface`, `--dp-text`, `--dp-sidebar-*`,
   `--dp-success|warning|danger|info`, `--dp-font-family`, `--dp-radius`,
   `--dp-shadow`, `--dp-density-scale`). **These are the names `globals.css` keys
   on.** Applied at `apps/web/app/(authenticated)/layout.tsx:126` via
   `buildTenantThemeStyle` (`:238-240`) onto the `.dp-theme-scope` wrapper
   (`:155-161`). Other consumers: `lib/public-tenant-settings.ts:17`,
   `lib/tenant-branding-client.ts:17`, and the settings live preview
   (`settings/branding/_components/branding-settings-form.tsx:173`). Supporting
   exports: `BRANDING_COLOR_KEYS` (`:3`), `BRANDING_FONT_OPTIONS` (`:46`),
   `DEFAULT_BRANDING_SETTINGS` (`:192`), `resolveBrandingSettings` (`:310`),
   `resolveTenantBranding` (`:470`), `getBrandingContrastRatio` (`:573`),
   `hasReadableContrast` (`:586`), `getBrandingValidationIssues` (`:594`, a real
   4.5 WCAG check on text/background and sidebar text).

2. **Runtime scope (6 vars only).** `buildTenantRuntimeCssVariables`
   (`apps/web/app/components/runtime/tenant-runtime-css-variables.ts:20-27`) emits
   `--dp-runtime-font-body`, `--dp-runtime-font-heading`, `--dp-runtime-primary`,
   `--dp-runtime-secondary`, `--dp-runtime-radius`, `--dp-runtime-density`.
   Radius map `:6-12`, density map `:14-18`. `TenantRuntimeStyleProvider`
   (`tenant-runtime-style-provider.tsx:7`) is a plain
   `<div style={...} data-tenant-runtime={slug}>` (`:17-23`) — **not a React
   context** — mounted in exactly two places:
   `runtime/module-list-page.tsx:160` and `runtime/module-record-page.tsx:372`.

Light/dark: `apps/web/lib/theme.ts` — `THEME_STORAGE_KEY = "dijipeople:theme"`
(`:12`), `systemPrefersDark` (`:16`), `readStoredThemeChoice` (`:23`),
`storeThemeChoice` (`:36`), `resolveTheme` (`:44`), `applyTheme` (`:57`, writes
`document.documentElement.dataset.theme`). `ThemeApplier`
(`app/components/theme/theme-applier.tsx:22`) is mounted once at
`apps/web/app/layout.tsx:82`, with a pre-paint inline script at `:104`.

### Formatting

`apps/web/lib/formatting-context.ts` — `ResolvedFormattingContext` (`:1-8`),
`setDefaultFormattingContext` (`:22`), `formatDateTime` (`:28`), `formatDate`
(`:40`), `formatTime` (`:50`), `formatMoney` (`:71`), `formatNumber` (`:85`),
`formatTimezoneLabel` (`:99`), `formatWorkHours` (`:116`). Resolution: explicit
context → module-level `runtimeDefaultContext` (`:20`) → `DEFAULT_CONTEXT`
(`UTC`/`USD`/`en-US`, `:10-18`). Exactly four `dateFormat` strings are supported
— `MM/dd/yyyy`, `dd/MM/yyyy`, `yyyy-MM-dd`, `dd-MMM-yyyy` (`:185-193`); anything
else falls back to `Intl` `dateStyle: "medium"` (`:194-198`).

`runtimeDefaultContext` is a **mutable module-level singleton** set from one
place — `app/(authenticated)/_components/resolved-settings-provider.tsx:169`
(cleanup `:170`). It is client-side only, so **server components must pass an
explicit formatting context**, which is why list pages build a `formatting`
object by hand (e.g. `leaves/page.tsx:100-110`).

`apps/web/lib/date-format.ts` — `formatDateWithTenantSettings` (`:14`),
`formatDateTimeWithTenantSettings` (`:21`); thin wrappers substituting the
literal `"Not set"` for empty values (`:18`, `:25`).

### Required states — actual coverage

| | `apps/web/app` | `apps/admin/app` |
|---|---|---|
| `loading.tsx` | 3 — `(authenticated)/`, `.../employees/`, `.../leaves/` | **0** |
| `error.tsx` | 3 — same three routes | **0** |
| `not-found.tsx` | 1 | 1 |
| `global-error.tsx` | 1 | 1 |

Access denied (real files):
`app/(authenticated)/_components/access-denied-state.tsx:17` —
`AccessDeniedState({ title, description, actionHref, actionLabel, traceId,
statusCode = 403, errorCode = "ACCESS_DENIED", requestPath })` with support
trace id and error-log download; `app/components/runtime/module-access-denied-state.tsx:3`
— `ModuleAccessDeniedState`, the runtime variant;
`app/(authenticated)/access-denied/page.tsx:10` — the route;
`apps/admin/app/access-denied/page.tsx:3` — admin's own, separate.

Empty: `EmptyState` (`ui/empty-state.tsx:3`) wrapped by `ModuleEmptyState`
(`runtime/module-empty-state.tsx:4`). `DashboardEmptyState`
(`app/components/views/shared.tsx:64`) is a third, duplicate implementation.

### Responsive

`app/components/runtime/responsive-runtime-tabs.tsx:17` —
`ResponsiveRuntimeTabs({ activeTabKey, onTabChange, tabs })`. Measures tabs in a
hidden `aria-hidden` mirror row (`:159-172`), computes how many fit in a
`useLayoutEffect` + `ResizeObserver` with `TAB_GAP = 8` / `MORE_RESERVE = 104`
(`:14-15`, `:98-135`), re-runs after `document.fonts.ready` (`:131`), and portals
the overflow into a `role="menu"` with Escape + arrow-key roving focus
(`:37-72`, `:137-155`).

**There is no `useMediaQuery`, `use-mobile` or `useIsMobile` hook anywhere.**
Responsiveness is inline Tailwind breakpoints, `ResizeObserver` in four files
(`command-bar/command-bar.tsx:107`, `metadata/form-layout-grid.tsx:134`,
`responsive-runtime-tabs.tsx:128`,
`apps/admin/app/_components/runtime/runtime-record-page.tsx:2219`), and one CSS
media query at `globals.css:509`. `matchMedia` is used only for
`prefers-color-scheme`.

### Accessibility — convention only, not enforced

Across the 69 `.tsx` files in `apps/web/app/components`: 96 `aria-*` occurrences
in 29 files, 22 `role="…"`, and **3** `sr-only`.

**No a11y lint rule is configured** — `jsx-a11y` appears nowhere in the repo.
`packages/eslint-config/base.js` is `js.configs.recommended` + prettier +
typescript-eslint + `turbo/no-undeclared-env-vars` + `only-warn`; `next.js` adds
react/react-hooks/`@next/next`. **Neither product app even uses it** —
`apps/web/eslint.config.mjs` and `apps/admin/eslint.config.mjs` pull only
`eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. And
`eslint-plugin-only-warn` in the shared base means nothing there can fail a
build.

Good local practice exists but is unverified: `Button` forwards `aria-label`
(`button.tsx:145,219,238`), `FieldShell` wires `aria-describedby`
(`form-control.tsx:99`), `DataTable` labels sort/filter buttons
(`data-table.tsx:538,873`) and checkboxes (`:506,607`), pagination sets
`aria-current="page"` (`data-table-pagination.tsx:163`).

### Icons and charts

`lucide-react@1.8.0` is the only icon library. **It is declared only in
`apps/admin/package.json:30`** — `apps/web` imports it (`ui/button.tsx:3`,
`data-table/data-table.tsx:3-11`, `responsive-runtime-tabs.tsx:3`) without
declaring it, resolving purely through workspace hoisting. **There is no
charting library at all** — no recharts, chart.js, d3, victory, nivo or
apexcharts. Dashboard widgets are hand-rolled. TipTap and `clsx` are admin-only.

### `apps/admin` kit

`_components/` subdirs: `billing` (1), `crm` (12), `dashboard` (1), `documents`
(4), `monitoring` (2), `notifications` (1), `partners` (2), `plans` (1),
`runtime` (6), `settings` (8), `ui` (10), plus ~40 loose top-level `.tsx` files.

`crm/` is the shared kit: `data-table.tsx` (`ProDataTable<T>` `:108`,
`ProDataTableColumn<T>` `:17`, `ProDataTableProps<T>` `:33`),
`data-table-header-menu.tsx`, `filter-bar.tsx`, `module-detail-layout.tsx`,
`module-list-layout.tsx`, `owner-selector.tsx`, `pagination-control.tsx`,
`query-params.ts`, `search-bar.tsx`, `sort-control.tsx`, `status-selector.tsx`,
`sub-status-selector.tsx`.

`_components/ui/` (10 files): `detail-page.tsx` (`DetailPageShell`,
`DetailHeader`, `CommandBar`, `SummaryCards`, `FormSection`, `ReadOnlyField`,
`StatusPipeline`), `empty-state.tsx`, `feature-chip.tsx`, `form-control.tsx`,
`lifecycle-tabs.tsx`, `metric-card.tsx`, `page-header.tsx`, `section-card.tsx`,
`toast-notice.tsx`, `toast-provider.tsx`.

## Key abstractions

- **`apps/web/app/components/ui/`** — the tenant primitive kit; search here first.
- **`apps/admin/app/_components/ui/` + `crm/`** — the admin kit; `ProDataTable`
  is the required table for every production admin screen.
- **CSS variables as the theming boundary** — components use semantic Tailwind
  utilities, `@theme inline` maps them to `--dp-*`, branding writes `--dp-*` per
  tenant at the layout level.
- **`RuntimeMetadataFormRenderer`** — the one place metadata field types become
  controls.
- **`formatting-context.ts`** — the one date/money/number formatter.

## Known exceptions

- **`StatusPill` hardcodes the Tailwind palette** (`status-pill.tsx:10-21`:
  `emerald-50`, `red-50`, `amber-50`, `sky-50`, `slate-50`), so status colours do
  not follow the tenant theme. Only `neutral` uses `accent-soft`.
- **`globals.css:281-373`** is a large dark-mode compensation block for
  components that hardcode `bg-white` / `bg-slate-50` / `text-slate-700`; the
  file admits it at `:294-310`. Do not add to it — fix the component.
- **`admin/globals.css:61-71`** has three `!important` class-rewrite hacks,
  needed because admin has **no `Button` component** and styles buttons inline.
- **Dead code in `form-control.tsx`**: `:352` and `:1120` keep unreachable
  `{false ? …}` native fallbacks.
- **`DataTableFilterField.type` allows `"lookup"`** (`types.ts:71`) but
  `data-table-toolbar.tsx:105-131` only branches on `select` vs text.
- **Sticky filters are client-mode only** (`data-table.tsx:133-176`); server-mode
  tables silently ignore `enableStickyFilters`.
- **`apps/admin` has zero `loading.tsx` and zero `error.tsx`.**
- **Duplication is real**: `SectionCard`, `EmptyState`, `FormControl`,
  `ReadOnlyField` each exist twice with different props; `admin-ui.tsx`
  (`AdminWorkspace` `:4`, `AdminCommandBar` `:8`, `AdminPageHeader` `:73`,
  `AdminSectionCard` `:127`) is a third, older admin kit.

## Anti-patterns to avoid

1. **Hand-rolling a table, form control, empty state or status badge** — an
   explicit review failure per `AGENTS.md`.
2. **Adding a `tailwind.config.js`.** v4 here is CSS-first; new tokens go in
   `:root` + `@theme inline` of the app's `globals.css`.
3. **Hardcoding a hex or raw palette class** (`bg-white`, `text-slate-700`,
   `#0f766e`). That is what forced `globals.css:281-373` to exist.
4. **Adding another dark-mode override** instead of fixing the component.
5. **Importing `@repo/ui`.**
6. **Formatting dates with `toLocaleDateString`/`Intl` directly** — use
   `formatting-context.ts` or `date-format.ts` so tenant settings apply.
7. **Relying on `setDefaultFormattingContext` in a server component** — it is a
   client-only singleton.
8. **Adding a charting library without a decision** — none is installed.
9. **Encoding meaning in colour alone.**
10. **Copying a component between web and admin.** If both genuinely need it,
    that is an ADR-worthy decision to populate `packages/ui`, not a copy-paste.

## TARGET (required going forward)

- Search the app's own `ui/` folder before creating any component; extend props
  rather than fork.
- Every new data surface ships **all four** states — loading, error, empty,
  access-denied — using `loading.tsx`/`error.tsx` plus `EmptyState` /
  `ModuleEmptyState` and `AccessDeniedState` / `ModuleAccessDeniedState`. New
  admin routes should add the boundaries that do not exist today.
- Colour, radius, font and density come from CSS variables only. A new visual
  token goes in `:root` + `@theme inline`, and if tenant-configurable also in
  `buildBrandingCssVariables` (`branding.ts:505`) and `BRANDING_COLOR_KEYS` (`:3`).
- Any new tenant-configurable colour pair must pass
  `getBrandingValidationIssues` (`branding.ts:594`).
- New form controls are added as a branch at
  `runtime-metadata-form-renderer.tsx:1138-1265` **and** a field component in
  `form-control.tsx` — never a bespoke input in a page.
- Accessibility is unenforced, so check by hand: labelled controls,
  focus-trapped and Escape-able dialogs, keyboard-navigable tables, visible
  focus rings, no colour-only meaning.
- Screens must work at tablet and mobile widths. Prefer Tailwind breakpoints;
  use `ResizeObserver` only when content-driven measurement is required,
  following `responsive-runtime-tabs.tsx`.

## What the specialist agent MUST verify before changing this

- Which app you are in — same-named, different-shaped components
  (`SectionCard`, `EmptyState`, `FormControl`, `ReadOnlyField`) and disjoint
  token namespaces (`--dp-*`/`--brand-*` vs `--admin-*`).
- Whether the token you are adding already exists — read `globals.css:3-51` and
  `:53-88` first.
- Whether a `DataTable` usage is `mode="client"` or `"server"` before touching
  sorting/filtering; the paths do not share behaviour and the default is
  `client` (`data-table.tsx:42`).
- Whether the component renders under `.dp-theme-scope` — outside it the
  `--dp-*` remapping at `globals.css:218-228` does not apply.
- Whether the surface is server-rendered before using formatting helpers; if so,
  thread an explicit `ResolvedFormattingContext`.
- Run the app's `check-types` and `lint`, but note `eslint-plugin-only-warn`
  means lint warnings never fail — read the output, do not trust the exit code.
- Check both light and dark (`html[data-theme="dark"]`) before declaring done.
