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

- [[BUG-2045-timesheet-background-job-completions-make-up-71-percent-of-t|BUG-2045]] — **Timesheet background-job completions make up 71 percent of the tenant audit trail** (MEDIUM)
- [[ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti|ITEM-0106]] — **An employee cannot use self-service until their manager activates their own account** (MEDIUM)
- [[ITEM-0113-the-seeded-leave-approval-chain-cannot-route-on-a-newly-prov|ITEM-0113]] — **The seeded leave approval chain cannot route on a newly provisioned tenant, and the Approval Matrices screen gives no warning** (MEDIUM)
- [[ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle|ITEM-0108]] — **Decide whether the roughly one-hour session lifetime is idle or absolute** (LOW)
- [[BUG-2007-projects-and-customers-can-be-created-but-never-deleted|BUG-2007]] — **Projects and customers can be created but never deleted** (LOW)
- [[ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-|ITEM-0114]] — **The workspace shell states the tenant's identity four times and its purpose twice** (unrated)

## Recent Product Changes

- [[2026-08-20-self-service-acquisition-path|Self-Service Acquisition Path]]
- [[2026-08-20-identity-and-membership|Identity and Multi-Tenant Membership]]
- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Known Product-Visible Defects

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e|BUG-1957]] | A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name | DATA_INTEGRITY | HIGH | OPEN | api:organization | FIX_NOW |
| [[BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa|BUG-1966]] | A failed save in the runtime form is swallowed with no message, toast or inline error | UX | HIGH | FIXED | apps/web | FIX_NOW |
| [[BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i|BUG-1986]] | Tenant settings has four blocking accessibility violations including buttons with no name | UX | HIGH | OPEN | apps/web | FIX_NOW |
| [[BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra|BUG-2008]] | Every employee is counted absent on a non-working day and raised as an exception | DATA_INTEGRITY | HIGH | OPEN | api:attendance, api:dashboard | FIX_NOW |
| [[BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr|BUG-2044]] | No employee lifecycle event is audited, including employee creation and reporting-manager assignment | DATA_INTEGRITY | HIGH | OPEN | api:employees, api:organization, api:leave | PLAN_REQUIRED |
| [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page|BUG-1950]] | Every tenant workspace screen renders the same h1, so no page announces what it is | UX | MEDIUM | OPEN | apps/web | FIX_NOW |
| [[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin|BUG-1951]] | Most tenant workspace pages render no main landmark, including every settings category | UX | MEDIUM | OPEN | apps/web | FIX_NOW |
| [[BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant|BUG-1956]] | Runtime lookup comboboxes expose no listbox or option semantics to assistive technology | UX | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve|BUG-1958]] | Deleting a department never releases its name, so it can never be recreated | DATA_INTEGRITY | MEDIUM | OPEN | api:organization | PLAN_REQUIRED |
| [[BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend|BUG-1962]] | Assigned On is required by the leave assignment API and rendered as an optional field | UX | MEDIUM | IN_PROGRESS | apps/web, api:leave | FIX_NOW |
| [[BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and|BUG-1963]] | Runtime dialogs show the end user the raw server message and the HTTP method and path | UX | MEDIUM | OPEN | apps/web | FIX_NOW |
| [[BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu|BUG-2005]] | Manual attendance accepts a date arbitrarily far in the future | DATA_INTEGRITY | MEDIUM | OPEN | api:attendance | FIX_NOW |
| [[BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime|BUG-2006]] | A successful save reports nothing to the user on the runtime forms and the branding page | UX | MEDIUM | OPEN | apps/web | FIX_NOW |
| [[BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum|BUG-2009]] | Display labels fall through to the raw field key or raw enum value on three tenant surfaces | UX | MEDIUM | OPEN | apps/web | FIX_NOW |
| [[BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t|BUG-2012]] | The related-list create dialog pre-fills child fields with the parent record values | DATA_INTEGRITY | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip|ITEM-0068]] | Legal publication has an operator UI, but no diff before publishing | UX | MEDIUM | READY | legal, admin | FIX_NOW |
| [[ITEM-0105-the-leave-entitlement-dialog-cannot-set-accrualtype-which-th|ITEM-0105]] | The leave entitlement dialog cannot set accrualType, which the API requires | UX | MEDIUM | READY | apps/web, api:leave | FIX_NOW |
| [[BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp|BUG-1964]] | Record headings and dialog titles are singularised by stripping a trailing s | UX | LOW | OPEN | apps/web | FIX_NOW |
| [[BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86|BUG-2010]] | The dashboard Recent changes list renders unformatted ISO-8601 timestamps | UX | LOW | OPEN | apps/web | FIX_NOW |
| [[BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-|BUG-2017]] | The inbox Related record column renders a bare UUID with no label and no link | UX | LOW | OPEN | apps/web | FIX_NOW |
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
