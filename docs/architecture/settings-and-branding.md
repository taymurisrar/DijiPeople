# Settings and Branding Architecture

> **Last verified:** 2026-08-22 · **Verified against commit:** c1d3d7b
>
> `docs/README.md` designates this document canonical — it "overrides other
> documents where they differ" — and until now it carried no provenance of its
> own. Four of its substantive claims had become false, including a ~20-row
> route table describing URLs that return 404, and because it is authoritative a
> reader who noticed was instructed to trust the wrong side (BUG-0045).
>
> `apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts` now
> checks this file against the code: every route named in backticks outside a
> blockquote must resolve, the category count must match the runtime, every
> category must be described, and every shared component named must exist. Move
> these two lines when you change a claim here.

## Tenant Settings Architecture

Tenant Settings is the tenant-scoped configuration plane for security,
regional behavior, people operations, communication, customization, visual
identity, and compliance. Settings are not a collection of unrelated admin
pages. Every setting has a clear owner, permission boundary, audit contract,
shared UI pattern, and runtime consumer.

### Principles

- Settings are role-aware, auditable, tenant-scoped, reusable, and consumed by
  runtime modules.
- Settings pages use the shared kit, which is exactly
  `app/components/ui/button.tsx`, `app/components/ui/dialog.tsx`,
  `app/components/ui/empty-state.tsx`, `app/components/ui/form-control.tsx`,
  `app/components/ui/section-card.tsx` and `app/components/ui/status-pill.tsx`,
  plus `app/components/data-table/` and the runtime Action Bar.
  `form-control.tsx` exports named fields — `TextField`, `SelectField`,
  `DateField`, `LookupField` and the rest — not a single `FormControl`.

  > This list previously named `Card`, `Badge`, `Tabs`, `Dialog` and
  > `FormControl`. None of the five existed, so the canonical contract sent
  > every specialist looking for components that were never built (BUG-0045).
  > `dialog.tsx` exists now because BUG-0043 built it.
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

### Settings Runtime And Nested Routes

Settings navigation is owned by the shared Settings Runtime registry. The
registry enriches every permission-aware setting with category and group
ownership, canonical and compatibility routes, adapter identity, list and
form metadata keys, Action Bar capabilities, Data Transfer support, and
timeline availability. Pages must resolve registry metadata; they must not
define a private navigation catalog.

The workspace hierarchy is Settings -> Category -> Setting Group -> Setting
Item -> Record. Category and group pages are metadata renderers. Canonical item
routes render `StandardModuleListPage` and `StandardModuleRecordPage` directly
through a registered adapter. Concise routes redirect to the canonical group
route and never serve as the CRUD implementation.

There are eleven canonical categories: `general-setup`, `regional`,
`security-access`, `people`, `integrations`, `payroll`, `approvals`,
`notifications`, `customization`, `appearance` and `audit-compliance`. The
Settings sidebar renders this exact category -> group -> item hierarchy and
applies the item's permission and role requirements before rendering a node.

> This said ten and omitted `integrations`, which was added with its own
> explanatory comment in `settings-runtime.ts` and carries the whole
> `/settings/integrations/attendance/**` tree — thirteen pages, undocumented
> (BUG-0045). `settings-doc-routes.spec.ts` now asserts the count against the
> runtime, so the two cannot disagree again.

The adapter registry owns server/browser APIs, View and Form metadata, Fields,
Lookup sources, Choice Lists, permissions, Action Bar commands, validation
mapping, formatters, Data Transfer flags, timeline availability, and
soft-delete behavior. CRUD settings expose list, detail, new, and edit modes.
Read-only adapters suppress mutation and record navigation. Record-style
tenant settings use the generic record renderer and translate saved fields to
tenant-setting updates.

Concepts without a domain aggregate use the tenant-scoped, effective-dated,
audited `TenantConfigurationRecord` store. Its allowlist covers Regions,
Fiscal Years, Business Date Rules, Field Security, Password/Login Policies,
Salary Package Rules, Delegation Rules, Escalation Rules, Workflow Templates,
and Retention Rules. Domain-owned Organizations, Benefits, Loans, Banks,
Payroll, Tax, Approvals, and Notifications continue using their dedicated
models and APIs.

Specialized surfaces remain only for non-CRUD interactions: Branding asset
upload/live preview, Billing checkout/portal, Desktop Agent policy controls,
Package Explorer, Module metadata design, and Publish Center. Each specialized
adapter records its blocker and implementation route.

Compound configuration editors also remain specialized until the generic
Related List mutation contract covers their atomic child records and business
commands: Users (roles/teams/lifecycle), Roles (privilege matrix), Teams
(members/roles), Leave Policies (rules/assignments), Approval Matrices
(ordered steps/conditions), Claim Types (subtypes), Tax Rules (brackets and
pay-component relationships), Travel Allowance Policies (destination rules),
Notification Templates (preview/test/activation), Email Providers
(secret validation/default), and Policy Engine (assignments/resolver
diagnostics). These are registered adapters with explicit blocker text, not
silent route fallbacks.

Master-data pages fully hosted by Settings Runtime include Organizations,
Business Units, Departments, Designations, Employee Levels, Work Sites, Work
Calendars, Shifts, Pay Components, Time Payroll Policies, Overtime
Policies, Payroll Regions, Exchange Rates, GL Accounts, Posting Rules, Payroll
Periods, Benefit Policies, Loan Policies, Banks, Permissions, Countries,
Currencies, Timezones, Notification Delivery Logs, generic configuration
records, and record-style tenant settings.

Recent payroll foundation operational records remain outside Settings and use
Module Runtime routes: `/payroll/runs`, `/payroll/payslips`, `/loans`,
`/benefits/assignments`, and `/employee-bank-accounts`. Payroll Run and Payslip
detail pages retain their command-oriented surfaces for calculation,
readiness, lock, publication, voiding, and download; their lists are generic
Views/DataTables. Bank account APIs return masked account and IBAN values for
list/detail and continue enforcing employee scope and field permissions.

The Release 1 Payroll Operations Dashboard, Exception Center, run Preview and
lifecycle, Payslip Delivery Center, and bank-export generation likewise remain
under `/payroll`. Settings owns their policies, matrices, calendars, tax,
currency, banks, and notification configuration; it does not host or duplicate
operational records or readiness validation logic.

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

Employee account lifecycle actions are owned by the Employee Module, not by a
global Action Bar. On Employee detail, Global Admin, System Admin, and HR may
send a reset password link or send an account invitation. Other roles still see
the actions disabled. Reset password requires a linked User whose
authentication email matches the Employee work email, then sends the configured
`AUTH_PASSWORD_RESET` template with `resetUrl`. Send Invitation requires an
Employee work email and a new or never-logged-in User account; it creates or
reuses the linked User and sends the configured `AUTH_ACCOUNT_ACTIVATION`
template with `activationUrl`. Both flows use the configured notification email
provider. The console provider writes the rendered template and bootstrap link
artifacts to server logs.

### Users Settings Module

The canonical route is `/settings/security-access/users`, rendered by the
settings runtime like every other catalogue item.

`/settings/access/users` is **not** a redirect and never was. It is a second,
fully implemented surface — the "Users & Access" operational view, which loads
roles, users, business units and teams together and presents them as one
expandable table. Two live user-management screens exist, and the canonical
document claimed one of them was a redirect to the other (BUG-0045).

The decision, recorded here rather than left implicit: **the runtime route is
canonical for the settings catalogue**, because metadata-driven UI is the
default and the catalogue must have exactly one entry per item.
`/settings/access/users` stays as a deep-dive reached from it, on the same
grounds the module already claims for itself — user lifecycle, role and team
assignment and effective-access diagnostics are compound operations the generic
list cannot express. It is a specialised view of the same data, not a rival
catalogue entry, and it does not appear in the sidebar.

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

Work Calendars support generic CRUD. Holidays remain child records of a selected
calendar and are managed through the parent-selected Holidays editor. Generic
Data Transfer actions stay hidden until import/export handlers and routes exist.
Attendance blocks ESS
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

> Re-derived against the code on 2026-08-29. A future attendance change
> re-derives this section rather than trusting it.

Attendance Rules define allowed work modes (Office, Remote, Hybrid), Office
Work Site requirement, duplicate check-in prevention, approved-leave
behavior, off-day and holiday check-in behavior, missing-checkout behavior,
manual correction policy, and HR/Admin override policy.

**Device location capture is not one of them.** It is a platform mandate, not
tenant configuration: every self-service check-in and check-out requires a
device position, in **all** of OFFICE, REMOTE and HYBRID. See
[Attendance location capture is mandatory](#attendance-location-capture-is-mandatory)
below.

### Attendance Runtime Consumption

Check In resolves current User to linked Employee, tenant business date,
schedule by the documented priority, weekday Shift, Work Calendar,
holiday/off-day state, and Attendance Rules. Office additionally requires an
active Work Site lookup value. **Every mode requires a device position** - see
below. The created Attendance record stores the resolved schedule, Shift,
mode, Work Site, business date, and location evidence.

Check Out resolves the same business-date record, requires a device position
on the same unconditional terms, updates that record, calculates working
duration and late/early behavior from the resolved Shift, and writes an
audit/timeline event.

### Attendance location capture is mandatory

Device location is a **mandatory integrity control for all self-service**
**attendance modes**. It is not tenant-configurable, and nothing turns it off.

- **The enforcement point** is `validateAttendanceLocationPayload`
  (`services/api/src/modules/attendance/attendance.service.ts`), called on both
  the check-in and the check-out path. It throws `LOCATION_CAPTURE_REQUIRED`
  when latitude or longitude is absent, with **no mode check, no policy check
  and no settings check**.
- **The origin** is commit `a8c04f16` (2026-07-29) and its migration
  `20260728234000_attendance_mandatory_location_capture`, whose first line
  states the intent verbatim: `-- Attendance location is a mandatory integrity
  control for all self-service modes.` The mandate is recorded as
  [ADR-0003](../decisions/ADR-0003-attendance-location-capture-is-mandatory.md).
- **The August 2026 attendance engine depends on it.** Server-side work-mode
  derivation, geofencing and the office-device rule are all built on a position
  always being present.

**Nine settings and policy fields are reported but do not enforce anything.**
`locationCaptureRequired`, `locationRequiredForModes`,
`captureLocationOnCheckIn`, `captureLocationOnCheckOut`,
`requireRemoteLocationCapture`, `highAccuracyLocation`,
`allowManualLocationException`, `requireRemoteLocationForRemoteMode` and
`allowRemoteWithoutLocation` appear in the resolved policy and the audit
snapshot only. Do not read them as controls: they are read in **zero**
enforcement branches. (`highAccuracyLocation` reaches the browser
`enableHighAccuracy` flag; `allowManualLocationException` and `allowIpFallback`
appear only in the accuracy-limit and IP-source conditions, never in the
unconditional throw.)

Seven of those keys are locked on write in `tenant-settings.service.ts` and are
rendered as disabled controls under Settings > Attendance. A submitted value
that differs from the mandate is refused with
`ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM` rather than silently substituted.

Relaxing the mandate is not a configuration change. It would require the
unconditional throws to become policy-driven and the attendance engine to
define a behaviour when no position is supplied - an ExecPlan, not an edit
here.

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

> **Rewritten 2026-08-22.** This was an enumeration of roughly fifty flat
> `/settings/<name>` URLs, and about twenty of them no longer resolved — they
> are the *pre-runtime* route map. `[category]/page.tsx` calls
> `getSettingsRuntimeCategory(key)` and `notFound()`s on a miss, so a
> single-segment `/settings/<x>` outside the eleven categories is a 404. One of
> those dead URLs, `/settings/tenant`, had been quoted out of this document and
> into `require-settings-permission.ts` as a live `fallbackHref`, so a
> permission failure redirected the user to a 404 (BUG-0045).
>
> An enumeration is the documentation form that ages worst, so this is now
> shapes plus the exceptions, and `settings-doc-routes.spec.ts` asserts that
> every route named in backticks anywhere in this file actually resolves.

### The runtime shapes

Eighty-seven catalogue items are served by these five routes. None of them is
listed individually, because the registry is the list.

| Route | Purpose |
| --- | --- |
| `/settings` | Settings landing. Navigation only; renders an access-denied state rather than redirecting, which makes it the safe `fallbackHref`. |
| `/settings/:category` | Category landing, rendered from the registry. 404s for anything that is not one of the eleven categories. |
| `/settings/:category/:settingGroup` | Group landing, or a concise item alias that redirects to the canonical group route. |
| `/settings/:category/:settingGroup/:item` | Generic setting list, through a registered adapter. |
| `/settings/:category/:settingGroup/:item/new`, `/:id`, `/:id/edit` | Generic create, detail and edit. |

An item's `legacyRoute` — the flat `/settings/<key>` form — is recorded on the
registry entry for redirect and history purposes. **It is not a live route.**

### Purpose-built pages inside the runtime tree

Nine catalogue items have a real page instead of a generic renderer, because an
adapter cannot express them. `DEDICATED_PAGE_KEYS` names them and
`settings-runtime.spec.ts` asserts each one has a file on disk.

| Route | Purpose |
| --- | --- |
| `/settings/integrations/attendance` | Attendance integrations overview |
| `/settings/integrations/attendance/integrations` | Integration connections |
| `/settings/integrations/attendance/devices` | Terminals and devices |
| `/settings/integrations/attendance/mapping` | Device user to employee mapping |
| `/settings/integrations/attendance/provisioning` | Device provisioning |
| `/settings/integrations/attendance/gateways` | On-premise gateways and pairing |
| `/settings/integrations/attendance/sync-history` | Sync history |
| `/settings/apps` | Gateways and installers |
| `/settings/approvals/templates/workflow-templates` | Workflow templates |

### Pages outside the catalogue

Surfaces that exist as their own route rather than as a registry item. They are
reached from a category page or from elsewhere in the product, and each is a
compound operation the generic renderer cannot express.

| Route | Purpose | Visibility |
| --- | --- | --- |
| `/settings/access`, `/settings/access/roles`, `/settings/access/teams`, `/settings/access/users` | Role, team and user operational views | Private; sensitive |
| `/settings/approval-matrices` | Approval routing | Private; cross-module policy |
| `/settings/billing`, `/settings/subscription` | Subscription lifecycle | Private; financial |
| `/settings/branding` | Identity, assets, theme, typography, density | Public-safe subset, private editor |
| `/settings/claim-types` | Claim configuration | Private |
| `/settings/company`, `/settings/organization` | Company profile and hierarchy | Private |
| `/settings/customization` | Packages, modules, fields, forms, views, publishing | Private; runtime publish |
| `/settings/data-management` | Import and export | Private |
| `/settings/desktop-agent` | Desktop agent defaults | Private |
| `/settings/features` | Feature availability | Private |
| `/settings/leave-policies`, `/settings/overtime-policies`, `/settings/policies` | Policy configuration | Private |
| `/settings/localization` | Resolved locale summary | Private; global consumer |
| `/settings/notifications` | Channels, providers, templates, logs | Private |
| `/settings/pay-components`, `/settings/payroll` | Pay and payroll configuration | Private; sensitive |
| `/settings/projects` | Project settings | Private |
| `/settings/security`, `/settings/system-audit` | Security and audit configuration | Private; never public |
| `/settings/security-access` | Security and access category | Private |
| `/settings/tax-rules`, `/settings/time-payroll-policies`, `/settings/travel-allowance-policies` | Payroll compliance policies | Private; sensitive |
| `/settings/work-sites` | Work sites | Private |

Public login surfaces are unchanged: `/login` and `/t/:tenantSlug/login` resolve
branding, font, title and favicon from public tenant resolution before the first
paint.

### Currency Ownership

### Payroll Banks And Loan Policies

Banks and loan policies are private Payroll & Finance configuration. Employee
bank accounts reference active bank records and carry country, currency,
effective dates, primary-payroll status, and verification status. Account
identifiers are always masked outside persistence and must be protected by
field-level payroll permissions.

Loan policies own amount/installment limits, currency, interest configuration,
and early-settlement behavior. Approved requests generate repayment rows;
payroll consumes scheduled rows instead of recalculating a live schedule.

Benefit Policies are private HR/Payroll configuration and follow the same
tenant-owned effective configuration boundary. They own eligibility scope,
calculation, payroll/tax/payslip behavior, renewal, expiry, visibility, and
optional generic approval requirements. Employee Benefit Assignments are
operational employee records, not Tenant Settings JSON. No Benefits settings UI
route is introduced in this backend phase; future settings surfaces must call
the Benefits API rather than duplicate policy state in tenant settings.

Standalone Currency Configuration was removed because currency ownership is split
by business responsibility:

1. Tenant Profile owns the tenant-level default currency.
2. Payroll Regions own payroll currency and reporting currency by scope and
   effective date.
3. Payroll & Finance > Exchange Rates owns currency conversion rates.

Currency resolution is centralized in `ConfigurationResolverService` through
`resolvePayrollCurrency`. The resolver returns payroll currency, reporting
currency, matched source, matched rule, fallback level, and effective date.
Current priority is work site Payroll Region, business unit Payroll Region,
organization Payroll Region, country Payroll Region, Tenant Profile default
currency, then platform/system default currency. A direct employee Payroll
Region assignment can be added later when the employee model has that field.

Payroll compensation creation already uses this resolver when no explicit
currency is supplied. Payroll runs, payslips, reports, and exports should keep
calling the resolver where a currency default is needed instead of hardcoding
or duplicating fallback logic. Demo payroll regions belong in demo seed data;
currency master data and tenant defaults belong in shared lookup/settings seeds.

### Work And Holiday Calendars

Work Calendars are backed by `WorkSchedule` and own working days, standard
hours, timezone, effective dates, and optional holiday-calendar linkage. Their
timezone must be selected from the shared timezone lookup rather than typed as
free text. Employees, departments, locations, projects, attendance, timesheets,
payroll regions, and payroll preparation all resolve or reference work
schedules.

Holiday Calendars are backed by `HolidayCalendar` and `Holiday`. A calendar
owns country, region, timezone, weekend convention, and effective dates. Holiday
rows own the holiday type (`PUBLIC`, `COMPANY`, `OPTIONAL`, `RELIGIOUS`,
`REGIONAL`) and scope (`TENANT`, `DEPARTMENT`, `WORK_SITE`). Locations can
reference a holiday calendar for work-site holidays; projects, payroll regions,
attendance, timesheets, leave planning, and employee schedule resolution consume
the resolved calendar context.

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
