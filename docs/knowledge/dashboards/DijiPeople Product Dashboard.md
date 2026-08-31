# DijiPeople Product Dashboard

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## What DijiPeople is

A multi-tenant SaaS HRM and business platform: one codebase, one database,
many tenants, built as a configurable product rather than a per-client build.

Four surfaces — the tenant product, the platform admin console, an Electron
attendance agent, and the public marketing site.

See [[dijipeople-platform-overview|DijiPeople Platform Overview]] for the full picture.

## Product Areas

- [[commercial-onboarding-journey|Commercial Onboarding Journey]]
- [[desktop-agent|Desktop Agent (`apps/agent-desktop`)]]
- [[dijipeople-platform-overview|DijiPeople Platform Overview]]
- [[employee-hr-platform|Employee HR Platform]]
- [[glossary|Glossary]]
- [[landing-website|Landing Website (`apps/landing`)]]
- [[partner-program|Partner Program]]
- [[product-areas|Product Areas]]
- [[starter-plan-scope|Starter Plan Scope and Entitlement Enforcement]]
- [[tenant-lifecycle|Tenant Lifecycle]]

## Main Modules

- [[approvals|Approvals]]
- [[attendance|Attendance]]
- [[audit-and-events|Audit and Events]]
- [[auth|Auth]]
- [[billing|Billing]]
- [[commercial-onboarding-lifecycle]]
- [[contracts-and-agreements|Contracts and Agreements]]
- [[customer-onboarding|Customer Onboarding]]
- [[customers|Customers]]
- [[employees|Employees]]
- [[leads|Leads]]
- [[leave-attendance-approvals|Leave, Attendance and Approvals]]
- [[legal|Legal]]
- [[notifications|Notifications]]
- [[organization|Organization]]
- [[outbox|Outbox]]
- [[partner-onboarding|Partner Onboarding]]
- [[partners|Partners]]
- [[payroll|Payroll]]
- [[platform-admin|Platform Admin]]
- [[platform-auth|Platform Auth]]
- [[platform-communications|Platform Communications]]
- [[reporting|Reporting]]
- [[settings|Settings]]
- [[super-admin|Super Admin]]
- [[tenant-application|Tenant Application]]
- [[tenant-control-plane]]
- [[tenant-isolation|Tenant Isolation]]
- [[tenant-provisioning|Tenant Provisioning]]
- [[workspace-routing-and-domains|Workspace Routing and Domains]]

## Requirements

- [[requirement-commercial-onboarding|Requirement — Commercial Onboarding]]
- [[requirement-lead-conversion|Requirement — Lead Conversion]]
- [[requirement-partner-onboarding|Requirement — Partner Onboarding]]
- [[requirement-tenant-workspace-domains|Requirement — Tenant Workspace Domains]]

## Open Product Decisions

Questions where the engineering is understood and the **product answer**
**is not**. No agent may resolve one by implementing a side of it.

- [[BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it|BUG-2509]] — **Platform admin remember-me has no policy able to refuse it** (MEDIUM)
- [[ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti|ITEM-0106]] — **An employee cannot use self-service until their manager activates their own account** (MEDIUM)
- [[ITEM-0115-provisioning-seeds-four-departments-with-no-business-unit-on|ITEM-0115]] — **Provisioning seeds four departments with no business unit on every tenant** (MEDIUM)
- [[ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle|ITEM-0108]] — **Decide whether the roughly one-hour session lifetime is idle or absolute** (LOW)
- [[BUG-2007-projects-and-customers-can-be-created-but-never-deleted|BUG-2007]] — **Projects and customers can be created but never deleted** (LOW)
- [[ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-|ITEM-0114]] — **The workspace shell states the tenant's identity four times and its purpose twice** (unrated)

## Recent Product Changes

- [[2026-08-29-workspace-switcher-avatar-menu|Workspace Switcher Moves Into the Avatar Menu]]
- [[2026-08-20-self-service-acquisition-path|Self-Service Acquisition Path]]
- [[2026-08-20-identity-and-membership|Identity and Multi-Tenant Membership]]
- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]

## Known Product-Visible Defects

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e|BUG-1957]] | A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name | DATA_INTEGRITY | HIGH | FIXED | api:organization | DONE |
| [[BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa|BUG-1966]] | A failed save in the runtime form is swallowed with no message, toast or inline error | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i|BUG-1986]] | Tenant settings has four blocking accessibility violations including buttons with no name | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra|BUG-2008]] | Every employee is counted absent on a non-working day and raised as an exception | DATA_INTEGRITY | HIGH | FIXED | api:attendance, api:dashboard | DONE |
| [[BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr|BUG-2044]] | No employee lifecycle event is audited, including employee creation and reporting-manager assignment | DATA_INTEGRITY | HIGH | FIXED | api:employees, api:organization, api:leave | DONE |
| [[BUG-2494-check-out-re-validates-check-in-preconditions-and-traps-the-|BUG-2494]] | Check-out re-validates check-in preconditions and traps the entry open for ever | STATE_MACHINE | HIGH | OPEN | api:attendance | TRIAGE_REQUIRED |
| [[BUG-2504-approving-a-correction-never-applies-the-requested-work-mode|BUG-2504]] | Approving a correction never applies the requested work mode, work site or overtime | STATE_MACHINE | HIGH | OPEN | api:attendance | PLAN_REQUIRED |
| [[BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h|BUG-2618]] | Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler | DATA_INTEGRITY | HIGH | OPEN | billing, super-admin | FIX_NOW |
| [[BUG-2693-historical-headcount-reports-employee-days-instead-of-headco|BUG-2693]] | Historical headcount reports employee-days instead of headcount and grows with the length of the period | DATA_INTEGRITY | HIGH | FIXED | api:reporting | DONE |
| [[BUG-2718-the-approvals-record-page-reads-the-detail-response-envelope|BUG-2718]] | The approvals record page reads the detail response envelope, so every field is blank | UX | HIGH | FIXED | approvals, leave, attendance | FIX_NOW |
| [[BUG-2732-attendance-integration-cannot-be-activated-activation-requir|BUG-2732]] | Attendance integration cannot be activated: activation requires a verified device, but only an active integration is ever verified | STATE_MACHINE | HIGH | OPEN | api:attendance-integrations, gateway/src/DijiPeople.Gateway.Host | TRIAGE_REQUIRED |
| [[BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width|BUG-1668]] | Tenant workspace pages scroll horizontally at mobile width | UX | MEDIUM | FIXED | views | DONE |
| [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page|BUG-1950]] | Every tenant workspace screen renders the same h1, so no page announces what it is | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin|BUG-1951]] | Most tenant workspace pages render no main landmark, including every settings category | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1955-every-404-is-reported-to-the-user-as-database-record-not-fou|BUG-1955]] | Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant|BUG-1956]] | Runtime lookup comboboxes expose no listbox or option semantics to assistive technology | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve|BUG-1958]] | Deleting a department never releases its name, so it can never be recreated | DATA_INTEGRITY | MEDIUM | FIXED | api:organization | DONE |
| [[BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend|BUG-1962]] | Assigned On is required by the leave assignment API and rendered as an optional field | UX | MEDIUM | FIXED | apps/web, api:leave | DONE |
| [[BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and|BUG-1963]] | Runtime dialogs show the end user the raw server message and the HTTP method and path | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu|BUG-2005]] | Manual attendance accepts a date arbitrarily far in the future | DATA_INTEGRITY | MEDIUM | FIXED | api:attendance | DONE |
| [[BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime|BUG-2006]] | A successful save reports nothing to the user on the runtime forms and the branding page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum|BUG-2009]] | Display labels fall through to the raw field key or raw enum value on three tenant surfaces | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t|BUG-2012]] | The related-list create dialog pre-fills child fields with the parent record values | DATA_INTEGRITY | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi|BUG-2148]] | Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology | UX | MEDIUM | FIXED | views, dashboard | DONE |
| [[BUG-2413-allocate-id-plan-scans-only-docs-qa-test-plans-so-execplan-i|BUG-2413]] | allocate-id plan scans only docs qa test-plans so ExecPlan ids collide | DATA_INTEGRITY | MEDIUM | FIXED | scripts | DONE |
| [[BUG-2495-the-under-investigation-tile-counts-incidents-nobody-is-inve|BUG-2495]] | The Under investigation tile counts incidents nobody is investigating | UX | MEDIUM | OPEN | admin:monitoring, api:platform-monitoring | TRIAGE_REQUIRED |
| [[BUG-2507-the-manager-s-correction-screen-hides-four-of-the-eight-kind|BUG-2507]] | The manager's correction screen hides four of the eight kinds of change | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2573-a-correction-request-cannot-be-withdrawn-by-the-person-who-f|BUG-2573]] | A correction request cannot be withdrawn by the person who filed it | UX | MEDIUM | OPEN | api:attendance, apps/web | PLAN_REQUIRED |
| [[BUG-2647-reporting-record-tables-and-metric-tiles-format-without-the-|BUG-2647]] | Reporting record tables and metric tiles format without the tenant context, causing a hydration mismatch | UX | MEDIUM | FIXED | app:web, app:web | DONE |
| [[BUG-2648-reports-pages-scroll-sideways-at-1440-because-grid-items-can|BUG-2648]] | Reports pages scroll sideways at 1440 because grid items cannot shrink below their content | UX | MEDIUM | FIXED | app:web | DONE |
| [[BUG-2662-an-expired-refresh-token-puts-the-tenant-app-into-a-redirect|BUG-2662]] | An expired refresh token puts the tenant app into a redirect loop instead of the login page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip|ITEM-0068]] | Legal publication has an operator UI, but no diff before publishing | UX | MEDIUM | READY | legal, admin | FIX_NOW |
| [[ITEM-0105-the-leave-entitlement-dialog-cannot-set-accrualtype-which-th|ITEM-0105]] | The leave entitlement dialog cannot set accrualType, which the API requires | UX | MEDIUM | READY | apps/web, api:leave | FIX_NOW |
| [[BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp|BUG-1964]] | Record headings and dialog titles are singularised by stripping a trailing s | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86|BUG-2010]] | The dashboard Recent changes list renders unformatted ISO-8601 timestamps | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-|BUG-2017]] | The inbox Related record column renders a bare UUID with no label and no link | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open|BUG-2149]] | Every dashboard metric card offers a link named only Open | UX | LOW | FIXED | views, dashboard | DONE |
| [[BUG-2384-tenant-record-shows-primary-tenant-owner-unassigned-while-it|BUG-2384]] | Tenant record shows Primary Tenant Owner Unassigned while its readiness check reports one active Tenant Owner | UX | LOW | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-2657-analytics-caveat-panels-list-the-same-note-twice-in-differen|BUG-2657]] | Analytics caveat panels list the same note twice in different wording | UX | LOW | FIXED | api:reporting | DONE |
| [[ITEM-0109-the-disabled-check-in-button-explains-itself-only-in-a-title|ITEM-0109]] | The disabled Check In button explains itself only in a title tooltip | UX | LOW | READY | apps/web | FIX_NOW |
| [[ITEM-0111-protected-route-prefixes-omits-twelve-authenticated-route-tr|ITEM-0111]] | PROTECTED_ROUTE_PREFIXES omits twelve authenticated route trees, so deep links to them are lost at sign-in | UX | LOW | READY | apps/web | FIX_NOW |

## How to read this

Generated from what the repository can actually evidence — source code,
architecture documents, QA runs and decision records. **Nothing here is
product intent that was not implemented.** Intent, meeting notes and client
feedback live in the hand-written folders of this vault, which no agent
writes to.

Where a generated note and a hand-written one disagree, the hand-written one
records what was *wanted* and this one records what was *built*. Both are
worth having; neither overwrites the other.
