# Product Overview

What DijiPeople is, derived from what the repository actually implements.
Business intent that could not be established from code is marked.

---

## What it is

A **multi-tenant SaaS HRM and business platform**: a single codebase and
database serving many customer organisations (tenants), configured rather than
customised per client.

It covers the employee lifecycle (hire → work → pay → exit) plus the commercial
machinery of running it as a SaaS business (leads, partners, customers,
contracts, plans, subscriptions, invoices, support).

## Who uses it

Four distinct audiences, each with its own application:

| Audience | Surface | What they do |
|---|---|---|
| Prospects and partners | `apps/landing` | Browse plans, request a demo, submit leads, partner enquiries, sign contracts |
| Tenant users | `apps/web` | The HR product — self-service, management, HR, payroll, tenant administration |
| DijiPeople staff | `apps/admin` | Run the SaaS — tenants, customers, plans, billing, support, monitoring |
| Employees on-site | `apps/agent-desktop` | Desktop attendance capture |

Tenant users are differentiated by role, not by application. The system roles
are `global-admin`, `system-admin`, `system-customizer`, `ceo`, `manager`, `hr`,
`recruiter`, `payroll-manager` and `employee`; tenants can define more.

`TODO: Confirm product/business rule.` — Target market. Earlier internal
instruction files described "small to medium businesses, clinics, and hospitals
in the US", but the implementation is geography-neutral: countries, currencies,
tax rules, holidays and regional formatting are all configurable data.

## What makes it configurable rather than custom

Verified capabilities that exist specifically so tenants differ without code
branching:

- **Tenant settings** — a settings plane covering security, regional behaviour,
  people operations, communication, customization, branding and compliance.
- **Customization** — tenant-level layers over entities, columns, views and
  forms, with packages and dependency validation.
- **Module runtime** — screens are declared as metadata (fields, views,
  commands, related records) and rendered by a shared runtime, so a tenant's
  configuration changes the UI without new code.
- **Roles and privileges** — configurable roles with entity/privilege/access-level
  grants, not fixed admin flags.
- **Approval matrices and workflows** — configurable approval routing.
- **Notification rules and templates** — per-tenant, per-module.
- **Branding** — per-tenant colours, logos, favicon, product naming.

This is the product's central bet: **no tenant-specific code paths**.

## Commercial model

Implemented: `Plan`, plan prices, `Subscription`, `Invoice`, `Payment`,
`Promotion`, commissions, and Stripe integration (`modules/billing/`,
`modules/super-admin/`). Billing cycles are `MONTHLY` / `ANNUAL`; billing models
are `PER_SEAT` / `FLAT`.

There is a partner/referral motion: `Partner`, partner referral links, partner
inquiries, partner onboarding and commissions.

Leads flow `NEW → CONTACTED → QUALIFIED → AGREEMENT → CONVERTED`, with
`UNQUALIFIED`, `CLOSED_LOST` and `ARCHIVED` terminal states, into
`CustomerAccount` and then a provisioned `Tenant`.

`TODO: Confirm product/business rule.` — Actual pricing, plan tiers, and which
modules each tier entitles.

## Tenant lifecycle

`TenantStatus`: `ONBOARDING → PENDING_SETUP → ACTIVE`, with `INACTIVE`,
`SUSPENDED`, `ARCHIVED`, `CHURNED`.

Each tenant gets a system subdomain (`<slug>.<base domain>`) and can add a
custom domain, with verification and SSL status tracked.

`TODO: Confirm product/business rule.` — The intended commercial meaning of
each status (what a customer can still do while `SUSPENDED`, when `CHURNED` is
set, data retention after `ARCHIVED`).

## Product principles (as implemented)

1. **One codebase, many tenants.** No per-client forks.
2. **Strong tenant isolation.** Every tenant-owned record carries `tenantId` and
   every query scopes to it.
3. **Permission-based authorization**, not role flags — configurable roles with
   entity-level privileges and access levels.
4. **Auditability.** Sensitive changes are recorded with before/after snapshots.
5. **Configuration over code** for anything tenant-specific.
6. **Modular monolith** — cohesive modules in one deployable.

## What it deliberately is not

- Not a per-client custom build.
- Not microservices.
- Not multi-tenant at the database level (shared schema, discriminator column).

## Related

[[DijiPeople]] · [[Module Index]] · [[Architecture Index]] ·
[[Engineering Rules]]
