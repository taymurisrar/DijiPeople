---
aliases: [Glossary]
type: product-knowledge
last_verified: 2026-08-30
---

# Glossary

Canonical terms, and the schema and UI names that mean the same thing. The
purpose is to stop two people using one word for two things, which is where most
of the confusion in this platform comes from.

Where the implementation is inconsistent, this note records the inconsistency
rather than pretending it away. **Do not rename a technical object to match a
term here.**

---

## Identity and people

| Canonical | Schema | Means | Not |
|---|---|---|---|
| **Identity** | [[entity-identity]] | One person, globally. Unique email, authoritative password, platform-level suspension | A login *to a workspace* |
| **User** | [[entity-user]] | One person's **membership of one tenant** — roles, business unit, sign-in state there | The person; the employee |
| **Employee** | [[entity-employee]] | An employment record in a tenant | A login. `userId` is optional |
| **Platform user** | `PlatformUser` | DijiPeople's own staff. A **separate identity system** | A tenant user with extra permissions |
| **Partner portal user** | `PartnerPortalUser` | A partner's login. A **third** identity system | Either of the above |

Three identity systems is a deliberate design, not duplication — see
[[decision-platform-admin-is-a-separate-identity]]. A person can be all three at
once and they share no rows.

## Customer and workspace

| Canonical | Schema | Means | Not |
|---|---|---|---|
| **Customer** | [[entity-customer-account]] | The commercial party — signs, pays, holds the plan | A workspace |
| **Tenant** | [[entity-tenant]] | One workspace, and the isolation boundary | The customer. One customer may own several |
| **Workspace** | — | The **UI term** for a tenant. No model of its own | A separate concept |
| **Subscription** | [[entity-subscription]] | What one tenant is entitled to and billed. **One per tenant** | Per customer |
| **Lead** | `Lead` | An enquiry, before it is a customer | The customer. `CustomerAccount` absorbs it one-to-one |

"Workspace" and "tenant" are the same thing at different altitudes: the product
says workspace, the schema says tenant, and `slug` is the label both resolve on.

## Organisational structure

| Canonical | Schema | Means |
|---|---|---|
| **Organization** | `Organization` | The legal/top structural entity inside a tenant |
| **Business unit** | [[entity-business-unit]] | The **unit of row-level access**, a self-referencing tree. Also models branches, departments and cost centres via `type` |
| **Department** | `Department` | A structural grouping — note `BusinessUnitType` also has `DEPARTMENT`, so the two overlap |
| **Team** | `Team` | A working group, with its own membership and roles |

`BusinessUnit` and `Department` genuinely overlap. `BusinessUnit` is the one
authorization is resolved against; `Department` is not.

## Authorization

| Canonical | Means |
|---|---|
| **Permission key** | The legacy string checked by `@Permissions(...)` — `common/constants/permissions.ts` |
| **Privilege** | The matrix entry checked by `@RequirePermission(...)` — `common/constants/rbac-matrix.ts` |
| **Access level** | How far a role reaches: `USER < BUSINESS_UNIT < PARENT_BU < ORGANIZATION < TENANT` |
| **Entitlement** | What the **plan** allows, checked by `EntitlementGuard`. A tenant admin cannot grant themselves one |
| **Elevated role** | `GLOBAL_ADMIN` or `SYSTEM_ADMIN` — bypasses the permission guard |

Permission, privilege, access level and entitlement are **four different
checks**. Passing one is not passing another, and "permissions" in conversation
usually means only the first two. See [[rbac]].

## Time and pay

| Canonical | Schema | Means |
|---|---|---|
| **Pay component** | `PayComponent` | An earning or deduction line. **The live model** |
| ~~Salary component~~ | `SalaryComponent` | A superseded predecessor with no code. See [[contradictions]] |
| **Attendance day** | `AttendanceDay` | The computed daily result |
| **Attendance entry** | `AttendanceEntry` | A single punch or record contributing to it |
| **Timesheet** | `Timesheet` | Project/task time, separate from attendance |
| **Payroll run** | `PayrollRun` | One execution of payroll for a period |

Attendance and timesheets are **two systems**, not one — attendance answers "were
they at work", timesheets answer "what did they work on".

## Terms with no model

- **Module** — a functional area, in three unrelated senses: an API directory
  under `services/api/src/modules/`, a runtime module in
  `apps/web/lib/runtime/`, and a plan-gated `TenantFeature`. Say which.
- **Platform** — DijiPeople itself, as opposed to a tenant. Also the string
  sentinel `tenantId: 'platform'`, which routes audit rows to
  `PlatformAuditLog` and is **not a tenant row**.
- **Runtime** — metadata-driven UI. Distinct from the settings runtime and the
  platform runtime, which are different subsystems with similar names.

## Related

[[data-model-overview]] · [[domain-map]] · [[entity-tenant|Tenant]] ·
[[entity-employee|Employee]] · [[entity-user|User]] ·
[[entity-identity|Identity]] · [[rbac]] · [[tenant-isolation]] ·
[[contradictions]] · [[dijipeople-platform-overview]]
