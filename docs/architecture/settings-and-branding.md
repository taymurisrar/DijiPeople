# Settings and Branding Architecture

## Tenant Settings Architecture

Tenant Settings is the tenant-scoped configuration plane for security,
regional behavior, people operations, communication, customization, visual
identity, and compliance. Settings are not a collection of unrelated admin
pages. Every setting has a clear owner, permission boundary, audit contract,
shared UI pattern, and runtime consumer.

### Principles

- Settings are role-aware, auditable, tenant-scoped, reusable, and consumed by
  runtime modules.
- Settings pages use shared `Card`, `DataTable`, `FormControl`, `Button`,
  `Badge`, `Tabs`, `Dialog`, Action Bar, and `EmptyState` components.
- Text, numeric, date, time, optionset, boolean, and relationship values use the
  corresponding shared form control. Relationship fields use searchable,
  paginated `LookupField` controls rather than raw selects.
- Settings do not duplicate system modules or create module-specific runtime
  branches. Generic runtime metadata, commands, lookups, import/export, and
  settings layouts are extended when capability is missing.
- Security identity, Employee HR identity, work configuration, attendance
  policy, regional data, and branding remain separate concepts.
- Multi-record configuration changes are transactional. Mutations return field
  validation and success/error feedback and invalidate the relevant runtime
  cache.

### Information Architecture

- **General Setup**: tenant identity, organizations, business units, and
  company defaults.
- **Regional Operations**: locale, timezone, currencies, countries, regions,
  and tenant business-date behavior.
- **Security & Access**: Users, Roles, Permissions, Password & Login Policies,
  and Audit/Login History.
- **People Configuration**: Employees, Departments, Work Sites, Work
  Calendars, Holidays, Shifts, Work Schedules, Attendance Rules, Timesheet
  Rules, Leave Rules, and Document Rules.
- **Notifications & Communication**: Email Providers, Email Templates,
  Notification Rules, and Delivery Logs.
- **Customization**: Packages, Modules, Forms, Views, Fields, Widgets, and
  Rules.
- **Appearance & Experience**: Branding, Theme, Fonts, Density, and
  Title/Favicon.
- **Audit & Compliance**: audit events, data access history, retention, and
  compliance exports.

### User And Employee

`User` is the security and login identity. It owns login email, linked
Employee, roles, effective permissions, security status, activation,
deactivation, locking, password-reset delivery, privileged manual password
changes, security timeline, and login audit.

`Employee` is the HR and work identity. It owns HR details, Department,
reporting manager, primary Work Site, default Work Schedule, effective
schedule overrides, and attendance, leave, payroll, and timesheet behavior.

One User links to at most one Employee and one Employee links to at most one
User. An Employee may exist without a User. Employee Self Service uses
`/my-profile`. HR and administrators manage login identities through
Settings > Security & Access > Users. `/users` is not exposed as an ESS
navigation module.

### Users Settings Module

The canonical route is `/settings/security-access/users`; the legacy
`/settings/access/users` route redirects to it. The module uses generic runtime
list, detail, create, and edit surfaces.

Create User creates the security identity and links an existing Employee by a
searchable Employee lookup. It does not create a duplicate Employee. Roles are
assigned through a searchable multi-lookup and the detail page displays an
effective permission summary.

Supported statuses are Invited, Active, Inactive, Locked, and Password Reset
Required. The Action Bar exposes New, Edit, Activate, Deactivate, Lock, Unlock,
Send Password Reset Link, Set Password, Refresh, Import, Export, and Export
Template according to status and permission. Set Password is limited to Global
Administrator and System Administrator. Password-reset email uses the active
tenant email provider; when none exists the command returns exactly
`Email provider not configured.` No license-management behavior is included.
All lifecycle and security actions write audit/timeline events.

### Work Sites

`Location` is the canonical Work Site entity. It stores Name, Code, Address,
City, Country, Timezone, optional Latitude and Longitude, optional Allowed
Radius Meters, Default Work Schedule lookup, Work Calendar override lookup,
and Active status.

Work Sites are consumed by Attendance Office mode, Employee Primary Work Site,
schedule fallback, holiday resolution, and future geofence enforcement.
Schedule and calendar relationships are `LookupField` controls backed by
tenant-scoped active records.

### Work Calendars And Holidays

A Work Calendar stores Name, Code, Country/Region, Weekend Days, Default
Calendar flag, and Active status. A Work Schedule may reference a Work
Calendar; Work Sites may override it.

A Holiday stores Name, Date, Type, Applies To, Work Calendar lookup, optional
Department or Work Site scope lookup, Paid flag, and Active status. Holiday
types are Public Holiday, Company Holiday, Optional Holiday, and Special
Non-working Day. Scope values are Tenant, Department, Work Site, and a future
Employee scope.

Work Calendars and Holidays support manual CRUD and the generic Data Transfer
Action Bar group: Import, Export, and Export Template. Attendance blocks ESS
check-in on holidays and off-days unless Attendance Rules allow it. HR/Admin
may override only when policy permits. Leave duration excludes configured
weekends and holidays. Timesheets mark or exclude non-working days according to
Timesheet Rules.

### Shifts

A Shift is a daily time block, not an employee assignment and not a Work
Schedule. It stores Name, Code, Start Time, End Time, Break Minutes, Expected
Hours, Late Grace Minutes, Early Exit Grace Minutes, Timezone, Is Night Shift,
and Active status. Work Schedule day patterns reference active Shifts.

### Work Schedules

A Work Schedule is an effective weekly working pattern built from Shifts. It
stores Name, Code, Work Calendar lookup, Day-to-Shift or Off Day pattern,
Default Schedule flag, Effective From, Effective To, and Active status.

A Work Schedule may be the default at tenant, Department, Work Site, or
Employee level. Work Schedule days own the weekday mapping; a Shift never
directly assigns an Employee.

### Employee Work Configuration

Employee work configuration exposes Primary Work Site and Default Work
Schedule as searchable lookups. The Employee detail form includes a Schedule
Overrides related tab.

A Schedule Override stores Employee lookup, Work Schedule lookup, Effective
From, optional Effective To, Reason, and Active status. Overrides are full-day
or date-range only. Partial-day overrides are out of scope. ESS cannot mutate
work configuration; HR/Admin can mutate it when their Employee and Settings
permissions allow it.

Department exposes Default Work Schedule lookup. Work Site exposes Default
Work Schedule and Work Calendar override lookups.

### Schedule Resolution

For a tenant business date, schedule resolution uses this exact priority:

1. Employee schedule override effective for the date.
2. Employee default Work Schedule.
3. Department default Work Schedule.
4. Employee Primary Work Site default Work Schedule.
5. Tenant default Work Schedule.

Every candidate must belong to the tenant, be active, and be inside its
effective date range. The resolved weekday must map to an active Shift or an
explicit Off Day. If no schedule resolves, Attendance Check In returns:

`No active work schedule is configured for this employee, department, work site, or tenant default.`

If a schedule resolves but its working day lacks an active Shift, the error
names the schedule and weekday. Generic `no active configuration` messages are
not permitted.

### Attendance Rules

Attendance Rules define allowed work modes (Office, Remote, Hybrid), Office
Work Site requirement, Remote/Hybrid browser-geolocation requirement,
duplicate check-in prevention, approved-leave behavior, off-day and holiday
check-in behavior, missing-checkout behavior, manual correction policy, and
HR/Admin override policy.

### Attendance Runtime Consumption

Check In resolves current User to linked Employee, tenant business date,
schedule by the documented priority, weekday Shift, Work Calendar,
holiday/off-day state, and Attendance Rules. Office requires an active Work
Site lookup value. Remote and Hybrid require browser geolocation. The created
Attendance record stores the resolved schedule, Shift, mode, Work Site,
business date, and location evidence.

Check Out resolves the same business-date record, requires checkout
geolocation for Remote/Hybrid when configured, updates that record, calculates
working duration and late/early behavior from the resolved Shift, and writes an
audit/timeline event.

### Settings UI Standard

Settings uses an enterprise hierarchy with category landing pages, shared
shells, breadcrumbs, concise descriptions, responsive cards, dense DataTables,
list/detail/create/edit flows, validation summaries, save/reset state,
permission-aware actions, and audit/timeline where applicable. Large record
sets belong in CRUD tables, not flat forms. Raw HTML controls are not used when
a shared form-control field exists.

### Testing And Release Standard

Automated coverage verifies the documentation contract, permissions, CRUD,
lookup relationships, status transitions, import/export, schedule precedence,
calendar/holiday consumption, Attendance policy, precise errors, tenant
timezone formatting, and idempotent seeds. Seed data includes role-based Users,
linked Employees, Work Sites, Work Calendars, Holidays, Shifts, defaults,
overrides, and operational records.

Browser UAT uses seeded administrator, HR, manager, and ESS identities. It
captures Settings and runtime-consumption evidence under
`uat-runtime-tests/proof`. A release cannot be marked GO until Settings are
both operable and demonstrably consumed by runtime behavior after full reload.

## Settings Route Audit

All routes below are authenticated unless marked public. Tenant settings use
`/tenant-settings`; domain configuration routes use their module API; branding
and system preferences are consumed globally through providers.

| Route | Purpose | Current data source | Visibility | Consumption | Required fix/status |
| --- | --- | --- | --- | --- | --- |
| `/login`, `/t/:tenantSlug/login` | Tenant login | public tenant resolution + public branding | Public | Global | Branding, font, title, favicon resolved before login paint |
| `/settings` | Settings landing | navigation/permission catalog | Private | Local | Keep as navigation only |
| `/settings/tenant` | Tenant identity and regional defaults | tenant + tenant settings APIs | Private | Global/local | Shared values must flow through providers |
| `/settings/company`, `/settings/organization` | Company profile | tenant settings | Private | Global/local | Avoid duplicate ownership with tenant route |
| `/settings/organizations`, `/settings/business-units` | Organization hierarchy | organization APIs | Private | Local | Domain configuration, not public settings |
| `/settings/branding` | Identity, assets, theme, typography, density | tenant settings branding category | Public-safe subset + private editor | Global | Live provider draft; save/cancel/reset update provider/cache |
| `/settings/system` | Tenant-wide display/system preferences | tenant settings system category | Private | Global | Consume through `SystemPreferencesProvider` |
| `/settings/localization` | Resolved locale summary | resolved tenant settings | Private | Global | Use shared shell and formatter context |
| `/settings/currency` | Currency master data | currency API | Private | Local | Keep separate from default currency preference |
| `/settings/security`, `/settings/system-audit`, `/settings/audit` | Security and audit configuration | security/audit APIs | Private | Local | Never expose through public settings |
| `/settings/features`, `/settings/apps` | Feature availability | tenant feature APIs | Private | Global/local | Authenticated shell may consume availability |
| `/settings/access` | Access landing | permission-aware navigation | Private | Local | No direct settings fetch |
| `/settings/access/permissions` | Permission catalog | permissions API | Private | Local | Sensitive; private only |
| `/settings/access/roles`, `/settings/access/roles/:roleId` | Role catalog/editor | roles API | Private | Local | Sensitive; private only |
| `/settings/access/teams` | Access teams | teams API | Private | Local | Sensitive; private only |
| `/settings/access/users/*` | User access lifecycle | users/roles/teams APIs | Private | Local | Sensitive; private only |
| `/settings/employees` | Employee defaults and validation | tenant settings | Private | Module/global | Resolve through tenant settings service |
| `/settings/departments/*`, `/settings/designations/*`, `/settings/locations/*` | People master data | domain APIs | Private | Local | Domain records, not tenant branding |
| `/settings/employee-levels` | Employee levels | enterprise configuration API | Private | Local | Private operational configuration |
| `/settings/leave-types/*`, `/settings/leave-policies/*` | Leave configuration | leave APIs | Private | Local | Private operational configuration |
| `/settings/holiday-calendars`, `/settings/work-calendars` | Calendar configuration | calendar APIs | Private | Module/global | IDs may be resolved privately by preferences |
| `/settings/attendance` | Attendance and timesheet defaults | tenant settings | Private | Module/global | Use resolved settings, not page constants |
| `/settings/approval-matrices` | Approval routing | approval API | Private | Module | Sensitive policy configuration |
| `/settings/notifications/*` | Channels, providers, templates, logs | notification APIs + tenant settings | Private | Module/global | Public branding only in rendered communications |
| `/settings/documents` | Document rules | tenant settings | Private | Module | Private operational configuration |
| `/settings/recruitment` | Recruitment/onboarding defaults | tenant settings | Private | Module | Private operational configuration |
| `/settings/projects` | Project settings placeholder | local page | Private | Local | Replace placeholder only when API contract exists |
| `/settings/payroll`, `/settings/payroll/*` | Payroll defaults and accounting setup | tenant settings + payroll APIs | Private | Module | Sensitive; never public |
| `/settings/pay-components`, `/settings/policies`, `/settings/overtime-policies` | Pay/policy configuration | enterprise configuration APIs | Private | Module | Sensitive; never public |
| `/settings/tax-rules`, `/settings/time-payroll-policies`, `/settings/travel-allowance-policies` | Payroll compliance policies | policy APIs | Private | Module | Sensitive; never public |
| `/settings/claim-types` | Claim configuration | claims API | Private | Module | Private operational configuration |
| `/settings/customization` | Customization landing | customization APIs | Private | Local/runtime publish | Draft metadata is never public runtime settings |
| `/settings/customization/packages/*` | Package lifecycle | customization APIs | Private | Runtime publish | Published metadata only affects runtime |
| `/settings/customization/tables/*` | Module/field/form/view design | customization APIs | Private | Runtime publish | No branding state duplication |
| `/settings/customization/columns`, `/forms`, `/views` | Module selection shortcuts | customization APIs | Private | Local | Route to module-scoped designers |
| `/settings/customization/publish` | Publish center | customization APIs | Private | Runtime publish | Invalidates metadata caches, not settings provider |
| `/settings/billing/*` | Subscription lifecycle | billing API | Private | Local | Financial data remains private |
| `/settings/desktop-agent` | Desktop agent defaults | agent settings API | Private | Module | Private operational configuration |

## Taxonomy

### Public Tenant Settings

The pre-auth endpoint may return only app title, company/short names, logos,
favicon, login copy, public contact/legal URLs, theme colors, semantic colors,
font family, density, and radius. The API response is an explicit whitelist.

### Private Tenant Settings

Security, access, payroll, approvals, audit/compliance, operational module
configuration, customization lifecycle, billing, and user preferences require
authentication. They must never be added to the public branding response.

## Load Order and Providers

1. Resolve tenant hint from host, configured default slug, or login query.
2. Fetch public settings in the root/login server render.
3. Write CSS variables and favicon before visible UI.
4. Render `TenantSettingsProvider` once at the root.
5. After authentication, resolve private settings and synchronize branding into
   the same root provider.
6. `SystemPreferencesProvider` supplies locale, timezone, date/time, number,
   currency, week-start, work-calendar, and schedule values.

Consumers use `useTenantSettings()`, `useBrandingTokens()`, or
`useSystemPreferences()`. Pages must not fetch branding directly.

## CSS Token Contract

Required global tokens:

`--brand-primary`, `--brand-secondary`, `--brand-accent`,
`--brand-background`, `--brand-surface`, `--brand-text`,
`--brand-muted-text`, `--brand-border`, `--brand-sidebar-background`,
`--brand-sidebar-text`, `--brand-sidebar-active-background`,
`--brand-sidebar-active-text`, `--color-success`, `--color-warning`,
`--color-danger`, `--color-info`, `--font-family`, `--font-scale`,
`--radius-sm`, `--radius-md`, `--radius-lg`, and `--density`.

Legacy `--dp-*` aliases remain during migration. Shared components should use
semantic Tailwind tokens or the required variables, never tenant hex values.

## Title and Favicon

Browser titles use `<Current Page> | <Tenant App Title>`. Missing tenant titles
fall back to `DijiPeople`. Route changes update the current-page segment.
Login uses `Login | <Tenant App Title>`. Tenant favicon falls back to
`/favicon.ico`.

## Branding Editor

The editor owns brand identity, public support/legal copy, grouped colors,
typography, density/radius, and a live preview for login, sidebar, dashboard,
list/table, form field, and actions. Draft changes update the provider without
persistence. Save persists and updates provider state, cancel restores the last
persisted state, and reset requires confirmation before saving defaults.

## Formatting Rules

Generic formatters in `apps/web/lib/formatting-context.ts` are the only normal
date/time/number/currency formatting entry point. The provider installs the
resolved tenant context, so existing generic calls inherit preferences. New
pages must not call `toLocaleDateString`, `toLocaleString`, or construct
hardcoded `Intl` formatters for tenant-facing values.

## Future Rules

- Add a public setting only by extending the explicit API response type and
  mapping.
- Keep one root tenant settings/branding state.
- Apply visual settings server-side or through an early root style.
- Invalidate public tenant caches after public branding changes.
- Private setting saves refresh the relevant provider/cache.
- Customization drafts do not alter published runtime or branding.
