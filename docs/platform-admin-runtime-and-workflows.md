# Platform Admin runtime and governed workflows

## Architecture

Platform Admin uses a metadata-driven runtime for list, create, read, and edit experiences. `platform-module-registry.ts` is the client-side module contract; `PlatformRuntimeService` is the server adapter and authorization boundary. The runtime resolves module views, fields, actions, filters, sorting, related records, timelines, validation, and persistence through module-owned services. It does not maintain a second CRUD data source.

The shared UI surface consists of:

- `RuntimeModulePage` and `RuntimeModuleList` for list views.
- `RuntimeRecordRoute`, `RuntimeRecordPage`, and `RuntimeForm` for create/read/edit.
- `RuntimeViewSelector` for dashboard and module views, including a user-pinned default.
- `ModuleActionBar` for list and record commands.
- `ProDataTable` for every production table in Platform Admin.
- `DashboardRuntime` and `DASHBOARD_WIDGET_REGISTRY` for role-based live widgets.

Module-specific panels extend the record runtime only where a governed workflow needs additional interaction, such as contract versions/signing, customer agreement creation, support activities, or tenant operations. They continue to use the normalized service/API layer.

## Runtime modules

The registry includes Dashboard, Leads, Partners, Customers, Customer onboarding, Tenants, Contracts, Contract templates, Support cases, Monitoring incidents, Plans, Subscriptions, Invoices, Payments, and Commissions. Partner inquiries and pending onboarding are system views of Partners; signature requests are system views and related records of Contracts. Compatibility routes redirect into these consolidated views and are not shown in navigation. Leads, Partners, Customers, Customer onboarding, Tenants, Contracts, and Support cases use the complete shared list and record route pattern. Read-only revenue records also use shared record detail definitions.

Legacy page-specific lead, customer, onboarding, and tenant list managers and the duplicate record ribbon were removed after their routes moved to the shared runtime. The specialized tenant operations workspace remains reachable from the Tenant record action and preserves status, feature, access, subscription, invoice, settings, and audit tools.

## Query and preference behavior

Runtime list queries accept bounded JSON filter and multi-sort metadata. Field paths and operators are allowlisted before use. Generic/in-memory modules and Prisma-backed services apply the same operator semantics. Search, page, page size, visible columns, column order, column widths, saved filters, and sorting are URL- or preference-backed. Preferences are stored per platform user and module in `PlatformModulePreference`.

The table supports server pagination, page sizing, multi-sort, filters, search, selection, bulk commands, keyboard row activation, sticky headers and pagination, column visibility/reorder/resize, empty states, and CSV export.

## Permissions and scope

Frontend visibility is only a usability layer. API guards and services verify the platform principal and the module permission on every runtime read/write/action. Partner portal endpoints use a separate partner principal and always include `partnerId` in record queries. Customer, tenant, partner, support, and contract relations use restrictive foreign keys where legal or financial history must survive parent changes.

Platform Owner, Platform Admin, and Super Admin receive the governed administrative capability set. Functional roles receive only their domains. Support assignment accepts active Platform Owner/Admin, Super Admin, Member, Support Manager/Agent, and Monitoring Operator users, plus an allowlisted support team.

## Currency and appearance ownership

`platform-defaults` is the authoritative source for reporting currency and global currency fallback. Dashboards aggregate only the configured reporting currency. New partner, commission, contract, onboarding, subscription, and billing workflows use the setting or a persisted record-specific override. UI formatters read the same settings provider.

Appearance is persisted in platform branding settings. Ocean, Emerald, Violet, and Sunset presets provide primary, accent, navigation, and surface colors; validated custom hex colors are also supported. The admin shell applies the selection through CSS variables.

## Contracts, templates, approvals, and signatures

Contracts can originate from a blank editor, a published versioned template, an existing lead/customer/onboarding/tenant record, a copied agreement, or a DOCX/PDF/TXT/HTML upload. Source uploads are persisted with hashes and storage keys. The editor uses TipTap, sanitizes pasted Word/Google markup, supports structured headings/lists/tables/links/alignment/indent/page breaks, inserts placeholders, previews documents, and creates immutable versions.

Templates and contracts are normalized into `ContractTemplate`, `ContractTemplateVersion`, `Contract`, `ContractVersion`, `ContractPlaceholderValue`, and `ContractDocument`. Template lifecycle supports clone, activate, deactivate, archive, preview, published versions, and restoring an earlier version into a new draft. The typed placeholder registry carries resolver source, type, required/default/fallback/formatting/security metadata and examples. Draft tokens remain non-destructive; values are type-checked before approval/signature, then frozen with a SHA-256-stamped source snapshot into the immutable signing version. Commercial and legal approval steps are persisted as requests, steps, and actions. Forward/backward stages write a timeline.

Signature requests contain ordered recipients with one-way hashed access tokens and expiry. The public signing journey supports typed, drawn, and uploaded signatures, explicit consent, decline, and request changes. View, send, resend, sign, decline, change-request, and cancel events are hash chained in `SignatureEvent`. Signer evidence records identity verification method, token reference, document and signature hashes, consent, IP, user agent, timezone, and event-chain information. Completion generates a locked signed PDF with a signer/evidence appendix plus an immutable JSON evidence bundle and links both documents to the request. Signed versions are guarded by service rules and corrected database triggers that allow legitimate pre-signing updates but reject every post-lock update/delete.

Outbound platform email uses a stable idempotency key and persisted attempts, provider identifiers, retry time, and failure details. Repeated successful delivery operations do not resend. Failed deliveries are retried by a bounded five-minute worker with exponential backoff and a six-attempt ceiling.

## Partner referral, agreement, and customer journeys

The public Partner application creates or updates one canonical `Partner` in `INQUIRY` status and stores an immutable linked `PartnerInquiry` submission snapshot. Review and approval move that same record through the governed lifecycle; approval does not activate the account or create onboarding. The configured required Partner agreement types must be fully executed before an onboarding invitation can be issued. Approved onboarding plus executed agreement evidence is required before account activation.

Activated Partner users authenticate with a separate Partner principal. Every portal Lead, referral-link, and agreement query is scoped by the authenticated `partnerId`. Partners cannot create, edit, qualify, assign, convert, or delete Leads. They share non-guessable `PartnerReferralLink` URLs to the existing public request-demo form and may create campaign links only when `partner-settings.allowPartnerCampaignLinks` is enabled.

The public Lead endpoint accepts only a referral code. It resolves the active Partner and link on the server, snapshots attribution, records invalid/disabled/expired attribution without rejecting the normal Lead, increments link usage, and writes the Partner timeline. Historical attribution remains attached when a link is regenerated. Administrative corrections use a dedicated permission-checked action and immutable correction history.

Agreements support multiple parties, signers, related records, signing modes, immutable generated versions, positioned fields, and parent/amendment/renewal/supersession relations. Executed agreements are preserved; amendments and renewals create derived agreement records. Final execution produces a locked PDF with signature blocks and an audit certificate from the same immutable event timeline used by the UI.

Lead conversion and Tenant provisioning evaluate configured required agreement types and fully executed statuses. They do not treat the presence of any contract as sufficient. Successful conversion and provisioning preserve the originating Lead, Partner, referral link/code, and agreement relations on downstream Customer and Tenant records.

## Support and monitoring

The error-log queue uses persisted sanitized web/admin/API events. Metrics are calculated against the complete active filter, not the current page. Inline button groups handle severity, source, time window, refresh, auto-refresh, and export. Advanced filters remain compact. The shared table has fixed professional column sizing and sticky pagination.

An incident can be assigned to an eligible platform support owner or team, investigated, resolved, and given separate internal and customer-safe updates. It can create or link a structured support case. Support cases calculate response/resolution SLAs from platform settings and persist priority, severity, escalation, ownership, activities, communications, attachments, parent/merge relationships, and incident links.

## Dashboard views

The reusable selector exposes Executive overview, Presales, Partner operations, Agreement operations, Customer onboarding, Customer support, Billing and revenue, Platform administration, and System health views according to role. Users may pin a default. Widget metadata resolves through a registry that supports KPI, comparison/trend, time-series, bar/stacked/donut, funnel/pipeline, SLA/aging/financial/conversion, queues/lists/activity/tasks/approvals/alerts/exceptions, forecast/goals, breakdown/system-health, quick-action/saved-view, and drill-down families. Current views use live aggregated Prisma data, locale-aware formatting, queues, alerts, charts, drill-through links, configurable 3/6/12-month ranges, refresh timestamps, manual refresh, and optional 60-second refresh.

## Deployment and verification

Apply migrations with `npm run prisma:migrate:deploy --workspace=services/api`. Seed configuration before `npm run seed:platform-workflows --workspace=services/api`; the workflow seed is idempotent and includes realistic Partner, agreement, signature, referral, customer contract, support SLA, and linked monitoring states. Run API unit tests, API E2E tests, workspace type checks/lint, and all production builds before deployment.

The primary verification routes are `/partners`, `/partners/[partnerId]`, `/contracts`, `/contracts/[contractId]`, `/request-demo?ref=<code>`, `/sign/[token]`, `/partners/onboarding/[token]`, `/partner`, `/partner/referral-links`, `/partner/leads`, and `/partner/contracts`. Partner Operations and Agreement Operations are selected from the dashboard view selector at `/`.
