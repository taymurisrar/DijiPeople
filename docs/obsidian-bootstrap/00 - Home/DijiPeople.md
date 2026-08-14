# DijiPeople

Entry point for the DijiPeople knowledge base.

DijiPeople is a **multi-tenant SaaS HRM and business platform**. One codebase,
one database, many tenants, configuration-driven rather than customised per
client.

> Everything below marked `TODO: Confirm product/business rule.` could not be
> established from the repository and must be confirmed by a human before being
> relied on.

---

## Start here

| I want to… | Go to |
|---|---|
| Understand what the product is | [[Product Overview]] |
| Understand how it is built | [[Architecture Index]] |
| Understand a domain | [[Module Index]] |
| Find a decision | [[Architecture Decision Index]] |
| Write a feature spec | `99 - Templates/Feature.md` |
| Work with AI agents on this | [[Engineering Rules]] |

---

## The system, in brief

Verified against the repository.

| Surface | Path | Port | Audience |
|---|---|---|---|
| Public site | `apps/landing` | 3000 | Prospects, leads, partners |
| Tenant product | `apps/web` | 3001 | Tenant users — employees through admins |
| Platform admin | `apps/admin` | 3002 | DijiPeople staff |
| Desktop agent | `apps/agent-desktop` | — | Attendance capture (Electron) |
| API | `services/api` | 4000 (`/api`) | All of the above |
| Integration gateway | `gateway/` | — | On-premise attendance devices (.NET) |

Stack: npm workspaces + Turborepo · Next.js App Router + Tailwind v4 ·
NestJS 11 · PostgreSQL + Prisma 7 · JWT access/refresh with per-client secrets ·
Stripe billing · deployed to Vercel (apps), Render (API), Neon (database).

---

## Domains

See [[Module Index]] for detail.

**People** — Employees, Organization Structure, Teams, Users
**Time** — Attendance, Timesheets, Leave
**Pay** — Payroll, Payslips, Compensation, Pay Components, Tax, Claims, Loans, Benefits, Business Trips
**Talent** — Recruitment, Onboarding, Projects, Documents, Policies
**Governance** — Approvals, Workflows, SLA, Audit
**Commercial** — Leads, Customers, Partners, Contracts, Support Cases, Billing, Plans and Subscriptions
**Platform** — Tenant Provisioning, Settings, Customization, Integrations, Monitoring

---

## Where knowledge lives

| Question | Answer lives in |
|---|---|
| What does the code do? | The repository |
| How is it built? | `docs/architecture/` in the repository |
| Why was it built that way? | `05 - Decisions/` here, settled ADRs in `docs/decisions/` |
| What should it do? | `04 - Requirements/` here |
| What did the client say? | `10 - Client Feedback/` here |
| How must agents behave? | `AGENTS.md` in the repository, [[Engineering Rules]] here |
| How are changes planned? | `PLANS.md` in the repository |

**The repository is always the technical source of truth.** These notes carry
intent, reasoning and history.

---

## Open questions

- `TODO: Confirm product/business rule.` — Target market and ICP. The
  pre-existing instruction files described "small to medium businesses, clinics,
  and hospitals in the US", but the schema's country, currency and tax-rule
  modelling is generic, and the demo data does not confirm a geography.
- `TODO: Confirm product/business rule.` — Which modules are included in which
  plan tier. `Plan` and `Subscription` models exist; the entitlement mapping was
  not established.
- `TODO: Confirm product/business rule.` — Whether a user may ever belong to
  more than one tenant. The current model is one tenant per user.
- `TODO: Confirm product/business rule.` — Payroll statutory scope: which
  jurisdictions' tax and compliance rules must be supported.

---

## Related

[[Product Overview]] · [[Architecture Index]] · [[Module Index]] ·
[[Architecture Decision Index]] · [[Engineering Rules]]
