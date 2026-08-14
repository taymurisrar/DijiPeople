# Module Index

Every domain implemented in DijiPeople, with where it lives in the repository.
Module paths are verified; **business rules are marked as unconfirmed** where
they could not be established from code.

Create one note per module as knowledge accumulates. Link them from here.

---

## People

### Employees
`services/api/src/modules/employees/` ·
`apps/web/app/(authenticated)/employees/` ·
`apps/web/lib/runtime/modules/employee*.ts`
Models: `Employee` + education, previous employment, history, addresses,
emergency contacts, documents, bank accounts, compensation.
Services: `employees.service.ts`, `employee-profiles.service.ts`,
`employee-access.service.ts`, `employees.repository.ts`.
Notable: employee **record lifecycle** (`employee-lifecycle.constants.ts`:
status/sub-status, draft profiles), duplicate detection
(`duplicate-rule-engine.ts`), CSV import, access provisioning (creating the
linked `User`), termination.
`TODO: Confirm product/business rule.` — Draft vs active profile rules; who may
provision account access; termination effects across leave, payroll and assets.

### Organization Structure
`services/api/src/modules/organization/`, `teams/`, `employee-levels/`,
`employment-types/`
Organizations, business units, departments, designations, teams, `Location`
(the canonical Work Site), employee levels, employment types.
Notable: business units drive **row-level access scope** through
`OrganizationAccessService` and the request context.
`TODO: Confirm product/business rule.` — Depth limits and reorganisation rules
for the business-unit hierarchy.

### Users and Access
`services/api/src/modules/users/`, `roles/`, `permissions/`, `auth/`
Notable: **`User` and `Employee` are separate concepts** — see
`docs/architecture/settings-and-branding.md`, which is canonical on that
boundary.

---

## Time

### Attendance
`services/api/src/modules/attendance/`, `attendance-engine/`,
`attendance-integrations/` · `apps/web/app/(authenticated)/attendance/`
Engine services: punch interpretation, session building, day context, policy
resolution, geofencing, impossible-travel detection, reconciliation queue,
backfill.
Integrations: connectors (incl. ZKTeco legacy), devices, on-prem gateways,
ingestion, mapping, provisioning, work sites.
Notable: `AttendanceEntry.workedMinutes` is written by the reconciliation engine
because `checkOut - checkIn` is wrong on multi-session days; null on legacy rows.
`TODO: Confirm product/business rule.` — Late/early thresholds, manual location
exception approval, correction approval routing.

### Timesheets
`services/api/src/modules/timesheets/` ·
`apps/web/app/(authenticated)/timesheets/`
Generation, calculation, policy resolution, workflow, export, jobs.
Notable: `TimesheetAccessRestriction` is enforced **in `JwtAuthGuard`** — it can
block or read-only a user across most of the product until timesheets are
submitted, with an allow-listed route set.
`TODO: Confirm product/business rule.` — Restriction escalation policy; who may
override.

### Leave
`services/api/src/modules/leave/` · `apps/web/app/(authenticated)/leaves/`
Leave types, policies, policy assignments, requests, approval routing.
`TODO: Confirm product/business rule.` — Accrual, carry-forward, encashment and
proration rules.

---

## Pay

### Payroll
`services/api/src/modules/payroll/`, `payslips/`, `pay-components/`,
`compensation/`, `tax-rules/`, `time-payroll/`
Cycles, periods, runs, records, cost allocation, journal, GL posting rules,
exchange rates, export providers, employer bank accounts, defaults, output
documents, notifications.
`TODO: Confirm product/business rule.` — Statutory jurisdictions supported;
rounding rules; approval and finalisation authority; off-cycle payroll.

### Claims, Loans, Benefits, Business Trips
`services/api/src/modules/claims/`, `loans/`, `benefits/`, `business-trips/`
Claim types and claims; loan issuance and payroll deduction; benefit policies
and employee assignments; TADA policies and trips.
`TODO: Confirm product/business rule.` — Eligibility, limits, and interaction
with payroll runs.

---

## Talent

### Recruitment
`services/api/src/modules/recruitment/`
Job openings, candidates, applications, recruiter ownership.
Notable: access scoping is **ownership-based** (recruiter owner, creator) rather
than business-unit based.

### Onboarding
`services/api/src/modules/onboarding/`
`EmployeeOnboarding`, `OnboardingTask`, owner and assignee scoping.

### Projects, Documents, Policies
`services/api/src/modules/projects/`, `documents/`, `policies/`

---

## Governance

### Approvals and Workflows
`services/api/src/modules/approvals/`, `workflows/`, `sla/`
Approval matrices with a resolver, workflow runtime and conditions, SLA
tracking.
`TODO: Confirm product/business rule.` — Matrix resolution precedence when
several matrices match.

### Audit and Error Logs
`services/api/src/modules/audit/`, `error-logs/`, `platform-events/`
See `docs/architecture/audit-events.md`.

---

## Commercial

### Leads
`services/api/src/modules/leads/` · `apps/landing` capture ·
`apps/admin` management
Public capture, referral attribution, status transitions, contracting handoff.

### Customers and Partners
`services/api/src/modules/super-admin/` (customer accounts, onboarding) ·
`partners/`, `partner-experience/`
Partner referral links, inquiries, onboarding, commissions.

### Contracts / Agreements
`services/api/src/modules/contracts/`
Contract templates, versions, signature requests, governing agreements,
contracting workflow. Public signing surface at `apps/landing/sign`.
`TODO: Confirm product/business rule.` — Legal validity requirements for the
signature flow; retention obligations.

### Billing
`services/api/src/modules/billing/`, `super-admin/`
Stripe integration, plans and prices, subscriptions, invoices (with PDF),
payments, promotions.
Notable: the Stripe webhook needs a **raw body** — body parsing in `main.ts` is
configured specifically for it.

### Support
`services/api/src/modules/support-cases/`, `platform-monitoring/`

---

## Platform

### Tenant Provisioning
`services/api/src/modules/tenants/`, `super-admin/tenant-provisioning.service.ts`,
`platform-onboarding.service.ts`, `platform-lifecycle.service.ts`
System subdomains, custom domains with verification and SSL status, lifecycle
states.
`TODO: Confirm product/business rule.` — The full commercial provisioning
sequence from signed contract to active tenant.

### Settings
`services/api/src/modules/tenant-settings/`, `settings-runtime/`,
`customization/`, `lookups/`, `views/`, `navigation/`, `data/` ·
`apps/web/app/(authenticated)/settings/`
**Canonical contract: `docs/architecture/settings-and-branding.md`.**
Includes field security, feature access, enterprise configuration, branding,
active organization resolution.

### Integrations
`services/api/src/modules/attendance-integrations/` · `gateway/` (.NET) ·
`tools/zkteco-poc/` · `app-releases/`
Device connectors, on-premise gateway with service credentials, ingestion
pipeline, provisioning planner, application release distribution.
`TODO: Confirm product/business rule.` — Supported device vendors and models;
on-prem deployment expectations.

### Platform Operations
`platform-auth/`, `platform-users/`, `platform-events/`,
`platform-monitoring/`, `platform-communications/`, `platform-runtime/`,
`demo-data/`, `data-management/`, `dashboard/`, `reports/`, `inbox/`,
`notifications/`, `agent/`

---

## Per-module note template

```markdown
# Module — <name>

## Purpose
## Users / roles
## Key business rules          ← mark unconfirmed ones
## Data model                  ← model names, not schema dumps
## Backend                     ← module paths
## Frontend                    ← route + runtime spec/adapter paths
## Permissions
## Tenant scoping notes
## Settings that affect it
## Integrations
## Known limitations
## Open questions
## Related modules / ADRs / features
```

## Related

[[DijiPeople]] · [[Product Overview]] · [[Architecture Index]]
