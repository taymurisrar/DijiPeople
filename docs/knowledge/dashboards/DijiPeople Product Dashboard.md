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
- [[settings|Settings]]
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

- [[ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays|ITEM-0032]] — **Recompute productivity totals inflated by heartbeat replays** (MEDIUM)
- [[ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site|ITEM-0053]] — **Publish privacy policy and terms for the public landing site** (MEDIUM)

## Recent Product Changes

- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Known Product-Visible Defects

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou|BUG-0077]] | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | OPEN | billing, super-admin, tenants | FIX_NOW |
| [[BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic|BUG-0078]] | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | OPEN | billing, outbox, super-admin | PLAN_REQUIRED |
| [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab|BUG-0043]] | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[ITEM-0031-replace-remaining-native-prompts-for-governed-input|ITEM-0031]] | Replace remaining native prompts for governed input | UX | MEDIUM | READY | apps/admin, apps/web | FIX_NOW |

## How to read this

Generated from what the repository can actually evidence — source code,
architecture documents, QA runs and decision records. **Nothing here is
product intent that was not implemented.** Intent, meeting notes and client
feedback live in the hand-written folders of this vault, which no agent
writes to.

Where a generated note and a hand-written one disagree, the hand-written one
records what was *wanted* and this one records what was *built*. Both are
worth having; neither overwrites the other.
