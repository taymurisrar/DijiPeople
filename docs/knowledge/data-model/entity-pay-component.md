---
aliases: [PayComponent]
type: entity
model: PayComponent
last_verified: 2026-08-30
---

# PayComponent

## Purpose

**One line that can appear on a payslip** — a basic salary, an allowance, a tax,
a deduction, an employer contribution. `PayComponent` is the tenant's
configuration of what payroll can produce, and at **34 relation ends** it is the
most connected model in the Pay domain.

It is the live model. `SalaryComponent` is a superseded predecessor with no code
anywhere; see [[contradictions]] before using the more obvious name.

## `componentType` is not `componentCategory`

- **`componentType`** — a real enum: `EARNING`, `ALLOWANCE`, `REIMBURSEMENT`,
  `DEDUCTION`, `TAX`, `EMPLOYER_CONTRIBUTION`, `ADJUSTMENT`. This is what payroll
  branches on.
- **`componentCategory`** — a plain `String` defaulting to `"BASIC"`. Unconstrained,
  tenant-facing grouping.

Only the first is defended by the database. Do not branch calculation logic on
`componentCategory`.

`EMPLOYER_CONTRIBUTION` is the one that catches people: it costs the employer and
does **not** reduce net pay, which is why `affectsGrossPay` and `affectsNetPay`
are separate booleans rather than derived from the type.

## Four calculation methods, and the fields each one needs

| `calculationMethod` | Reads |
|---|---|
| `FIXED` | `fixedAmount` |
| `PERCENTAGE` | `percentage` and `percentageBaseComponentId` |
| `FORMULA` | `formulaExpression` |
| `MANUAL` | Nothing — entered per employee per run |
| `SYSTEM_CALCULATED` | Nothing — the engine owns it (tax, statutory) |

Every one of those inputs is nullable, so **the schema cannot enforce that a
`PERCENTAGE` component has a percentage**. That validation lives in the service,
and a component configured through any path that skips it produces a zero line
rather than an error.

`percentageBaseComponentId` is a self-reference — a percentage *of another
component*. Nothing in the schema prevents a cycle. Treat cycle detection as the
service's job, and assume it is needed.

## Bounds and rounding are part of the definition

`minimumAmount`, `maximumAmount`, `roundingMethod` and `prorationBasis` all
participate in the computed value. `prorationBasis` and `roundingMethod` are
unconstrained `String`s with defaults of `"NONE"` — two more places where the
permitted values live in code rather than in the database.

Getting rounding wrong is not a display bug. It changes what is paid.

## Effective dating, and `version`

`effectiveFrom` / `effectiveTo` bound when a component applies;
`status: ConfigurationStatus` (`DRAFT`, `ACTIVE`, `INACTIVE`, `EXPIRED`,
`ARCHIVED`) is its own lifecycle beside them, and `version` increments on change.

A payroll run must resolve components **as at the period**, not as at now.
Reading the current row to explain a historical payslip gives the wrong answer
whenever a component has been edited since — which is what
`PayrollInputSnapshot` exists to prevent.

## Two visibility flags

`displayOnPayslip` and `employeeVisible` are different questions: whether the
line is printed, and whether the employee may see the component's configuration.
An employer contribution is commonly the first and not the second.

## Security

Configuration of this model **is** payroll authority — creating a component with
`affectsNetPay` changes what people are paid. It belongs behind pay-component
permissions, not general settings permissions, and every change should carry an
audit entry with before and after snapshots.

`defaultDebitAccountId` and `defaultCreditAccountId` reach into the GL through
`PayrollPostingRule`, so a change here can also alter accounting output.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.payComponent` |
| Owning module | `services/api/src/modules/pay-components` |
| Domain | Pay |
| Also touched by | `payroll`, `compensation` (reads), `tax-rules` (reads), `benefits` (reads), `loans` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | `String` | yes | — |
| `name` | `String` | yes | — |
| `description` | `String` | no | — |
| `organizationId` | `String` | no | — |
| `legalEntityId` | `String` | no | — |
| `ownerUserId` | `String` | no | — |
| `status` | `ConfigurationStatus` (enum) | yes | default `ACTIVE` |
| `isDefault` | `Boolean` | yes | default `false` |
| `componentCategory` | `String` | yes | default `"BASIC"` |
| `componentType` | `PayComponentType` (enum) | yes | — |
| `calculationMethod` | `PayComponentCalculationMethod` (enum) | yes | — |
| `fixedAmount` | `Decimal` | no | decimal(12,2) |
| `percentage` | `Decimal` | no | decimal(8,4) |
| `percentageBaseComponentId` | `String` | no | — |
| `formulaExpression` | `String` | no | — |
| `eligibilityAppliesTo` | `String` | yes | default `"ALL_EMPLOYEES"` |
| `effectiveFrom` | `DateTime` | no | — |
| `effectiveTo` | `DateTime` | no | — |
| `prorationBasis` | `String` | yes | default `"NONE"` |
| `minimumAmount` | `Decimal` | no | decimal(12,2) |
| `maximumAmount` | `Decimal` | no | decimal(12,2) |
| `roundingMethod` | `String` | yes | default `"NONE"` |
| `defaultDebitAccountId` | `String` | no | — |
| `defaultCreditAccountId` | `String` | no | — |
| `isTaxable` | `Boolean` | yes | default `false` |
| `affectsGrossPay` | `Boolean` | yes | default `true` |
| `affectsNetPay` | `Boolean` | yes | default `true` |
| `isRecurring` | `Boolean` | yes | default `false` |
| `requiresApproval` | `Boolean` | yes | default `false` |
| `displayOnPayslip` | `Boolean` | yes | default `true` |
| `employeeVisible` | `Boolean` | yes | default `true` |
| `displayOrder` | `Int` | yes | default `0` |
| `isActive` | `Boolean` | yes | default `true` |
| `version` | `Int` | yes | default `1` |

### States

- `status` — `ConfigurationStatus`: `DRAFT`, `ACTIVE`, `INACTIVE`, `EXPIRED`, `ARCHIVED`
- `componentType` — `PayComponentType`: `EARNING`, `ALLOWANCE`, `REIMBURSEMENT`, `DEDUCTION`, `TAX`, `EMPLOYER_CONTRIBUTION`, `ADJUSTMENT`
- `calculationMethod` — `PayComponentCalculationMethod`: `FIXED`, `PERCENTAGE`, `FORMULA`, `MANUAL`, `SYSTEM_CALCULATED`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-pay-component|PayComponent]] via `percentageBaseComponent` (optional) — `onDelete: SetNull`
- `PayrollGlAccount` via `defaultDebitAccount` (optional) — `onDelete: SetNull`
- `PayrollGlAccount` via `defaultCreditAccount` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `EmployeeCompensationComponent` via `compensationComponents`[]
- `SalaryPackageRuleComponent` via `salaryPackageRuleComponents`[]
- `SalaryPackageRuleComponent` via `salaryPackageBaseComponents`[]
- `PayComponentEligibilityRule` via `eligibilityRules`[]
- `PayrollRunLineItem` via `payrollRunLineItems`[]
- `PayrollAdjustment` via `payrollAdjustments`[]
- `PayslipLineItem` via `payslipLineItems`[]
- `TaxRulePayComponent` via `taxRuleMappings`[]
- `PayrollPostingRule` via `payrollPostingRules`[]
- `PayrollJournalEntryLine` via `payrollJournalEntryLines`[]
- [[entity-pay-component|PayComponent]] via `percentageBasedComponents`[]
- `ClaimSubType` via `claimSubTypes`[]
- `OvertimePolicy` via `overtimePolicies`[]

### Constraints and indexes

- Unique: `@@unique([id, tenantId])`, `@@unique([tenantId, code])`
- Indexes: 12
<!-- /GENERATED:schema-facts -->

## Related

[[entity-payroll-run|PayrollRun]] · [[entity-employee|Employee]] ·
[[entity-tenant|Tenant]] · [[payroll]] · [[contradictions]] · [[rbac]] ·
[[data-model-overview]] · [[domain-map]] · [[glossary]]
