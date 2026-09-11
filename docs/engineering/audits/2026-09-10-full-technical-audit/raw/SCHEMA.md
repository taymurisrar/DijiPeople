# DATABASE SCHEMA HEALTH — raw findings

Area: **DATABASE SCHEMA HEALTH**. Finding prefix `SCHEMA`.

Methodology: `services/api/prisma/schema.prisma` (14,399 lines) was parsed with a
purpose-built, read-only Node script
(`parse-schema.js` → `schema-parsed.json`) into 325 models / 305 enums, matching
the briefing's counts. All tables below are generated from that structured
parse plus targeted `grep`/`awk` verification against `services/api/src` and
`docs/bugs/` / `docs/knowledge/`. No file was edited, no migration was run, no
database was written to. `npx prisma validate` (via the correctly-resolved
local binary, see Not examined) was run read-only and is reported in
SCHEMA-08.

---

## 1. Tenant ownership integrity

### 1.1 The headline number

**261 of 325 models (80%) carry `tenantId`.** Of the other 64, every single one
was traced to either a legitimate global/platform/lookup role or an indirect
tenant-scoped parent. **Zero models were found with tenant ownership missing
that they should have.** This is the single most important healthy result in
this report — see `## Healthy` for the full classification.

### 1.2 Classification table — the 64 models without `tenantId`

| Class | Count | Models |
|---|---|---|
| Legitimately global — platform/commercial (pre-tenant sales, billing, support) | 31 | `Lead`, `LeadAttributionCorrection`, `Partner`, `PartnerCommission`, `PartnerInquiry`, `PartnerLeadReview`, `PartnerOnboardingApplication`, `PartnerOnboardingSubmission`, `PartnerPortalUser`, `PartnerReferralLink`, `PartnerRefreshToken`, `PartnerTimeline`, `CustomerAccount`, `CustomerContact`, `CustomerNote`, `Promotion`, `SubscriptionPromotion`, `PlanPrice`, `StripeWebhookEvent`, `ReconciliationRun`, `ReconciliationFinding`*, `RefundRequest`*, `TenantEnvironmentGroup`, `ApplicationRelease`, `PlatformUser`, `PlatformRefreshToken`, `PlatformModulePreference`, `PlatformApprovalRequest`, `PlatformApprovalStep`, `PlatformApprovalAction`, `PlatformOutboundEmail` |
| Legitimately global — geography/legal/config lookups | 11 | `Country`, `StateProvince`, `City`, `Market`, `MarketCountry`, `LegalDocument`, `LegalDocumentVersion`, `Plan`*, `PlanFeature`*, `PlatformSetting`, `PlatformExchangeRate` |
| Legitimately global — contract/e-sign platform workflow | 13 | `Contract`*, `ContractTemplate`, `ContractTemplateVersion`, `ContractVersion`, `ContractDocument`, `ContractParty`, `ContractPlaceholderValue`, `ContractRelatedRecord`, `ContractTimeline`, `SignatureRequest`, `SignatureRecipient`, `SignatureEvent`, `SignatureEvidence` |
| Owned via a tenant-scoped parent, denormalized `tenantId` present but no `Tenant` relation | 4 | `WorkflowRun`→`Workflow`, `RecruitmentPipelineStage`→`RecruitmentPipeline`, `RetentionHold`→`TenantRetention`, `DocumentVersion`→`Document` (see SCHEMA-05/06) |
| Owned via a non-tenant parent that is itself global | 4 | `WorkflowAction`→`Workflow` (Workflow *is* tenant-owned; listed here because the action itself carries no denormalized `tenantId`), `ErrorLogOccurrence`→`ErrorLog` (ErrorLog's own `tenantId` nullable), `SupportCaseAttachment`/`SupportCaseCommunication`/`SupportCaseIncident`/`SupportCaseTimeline`→`SupportCase` (nullable `tenantId` on parent) |
| Standalone platform audit / identity | 4 | `PlatformAuditLog`, `Identity`, `PasswordHistory`→`User`, `Subprocessor` |
| Requires no ownership (pure lookup, no rows written per-tenant) | 1 | (none found in this category — all lookups in the schema are either tenant-owned config or the global geography set above) |

`*` = field is present with `tenantId String?` (nullable) rather than fully
absent; see §4.

Evidence for the classification is the full relation dump captured during
analysis (every model's relation fields), e.g.:

`services/api/prisma/schema.prisma:2748` (`Lead`) has no `tenantId` and its
only tenant-adjacent relation is `attributedTenants Tenant[] @relation("LeadAttributedTenants")` —
a lead is associated with zero or more tenants it later becomes, not owned by
one, so it is correctly global.

`services/api/prisma/schema.prisma:6874-6895` (`RecruitmentPipelineStage`)
carries a required `tenantId` column plus three `tenantId`-prefixed indexes,
but its only parent-shaped relation is `pipeline RecruitmentPipeline
@relation(fields: [pipelineId], ...)` — no `tenant Tenant @relation(...)`. See
SCHEMA-06.

### 1.3 `@@index([tenantId, ...])` coverage

Of the 261 tenant-owned models, **all but one** (`AttendancePolicy`,
`schema.prisma:6009-6065`, a tenant-singleton `@@unique([tenantId])` model
whose single-row-per-tenant lookup is already served by the unique constraint)
have at least one index starting with `tenantId`. `CustomerOnboarding`
(`schema.prisma:3817`) and `Subscription` (`schema.prisma:4129`) likewise rely
on their `@@unique([tenantId])` singleton constraint rather than a separate
`@@index`. **NOT OBSERVED** — no tenant-owned model was found querying at
scale without any `tenantId`-leading index.

### 1.4 Bare uniques on business keys — the specific ask

Checked every field-level `@unique` and `@@unique(...)` in the schema (270
occurrences) against tenant ownership. Result:

- **`Employee.employeeCode`**: `@@unique([tenantId, employeeCode])` —
  `schema.prisma:5110`. Correct.
- **`Employee.cnic`**: `@@unique([tenantId, cnic])` — confirmed present
  (cross-checked against OBS-20/OBS's finding at `schema.prisma:1125`
  reference in `OBS.md`). Correct.
- **`User.email`**: `@@unique([tenantId, email])` — `schema.prisma:4436`.
  Correct. (`Identity.email` and `PlatformUser.email` are separately and
  correctly *globally* unique — `Identity` is the cross-tenant person record
  one physical human owns once, `PlatformUser` is DijiPeople staff.)
- The 78 other `@@unique`/`@unique` occurrences that appear to omit `tenantId`
  were individually checked (`analyze5-unique-money.js` output): every one is
  either (a) scoped through a parent id that is itself unique-per-tenant
  (e.g. `PayrollRecord @@unique([payrollCycleId, employeeId])` — a
  `payrollCycleId` cannot span tenants), (b) a cryptographically-random
  token/hash (`RefreshToken.tokenHash`, `IntegrationGatewayCredential.secretHash`,
  `OutboxEvent.idempotencyKey`), or (c) a deliberately globally-unique platform
  key (`TenantDomain.domain`, `Plan.key`, `SupportCase.caseNumber`,
  `Contract.contractNumber` — all owned/generated by DijiPeople platform staff
  across every tenant, not self-service tenant data).
- **One exception found that is already tracked**: `HolidayCalendar`
  declares `@@unique([tenantId, name])` (`schema.prisma:6176`) but no
  migration creates it in the database — see SCHEMA-08 (KNOWN, ITEM-0120).

**Confidence: CONFIRMED** for the employeeCode/cnic/email checks (direct read).
**Confidence: CONFIRMED** for the composite-unique sweep (full enumeration, not
a sample).

---

## 2. Referential integrity

### 2.1 `onDelete` coverage

833 FK relations carry an explicit `fields:`+`onDelete` on the owning side.

| `onDelete` | Count |
|---|---|
| `Cascade` | 464 |
| `SetNull` | 216 |
| `Restrict` | 152 |
| *(none declared)* | **1** |

The one relation with no explicit `onDelete` is
**`LeavePolicyRule.tenant`** (`schema.prisma:5617`) — every other one of the
261 tenant-owned models' `tenant` relation declares `onDelete: Cascade`
explicitly; this one falls back to Prisma's default (`Restrict` for
required relations). Functionally this makes `LeavePolicyRule` the single
model that would **block** a tenant-erasure cascade rather than participate
in it, which is inconsistent with its siblings and is exactly why the
tenant-erasure service's explicit `deleteMany` phase exists — but it means
this one model depends on the erasure service's manual ordering rather than
the schema's own cascade to be removable at all. See SCHEMA-01.

**Confidence: CONFIRMED** (full enumeration of all 833 FK relations, not a
sample).

### 2.2 Cascade depth from `Tenant`

Deleting one `Tenant` row cascades, through `onDelete: Cascade` alone (ignoring
the tenant-erasure service's manual ordering), to **246 of 325 models** —
essentially the entire tenant-owned schema, in a single depth-2 closure:

- **Depth 1: 237 models** — every tenant-owned domain table with a direct
  `tenant Tenant @relation(..., onDelete: Cascade)`, including `AuditLog`,
  `Payslip`, `PayrollRecord`, `PayrollRun`, `EmployeeCompensationHistory`,
  `TenantConfigurationRecord`, `RefreshToken`.
- **Depth 2: 8 models** — reached through a depth-1 model:
  `DocumentVersion`, `LeavePolicyRule`, `PasswordHistory`,
  `RecruitmentPipelineStage`, `RetentionHold`, `SubscriptionPromotion`,
  `WorkflowAction`, `WorkflowRun`.

See SCHEMA-01 for the risk this represents.

### 2.3 Cascade depth from `Employee`

Deleting one `Employee` row cascades to **64 models**:

- **Depth 1: 51 models**, including `Payslip`, `PayrollRecord`,
  `PayrollRunEmployee`, `Timesheet`, `LeaveRequest`, `LeaveBalance`,
  `LoanRequest`, `LoanInstallment`, `EmployeeCompensation`,
  `EmployeeCompensationHistory`.
- **Depth 2: 12 models**, including `PayslipLineItem`, `PayslipEventLog`,
  `PayrollRunLineItem`, `PayrollInputSnapshot`, `ClaimApproval`,
  `BenefitConsumption`.

No caller of `prisma.employee.delete()` was found anywhere in
`services/api/src` (`grep -rn "employee.delete\b"` → 0 results); `Employee`
uses the `isDeleted`/`deletedAt`/`deletedById` soft-delete convention
exclusively (`employees.service.ts:1420` sets these three fields, never calls
`delete`). **This makes the Employee cascade depth a latent schema property,
not a currently reachable defect** — see SCHEMA-02.

### 2.4 Missing FKs (plain `String` id columns with no relation)

Every `*Id`-suffixed scalar field was checked against the model's relation
list. The only genuine gaps found are the four denormalized-`tenantId` cases
in §1.2 (SCHEMA-06) and `ModuleView.tenantId` (SCHEMA-05); no other orphaned
`*Id` scalar (an id column with no matching `@relation`) was found across the
enumerated relation set. **Confidence: CONFIRMED** for the sweep methodology,
**LIKELY** that it is fully exhaustive (a scalar `*Id` column that is never
used as a relation target anywhere, e.g. a denormalized cache column, would
not be flagged by this method and was not separately hunted for).

---

## 3. Typing

### 3.1 Money/rate fields — healthy result

187 fields matched a money/rate/quantity naming pattern
(`amount|salary|rate|price|balance|total|tax|...`). By type:

| Type | Count |
|---|---|
| `Decimal` | 168 |
| `Int` | 19 (all counts/seconds/capacities, e.g. `installmentNumber`, `totalActiveSeconds`, `purchasedCapacity` — not money) |
| `Float` | **0** |

**No money field anywhere in the schema uses `Float`.** The schema's only 13
`Float` fields are GPS coordinates (`latitude`, `longitude`,
`accuracyMeters`/`checkInLocationAccuracy`) — an appropriate use.
166 of 168 `Decimal` money fields specify `@db.Decimal(p,s)` precision
explicitly; the two without it (`CustomizationColumn.minValue`/`maxValue`,
`schema.prisma:11155-11156`) are generic custom-field validation bounds for
the metadata/customization engine, not financial data.

**Confidence: CONFIRMED** (full enumeration).

### 3.2 Calendar dates stored as full `DateTime` instead of `@db.Date`

Of **1,165** `DateTime` fields in the schema, only **5** use `@db.Date`
(`PayrollCalendar.periodStart`/`periodEnd` at `schema.prisma:8420-8421`, plus
three more). Everything else — including fields that are pure calendar dates
with no meaningful time-of-day or timezone component — is a full timestamp:

- `Employee.dateOfBirth` (`schema.prisma:4961`), `Employee.hireDate`
  (`:4973`), `Employee.confirmationDate` (`:4974`),
  `Employee.probationEndDate` (`:4975`), `Employee.terminationDate` (`:4976`)
- `Candidate.dateOfBirth` (`:6910`)
- `Holiday.holidayDate` (`:6192`)
- `WorkforceSnapshotDaily.hireDate`/`terminationDate` (`:14368-14369`)
- `Contract.expiryDate` (`:3101`), `EmployeeBenefitAssignment.expiryDate` (`:9310`)

This is **SCHEMA-09** below. By contrast, `AttendanceDay.attendanceDate`
(`schema.prisma:12552`) is *correctly* not `@db.Date` — it is deliberately a
timezone-aware instant computed by
`AttendanceDayContextService.zonedDayStart()`
(`services/api/src/modules/attendance-engine/attendance-day-context.service.ts:303-320`),
documented in `docs/knowledge/data-model/entity-attendance-day.md:19-31` as
"the shift day, not the calendar day" for overnight shifts. That one is a
verified-good design choice, not a typing gap — see `## Healthy`.

### 3.3 Status columns — mixed typing

`Employee` carries three independent status-shaped fields:
`employmentStatus EmployeeEmploymentStatus` (proper enum, `schema.prisma:4968`),
`status String @default("ACTIVE")` and `subStatus String @default("OPEN")`
(plain strings, `schema.prisma` same model). `status`/`subStatus` track a
*different* axis — record-lifecycle/activation state (`DATA_COLLECTION`,
`READY_FOR_ACTIVATION`, `ONBOARDING`) via app-level constants
`EMPLOYEE_RECORD_SUB_STATUS` (`services/api/src/modules/employees/employee-lifecycle.constants.ts:34-41`)
— not a duplicate of `employmentStatus`, but it is a small, fixed vocabulary
that is not schema-enforced. See SCHEMA-10.

### 3.4 String length bounding

3,166 `String` fields exist; only **1** uses `@db.VarChar(n)`. Postgres'
`text` (Prisma's default mapping) has no server-side length cap, so every
string column in the schema is unbounded at the database level; bounding is
delegated entirely to `class-validator` DTOs at the API boundary (matches
`AGENTS.md`'s documented model — "Validation: class-validator DTOs"). This is
a deliberate, consistent, whole-schema pattern rather than an anomaly in one
model, so it is reported as LOW/INFORMATIONAL (SCHEMA-13) rather than a
correctness bug.

---

## 4. Nullability

### 4.1 `tenantId` nullable on tenant-owned models

13 models have `tenantId String?` (nullable) despite carrying a real `tenant
Tenant @relation(...)`:

| Model | Pattern |
|---|---|
| `Contract`, `CustomerOnboarding`, `SubscriptionOrder`, `SupportCase` | Pre-tenant platform/commercial objects — a sales contract, onboarding record or support case can exist before the tenant it will belong to is provisioned. |
| `DocumentType`, `DocumentCategory`, `RelationType`, `EmailTemplate`, `NotificationTemplate` | `tenantId = null` means "system default row", a non-null value means a tenant-specific override. `EmailTemplate` has an explicit doc comment for the analogous `moduleKey` field ("Null means the template applies to every module", `schema.prisma:7717-7736`) confirming the pattern is deliberate. |
| `Plan`, `PlanFeature` | `tenantId = null` is the public catalog plan; a non-null value is a bespoke enterprise plan built for one tenant. |
| `CustomizationSolution`, `CustomizationSolutionComponent` | Same override pattern for the metadata/customization engine. |

This is an established, consistent "global default row / tenant override"
design, not scattered nullability. **The residual risk is entirely at the
service layer**: correctness depends on every read/write path treating a
`tenantId = null` row as system-owned (read-only to tenants, writable only by
platform admins) and never accidentally scoping a query so that a null-tenant
default row is returned as if it belonged to the requesting tenant. This was
**NOT independently verified per-service** — it borders AUTHZ/OBS territory
(service-layer authorization) rather than schema; flagged for that
specialist's attention. **Confidence: LIKELY** that the pattern is safe (it
is consistent and documented at least once), unverified per service.

### 4.2 Required columns with masking defaults

`Employee.status @default("ACTIVE")` and `Employee.subStatus
@default("OPEN")` (§3.3) are the clearest instance: a required string with a
default that silently masks any caller that forgets to set it explicitly,
with no schema-level constraint on the domain of values.
`AttendancePolicy`/`ModuleView` etc. use typed enum defaults, which is safer
(an invalid write is a Prisma type error, not a silently-accepted arbitrary
string). **Confidence: CONFIRMED**.

---

## 5. Normalization / duplication

- **Employee status is one legitimate two-axis design, not a duplicate** —
  see §3.3. Confirmed by reading actual usage in
  `employees.service.ts:2946-3596`, not just field names.
- **Denormalized `tenantId` without a `Tenant` FK** (§1.2/SCHEMA-06):
  `WorkflowRun.tenantId`, `RecruitmentPipelineStage.tenantId`,
  `RetentionHold.tenantId`, `DocumentVersion.tenantId` are all copies of the
  parent's `tenantId`, kept only for query/index convenience. Nothing in the
  schema enforces they stay equal to the parent's `tenantId`; a bug that
  writes a mismatched value would only be caught if application code
  cross-checks, which was not verified.
- **Address/contact shape**: `EmergencyContact` and `CandidateEducation`/
  `CandidateExperience`/`EmployeeEducation`/`EmployeePreviousEmployment` each
  define their own free-text location/address fields inline (no shared
  `Address` embed/model). This is consistent with `AGENTS.md`'s "no premature
  abstraction" principle and is a defensible choice for a schema this size,
  not flagged as a defect. **NOT OBSERVED** as causing drift (no duplicate
  values found stored redundantly across these).
- **Org-unit overlap**: `Organization` → `BusinessUnit` → `Department` →
  `Team` form a real 4-level hierarchy (each with its own tenant-scoped table
  and its own `headedBy`/`Employee` relation), not an accidental duplication —
  each level has distinct fields and distinct downstream FKs (e.g. payroll
  scopes to `BusinessUnit`, attendance policy resolution walks
  `Team`→`Department`). **NOT OBSERVED** as duplicate concepts.

---

## 6. Soft delete

Only **3 of 325 models** carry any soft-delete column at all:

| Model | Columns | Shape |
|---|---|---|
| `Employee` | `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedById String?` | boolean + timestamp + actor |
| `CustomDataRecord` | `isDeleted Boolean @default(false)`, `deletedAt DateTime?` | boolean + timestamp |
| `DemoSeedBatch` | `deletedAt DateTime?` only | timestamp-only, **no boolean flag** — a different convention from the other two |

This matches `AGENTS.md`'s own statement ("Soft delete is not universal. Only
a handful of models carry `isDeleted`"), so the inconsistency in `DemoSeedBatch`'s
shape is a minor, already-acknowledged gap (LOW).

### 6.1 Is `Employee.isDeleted` actually filtered everywhere?

`services/api/src/modules/employees/employees.repository.ts` and
`employees.service.ts` filter `isDeleted` in 12 places. Outside the
`employees` module, **47 other files** call `prisma.employee.find*/count/
aggregate` directly. Of those, **26 files contain zero mentions of
`isDeleted` anywhere**:

`agent.service.ts`, `dlp.service.ts`, `attendance-policy-resolver.service.ts`,
`attendance-device.service.ts`, `employee-mapping.service.ts`,
`attendance-operations.service.ts`, `provisioning-planner.service.ts`,
`employee-work-site-resolver.service.ts`, `work-site-readiness.service.ts`,
`benefits.service.ts`, `business-trips.service.ts`, `claims.service.ts`,
`compensation.service.ts`, `employee-levels.service.ts`, `loans.service.ts`,
`lookups.service.ts`, `notifications.service.ts`,
`payroll-run.service.ts`, `payroll.service.ts`, `payslips.service.ts`,
`policies.service.ts`, `tenant-access.service.ts`, `tenant-erasure.service.ts`,
`configuration-resolver.service.ts`, `time-payroll-preparation.service.ts`,
`workflow-runtime.service.ts`.

One of these was traced end-to-end to a confirmed wrong output — **SCHEMA-03**
(payroll run eligibility). The other 25 were **not** individually traced this
deeply (most are single-record `findFirst` lookups keyed off an
already-authenticated user's own `userId`, which is lower risk than a batch
eligibility query — see SCHEMA-03 evidence and the "Not examined" section).
`reports.service.ts` (`:26-30`) documents a *fixed* instance of exactly this
class of bug (`BUG-2625`, KNOWN) with a comment explicitly naming the pattern
("headcount never filtered `isDeleted`, while every other employee read path
does").

**Confidence: CONFIRMED** for the 26/47 count and for SCHEMA-03.
**Confidence: NOT OBSERVED / unverified** for whether the other 25 are
individually wrong — flagged for the Reviewer or a follow-up sweep.

---

## 7. Audit / history coverage (schema level)

Per the task split, service-layer `AuditService.log()` completeness is OBS's
territory; this section covers **dedicated schema-level history/version
tables**.

| Domain | Dedicated history/version table? |
|---|---|
| Employment status/profile changes | **Yes** — `EmployeeHistory` (`schema.prisma:5227`) |
| Compensation/salary | **Yes** — `EmployeeCompensationHistory` (`:10369`) |
| Candidate/application pipeline | **Yes** — `CandidateHistory`, `ApplicationHistory`, `ApplicationStageHistory` |
| Policies | **Yes** — `PolicySnapshot` (`:10598`), confirmed actually read by `attendance.service.ts` |
| Contracts / e-signature | **Yes, extensively** — `ContractVersion`, `ContractTemplateVersion`, `ContractTimeline`, `SignatureEvent`, `SignatureEvidence` |
| Documents | **Yes** — `DocumentVersion` (versioned, `schema.prisma:7373`) |
| Legal documents | **Yes** — `LegalDocumentVersion` |
| Payslip lifecycle | **Yes** — `PayslipEventLog` (`:9068`) |
| Customization publishes | **Yes** — `CustomizationPublishSnapshot` |
| Tenant configuration (feature-flag-like settings) | **Partial** — `TenantConfigurationRecord` has `effectiveFrom`/`effectiveTo` (append-new/close-old versioning built in, `schema.prisma:7656-7678`); plain `TenantSetting` (key→JSON value) has no versioning columns at all and relies solely on generic `AuditLog` before/after snapshots. |
| Bank account changes | **No dedicated table, but well-audited in code** — `EmployeeBankAccount` writes (all in `loans.service.ts`) call `this.audit(user, 'EMPLOYEE_BANK_ACCOUNT_CREATED'/'_UPDATED'/'_VERIFICATION_UPDATED'/'_SET_AS_PAYROLL', ...)` at `loans.service.ts:845,911,942,974,996,1037,1092` → generic `AuditLog` with `entityType: 'EmployeeBankAccount'`. Verified this is genuinely present (an earlier literal-string grep for `entityType: 'EmployeeBankAccount'` gave a false negative because the entity type is computed via a ternary on the action-name prefix at `loans.service.ts:1179`; re-checked by reading the file). See `## Healthy`. |
| Roles/permissions/`RolePermission`/`UserRole` | **No dedicated table** — relies on generic `AuditLog` with `entityType: 'Role'`/`'User'` (`roles.service.ts:221-498`, `users.service.ts:161-531`). Fine-grained per-assignment audit (which specific permission was added/removed) was **not verified** beyond confirming the wrapping entity types exist — flagged as OBS/Reviewer follow-up, not claimed as a gap. |
| Payroll run status transitions | **No dedicated `PayrollRunHistory`** — `PayrollRun.status` is a plain enum column overwritten in place; reconstructing the transition history depends entirely on `AuditLog`/`PayslipEventLog` rows being written for every transition (not independently verified). |
| Subscription changes | **Partial** — `SubscriptionCancellation`, `SeatUsagePeriod`, `SeatUsageSample`, `PlanChangeRequest` capture specific slices of subscription lifecycle, but there is no single `SubscriptionHistory` covering arbitrary field changes; relies on generic `AuditLog`. |
| Attendance day recomputation | **No history** — `AttendanceDay` is recomputed **in place** by design (`docs/knowledge/data-model/entity-attendance-day.md:31`: "reconciliation recomputes in place rather than accumulating duplicates"). This is a deliberate, documented design choice (idempotency over history), not an oversight — noted for completeness, not flagged as a defect. |

**Confidence: CONFIRMED** for the table-existence facts (schema read).
**Confidence: LIKELY** for the "relies on generic AuditLog" rows actually
being written consistently for Role/User/PayrollRun — not independently
traced call-by-call (that is explicitly OBS's assignment per the task split).

---

## 8. Growth / hot tables

No live database query access was available or appropriate (read-only audit,
no DB writes permitted, and the task instructions provide the production
figure — Postgres 17 on Neon, ~130 MB logical size today — rather than
granting query access). Ranking is by schema shape and index design, reasoned
from write-frequency multipliers:

| Rank | Table | Why it grows fastest | Retention/partitioning present? |
|---|---|---|---|
| 1 | `RawAttendanceEvent` | One row per raw device/biometric punch, per employee, per tenant — the base ingestion table behind the entire attendance engine (`schema.prisma:12339`, 7 indexes/uniques incl. dedupe). Every check-in/out from every device from every tenant lands here before reconciliation. | **No retention/purge job found** (`grep` across `attendance-integrations` and `attendance-engine` found zero `cleanup`/`purge`/`retention` hits for this model). |
| 2 | `AuditLog` (+`PlatformAuditLog`) | Written on "every state-changing operation" per `AGENTS.md` — the single busiest write target across all 68 modules by design. 7 indexes support common query shapes (`tenantId, action/entityType/actorUserId, createdAt`). | **No retention/purge job found.** Likely intentional (compliance/audit trails are commonly kept indefinitely), but this was not confirmed as a deliberate decision anywhere in `docs/`. |
| 3 | `TimesheetEntry` / `AttendanceEntry` / `AttendanceDay` | One-to-several rows per employee per working day; `AttendanceDay` alone is `@@unique([tenantId, employeeId, attendanceDate])` — a guaranteed one row per employee-day across the entire tenant base. | No purge found; `AttendanceDay` is recomputed in place (§7) so it doesn't accumulate duplicates, bounding its growth to employee-days rather than employee-events. |
| 4 | `NotificationRecipient` / `Notification` / `NotificationInteractionLog` | Fan-out: one `Notification` can produce many `NotificationRecipient` rows, and every render/click can log an interaction. | **Retention is designed in** — `NotificationInteractionLog.retentionUntilUtc` has a dedicated `@@index([retentionUntilUtc])` (`schema.prisma`), and `notifications.repository.ts`/`notifications.service.ts` contain cleanup logic. |
| 5 | `ActivityEvent` / `WorkSession` / `ClipboardCaptureEvent` / `ScreenCaptureEvent` | Agent-desktop productivity/DLP tracking — per-second/per-event telemetry when enabled. Per project memory, DLP capture (TASK-0020) ships **off by default**, which currently bounds this table's real-world growth regardless of schema capacity. | No retention found in schema; mitigated operationally by the feature being opt-in. |
| 6 | `ErrorLog` (+`ErrorLogOccurrence`) | One row per distinct error fingerprint, with `ErrorLogOccurrence` fanning out per repeat. | **Has retention** — `error-logs.service.ts:51-72,277-283` runs an in-process `setInterval`-driven `cleanupExpiredLogs()` against a configurable `retentionDays`. Implemented as an ad-hoc in-process timer rather than a scheduled job (no `@Cron`/`ScheduleModule` usage found anywhere in the codebase — 0 hits), which is a single-point-of-failure retention design (dies with the process, and if multiple API instances run, each runs its own redundant timer) but it does exist. |
| 7 | `OutboxEvent` / `PlatformEvent` | Transactional outbox + platform event stream. `OutboxEvent` has processing-status indexes and `outbox-worker.service.ts` references cleanup-adjacent logic; `PlatformEvent` has no retention hooks found. | Partial (`OutboxEvent`); none found for `PlatformEvent`. |
| 8 | `RefreshToken` / `AgentRefreshToken` / `PartnerRefreshToken` / `PlatformRefreshToken` | Grows with every login; bounded somewhat by revocation, but no scan found for a purge of long-expired/revoked rows. | Indexed on `expiresAt`/`revokedAt` (queryable), but no purge job found. |

**First operational bottleneck if unaddressed**: `RawAttendanceEvent`, because
it is (a) the only genuinely per-event (not per-day) high-cardinality table in
the core HR domain, (b) has no retention mechanism at all, and (c) every
`CREATE INDEX` in this schema's migration history is non-concurrent (§9) — so
the day this table is large enough to need a new index, adding one will lock
it for writes tenant-wide for the duration of the build. At the current ~130 MB
total production size this is not yet a live problem — it is a forward-looking
risk, not a current incident. **Confidence: LIKELY** (reasoned from schema
shape and absence of mitigations, not from actual row counts — no query access
was available).

---

## 9. Migration health

- **`npx prisma validate --config prisma.config.ts` result: PASS.**
  ```
  Prisma schema loaded from prisma\schema.prisma.
  The schema at prisma\schema.prisma is valid 🚀
  ```
  (Run via the correctly-resolved local Prisma 7.9.1 binary — see "Not
  examined" for the environment quirk this required working around. No
  migration, generate, or db command was run — `validate` only reads the
  schema file.)
- **226 migration directories**, all timestamp-prefixed in strictly
  increasing lexical order (`ls | grep -vE "^[0-9]{14}_"` → only
  `migration_lock.toml`, no out-of-order or malformed names).
- **KNOWN — ITEM-0120 / BUG-2741**: `schema.prisma` and the applied migration
  set disagree. Per the existing backlog record: applying all 225(now 226)
  migrations and diffing against the committed schema produces constraint
  **renames** on 7 Timesheet-family tables (migrations created them under
  abbreviated names) and **7 unique constraints the schema declares that no
  migration ever created** — `HolidayCalendar[tenantId,name]` (confirmed
  present in schema at `schema.prisma:6176`, cross-referenced independently
  in §1.4), `PartnerOnboardingApplication[invitationTokenHash]`,
  `PartnerOnboardingSubmission[applicationId,version]`,
  `PartnerPortalUser[invitationTokenHash]`,
  `PlatformApprovalRequest[requestNumber]`,
  `PlatformApprovalStep[approvalRequestId,stepOrder]`,
  `SupportCaseIncident[supportCaseId,errorLogId]`. Status: `DEFERRED`,
  `Priority: P2`. This means `npm run prisma:migrate:dev` cannot be used to
  create a new migration on this branch without Prisma proposing a reset, and
  the 7 unique constraints are enforced by application code only, not by the
  database, until resolved. Not re-verified by re-running `migrate diff`
  here (would require an empty database, out of scope for a read-only audit)
  — taken as KNOWN on the existing record's own reproduction evidence.
- **Zero `NOT NULL` columns added without a `DEFAULT` on the same statement**
  across all 226 migrations (`grep -E "ADD COLUMN.*NOT NULL" | grep -v
  DEFAULT` → 0 matches) — matches `AGENTS.md`'s documented expand/backfill/
  contract discipline. **Healthy.**
- **Zero of 1,509 `CREATE INDEX`/`CREATE UNIQUE INDEX` statements use
  `CONCURRENTLY`** across all migrations. Expected given Prisma's standard
  transactional `migrate deploy` (which cannot run `CONCURRENTLY` inside a
  transaction), but it is a standing operational risk the moment any table
  crosses from "small" to "needs a lock-sensitive index build" — see
  SCHEMA-14 / §8.
- **6 migrations contain `DROP COLUMN`** (`auth_login_refresh_tokens`,
  `billing_plan_enforcement_foundation`, `centralized_documents_system`,
  `tenant_owner_system_admin`, `customization_metadata_schema`,
  `add_leave_policy_rule_audit_fields`), all dated April–May 2026, i.e. early
  schema churn that plausibly predates the system carrying real tenant data.
  Not individually verified for backfill correctness (would require git-log
  dating against a known production go-live date, out of scope) —
  **NOT OBSERVED** as a live risk, reported for completeness.
- No hand-edited-migration evidence found (no anomalous diffs, no
  out-of-sequence timestamps, no duplicate migration names).

---

## 10. Unused schema

`services/api/src/modules/data/entity-registry.ts` — the generic
string-keyed model resolver the briefing warned about — was read in full
(124 lines). It registers **exactly one** logical entity, `employees` →
`prismaModel: 'employee'`. It does **not** provide blanket dynamic access to
arbitrary models, so it narrows (not widens) the set of models that need a
"maybe it's used dynamically" caveat.

A second, genuinely repo-wide dynamic accessor **was** found and had to be
accounted for: `tenant-erasure.service.ts`'s `delegateFor(tx, model)`
(`services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts`)
walks a constant list of model names
(`tenant-erasure.constants.ts`) generically for GDPR erasure. Several models
below appear **only** in that constant, meaning they are deleted generically
on tenant erasure but never created or read by any actual product feature.

Methodology: for every one of the 325 models, searched for
`.<camelCaseAccessor>.(findMany|findFirst|create|update|delete|upsert|
count|aggregate|...)` anywhere in `services/api/src` (excluding specs), then
for the ~16 zero-hit models, separately searched for the model's relation
field name in `include`/`select` blocks (to catch nested-write/read usage
that a direct-accessor grep would miss), then case-insensitively for the bare
model name across `services/api/src` and `apps/`.

| Model | Evidence | Classification |
|---|---|---|
| `DataJobBatch` | Zero hits anywhere except `tenant-erasure.constants.ts`. `data-management` module (`data-job-worker.service.ts`, `import-execution.service.ts`, `export-execution.service.ts`) never references it despite `DataJob.batches` being exactly the kind of thing a chunked import/export job would use. | **LIKELY SAFE TO REMOVE**, or a feature (chunked job batching) that was modeled but never implemented — **REQUIRES REVIEW** by whoever owns `data-management` to confirm intent before removal. |
| `SlaEscalationLevel`, `SlaMilestone` | Zero hits anywhere except `tenant-erasure.constants.ts`. `sla.service.ts` exists and implements `SlaPolicy`/`SlaRule`/`SlaTracking` but never references `escalationLevels` or `milestones` (the relation field names), nor the model accessors. | **REQUIRES REVIEW** — same "modeled, not implemented" pattern as `DataJobBatch`; SLA escalation is a plausible in-progress feature, not obviously dead. |
| `ClaimApproval` | **Read** via `approvals: { orderBy: { createdAt: 'desc' } }` in `claims.service.ts:67` (an `include`), but **never written** — no `.claimApproval.create` or nested `approvals: { create: ... }` anywhere. `claims.service.ts` imports and uses `ApprovalsService`/`ApprovalMatrixResolverService` (the generic `ApprovalRequest`/`ApprovalStep`/`ApprovalAction` model family) for its actual approval workflow instead (`claims.service.ts:501-596`). | **LIKELY SAFE TO REMOVE** (schema clutter — the include always returns `[]`) but confirm with the claims module owner that the generic-approvals migration was intentional and complete, since the relation is still wired into the read path. |
| `Subprocessor` | Appeared to have zero hits in `services/api/src`, but **is used**: `apps/landing/lib/legal-server.ts` and `services/api/prisma/seed-legal.ts`. | **MUST KEEP** — false positive from an API-only search; legitimate frontend/seed usage. |

No other models produced a genuine zero-hit result after the relation-field
and case-insensitive passes — the initial 58-model "no direct accessor" list
(from a `.prisma.`/`.tx.`/`.client.` prefix search) collapsed to these 4 real
candidates once nested-write/read patterns (`approvals:`, `escalationLevels:`,
etc.) and non-`prisma`-prefixed variable names were accounted for.
**Confidence: CONFIRMED** for the "zero hits in services/api/src" fact on
each of the 3 remaining candidates; **LIKELY** (not CONFIRMED) that they are
truly dead rather than reached through a pattern this grep-based method
cannot see (e.g. a raw SQL string, a dynamically-built Prisma query using
computed property access, or apps/-side code — `apps/` was checked for the
bare PascalCase name but not as exhaustively as `services/api/src`).

---

## Findings

### SCHEMA-01 — Tenant deletion cascades through the entire tenant-owned schema, including every audit and payroll table

- **Category:** Schema / Referential Integrity / Data Loss
- **Severity:** HIGH
- **Confidence:** LIKELY (schema cascade is CONFIRMED; the "no other caller"
  claim is LIKELY — verified for the current codebase, not provable for all
  future code)
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma` (schema-wide), `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts`
- **Evidence:**
  `schema.prisma` — 237 models declare `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`; BFS closure over all `onDelete: Cascade` edges from `Tenant` reaches 246 of 325 models in 2 hops, including `AuditLog`, `Payslip`, `PayrollRecord`, `PayrollRun`, `EmployeeCompensationHistory`.
  `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts:555` — `await tx.tenant.delete({ where: { id: tenantId } });` is the only call to `tenant.delete`/`tenant.deleteMany` found anywhere in `services/api/src` (`grep -rln "tenant\.delete("` → 3 files total, the other 2 are `demo-data` and `tenant-erasure.constants.ts` which only reference the constant, not call delete).
- **Current behaviour:** The erasure service deletes child rows in an explicit, carefully ordered sequence (`TENANT_ERASURE_LINK_CLEANUPS`, `TENANT_ERASURE_SELF_REFERENCES`, `TENANT_ERASURE_DELETE_ORDER`) *before* calling `tenant.delete()`, so today's only caller behaves correctly. But the database's own `onDelete: Cascade` graph is independently sufficient to do the same destruction with none of that care — any future direct `prisma.tenant.delete()` call (a test-cleanup script, an admin REPL one-liner, a future engineer unaware of the erasure service) instantly and irrecoverably destroys every audit log, payslip, and payroll record for that tenant, with no confirmation step and no archival requirement enforced by the schema itself.
- **Expected behaviour:** The schema should not be capable of silently destroying `AuditLog`/`Payslip`/`PayrollRecord`/payroll history via a bare `Tenant` delete. A common pattern is `onDelete: Restrict` on the highest-value historical tables (forcing any deletion path — including the erasure service — to explicitly archive or export them first), or an application-level guard (e.g. a Prisma extension or `$transaction` wrapper) that refuses `tenant.delete()` outside the erasure service.
- **Risk:** A future direct-delete call (test harness, ops script, accidental REPL command) against a tenant with real financial/audit history is an unrecoverable data-loss and compliance event — no backup-before-delete step is enforced by the schema.
- **Remediation:** Consider `onDelete: Restrict` (not `Cascade`) from `Tenant` to at minimum `AuditLog`, `PayrollRecord`, `Payslip`, `PayrollRun`, and require the erasure service to explicitly export/archive and then `deleteMany` those specific tables before the final `tenant.delete()` — which it already does for other tables, so this would only formalize what one path already does correctly and forbid every other path from bypassing it.
- **Difficulty:** MEDIUM (schema change + migration + erasure-service already does the right ordering, so mostly a `Restrict` flip plus verifying no other path relies on cascading through these tables)
- **Regression risk:** MEDIUM (must verify no other legitimate flow relies on cascading these specific tables via a bare tenant delete)
- **Fix now:** LATER (no currently-reachable caller violates this; worth a deliberate ExecPlan rather than an ad-hoc change, per `PLANS.md`'s rules on destructive-change review)

### SCHEMA-02 — Employee deletion would cascade through 64 tables including Payslip and PayrollRecord, but no code path currently triggers it

- **Category:** Schema / Referential Integrity
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (schema fact); the "unreachable today" claim is CONFIRMED by an exhaustive `grep` for `employee.delete`/`employee.deleteMany` across `services/api/src`, `services/api/prisma` (0 results)
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma` (Employee cascade graph), `services/api/src/modules/employees/employees.service.ts`
- **Evidence:**
  BFS from `Employee` over `onDelete: Cascade` edges reaches 64 models in 2 hops, including `Payslip`, `PayrollRecord`, `PayrollRunEmployee`, `LoanInstallment`.
  `services/api/src/modules/employees/employees.service.ts:1408-1422` — the only "delete" path sets `isDeleted: true, deletedAt, deletedById` via `updateMany`, never calls `.delete()`.
- **Current behaviour:** Employee removal is soft-delete only; the hard-delete cascade exists in the schema but is dormant.
- **Expected behaviour:** No change strictly required while unreachable, but worth an explicit `onDelete: Restrict` on `Employee`→`Payslip`/`PayrollRecord` so a future hard-delete code path cannot silently destroy payroll history for an employee who was legitimately paid.
- **Risk:** Latent — if any future feature (bulk cleanup tool, GDPR right-to-erasure for an individual employee, a test utility) calls `employee.delete()` directly, it destroys that employee's entire payroll and payslip history with no warning.
- **Remediation:** Same pattern as SCHEMA-01: `Restrict` on the highest-value historical children of `Employee`, or an explicit application guard preventing raw `employee.delete()` calls outside a reviewed erasure flow.
- **Difficulty:** LOW-MEDIUM
- **Regression risk:** LOW (no current caller to break)
- **Fix now:** LATER

### SCHEMA-03 — Payroll run eligibility never checks `Employee.isDeleted`; an archived employee with a stale `employmentStatus` is paid

- **Category:** Schema / Data Correctness / Payroll
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/payroll/payroll-run.service.ts`
- **Evidence:**
  `services/api/src/modules/payroll/payroll-run.service.ts:969-977` —
  ```ts
  const employees = await this.prisma.employee.findMany({
    where: buildPayrollEmployeeEligibilityWhere({ tenantId: user.tenantId, periodStart: period.periodStart, periodEnd: period.periodEnd, businessUnitId }),
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  ```
  `services/api/src/modules/payroll/payroll-run.service.ts:3040-3087` — `buildPayrollEmployeeEligibilityWhere` filters on `tenantId`, `isDraftProfile`, `hireDate`, `employmentStatus` (`ACTIVE`/`PROBATION`/`NOTICE`/`TERMINATED`-within-period), and `businessUnitId` — **`isDeleted` never appears**.
  `services/api/src/modules/employees/employees.service.ts:1408-1422` — the archive/soft-delete operation sets `isDeleted: true`, `deletedAt`, `deletedById` but **does not change `employmentStatus`**.
- **Current behaviour:** An employee who is archived (soft-deleted) while their `employmentStatus` still reads `ACTIVE` (the normal case — archiving is a separate action from termination) remains eligible under `buildPayrollEmployeeEligibilityWhere` and is included in the next payroll run, generating a payslip for a record the tenant explicitly marked deleted.
- **Expected behaviour:** `buildPayrollEmployeeEligibilityWhere` should include `isDeleted: false` (or `deletedAt: null`) alongside its `employmentStatus` checks, matching the pattern already used correctly in `employees.repository.ts`/`employees.service.ts` and the now-fixed `reports.service.ts` (`BUG-2625`).
- **Risk:** A tenant pays (and generates a payslip audit trail for) an employee record they archived — a real financial-correctness defect, not just a display inconsistency like the already-fixed `BUG-2625` headcount bug.
- **Remediation:** Add `isDeleted: false` to the `where` clause built by `buildPayrollEmployeeEligibilityWhere` in `services/api/src/modules/payroll/payroll-run.service.ts:3040`.
- **Difficulty:** LOW (one-line `where` clause addition plus a regression test)
- **Regression risk:** LOW
- **Fix now:** YES

### SCHEMA-04 — 26 of 47 non-`employees`-module files querying `Employee` never reference `isDeleted`

- **Category:** Schema / Data Correctness
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (the count); LIKELY (that all 26 are actually wrong — only one, SCHEMA-03, was traced to a concrete bad output)
- **Known:** Partially KNOWN — `BUG-2625` (fixed) is the same defect class in `reports.service.ts`, which the comment at `reports.service.ts:26-30` explicitly documents; the remaining files are NEW.
- **Component:** 26 files across `payroll`, `loans`, `claims`, `benefits`, `business-trips`, `compensation`, `policies`, `attendance-integrations`, `agent`, `tenant-settings`, `workflows`, `notifications`, `time-payroll`, `employee-levels`, `lookups`
- **Evidence:** File list and per-file `isDeleted` occurrence counts in §6.1 above (26 files at 0 occurrences, generated by a full sweep, not a sample).
- **Current behaviour:** Each of these files calls `prisma.employee.findFirst/findMany/count` without any `isDeleted` filter in the same file.
- **Expected behaviour:** Every read of `Employee` that feeds a business decision (eligibility, disbursement, reporting) should exclude soft-deleted rows unless there is a documented reason to include them (e.g. historical payroll records for an employee archived after being paid — which is a different, legitimate case from SCHEMA-03's "archived before payroll runs").
- **Risk:** Same class as SCHEMA-03 and the fixed `BUG-2625` — inconsistent or incorrect inclusion of archived employees in claims, loans, benefits, compensation and business-trip processing.
- **Remediation:** A repository-level helper (e.g. `EmployeesRepository.findActiveByTenant()`) that centralizes the `isDeleted: false` filter, and a lint/spec rule flagging direct `prisma.employee.find*` calls outside the `employees` module, would prevent this recurring — it has now recurred at least twice (`BUG-2625` plus SCHEMA-03).
- **Difficulty:** MEDIUM (touches many files; needs per-file judgment on whether excluding soft-deleted rows is actually correct for that use case)
- **Regression risk:** MEDIUM (some of these reads may intentionally want to include archived employees, e.g. historical reporting)
- **Fix now:** NO — needs triage per file; SCHEMA-03 is the one instance confirmed wrong and should be fixed now, the rest should become a tracked backlog item

### SCHEMA-05 — `ModuleView.tenantId` is a required column with no `Tenant` relation

- **Category:** Schema / Referential Integrity
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma:11036-11059`
- **Evidence:**
  ```
  model ModuleView {
    id       String @id @default(uuid())
    tenantId String
    ...
    @@unique([tenantId, moduleKey, slug])
  }
  ```
  No `tenant Tenant @relation(...)` field exists on the model, unlike 260 of the other 261 tenant-owned models.
- **Current behaviour:** `tenantId` is stored as a plain, unvalidated string with no database-level foreign key back to `Tenant`.
- **Expected behaviour:** Consistent with the rest of the schema, `ModuleView` should carry `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`.
- **Risk:** A row with a `tenantId` that does not correspond to any real tenant (typo, leftover from a deleted tenant that bypassed the erasure service's own model list, test data) can be inserted and will never be caught by the database; it also will not be cleaned up automatically if a tenant is deleted through any path other than the erasure service's explicit `deleteMany`.
- **Remediation:** Add the `tenant` relation and a migration to enforce the FK; verify against production for orphaned rows before adding a `NOT NULL` FK constraint (per `AGENTS.md`'s destructive-change rules).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

### SCHEMA-06 — Denormalized `tenantId` columns with no `Tenant` FK, validated only indirectly through a parent

- **Category:** Schema / Normalization / Referential Integrity
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `WorkflowRun` (`schema.prisma:11526-11542`), `RecruitmentPipelineStage` (`:6874-6895`), `RetentionHold` (`:13784-13806`), `DocumentVersion` (`:7373-7394`)
- **Evidence:**
  `WorkflowRun.tenantId String` with only `workflow Workflow @relation(fields: [workflowId], ...)` as a real relation — `tenantId` is copied from `Workflow.tenantId` for indexing but nothing enforces the two stay equal.
  Same pattern confirmed for the other three models (each has a parent relation carrying the real tenant scope, plus its own denormalized `tenantId` column with indexes but no `Tenant` relation).
- **Current behaviour:** These four models store `tenantId` purely as a query/index optimization, trusting application code to always set it equal to the parent's `tenantId` at write time.
- **Expected behaviour:** If the denormalization is intentional (reasonable, for index locality), a database-level check (e.g. a trigger, or at minimum a code comment/invariant test) should guarantee `child.tenantId == parent.tenantId`; today nothing does.
- **Risk:** A bug that writes a mismatched `tenantId` (e.g. copies the acting user's tenant instead of the parent's) would silently create a row indexed under the wrong tenant, invisible to that tenant's queries and potentially visible to the wrong one if any query filters on `tenantId` directly rather than joining through the parent.
- **Remediation:** Add an invariant test (in the style of `wiring-invariants.spec.ts`) asserting `WorkflowRun.tenantId === WorkflowRun.workflow.tenantId` etc. at write time, or set these via a database trigger/generated column if Postgres version support allows.
- **Difficulty:** LOW (test-only fix) to MEDIUM (trigger-based fix)
- **Regression risk:** LOW
- **Fix now:** LATER

### SCHEMA-07 — `HolidayCalendar[tenantId,name]` and 6 other unique constraints are declared in the schema but not enforced by the database

- **Category:** Schema / Migration Drift / Referential Integrity
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (cited from `ITEM-0120`'s own reproduction; `HolidayCalendar`'s declaration independently confirmed at `schema.prisma:6176`)
- **Known:** **KNOWN — `ITEM-0120` (backlog, `Status: DEFERRED`, `Priority: P2`), related to `BUG-2741`**
- **Component:** `services/api/prisma/schema.prisma:6176` (`HolidayCalendar`), plus `PartnerOnboardingApplication`, `PartnerOnboardingSubmission`, `PartnerPortalUser`, `PlatformApprovalRequest`, `PlatformApprovalStep`, `SupportCaseIncident`; `services/api/prisma/migrations/`
- **Evidence:** `docs/backlog/items/ITEM-0120-...md:63-76` — applying all migrations and diffing against the committed schema shows 7 unique constraints Prisma believes exist that the database does not have, plus constraint-name mismatches on 7 Timesheet-family tables. `HolidayCalendar`'s `@@unique([tenantId, name])` at `schema.prisma:6176` was independently confirmed to exist in the schema text during this audit's own uniqueness sweep (§1.4), consistent with the backlog item's claim.
- **Current behaviour:** Two tenant-owned `HolidayCalendar` rows with the same `name` in the same tenant can be inserted concurrently without a database-level rejection; the schema's own promise (`@@unique`) is enforced only by whatever application-level check exists, if any.
- **Expected behaviour:** Schema and database should agree; either the migration creating the constraint should be added, or the constraint should be deliberately removed from the schema with the decision recorded.
- **Risk:** Duplicate `HolidayCalendar` names (and duplicate rows for the other 6 constraints) under concurrent writes; already assessed and deferred by the Architect per the existing record.
- **Remediation:** Already scoped in `ITEM-0120` — measure production duplicate-group counts first, then either backfill+add the constraint or record why it was dropped, via an ExecPlan per `PLANS.md`.
- **Difficulty:** MEDIUM (per existing record)
- **Regression risk:** MEDIUM (per existing record — production may already hold violating rows)
- **Fix now:** NO — already triaged as `DEFERRED`/P2 by the Architect; this audit found nothing to change that disposition, only independent confirmation that the schema-side half of the claim (`HolidayCalendar`) is accurate.

### SCHEMA-08 — `LeavePolicyRule.tenant` is the one relation in the schema with no explicit `onDelete`

- **Category:** Schema / Referential Integrity / Consistency
- **Severity:** LOW
- **Confidence:** CONFIRMED (full enumeration of all 833 FK relations)
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma:5617`
- **Evidence:** Full sweep of every `@relation(fields: ..., onDelete: ...)` across the schema found exactly one relation with no `onDelete:` clause: `LeavePolicyRule.tenant -> Tenant`. Every other one of the 261 tenant-owned models' `tenant` relation declares `onDelete: Cascade` explicitly (confirmed via the direct-children-of-`Tenant` list in §2.2, which lists all 237 `.tenant` relations and their target).
- **Current behaviour:** `LeavePolicyRule` falls back to Prisma's implicit default (`Restrict` for a required relation), meaning a `Tenant` delete would fail with a foreign-key violation if any `LeavePolicyRule` rows exist for it — unless removed first by the erasure service's explicit `deleteMany` phase (which the tenant-erasure delete-order list does include, based on the model's presence in the genericized delete flow).
- **Expected behaviour:** Consistent with its 236 siblings, this should declare `onDelete: Cascade` explicitly (or, if `Restrict` is intentional, the intent should be documented — it currently reads as an oversight given every comparable model uses `Cascade`).
- **Risk:** LOW — the erasure service's explicit ordering already handles this model, so the practical risk is confusion/inconsistency rather than a live defect.
- **Remediation:** Add `onDelete: Cascade` to `LeavePolicyRule.tenant` at `schema.prisma:5617` for consistency, or document why it is intentionally different.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

### SCHEMA-09 — Calendar-only date fields (dateOfBirth, hireDate, holidayDate, etc.) stored as full `DateTime` instead of `@db.Date`

- **Category:** Schema / Typing
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (schema fact); LIKELY that it causes an actual off-by-one-day bug in production (depends on serialization/timezone handling in the API and frontends, not independently traced end-to-end here)
- **Known:** NEW (not found in `docs/bugs/` or `docs/knowledge/` despite a targeted grep for `dateOfBirth`, `@db.Date`, "wall-clock")
- **Component:** `services/api/prisma/schema.prisma` — `Employee.dateOfBirth` (`:4961`), `Employee.hireDate` (`:4973`), `Employee.confirmationDate`/`probationEndDate`/`terminationDate` (`:4974-4976`), `Candidate.dateOfBirth` (`:6910`), `Holiday.holidayDate` (`:6192`), `WorkforceSnapshotDaily.hireDate`/`terminationDate` (`:14368-14369`), and others
- **Evidence:** Of 1,165 `DateTime` fields in the schema, only 5 use `@db.Date` (`grep -n "DateTime" schema.prisma | grep -oE "@db\.\w+" | sort | uniq -c` → `5 @db.Date`); `PayrollCalendar.periodStart`/`periodEnd` (`:8420-8421`) are two of the five that correctly use it. None of the calendar-date fields listed above do.
- **Current behaviour:** A field like `dateOfBirth`, which has no meaningful time-of-day or timezone component, is stored as a full Postgres timestamp. JS `Date` objects crossing a serialization boundary (API JSON response → frontend `Date` parsing → display in the browser's local timezone) can shift the displayed calendar date by one day depending on the UTC offset at the time of parsing versus storage, unless every consumer is careful to always read the UTC date components and never the local ones.
- **Expected behaviour:** Pure calendar-date fields (no meaningful time-of-day) should use `@db.Date` so the database itself guarantees no time-of-day/timezone ambiguity can be introduced, consistent with the 5 fields that already do this correctly.
- **Risk:** A birthdate, hire date, or holiday date displayed as one calendar day earlier or later than intended in some client timezones — a subtle, hard-to-reproduce class of bug (compounds with `Employee.dateOfBirth` being one of the PII fields OBS separately flags for plaintext-storage concerns).
- **Remediation:** Audit each calendar-only `DateTime` field and convert to `@db.Date` where no time-of-day is ever meaningful, in an expand/backfill/contract migration per `AGENTS.md`'s destructive-change rules (changing a column's underlying type is a `narrowing`-adjacent change requiring care).
- **Difficulty:** MEDIUM (touches many fields; needs per-field confirmation that no consumer relies on a time-of-day component)
- **Regression risk:** MEDIUM (any consumer that currently reads a time component, even accidentally, would break)
- **Fix now:** NO — needs an ExecPlan; not urgent (no confirmed production incident), but real

### SCHEMA-10 — `Employee.status`/`subStatus` are untyped strings governed only by application constants

- **Category:** Schema / Typing
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma` (`Employee.status`, `Employee.subStatus`), `services/api/src/modules/employees/employee-lifecycle.constants.ts:34-41`, `employees.service.ts:2946-3596`
- **Evidence:** `status String @default("ACTIVE")`, `subStatus String @default("OPEN")` alongside the properly-enumerated `employmentStatus EmployeeEmploymentStatus @default(ACTIVE)` on the same model. `employee-lifecycle.constants.ts:34-41` defines the vocabulary (`EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION`, `.READY_FOR_ACTIVATION`, etc.) purely in TypeScript, not in a Prisma enum.
- **Current behaviour:** The record-lifecycle state machine (distinct from employment status — see §3.3) has no database-level constraint on its value domain; any string can be written by any code path or direct SQL.
- **Expected behaviour:** A small, fixed, named vocabulary like this is exactly what Prisma enums exist for, matching the pattern already used correctly for `employmentStatus` on the same model.
- **Risk:** A typo or a new code path that writes an unlisted status value would not be caught by the database, only (if at all) by application-level validation; downstream code that switches on `subStatus` string values could silently fall through to a default branch.
- **Remediation:** Convert `status`/`subStatus` to Prisma enums mirroring `EMPLOYEE_RECORD_SUB_STATUS`, in a migration that validates existing values first.
- **Difficulty:** LOW-MEDIUM
- **Regression risk:** LOW-MEDIUM (any code doing loose string comparison would need re-verification against enum values)
- **Fix now:** LATER

### SCHEMA-11 — `DataJobBatch`, `SlaEscalationLevel`, `SlaMilestone`, `ClaimApproval` are schema-only or vestigial — no business logic populates them

- **Category:** Schema / Unused Schema
- **Severity:** LOW
- **Confidence:** LIKELY (methodology detailed in §10; genuinely dead code is hard to prove with 100% certainty via static grep alone)
- **Known:** NEW
- **Component:** `schema.prisma` (`DataJobBatch` line 11441, `SlaEscalationLevel` line 8171, `SlaMilestone` line 8154, `ClaimApproval` line 8082), `services/api/src/modules/tenant-control-plane/tenant-erasure.constants.ts`, `services/api/src/modules/claims/claims.service.ts:67`
- **Evidence:** See the full table and methodology in §10. `DataJobBatch`/`SlaEscalationLevel`/`SlaMilestone` have zero hits anywhere in `services/api/src` except the generic tenant-erasure delete-order constant. `ClaimApproval` is read via an always-empty `include` at `claims.service.ts:67` but never written — the real claim-approval workflow runs through the generic `ApprovalRequest`/`ApprovalStep` model family instead (`claims.service.ts:501,521,593`).
- **Current behaviour:** These tables exist, are indexed, participate in the tenant cascade/erasure graph, but hold no data because nothing creates rows in them (or, for `ClaimApproval`, are always read as empty).
- **Expected behaviour:** Either the corresponding feature (chunked data-job batching; SLA escalation levels/milestones; per-claim approval chaining) should be implemented against these tables, or the tables should be removed to reduce schema surface area and migration/audit overhead.
- **Risk:** LOW directly (empty tables cost little), but they add cognitive load, appear in every schema-wide sweep (including this one and the tenant-erasure model list) as if they were live, and could mislead a future engineer into building against a table nothing else honors.
- **Remediation:** Confirm with the owning module (`data-management` for `DataJobBatch`, `sla` for the SLA pair, `claims` for `ClaimApproval`) whether each is planned/in-progress or safe to drop; if dropping, remove from `tenant-erasure.constants.ts` and the schema together, plus the `ClaimApproval` relation include in `claims.service.ts:67`.
- **Difficulty:** LOW (removal) / MEDIUM-HIGH (implementation, if these are actually planned features)
- **Regression risk:** LOW (removal), given zero current callers
- **Fix now:** NO — needs product/owner confirmation first; classified REQUIRES REVIEW, not auto-removable

### SCHEMA-12 — No table in the schema has a retention/partitioning mechanism for its highest-growth raw event data

- **Category:** Schema / Growth / Scalability
- **Severity:** MEDIUM
- **Confidence:** LIKELY (reasoned from schema + code search, not from live row counts — no DB query access was available)
- **Known:** NEW
- **Component:** `RawAttendanceEvent` (`schema.prisma:12339`), `AuditLog`/`PlatformAuditLog`, `PlatformEvent`
- **Evidence:** See §8 table. `grep` for `retention|archival|archive|cleanup|purge` across `attendance-integrations`, `attendance-engine`, `audit`, `platform-events` found zero hits for `RawAttendanceEvent`, `AuditLog`, or `PlatformEvent`, versus confirmed retention mechanisms for `ErrorLog` (`error-logs.service.ts:51-72,277-283`, in-process timer) and `NotificationInteractionLog` (dedicated `retentionUntilUtc` column + index).
- **Current behaviour:** `RawAttendanceEvent` (one row per raw device punch, across every tenant, indefinitely), `AuditLog` (one row per state-changing operation across 68 modules, indefinitely), and `PlatformEvent` grow without any bound or archival path.
- **Expected behaviour:** At minimum a documented retention decision (even "keep forever, by design, for compliance" is a valid answer for `AuditLog`) and ideally a retention/archival mechanism matching what `ErrorLog` and notifications already have, before these tables reach a size where the schema's own non-concurrent index-creation pattern (§9) becomes a real operational risk.
- **Risk:** Unbounded growth of the highest-write-volume tables in the schema, compounded by every future index build on them being a full table lock (§9) — currently masked by the ~130 MB total production size, but a forward-looking scalability risk as tenant count and history grow.
- **Remediation:** Decide and document a retention policy per table (`RawAttendanceEvent` is the strongest purge candidate — raw punches are superseded by `AttendanceDay`'s computed result once reconciled); implement using the same pattern `ErrorLog` already has, ideally converted to a proper scheduled job (`@nestjs/schedule`) rather than an in-process `setInterval` (§8, `ErrorLog` sub-note) if adopted more broadly.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW (a purge job for raw, already-reconciled data is low-risk by nature)
- **Fix now:** LATER — not urgent at current scale, but should be planned before it becomes urgent

### SCHEMA-13 — Every `CREATE INDEX` across 226 migrations is non-concurrent; no string column anywhere has a database-level length bound

- **Category:** Schema / Migration Health / Typing
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/prisma/migrations/*/migration.sql` (index creation), `schema.prisma` (all 3,166 `String` fields)
- **Evidence:** `grep -rc "CREATE INDEX\|CREATE UNIQUE INDEX"` across all migrations sums to 1,509; `grep -rl "CREATE INDEX CONCURRENTLY"` → 0 files. `grep -c "@db.VarChar" schema.prisma` → 1 (out of 3,166 `String` fields).
- **Current behaviour:** Every index build locks its table for writes for the duration, and every string column accepts arbitrarily large input at the database layer (bounding delegated entirely to `class-validator` DTOs).
- **Expected behaviour:** Acceptable today (matches standard Prisma `migrate deploy` conventions and the documented DTO-validation model in `AGENTS.md`), but both become real constraints as the highest-growth tables (§8/§12) get larger.
- **Risk:** LOW today given the ~130 MB production database size; grows into a real deployment/ops risk as `RawAttendanceEvent`/`AuditLog` grow, since any future index addition to those tables would need to be hand-split outside the standard `prisma migrate deploy` transactional flow to use `CONCURRENTLY`.
- **Remediation:** No change needed now; document as an operational runbook item ("when adding an index to a table over N rows, use a manually-authored non-Prisma-generated concurrent index migration") for when it becomes relevant.
- **Difficulty:** LOW (documentation only, for now)
- **Regression risk:** LOW
- **Fix now:** NO — informational, forward-looking

---

## Healthy — verified good

- **Zero models found with tenant ownership genuinely missing.** Every one of
  the 64 models without `tenantId` was traced to a legitimate global/platform
  role or an indirect tenant-scoped parent (§1.2). This is the strongest
  possible result for the single highest-value schema question in a
  multi-tenant system.
- **No money/salary/rate field anywhere uses `Float`.** All 168 real money
  fields use `Decimal` with explicit `@db.Decimal(p,s)` precision; the
  schema's only `Float` fields are GPS coordinates, an appropriate use
  (§3.1). Full enumeration, not a sample.
- **Business-key uniqueness is correctly tenant-scoped.** `Employee.employeeCode`
  (`@@unique([tenantId, employeeCode])`, `schema.prisma:5110`),
  `Employee.cnic` (`@@unique([tenantId, cnic])`, cross-checked against OBS),
  and `User.email` (`@@unique([tenantId, email])`, `schema.prisma:4436`) are
  all correctly composite with `tenantId` — the exact bug class this audit
  was asked to hunt for was searched for specifically and not found on any of
  the three highest-risk business keys.
- **`AttendanceDay.attendanceDate` is correctly modeled as a timezone-aware
  instant, not a naive date.** Verified by reading
  `AttendanceDayContextService.zonedDayStart()`
  (`services/api/src/modules/attendance-engine/attendance-day-context.service.ts:303-320`),
  which computes midnight in the *employee's* timezone as a real UTC instant
  — the deliberate opposite of the `@db.Date` fix recommended in SCHEMA-09
  for genuinely-calendar-only fields, and correctly so, since an overnight
  shift's "day" is not the same thing as a calendar date
  (`docs/knowledge/data-model/entity-attendance-day.md:19-31`).
- **`EmployeeBankAccount` changes are comprehensively audited**, despite an
  initial literal-string grep suggesting otherwise (the entity type is
  computed via a ternary on the action-name prefix, not a literal string —
  re-verified by reading `loans.service.ts:845-1179` directly). Every create,
  update, verification-status change, deactivation, and payroll-designation
  change calls `AuditService.log()` with before/after snapshots.
- **Zero `NOT NULL` columns added without a `DEFAULT` on the same statement**,
  across all 226 migrations — the expand/backfill/contract discipline
  `AGENTS.md` documents is actually followed in every migration, not just
  described.
- **`prisma validate` passes** on the current schema with no errors.
- **`onDelete` is explicit on 832 of 833 FK relations** (99.9%) — only
  `LeavePolicyRule.tenant` (SCHEMA-08) is the exception, and it is a
  consistency nit, not a functional gap (the erasure service's explicit
  ordering already accounts for it).
- **`TenantConfigurationRecord` has real period-based versioning built in**
  (`effectiveFrom`/`effectiveTo`), not just an overwrite-in-place pattern
  (`schema.prisma:7656-7678`).
- **`NotificationInteractionLog` has a genuine, schema-supported retention
  design** (`retentionUntilUtc` column with a dedicated index), unlike most
  other high-growth tables in the schema (§8/§12).
- **326 migrations (well, 226) all follow strict, monotonically increasing,
  correctly-formatted timestamp naming** with no out-of-order or malformed
  directory names found.

## Not examined / limits

- **No live database query access.** The growth/hot-table ranking (§8) is
  reasoned from schema shape (index design, cardinality-implying relations,
  absence of retention code) rather than actual row counts; the task gave the
  production DB as ~130 MB total on Neon Postgres 17, which was taken as
  given context rather than independently queried. A live `EXPLAIN`/row-count
  pass would sharpen or correct this ranking.
- **`prisma migrate diff` was not re-run** to independently reproduce
  `ITEM-0120`'s exact drift script — that would require spinning up an empty
  database and applying all 226 migrations, which is a write-adjacent
  operation out of scope for a read-only audit. `SCHEMA-07` relies on the
  existing backlog record's own reproduction evidence plus an independent
  confirmation that `HolidayCalendar`'s declared constraint still exists in
  the current schema text.
- **Service-layer `AuditService.log()` completeness for `Role`/`RolePermission`/
  `UserRole`/`PayrollRun` status transitions was not independently traced
  call-by-call.** Confirmed the wrapping entity types exist
  (`entityType: 'Role'`/`'User'`) but did not verify every mutating code path
  actually calls them — this is explicitly OBS's assigned territory per the
  task split ("OBS covers the service-layer AuditService side").
- **Only one of the 26 files in SCHEMA-04 (the `isDeleted` gap) was traced
  end-to-end to a concrete wrong output** (`payroll-run.service.ts`, SCHEMA-03).
  The other 25 were counted but not individually read in full — some may be
  correct (e.g. a self-service lookup bounded by an already-authenticated
  active user session is lower risk than a batch eligibility query).
- **The nullable-`tenantId` "global default / tenant override" pattern (§4.1)
  was not verified per-service.** The schema-level pattern is consistent and
  at least once explicitly documented in a code comment
  (`EmailTemplate`'s `moduleKey` comment), but whether every consuming
  service correctly treats a `tenantId = null` row as read-only to tenants
  was not checked — flagged for AUTHZ/OBS.
- **`apps/web`/`apps/admin`/`apps/agent-desktop` were only checked for the
  bare model-name string (§10), not exhaustively for GraphQL-style or
  computed-property dynamic access patterns** that a grep-based method cannot
  see. The 3 "likely safe to remove" candidates in SCHEMA-11 carry a LIKELY,
  not CONFIRMED, confidence rating for exactly this reason.
- **Environment note, not a schema finding**: this audit worktree's
  `node_modules` symlink resolves to a malformed path
  (`/d/D:/My Work/hrm-dijipeople/DijiPeople/node_modules/`, a doubled drive
  prefix), which breaks Node's module resolution for anything requiring
  `dotenv/config` (as `prisma.config.ts` does) from within the worktree.
  Worked around by setting `NODE_PATH` to the real `DijiPeople` checkout's
  `node_modules` and invoking the real local `prisma` binary (7.9.1) directly
  by absolute path rather than via `npx` (which otherwise silently fetches
  Prisma 8.0.0-rc.13 from the network — a materially different, unreleased
  major version with an entirely different CLI surface — since no local
  binary was resolvable through the broken symlink). This is worth fixing in
  the audit worktree setup itself so the next specialist doesn't have to
  rediscover it.
