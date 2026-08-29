# Settings and Configuration

> Derived from repository evidence at `eb457d9d` on 2026-08-29, and independently
> re-derived at the same commit by a second pass that corrected two of its
> figures. Every count below was measured, not carried over. Line numbers and
> counts drift — re-derive on your branch rather than trusting them; see the
> `doc-code-drift` pattern.

## Why this note exists

Six configuration stores exist, and three unrelated registries have names that
collide with them. Getting the boundary wrong is the most common and most
expensive mistake in this area — it produces a setting that saves successfully
and changes nothing, which no error will ever tell you about.

`docs/architecture/settings-and-branding.md` remains the **canonical contract**.
This note records what the mechanism actually does, including where it diverges
from the contract.

## The six stores, and the four things that are not stores

| Store | Model | Scope | What it is for |
|---|---|---|---|
| **Tenant settings (KV)** | `TenantSetting` | tenant | The 591-key catalog. Scalars only. Written **only** by `TenantSettingsService`. |
| **Organization overrides** | `OrganizationSetting` | tenant + organization | Per-organization override. **Only the `branding` category is permitted** (`tenant-settings.service.ts:347-349`). |
| **Generic config records** | `TenantConfigurationRecord` | tenant | Effective-dated *named records* for 15 allowlisted `settingKey`s. Not the KV store. |
| **Platform settings** | `PlatformSetting` | **platform, no `tenantId`** | DijiPeople's own operator configuration. ~17 keys, all string literals, **no constant file — grep, do not guess.** |
| **User preferences** | `User.preferencesJson` | user | Exactly four keys: `timezone`, `locale`, `dateFormat`, `timeFormat`. |
| **Branding mirror** | `TenantBranding` | tenant | A denormalised copy of 23 branding keys, written as a side effect. **Not a source of truth** — see the two-public-endpoints trap below. |

Not stores, despite the names: `TenantFeature` (plan entitlement, ANDed with the
subscription — see [[starter-plan-scope]]); `customization` (tenant *schema and
UI*, not values); `lookups` (reference data, and **`Country`/`StateProvince`/`City`
are global rows with no `tenantId`** — editing a state edits it for every
tenant); `platform-runtime` (a CRUD engine for 17 platform-admin modules, no
configuration at all).

Two naming collisions worth memorising:

- `services/api/src/modules/settings-runtime/` (the `TenantConfigurationRecord`
  store) and `apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts`
  (the frontend navigation catalogue) share a name and nothing else.
- `TenantSetting.category` and `TenantSetting.key` are **two separate columns**.
  There is no dotted composite key anywhere. Writing a query against
  `key: 'organization.timezone'` returns nothing, forever — that is [[BUG-1977]].

Domain-owned configuration deliberately outside the KV store: `AttendancePolicy`,
`TimesheetPolicy`, `EmailProviderSetting`, `FieldSecurityPolicy`,
`HolidayCalendar` / `WorkSchedule` / `ShiftTemplate` / `PayrollRegion` /
`FiscalYear` (all served by `EnterpriseConfigurationService`),
`BusinessUnit.settingsJson`, `TenantNavigationOverride`.

## The resolution order

`TenantSettingsResolverService.getSettingsMap` — `tenant-settings-resolver.service.ts:1711-1749`:

```
1  structuredClone(DEFAULT_TENANT_SETTINGS)   the catalog
2  overlay every TenantSetting row            tenant
3  overlay every OrganizationSetting row      organization (branding only, in practice)
4  the per-getter coercion fallback           ← not the catalog value
```

**Layer 4 is the one people get wrong.** Every `getXSettings()` reads through
`booleanValue` / `numberValue` / `stringValue` / `enumStringValue` (`:1809-1908`),
each with its own hardcoded second argument. Two consequences:

- Where the catalog default is `''`, the catalog default is **never** the
  effective value — `stringValue('')` falls through. `branding.welcomeTitle`
  (catalog `''`) resolves to `'People operations, without the mess.'`
- Where the catalog default is a non-empty string, the resolver's second
  argument is **dead code**. This is why four different default colour palettes
  exist and only the catalog one wins.
- `numberValue` **clamps** rather than rejects. An out-of-range persisted value
  is silently narrowed at read time, so the stored row and the effective value
  differ with no error anywhere.

Two layers bypass the chain:

- **Business unit** — for `timesheets` and `payroll` only,
  `BusinessUnit.settingsJson[category]` is spread on top before coercion
  (`:882-898`, `:988-1004`).
- **Timesheet policies** — `timesheet-policy-resolver.service.ts:270-386` builds
  its own map from the catalog plus raw rows, **skipping the resolver and its
  cache**, then overlays `TimesheetPolicy.settings` by scope precedence
  `TENANT → ORGANIZATION → BUSINESS_UNIT → DEPARTMENT → TEAM → EMPLOYEE`.

## Caching

Two in-process caches, neither shared between replicas:

| Cache | Where | TTL | Busted by |
|---|---|---|---|
| Resolver | `tenant-settings-resolver.service.ts:484`, instance `Map` | **30 s**, hardcoded | `invalidateTenantCache(tenantId)` — deletes the tenant key *and* every `${tenantId}:` organization key |
| Public tenant | `public-tenant-cache.service.ts:10`, **`static`** `Map` | 300 s (`PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS`) | only when the tenant profile changed or an update was in the `branding` category |

Under more than one API replica, invalidation reaches only the instance that
served the write. Everyone else serves stale values for up to 30 s / 300 s.

`tenant-settings.service.ts:741` and `public-tenants.service.ts:116` delete a
cache key `tenant:branding:${tenantId}` that **nothing ever writes**. Both calls
are no-ops; the `deleteByPrefix('tenant:resolve:')` beside them does the work.

## The write path

`TenantSettingsService.updateTenantSettings` — `tenant-settings.service.ts:269-339`.
Allowlist from the catalog (an unknown key is a 400) → coercion by the *type of
the catalog default* → no-op updates dropped → one upsert per key in a
transaction → branding mirror → cache invalidation → `AuditService.log`.

**`enforceCriticalAttendanceSetting` (`:745-767`) silently overrides seven
attendance values on every write**, with no flag, no role check and no escape:
`requireRemoteLocationCapture`, `locationCaptureRequired`,
`locationRequiredForModes`, `captureLocationOnCheckIn`,
`captureLocationOnCheckOut`, `allowManualLocationException`,
`highAccuracyLocation`. Because the override runs before the change diff, the
update is then dropped as a no-op: the admin gets a successful save, no warning,
and an audit row recording no change. All seven are rendered as live controls.
[[BUG-1979]].

## The catalog

One file: `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts`.
`TENANT_SETTING_CATEGORIES` (13), `DEFAULT_TENANT_SETTINGS` (**591 keys**),
`TENANT_FEATURE_DEFINITIONS` (12 — a different mechanism).

| Category | Keys | Category | Keys |
|---|---:|---|---:|
| `timesheets` | 160 | `documents` | 30 |
| `payroll` | 87 | `notifications` | 26 |
| `branding` | 71 | `security` | 22 |
| `attendance` | 70 | `organization` | 21 |
| `employees` | 43 | `system` | 15 |
| `recruitment` | 35 | `leave` | 6 |
| | | `access` | 5 |

Adding a key needs three edits — the catalog default, a getter in the resolver,
and a field in `settings-page-config.ts`. **Skip any one and the key is dead.**
Rows are sparse; seeding writes exactly one (`notifications.emailEnabled`).

## The traps, in the order they will bite you

**1. 246 of 591 keys (41.6%) have no production reader, and 230 of those are
editable in the UI.** Both figures were derived twice by independent methods and
reproduce exactly; 246 is a defensible *lower bound*, because the scan is
identifier-only and category-blind, and 24 rows share a key name across two
categories and are all counted alive. The remaining 16 have no UI at all.
The admin toggles the control, the value persists, an audit row is written, and
nothing changes. [[BUG-1974]].

Worst by category: `timesheets` 87/160, `payroll` 39/87, `recruitment` 28/35,
`attendance` 19/70. The nastiest single instance is `security` 7/22 — including
`mfaRequired`, `mfaMethod`, `rememberTrustedDevice`, `requireEmailVerification`
and `invitationExpiryHours`. A tenant admin enabling "MFA required" gets no MFA.

**2. `access` (5 keys) and `leave` (6 keys) are entirely dead.** No resolver
getter, no UI section, zero references anywhere in the monorepo — verified by
word-boundary grep over every tracked file. They remain fully API-reachable:
`GET /tenant-settings` returns them with defaults and `PATCH` accepts them.

This is **integrator-facing, not customer-facing**, and the distinction matters
for triage. Neither category has a UI surface. The "Leave & Approvals" group in
the settings navigation is a *navigation group key*, not this category — Starter
leave behaviour runs entirely on `LeavePolicy` / `LeavePolicyRule`, which work.
The person this bites is a partner who reads `GET /tenant-settings`, PATCHes
`leave.defaultCarryForwardEnabled: true`, gets a 200 with the value echoed back,
and ships. Carry-forward is a `LeavePolicyRule` field and nothing has ever read
that key.

**3. Eight key pairs where the resolver reads one name and the UI renders the
other.** These controls are write-only; the key that is actually enforced has no
control at all. There is **no alias or normalisation layer** — verified by grep
for `alias|legacyKey|keyAliases|SETTING_KEY_MAP|normalizeKey|synonym`, and by the
fact that each dead name appears in exactly one file in the whole repository
(`settings-page-config.ts`) plus the catalog. [[BUG-1976]].

| Category | Resolver reads (live) | UI renders (dead) |
|---|---|---|
| `employees` | `maxReportingLevels` (`:567`) | `maximumReportingLevels` (`:159`) |
| `employees` | `allowSkipLevelApprovals` (`:568`) | `allowSkipLevelReporting` (`:171`) |
| `employees` | `allowEmployeeWithoutManager` (`:573`) | `allowEmployeeWithoutReportingManager` (`:183`) |
| `employees` | `preventDuplicateByPersonalEmail` (`:577`) | `preventDuplicatePersonalEmail` (`:208`) |
| `employees` | `preventDuplicateByPhoneNumber` (`:581`) | `preventDuplicatePhone` (`:220`) |
| `employees` | `preventDuplicateByNationalId` (`:585`) | `preventDuplicateNationalId` (`:226`) |
| `employees` | `requireWorkLocation` (`:557`) | `requirePrimaryWorkLocation` (`:134`) |
| `organization` | `weekStartsOn` (`:497`) | `weekStartDay` (`organization-settings-config.ts:119`) |

Two of the eight are weaker than the rest and should not be fixed by renaming:
`allowSkipLevelApprovals` has **no consumer on either side** — skip-level
approval is simply unimplemented; and `organization.weekStartsOn` is itself
shadowed by `system.defaultWeekStartDay`, which is never falsy and *does* have a
working control on a different page.

**A ninth pair is not a defect** and is excluded from the count:
`timesheets.requireMonthlySubmission` / `requireMONTHLYSubmission` is reconciled
at the resolver (`:913-914` reads `a ?? b`, `:933-934` echoes both) and the UI
renders the live half. An earlier draft of this analysis counted nine; eight is
the defensible figure.

**4. `AttendancePolicy` silently outranks the `attendance` category.**
`attendance.service.ts:3540-3592` reads `policy?.X ?? settings.X`, and **every
column consulted is non-nullable with a Prisma default** except
`maxAllowedAccuracyMeters`. So the `??` falls through only when the whole row is
absent. The row is **never seeded**; it is created by the first person who opens
and saves the attendance-policy screen — and a partial PATCH writes column
defaults over whatever the tenant had configured. From that moment eight
settings keys stop having any effect. [[BUG-1980]].

Two further constants in `resolvePolicy` (`requireRemoteLocationForRemoteMode`,
`allowRemoteWithoutLocation`) are hardcoded to the **opposite** of their column
defaults and have no `TenantSetting` counterpart, so they make two *policy
columns* dead rather than two settings keys. [[BUG-1981]]. Note this is a
different set from the seven forced on write above — the two lists both have
seven entries and overlap in only five, which is how they get conflated.

**5. Eleven places read `TenantSetting` directly, bypassing the resolver** — and
therefore the 30 s cache, the organization layer and the catalog defaults, each
re-implementing its own coercion. The practical rule: **`security` settings are
the ones most likely to be read outside the resolver.** Changing a security
default in the catalog does not change auth behaviour unless you also change
`auth.service.ts:2070-2114` and `jwt-auth.guard.ts:361`.

**6. Two "public branding" endpoints read two different stores.**
`/tenant-settings/public-branding` and `/tenant-branding/resolved` both go
through the resolver; `/public/tenants/resolve` — which is what the **login
page** uses — reads the `TenantBranding` mirror instead. The mirror is 23 fields
wide, is written only when a branding key changes through the settings service,
and expires on a different clock. Organization branding overrides never reach
any public path at all: `getPublicBrandingByTenantSlug` calls `getSettingsMap`
with no `organizationId`, so the login screen and the app can legitimately show
different branding to the same user.

**7. The "no direct `Intl`" rule is stated three times and enforced zero times.**
`apps/web/AGENTS.md`, `docs/architecture/frontend.md` and
`docs/architecture/settings-and-branding.md` all forbid `toLocaleDateString` and
hand-built `Intl` formatters for tenant-facing values. `apps/web/eslint.config.mjs`
has no rule for it and no spec asserts it: **51 violations across 30 files**,
including the generic dashboard widget renderer and the runtime module renderer
— i.e. every dashboard metric and date cell. Money is formatted as
`` `${code} ${value.toLocaleString()}` `` in three payroll surfaces.

Adjacent: web and admin use **two incompatible date-pattern vocabularies**
(`MM/dd/yyyy` vs `DD/MM/YYYY`) and two time-format sentinels (`12h`/`24h` vs
`12-hour`/`24-hour`). `formatting-context.ts` honours exactly four date
patterns; anything else silently falls through to `Intl` `dateStyle: 'medium'`
— and the provider's own hard default, `'MMM d, yyyy'`, is not one of the four.

## Where to go for X

| Question | Answer |
|---|---|
| Read a tenant setting in a service | Inject `TenantSettingsResolverService`, call `getXSettings(tenantId, organizationId?)`. Never query `prisma.tenantSetting`. |
| Add a tenant setting | Catalog default **and** resolver getter **and** `settings-page-config.ts` field. Any one missing means dead. |
| Add a settings page | An item in `settings-runtime.ts` plus an adapter in `settings-adapter-registry.ts` — or add the key to `DEDICATED_PAGE_KEYS` and build the page. Omitting both **throws at module load**. |
| Format a date/number/money in web | `apps/web/lib/formatting-context.ts` — `formatDate`, `formatMoney` (there is no `formatCurrency`). |
| Change platform-operator config | `PlatformSetting` via `SuperAdminService`; UI under `apps/admin/app/(internal)/settings/`. |
| **Why is my setting not taking effect?** | In order: dead category (trap 2) · no reader (trap 1) · wrong half of a pair (trap 3) · `AttendancePolicy` wins (trap 4) · a direct reader bypassed the resolver (trap 5) · `enforceCriticalAttendanceSetting` · the 30 s cache under multiple replicas. |

Files to re-read when this note ages: `tenant-settings.catalog.ts`,
`tenant-settings-resolver.service.ts`, `tenant-settings.service.ts`,
`settings-runtime.catalog.ts`, `settings-runtime.ts`,
`settings-adapter-registry.ts`, `formatting-context.ts`, `branding.ts`.

Two specs enforce parts of this contract and must be updated with it:
`settings-doc-routes.spec.ts` (parses `docs/architecture/settings-and-branding.md`
and asserts every route it names exists) and `settings-runtime.spec.ts`.

## Related

[[settings]] · [[runtime-module-system]] · [[rbac]] · [[multi-tenancy]] ·
[[tenant-application]] · [[web-architecture]] · [[starter-plan-scope]] ·
[[leave-attendance-approvals]]
