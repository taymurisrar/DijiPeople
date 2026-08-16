# DijiPeople Platform Overview

> Generated from repository evidence at `ad8f77f`. Describes what is **built**.
> Product intent and client requests live in the hand-written folders of this
> vault, which no agent writes to.

## What DijiPeople is

A **multi-tenant SaaS HRM and business platform**. One codebase, one database,
many tenants — built as a configurable product, never as a per-client custom
build.

That last sentence is a constraint, not a slogan: tenant-specific behaviour
belongs in settings and customization, never in a code branch keyed on a tenant
name. See [[settings]].

## Four surfaces

| Surface | Who uses it |
|---|---|
| **[[tenant-application]]** (`apps/web`) | A tenant's employees, managers, HR, payroll operators and admins |
| **[[platform-admin]]** (`apps/admin`) | DijiPeople's own staff, operating the SaaS across all tenants |
| **[[desktop-agent]]** (`apps/agent-desktop`) | Employees, on their own workstation. An Electron **workstation-activity** agent with its own auth client — it produces utilisation data, **not** attendance |
| **[[landing-website]]** (`apps/landing`) | The public: marketing, demo requests, partner enquiry, plan browsing, self-service checkout, contract signing |

A fifth workspace, `apps/docs`, is a stock `create-turbo` starter and is **not a
product surface** — see [[docs-application]]. It is listed here only so its
absence from the table is not read as an omission.

## Two businesses in one repository

DijiPeople is simultaneously:

1. **An HR product** its tenants use — people, time, pay, talent, governance.
   See [[employee-hr-platform]].
2. **A SaaS business** that sells that product — leads, agreements, customers,
   onboarding, tenant provisioning, partners, billing. See
   [[commercial-onboarding-journey]] and [[tenant-lifecycle]].

The second is the less obvious half and the more recently exercised: the
2026-08-15 end-to-end run covered it from a public web form all the way to a
provisioned tenant.

## Domains actually implemented

63 API modules, grouped:

**People** — employees, employee levels, employment types, users, teams,
organization.
**Time** — attendance, attendance engine, attendance integrations, timesheets,
leave.
**Pay** — payroll, payslips, pay components, compensation, tax rules, loans,
claims, benefits, business trips, time-payroll.
**Talent** — recruitment, onboarding, projects, documents, policies.
**Governance** — approvals, workflows, SLA, audit, error logs, permissions,
roles.
**Commercial** — leads, partners, partner experience, contracts, support cases,
billing, super-admin.
**Configuration** — tenant settings, settings runtime, customization, lookups,
views, navigation, data, platform runtime.
**Platform ops** — platform auth, platform users, platform events, platform
monitoring, platform communications, app releases, tenants, demo data, data
management, agent, dashboard, inbox, reports.

## What is *not* proven

Worth stating alongside what exists:

- **No browser test tooling.** No UI behaviour in this product has been verified
  in a browser by an automated test. [[ITEM-0001]].
- **Tenant activation has never completed in a test.** [[ITEM-0004]].
- **Payroll has no QA run at all.** See [[payroll]].
- **Stripe billing is a stub in code.** See [[billing]].

## Related

[[product-areas]] · [[system-architecture]] · [[multi-tenancy]] ·
[[commercial-onboarding-journey]] · [[tenant-lifecycle]] · [[partner-program]]
