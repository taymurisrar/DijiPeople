# Product Areas

> Generated from repository evidence at `ad8f77f`.

The seven areas DijiPeople actually implements, and where each is documented.

## 1. People

Employees, employee levels, employment types, users, teams, organization.

The people record is what nearly everything else hangs off. Its authorization is
also where the "permission for the entity ≠ permission for the data" rule was
learned. → [[employees]], [[organization]]

## 2. Time

Attendance, attendance engine, attendance integrations, timesheets, leave.

Time is money here: it feeds payroll. Device ingestion arrives through an
on-premise gateway and an Electron agent, so idempotency is a first-order
concern. → [[attendance]], [[integration-architecture]]

## 3. Pay

Payroll, payslips, pay components, compensation, tax rules, loans, claims,
benefits, business trips.

The highest correctness bar in the product — and currently the **least
QA-covered**. → [[payroll]]

## 4. Talent

Recruitment, onboarding, projects, documents, policies.

Implemented; not yet covered by any QA run in this repository, so nothing is
asserted about its behaviour here.

## 5. Governance

Approvals, workflows, SLA, audit, error logs, permissions, roles.

The cross-cutting machinery: who may do what, what happened, and what is
guaranteed. → [[approvals]], [[audit-and-events]], [[rbac]]

## 6. Commercial

Leads, partners, partner experience, contracts, support cases, billing,
super-admin (customers, plans, subscriptions, invoices, payments, tenant
provisioning).

**This is DijiPeople selling DijiPeople**, and it is the most thoroughly
exercised area in the repository — 156 scenarios end to end on 2026-08-15. →
[[commercial-onboarding-journey]], [[partner-program]], [[tenant-lifecycle]]

## 7. Configuration and platform operations

Tenant settings, settings runtime, customization, lookups, views, navigation,
data, platform runtime; plus platform auth, users, events, monitoring,
communications, app releases, tenants, demo data, data management, agent,
dashboard, inbox, reports.

What makes one codebase serve many tenants without forking. → [[settings]],
[[runtime-module-system]], [[platform-admin]]

## Related

[[dijipeople-platform-overview]] · [[employee-hr-platform]] ·
[[system-architecture]]
