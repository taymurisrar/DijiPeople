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

- [[BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si|BUG-0163]] — **package-lock.json cannot be regenerated - npm overrides are silently ignored** (HIGH)
- [[BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi|BUG-0223]] — **Admin cannot set a plan isPublic flag which gates self-service checkout** (MEDIUM)
- [[ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays|ITEM-0032]] — **Recompute productivity totals inflated by heartbeat replays** (MEDIUM)
- [[ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site|ITEM-0053]] — **Publish privacy policy and terms for the public landing site** (MEDIUM)
- [[ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never|ITEM-0076]] — **Operators cannot recover an order whose Stripe webhook never arrived** (MEDIUM)
- [[ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re|ITEM-0057]] — **Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex** (unrated)

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
| [[BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou|BUG-0077]] | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, tenants | FIX_NOW |
| [[BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic|BUG-0078]] | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | FIXED | billing, outbox, super-admin | FIX_NOW |
| [[BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab|BUG-0080]] | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, legal | FIX_NOW |
| [[BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-|BUG-0082]] | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | FIXED | landing | FIX_NOW |
| [[BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing|BUG-0280]] | Self-service checkout leaves a customer with no plan, billing cycle or origin channel | DATA_INTEGRITY | HIGH | FIXED | api:billing, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri|BUG-0282]] | The platform runtime schema manifest drifted from schema.prisma and no check noticed | DATA_INTEGRITY | HIGH | FIXED | pkg:config, apps/admin, services/api/prisma | FIX_NOW |
| [[BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin|BUG-0418]] | Contract placeholders declared a formatting rule that nothing applied | DATA_INTEGRITY | HIGH | FIXED | api:contracts | FIX_NOW |
| [[BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-|BUG-0419]] | Preview sample data replaced the live template and rendered one paint late | UX | HIGH | FIXED | apps/admin | FIX_NOW |
| [[BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro|BUG-0422]] | An abandoned provisioning run blocked every retry with no route out | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0463-an-active-reachable-tenant-reported-that-its-workspace-was-n|BUG-0463]] | An active reachable tenant reported that its workspace was not provisioned | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0531-flat-prices-were-sellable-on-the-public-site-at-invented-amo|BUG-0531]] | Flat prices were sellable on the public site at invented amounts | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
| [[BUG-0533-seeding-the-commercial-catalogue-never-corrected-an-existing|BUG-0533]] | Seeding the commercial catalogue never corrected an existing plan or price | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
| [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab|BUG-0043]] | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | FIXED | apps/web | PLAN_REQUIRED |
| [[BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-|BUG-0221]] | Schema-completed form fields render on a tab the form never declares | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend|BUG-0222]] | Plan related-record panels declare no tab, so they never render | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-|BUG-0281]] | Partner attribution is lost when a referred buyer purchases through self-service checkout | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing, api:billing, api:partner-experience | PLAN_REQUIRED |
| [[BUG-0314-the-notifications-page-is-a-placeholder-under-a-permanently-|BUG-0314]] | The notifications page is a placeholder under a permanently lit badge | UX | MEDIUM | FIXED | apps/admin, api:platform-events | FIX_NOW |
| [[BUG-0315-workspace-preferences-are-stored-in-localstorage-and-never-a|BUG-0315]] | Workspace preferences are stored in localStorage and never applied | UX | MEDIUM | FIXED | apps/admin, api:platform-users, services/api/prisma | FIX_NOW |
| [[BUG-0316-country-industry-and-contact-fields-are-free-text-where-a-ca|BUG-0316]] | Country industry and contact fields are free text where a canonical list exists | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing, apps/admin, api:lookups, pkg:config | FIX_NOW |
| [[BUG-0317-the-subscribe-wizard-shows-five-identical-pills-and-labels-t|BUG-0317]] | The subscribe wizard shows five identical pills and labels three address fields only by placeholder | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0350-the-subscribe-wizard-s-country-field-silently-degraded-to-fr|BUG-0350]] | The subscribe wizard's country field silently degraded to free text | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0351-the-subscribe-wizard-progress-rail-truncated-every-step-labe|BUG-0351]] | The subscribe wizard progress rail truncated every step label | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin|BUG-0420]] | The console dark theme set color-scheme and repainted nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e|BUG-0421]] | An overflow declaration in the shell disabled every sticky element | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-|BUG-0439]] | The subscribe form was disabled without looking disabled or saying why beside it | UX | MEDIUM | FIXED | apps/landing, apps/admin | FIX_NOW |
| [[BUG-0460-the-notification-badge-counted-over-a-window-sized-by-the-pa|BUG-0460]] | The notification badge counted over a window sized by the page it was fetching | UX | MEDIUM | FIXED | api:platform-events, apps/admin | FIX_NOW |
| [[BUG-0461-the-cost-estimator-listed-flat-priced-plans-under-a-headcoun|BUG-0461]] | The cost estimator listed flat-priced plans under a headcount input | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0462-monitoring-opened-on-a-twelve-thousand-row-queue-with-five-u|BUG-0462]] | Monitoring opened on a twelve thousand row queue with five unactionable tiles | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0493-open-tenant-reported-success-while-opening-nothing|BUG-0493]] | Open Tenant reported success while opening nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0494-workspace-hostnames-stayed-pending-for-ever-with-nothing-to-|BUG-0494]] | Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it | STATE_MACHINE | MEDIUM | FIXED | api:tenant-domains, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0495-the-console-painted-light-on-every-load-before-the-dark-them|BUG-0495]] | The console painted light on every load before the dark theme arrived | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0496-the-monitoring-landing-page-showed-real-data-an-agent-could-|BUG-0496]] | The monitoring landing page showed real data an agent could not act on | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0497-fifteen-modules-offered-no-delete-and-no-reason-for-its-abse|BUG-0497]] | Fifteen modules offered no Delete and no reason for its absence | UX | MEDIUM | FIXED | apps/admin, api:partners, api:platform-runtime | FIX_NOW |
| [[BUG-0534-plan-form-offered-editable-legacy-price-fields-that-bill-nob|BUG-0534]] | Plan form offered editable legacy price fields that bill nobody | UX | MEDIUM | FIXED | super-admin, apps/admin | FIX_NOW |
| [[ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip|ITEM-0068]] | Legal documents have no operator UI, so publishing is a script | UX | MEDIUM | READY | legal, admin | PLAN_REQUIRED |
| [[BUG-0352-the-tenant-timeline-rendered-every-entry-with-no-count-and-n|BUG-0352]] | The tenant timeline rendered every entry with no count and no paging | UX | LOW | FIXED | apps/admin | FIX_NOW |

## How to read this

Generated from what the repository can actually evidence — source code,
architecture documents, QA runs and decision records. **Nothing here is
product intent that was not implemented.** Intent, meeting notes and client
feedback live in the hand-written folders of this vault, which no agent
writes to.

Where a generated note and a hand-written one disagree, the hand-written one
records what was *wanted* and this one records what was *built*. Both are
worth having; neither overwrites the other.
