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

- [[ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so|ITEM-0062]] — **No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist** (HIGH)
- [[ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en|ITEM-0079]] — **Activation does not gate on a workspace having any module enabled** (LOW)

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
| [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable|BUG-0015]] | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | OPEN | api:tenant-control-plane | PLAN_REQUIRED |
| [[BUG-0016-partner-onboarding-review-has-no-state-machine|BUG-0016]] | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | OPEN | api:partner-experience | PLAN_REQUIRED |
| [[BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-|BUG-1420]] | The monitoring severity filter cannot match 99.7 percent of stored incidents | DATA_INTEGRITY | HIGH | OPEN | apps/admin, api:error-logs | TRIAGE_REQUIRED |
| [[BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read|BUG-1423]] | Runtime form controls have no accessible name so screen readers announce every field as blank | UX | HIGH | OPEN | apps/admin | TRIAGE_REQUIRED |
| [[BUG-1515-tenant-activation-invitation-reported-as-sent-when-it-was-ne|BUG-1515]] | Tenant activation invitation reported as sent when it was never delivered | STATE_MACHINE | HIGH | OPEN | auth, tenant-control-plane, notifications | TRIAGE_REQUIRED |
| [[BUG-1516-public-signup-creates-duplicate-customer-records-breaking-st|BUG-1516]] | Public signup creates duplicate customer records, breaking Stripe tenant resolution | DATA_INTEGRITY | HIGH | OPEN | super-admin, billing, landing | TRIAGE_REQUIRED |
| [[BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-|BUG-1421]] | Every admin screen shares one page title, two main landmarks and a duplicate h1 | UX | MEDIUM | OPEN | apps/admin | TRIAGE_REQUIRED |
| [[BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer|BUG-1425]] | currencyCode accepts any string of three characters or fewer | DATA_INTEGRITY | MEDIUM | OPEN | api:partners | TRIAGE_REQUIRED |
| [[ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip|ITEM-0068]] | Legal publication has an operator UI, but no diff before publishing | UX | MEDIUM | READY | legal, admin | FIX_NOW |

## How to read this

Generated from what the repository can actually evidence — source code,
architecture documents, QA runs and decision records. **Nothing here is
product intent that was not implemented.** Intent, meeting notes and client
feedback live in the hand-written folders of this vault, which no agent
writes to.

Where a generated note and a hand-written one disagree, the hand-written one
records what was *wanted* and this one records what was *built*. Both are
worth having; neither overwrites the other.
