---
aliases: [Employee]
type: entity
model: Employee
last_verified: 2026-08-30
---

# Employee

## Purpose

The people record at the centre of the tenant product, and the second most
connected model in the schema after [[entity-tenant|Tenant]] — **85 relation
ends**. Attendance, timesheets, leave, payroll, claims, loans, approvals,
onboarding and projects all hang off it.

It is not the sign-in account. See [[entity-user|User]] and
[[entity-identity|Identity]]; `userId` here is **optional**, because somebody on
the payroll need not have a login.

## Four status fields, and only one is enforced by the database

This is the single most important thing to understand about this model, and the
place most mistakes originate.

| Field | Type | Enforced by | Answers |
|---|---|---|---|
| `employmentStatus` | `EmployeeEmploymentStatus` enum | **the database** | The HR fact: `ACTIVE`, `INACTIVE`, `PROBATION`, `NOTICE`, `TERMINATED` |
| `status` | plain `String` | application only | The record's lifecycle: `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `subStatus` | plain `String` | application only | Where in that lifecycle: `DATA_COLLECTION`, `ONBOARDING`, `READY_FOR_ACTIVATION`, … |
| `isDraftProfile` | `Boolean` | — | Whether the record is still a draft |

The permitted values for `status` and `subStatus` live in
`modules/employees/employee-lifecycle.constants.ts`, **not** in the schema.
Nothing in the database prevents any other string.

The employment axis and the record axis are genuinely different questions — a
half-entered record for somebody who has not started is `DRAFT` *and*
`INACTIVE` — so having both is a real design, not an accident.

`isDraftProfile` is the problem. It duplicates `status === 'DRAFT'`, and the two
directions of the code disagree about which one leads. See
[[contradictions]] before writing anything that reads either. In short: on
**write**, `status` is authoritative and `isDraftProfile` is derived from it; on
**read**, `mapEmployee` lets `isDraftProfile` override the stored `status`,
`subStatus` *and* `employmentStatus` on the way out — so the API response can
disagree with the row, and consumers that query the database directly see the
other answer.

## Soft delete exists here, and almost nowhere else

`isDeleted`, `deletedAt` and `deletedById` are present. **Do not generalise
this.** Only a handful of models carry soft delete, and assuming it exists
elsewhere produces queries that silently return deleted rows on models that have
no such column, or that filter on a column that is not there.

Every read of this model must filter `isDeleted: false` unless it is
deliberately reporting on deleted records.

## Tenant-safe identity

`@@unique([id, tenantId])` is unusual and deliberate: it lets other tenant-owned
models reference an employee with a **composite** foreign key, so the reference
itself cannot cross a tenant boundary. The business keys —
`@@unique([tenantId, employeeCode])`, `[tenantId, email]`,
`[tenantId, personalEmail]`, `[tenantId, cnic]` — are all tenant-composite, never
bare. That is the rule for every tenant-owned model; see [[tenant-isolation]].

## Emergency contact is stored twice

Five denormalised fields — `emergencyContactName`, `emergencyContactPhone`,
`emergencyContactAlternatePhone`, `emergencyContactRelation`,
`emergencyContactRelationTypeId` — sit on this model, **and** an
`EmergencyContact` model exists with a relation to it.

`EmergencyContact` has no read or write anywhere in the repository. The
denormalised fields are the live implementation; the model is vestigial. Recorded
in [[known-gaps]]. The same shape applies to `EmployeeDocumentReference`.

## Self-reference: the reporting line

`managerEmployeeId` points at another `Employee` in the same tenant. This is what
makes the authorization surface wide rather than narrow: `assertEmployeeAccess`
clears a reporting manager **for their entire subtree**, not just direct reports.
That is the fact behind
[[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] — a
compensation exposure that reached far further than it first appeared.

## Security

**Authorization must match the sensitivity of the data returned, not the entity
it hangs off.** `taxIdentifier` lives on this model, and `basicSalary`,
`bankAccountNumber`, `bankIban` and `bankRoutingNumber` reach clients *through*
it because `getProfile` embeds the current compensation. All of them require a
compensation or payroll permission and are returned through an explicit
`select` — never `include` everything.

`cnic` and `dateOfBirth` are national-identity and personal data. Treat a change
that widens who can read this model as a security change, not a UI change.

Regression cover: REG-001, `employee-compensation-access.spec.ts`, proven to
fail without the fix.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.employee` |
| Owning module | `services/api/src/modules/employees` |
| Domain | People |
| Also touched by | `onboarding`, `attendance-integrations`, `dashboard` (reads), `users`, `recruitment`, `attendance-engine` (reads), `organization` (reads), `payroll` (reads), and 26 more |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `employeeCode` | `String` | yes | — |
| `recordType` | `EmployeeRecordType` (enum) | yes | default `INTERNAL_EMPLOYEE` |
| `firstName` | `String` | yes | — |
| `middleName` | `String` | no | — |
| `lastName` | `String` | yes | — |
| `preferredName` | `String` | no | — |
| `profileImageDocumentId` | `String` | no | unique |
| `email` | `String` | no | — |
| `personalEmail` | `String` | no | — |
| `phone` | `String` | yes | — |
| `alternatePhone` | `String` | no | — |
| `dateOfBirth` | `DateTime` | no | — |
| `gender` | `EmployeeGender` (enum) | no | — |
| `maritalStatus` | `EmployeeMaritalStatus` (enum) | no | — |
| `nationalityCountryId` | `String` | no | — |
| `nationality` | `String` | no | — |
| `cnic` | `String` | no | — |
| `bloodGroup` | `String` | no | — |
| `employmentStatus` | `EmployeeEmploymentStatus` (enum) | yes | default `ACTIVE` |
| `employeeType` | `EmployeeType` (enum) | no | — |
| `employmentTypeId` | `String` | no | — |
| `workMode` | `EmployeeWorkMode` (enum) | no | — |
| `contractType` | `EmployeeContractType` (enum) | no | — |
| `hireDate` | `DateTime` | yes | — |
| `confirmationDate` | `DateTime` | no | — |
| `probationEndDate` | `DateTime` | no | — |
| `terminationDate` | `DateTime` | no | — |
| `organizationId` | `String` | no | — |
| `departmentId` | `String` | no | — |
| `businessUnitId` | `String` | no | — |
| `teamId` | `String` | no | — |
| `designationId` | `String` | no | — |
| `employeeLevelId` | `String` | no | — |
| `locationId` | `String` | no | — |
| `defaultWorkScheduleId` | `String` | no | — |
| `holidayCalendarId` | `String` | no | — |
| `officialJoiningLocationId` | `String` | no | — |
| `managerEmployeeId` | `String` | no | — |
| `userId` | `String` | no | unique |
| `addressLine1` | `String` | no | — |
| `addressLine2` | `String` | no | — |
| `countryId` | `String` | no | — |
| `stateProvinceId` | `String` | no | — |
| `cityId` | `String` | no | — |
| `city` | `String` | no | — |
| `stateProvince` | `String` | no | — |
| `country` | `String` | no | — |
| `postalCode` | `String` | no | — |
| `emergencyContactName` | `String` | no | — |
| `emergencyContactRelationTypeId` | `String` | no | — |
| `emergencyContactRelation` | `String` | no | — |
| `emergencyContactPhone` | `String` | no | — |
| `emergencyContactAlternatePhone` | `String` | no | — |
| `noticePeriodDays` | `Int` | no | — |
| `taxIdentifier` | `String` | no | — |
| `isDraftProfile` | `Boolean` | yes | default `false` |
| `sourceCandidateId` | `String` | no | — |
| `sourceApplicationId` | `String` | no | unique |
| `sourceJobOpeningId` | `String` | no | — |
| `ownerUserId` | `String` | no | — |
| `status` | `String` | yes | default `"ACTIVE"` |
| `subStatus` | `String` | yes | default `"OPEN"` |
| `deletedAt` | `DateTime` | no | — |
| `deletedById` | `String` | no | — |
| `isDeleted` | `Boolean` | yes | default `false` |

### States

- `recordType` — `EmployeeRecordType`: `INTERNAL_EMPLOYEE`, `EXTERNAL_WORKER`, `CONTRACTOR`
- `gender` — `EmployeeGender`: `FEMALE`, `MALE`, `NON_BINARY`, `PREFER_NOT_TO_SAY`
- `maritalStatus` — `EmployeeMaritalStatus`: `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED`, `SEPARATED`
- `employmentStatus` — `EmployeeEmploymentStatus`: `ACTIVE`, `INACTIVE`, `PROBATION`, `NOTICE`, `TERMINATED`
- `employeeType` — `EmployeeType`: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`, `CONSULTANT`
- `workMode` — `EmployeeWorkMode`: `OFFICE`, `REMOTE`, `HYBRID`, `FIELD`
- `contractType` — `EmployeeContractType`: `PERMANENT`, `FIXED_TERM`, `FREELANCE`, `TEMPORARY`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-user|User]] via `user` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `ownerUser` (optional) — `onDelete: SetNull`
- `Document` via `profileImageDocument` (optional) — `onDelete: SetNull`
- `Country` via `countryLookup` (optional) — `onDelete: SetNull`
- `StateProvince` via `stateProvinceLookup` (optional) — `onDelete: SetNull`
- `City` via `cityLookup` (optional) — `onDelete: SetNull`
- `RelationType` via `emergencyContactRelationType` (optional) — `onDelete: SetNull`
- `Organization` via `organization` (optional) — `onDelete: Restrict`
- `Department` via `department` (optional) — `onDelete: SetNull`
- [[entity-business-unit|BusinessUnit]] via `businessUnit` (optional) — `onDelete: Restrict`
- `Team` via `team` (optional) — `onDelete: SetNull`
- `Designation` via `designation` (optional) — `onDelete: SetNull`
- `EmployeeLevel` via `employeeLevel` (optional) — `onDelete: Restrict`
- `EmploymentType` via `employmentTypeRef` (optional) — `onDelete: Restrict`
- `Location` via `location` (optional) — `onDelete: SetNull`
- `WorkSchedule` via `defaultWorkSchedule` (optional) — `onDelete: SetNull`
- `HolidayCalendar` via `holidayCalendar` (optional) — `onDelete: SetNull`
- `Location` via `officialJoiningLocation` (optional) — `onDelete: SetNull`
- [[entity-employee|Employee]] via `manager` (optional) — `onDelete: SetNull`
- `Candidate` via `sourceCandidate` (optional) — `onDelete: SetNull`
- `Application` via `sourceApplication` (optional) — `onDelete: SetNull`
- `JobOpening` via `sourceJobOpening` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- **62 child relations** — too many to list usefully. See [[domain-map]] for the full model inventory, grouped by domain.

### Constraints and indexes

- Unique: `profileImageDocumentId`, `userId`, `sourceApplicationId`, `@@unique([id, tenantId])`, `@@unique([tenantId, employeeCode])`, `@@unique([tenantId, email])`, `@@unique([tenantId, personalEmail])`, `@@unique([tenantId, cnic])`
- Indexes: 22
<!-- /GENERATED:schema-facts -->

## Related

[[entity-user|User]] · [[entity-tenant|Tenant]] ·
[[entity-business-unit|BusinessUnit]] · [[employees]] · [[rbac]] ·
[[tenant-isolation]] · [[contradictions]] · [[known-gaps]] ·
[[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] ·
pattern [[sensitive-field-overexposure]] · [[data-model-overview]] ·
[[domain-map]]
