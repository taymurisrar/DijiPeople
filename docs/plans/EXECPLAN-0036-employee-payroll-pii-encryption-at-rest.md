CONTEXT_FILES_REQUIRED:
  - services/api/prisma/AGENTS.md          (expand/backfill/contract convention)
  - AGENTS.md                              (SecretEncryptionService reuse, tenant isolation, security checklist)

SPECIALIST_AGENTS_REQUIRED:
  - database                               — schema change, migration, backfill script
  - backend-api                            — service-layer dual-write/decrypt wiring

DELIBERATELY_NOT_USED:
  - frontend                               — no response shape changes; every touched
                                              endpoint keeps its existing field names
  - ui-ux                                  — no screen changes
  - integration                            — no external contract changes (gateway,
                                              Stripe, agent-desktop all untouched)

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/**

QA_REQUIRED: no
  (no user-facing behavior change; API response shapes are unchanged by design.
  Verification is unit/integration tests plus the throwaway-database migration
  round-trip described below.)

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - doc-code-drift — this file states exact line numbers and counts as of this
    branch; re-derive rather than trust if the branch has moved.

REGRESSION_ENTRIES_IN_SCOPE:
  - None found referencing EmployeeBankAccount/EmployerBankAccount/
    EmployeeCompensation/EmployeeTaxProfile/Employee.cnic encryption.

TARGET_BRANCH:            agent/cs-s10-pii (integrates to develop later, not by this task)
TARGET_ENVIRONMENT:       LOCAL only for this task; the production backfill script is
                          handed to the product owner to run themselves (see below)
DEPLOYMENT_REQUIRED:      no (this task does not deploy; expand-phase migration and
                          code are handed off for a future release + backfill run)
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         database (expand migration) -> api
ROLLBACK_CLASS:           DATABASE_ADDITIVE (expand phase only; see Rollback below)
INTEGRATOR_REQUIRED:      yes (any task modifying tracked files)
RELEASE_DEVOPS_REQUIRED:  no (not deploying from this task)
POST_DEPLOY_QA_REQUIRED:  n/a (not deploying)
MERGE_STRATEGY:           merge --no-ff (per repo convention; not executed by this task)
KNOWN_CONCURRENT_WORK:    SESSION-0098 (agent/closeout-sweep) was ACTIVE at plan time,
                          not touching schema.prisma; `session.mjs check --paths
                          services/api/prisma/schema.prisma,services/api/prisma/migrations`
                          returned SAFE_PARALLEL.
ENVIRONMENT_DEPENDENCIES: none new. SECRET_ENCRYPTION_KEY already exists (mandatory in
                          production per services/api/src/common/security/
                          secret-encryption.service.ts:47-55, and already required by
                          render.yaml). No new env var is introduced by this plan.

# ExecPlan — Encrypt employee/payroll PII at rest (OBS-24)

## Objective
Every bank account number, IBAN, SWIFT/routing code, national id (CNIC) and tax
identifier belonging to an employee, an employer bank account, or a
compensation/tax-profile record is stored as AES-256-GCM ciphertext at rest,
using the same `SecretEncryptionService` this codebase already uses for SMTP
passwords and integration secrets — not a second, parallel encryption
mechanism. No existing caller (controller, DTO mapper, audit snapshot, export)
changes shape: every read that returns one of these fields today keeps
returning the same field name holding the same plaintext value it holds today,
sourced transparently from the new ciphertext column once that row has been
migrated.

This plan covers the **expand** phase (schema + dual-write + transparent
decrypt) and prepares, but does not apply, the **contract** phase (dropping
the plaintext columns). The **backfill** phase is a standalone script handed
to the product owner to run against production themselves, because this
session's harness blocks writes to any production database.

## Business requirement
Audit finding OBS-24 (P0-5),
`docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md:1076-1149`
and `00-EXECUTIVE-AUDIT-REPORT.md` (P0-5 entry): employee national ids and full
bank details are readable by anyone with database access, a replica, a backup
file, or a leaked `DATABASE_URL`. Neon provides volume-level encryption; there
is no field-level protection above it. The task instruction (product owner)
additionally requires: an ExecPlan with explicit backfill/rollback, a fresh
audit of schema.prisma rather than trusting OBS-24's own list, and a
production backfill script the owner runs themselves.

## Existing behavior
- `SecretEncryptionService`
  (`services/api/src/common/security/secret-encryption.service.ts`) already
  encrypts/decrypts with AES-256-GCM, format `enc:v1:<iv>:<authTag>:<ciphertext>`
  (all base64), key derived via SHA-256 from `SECRET_ENCRYPTION_KEY` (falling
  back to `APP_ENCRYPTION_KEY`), and **fails closed**: it refuses to start in
  production without a key (`:44-56`) and throws
  `InternalServerErrorException` on a decrypt failure rather than returning
  ciphertext or a corrupted value (`:122-130`). Five call sites already use it
  (DLP capture, platform SMTP settings, attendance-integration connector
  secrets, notification provider config) — none touch employee/payroll data.
- Every column named below is a plain `String?` column with no encryption,
  written and read directly by the owning service.
- Two existing owning services already **mask** these values in API responses
  today (`mask()` helpers producing `***1234`-style output): `loans.service.ts`
  for `EmployeeBankAccount`/`Bank`, `employer-bank-accounts.service.ts` for
  `EmployerBankAccount`, `employee-tax-profiles.service.ts` for
  `EmployeeTaxProfile.taxIdentificationNumber`. Masking is a *screen* control;
  it does not touch how the value is stored, which is exactly the gap
  `SecretEncryptionService`'s own header comment names: *"Masking them in API
  responses hid them from the screen but not from anyone with database
  access, a backup, or a replica."*
- Audit snapshots for `EmployeeBankAccount` already mask `accountNumber`/`iban`
  before calling `AuditService.log()` (`loans.service.ts:845-849, 926-930` at
  the pre-change line numbers) — the audit trail is not a new plaintext-leak
  surface for this table today, but this plan additionally strips the new
  ciphertext columns out of what reaches the audit log column, for cleanliness
  (ciphertext is not sensitive, but there is no reason to persist it twice).

## Existing architecture
Models and their owning services (Prisma delegate name -> service):
- `EmployeeBankAccount` -> `services/api/src/modules/loans/loans.service.ts`
  (CRUD for an employee's own bank accounts lives in the loans module because
  loan disbursement was the first consumer; the same accounts back payroll
  payment lines)
- `EmployerBankAccount` ->
  `services/api/src/modules/payroll/employer-bank-accounts.service.ts`
- `EmployeeCompensation` -> two independent write paths:
  `services/api/src/modules/employees/employee-profiles.service.ts`
  (`upsertCompensation`, the tenant-facing "manage my compensation" flow,
  writes bank + tax fields) and
  `services/api/src/modules/payroll/payroll.repository.ts`
  (`createCompensation`/`updateCompensation`, generic repository methods used
  by the payroll module's own compensation flows)
- `EmployeeTaxProfile` ->
  `services/api/src/modules/tax-rules/employee-tax-profiles.service.ts`
- `Employee.{cnic,taxIdentifier}` ->
  `services/api/src/modules/employees/employees.service.ts`

Downstream **readers** that consume these fields via a Prisma relation
`include` from a different model, rather than as the owning service's own
`find`, are NOT rewired by this plan (see Migration / data compatibility
below): `payroll-run.service.ts` (wire-file generation, two `findFirst` calls
on `employeeBankAccount`) and `payroll-operations.service.ts` (payment line
export, `include: { employeeBankAccount: true }`). They continue reading the
plaintext column directly, which stays correct and current throughout expand
and backfill because of the dual-write design — see Risks.

`modules/data/entity-registry.ts` (the generic metadata-driven entity API)
does **not** register `EmployeeBankAccount`, `EmployerBankAccount`,
`EmployeeCompensation`, `EmployeeTaxProfile` or `Employee` for generic CRUD
(confirmed by grep), so there is no bypass of the owning-service wiring below
through that path.

## Requirements
1. Every column listed in "Columns found" gets a parallel `*Enc` ciphertext
   column (nullable, additive) via an expand-phase migration.
2. `Employee.cnic` additionally gets `cnicHmac` (deterministic HMAC-SHA256,
   keyed from the same `SECRET_ENCRYPTION_KEY` material) and a new
   `@@unique([tenantId, cnicHmac])`, coexisting with the current
   `@@unique([tenantId, cnic])` — AES-256-GCM is non-deterministic and cannot
   back a uniqueness check.
3. Every owning-service write path dual-writes: the plaintext column keeps
   being written exactly as today, and the `*Enc` column is now also written,
   encrypted from the same value.
4. Every owning-service read path transparently decrypts: when `*Enc` is
   populated, the plaintext field in the object returned to the caller is
   replaced with the decrypted value; when `*Enc` is null (not yet
   backfilled), the existing plaintext value passes through unchanged. The
   raw `*Enc`/`cnicHmac` columns are stripped from what any caller receives.
5. No caller outside the owning service changes: same field names, same
   nullability, same masking behavior downstream.
6. `SecretEncryptionService` is the only encryption mechanism used; no second
   AES implementation, no second key-derivation scheme.
7. A production backfill script encrypts every pre-existing row exactly once,
   is idempotent (safe to run twice), batches its work with progress output,
   verifies each row immediately after writing it, reports final
   encrypted/skipped/failed counts, and refuses to run without a
   `SECRET_ENCRYPTION_KEY` of the required length.
8. A contract-phase migration (dropping the plaintext columns and the old
   `@@unique([tenantId, cnic])`) is written and reviewable, but **not applied**
   by this task, and not applied to the throwaway database either — its SQL is
   file-only, pending a future task after the backfill is verified complete in
   production.
9. Tests cover: round-trip encrypt/decrypt, fail-closed behavior when the key
   is wrong/missing, that no test-observable API response or log line carries
   a plaintext value beyond what the codec intentionally decrypts for a
   legitimate caller, and that the backfill logic is idempotent.

## Dependencies
- `SECRET_ENCRYPTION_KEY` must already be set in every environment this code
  runs in. It already is (production: mandatory per
  `secret-encryption.service.ts:47-55`; local/dev: read from `services/api/.env`).
  No new environment variable is introduced.
- The production backfill run depends on the product owner (a) taking the
  pre-migration database dump documented below, (b) applying the expand-phase
  migration to production, then (c) running the backfill script against
  `DIRECT_DATABASE_URL`. This plan does not perform any of those three steps.

## Files / modules affected
Database (**SINGLE_WRITER**):
- `services/api/prisma/schema.prisma`
- `services/api/prisma/migrations/20260911020000_pii_encryption_expand/migration.sql` (new, applied to the throwaway DB only)
- `services/api/prisma/migrations/20260911020100_pii_encryption_contract/migration.sql` (new, **not applied** anywhere)
- `services/api/prisma/backfill-pii-encryption.ts` (new; standalone production script)

Backend:
- `services/api/src/common/security/secret-encryption.service.ts` (add `hmac()`)
- `services/api/src/common/security/pii-field-codec.ts` (new; shared encrypt/decrypt helpers)
- `services/api/src/modules/loans/loans.module.ts`, `loans.service.ts`
- `services/api/src/modules/payroll/employer-bank-accounts.module.ts` (or wherever it is provided — see note below), `employer-bank-accounts.service.ts`
- `services/api/src/modules/employees/employees.module.ts`, `employees.service.ts`, `employee-profiles.service.ts`
- `services/api/src/modules/payroll/payroll.module.ts`, `payroll.repository.ts`
- `services/api/src/modules/tax-rules/tax-rules.module.ts` (or equivalent), `employee-tax-profiles.service.ts`

Tests (new):
- `services/api/src/common/security/pii-field-codec.spec.ts`
- `services/api/prisma/backfill-pii-encryption.spec.ts`

## Database impact

### Columns found (full audit of schema.prisma, not just OBS-24's list)

| Model | Column | In OBS-24's list? | Encrypting? |
|---|---|---|---|
| `EmployeeBankAccount` | `accountNumber` | yes | yes |
| `EmployeeBankAccount` | `iban` | yes | yes |
| `EmployeeBankAccount` | `swiftOrRoutingCode` | yes | yes |
| `EmployerBankAccount` | `accountNumber` | yes | yes |
| `EmployerBankAccount` | `iban` | yes | yes |
| `EmployeeCompensation` | `bankAccountNumber` | yes | yes |
| `EmployeeCompensation` | `bankIban` | yes | yes |
| `EmployeeCompensation` | `bankRoutingNumber` | yes | yes |
| `EmployeeCompensation` | `taxIdentifier` | yes | yes |
| `EmployeeTaxProfile` | `taxIdentificationNumber` | yes | yes |
| `Employee` | `cnic` (+ new `cnicHmac`) | yes | yes |
| `Employee` | `taxIdentifier` | **no — found separately** | yes |
| `Bank` | `swiftCode`, `routingCode` | no | **no** — reference/lookup catalog data describing a bank institution (e.g. "Chase's SWIFT code"), not a data subject's secret; same category as a public directory entry. |
| `CustomerAccount` | `taxId` | no | **no** — commercial/B2B customer's own business tax registration number, `services/api/prisma/schema.prisma` around the `CustomerAccount` model (super-admin/billing domain). Out of OBS-24's employee/payroll scope; business tax ids are frequently disclosed on contracts and invoices already, a different risk profile than a person's national id. |
| `Lead` | `taxId` | no | **no** — same reasoning, commercial pre-sales domain. |
| `Partner` | `taxId` | no | **no** — same reasoning, partner/commercial domain. |

`Employee.taxIdentifier` is a genuine gap in OBS-24's own evidence: it sits in
the same model as `cnic` (which OBS-24 did name) and holds the same class of
value as `EmployeeCompensation.taxIdentifier` and
`EmployeeTaxProfile.taxIdentificationNumber` (both of which OBS-24 did name).
It was found by grepping `schema.prisma` for the tax/bank/national-id pattern
directly rather than trusting the audit's own call-site list, per this task's
instructions.

`Bank.swiftCode`/`routingCode`, `CustomerAccount.taxId`, `Lead.taxId` and
`Partner.taxId` are documented here as a **PROPOSAL to leave out of scope**,
not silently dropped — if the business wants the three commercial tax-id
columns protected too, that is a follow-up ExecPlan in the commercial/billing
domain, decided by product, not inferred here.

### Expand-phase migration (applied to the throwaway database, not production)

`20260911020000_pii_encryption_expand` — additive only:
```sql
ALTER TABLE "Employee" ADD COLUMN "cnicEnc" TEXT, ADD COLUMN "cnicHmac" TEXT, ADD COLUMN "taxIdentifierEnc" TEXT;
ALTER TABLE "EmployeeBankAccount" ADD COLUMN "accountNumberEnc" TEXT, ADD COLUMN "ibanEnc" TEXT, ADD COLUMN "swiftOrRoutingCodeEnc" TEXT;
ALTER TABLE "EmployerBankAccount" ADD COLUMN "accountNumberEnc" TEXT, ADD COLUMN "ibanEnc" TEXT;
ALTER TABLE "EmployeeTaxProfile" ADD COLUMN "taxIdentificationNumberEnc" TEXT;
ALTER TABLE "EmployeeCompensation" ADD COLUMN "bankAccountNumberEnc" TEXT, ADD COLUMN "bankIbanEnc" TEXT, ADD COLUMN "bankRoutingNumberEnc" TEXT, ADD COLUMN "taxIdentifierEnc" TEXT;
CREATE UNIQUE INDEX "Employee_tenantId_cnicHmac_key" ON "Employee"("tenantId", "cnicHmac");
```
Every new column is `TEXT NULL`; no existing column, row or constraint is
touched. The new unique index is safe on a populated table because every
existing row's `cnicHmac` is `NULL` and Postgres does not consider `NULL`
values to collide in a unique index.

Generated via `prisma migrate diff --config prisma.config.ts --from-schema
<pre-change schema.prisma> --to-schema services/api/prisma/schema.prisma
--script` (schema-to-schema diff, not database-to-schema — the database
carries pre-existing, unrelated migration/schema drift documented in prior
sessions' knowledge notes, so diffing against a live database would have
produced hundreds of unrelated lines). Applied and verified with `prisma
migrate deploy` against a throwaway database (`dp_s10_pii_test`) created for
this task only; never applied to the populated `dijipeople` database or to
any production system.

### Backfill phase
See "Production backfill script" below. Not run by this task against any real
database — this session's harness blocks production writes. Idempotent by
construction: it only processes rows where the `*Enc` column is still null.

### Contract phase (prepared, not applied)
`20260911020100_pii_encryption_contract` drops, in one migration, once the
backfill is verified complete and the application has been running the
decrypt path in production for a full observation window:
```sql
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_tenantId_cnic_key";
ALTER TABLE "Employee" DROP COLUMN "cnic";
ALTER TABLE "Employee" DROP COLUMN "taxIdentifier";
ALTER TABLE "EmployeeBankAccount" DROP COLUMN "accountNumber";
ALTER TABLE "EmployeeBankAccount" DROP COLUMN "iban";
ALTER TABLE "EmployeeBankAccount" DROP COLUMN "swiftOrRoutingCode";
ALTER TABLE "EmployerBankAccount" DROP COLUMN "accountNumber";
ALTER TABLE "EmployerBankAccount" DROP COLUMN "iban";
ALTER TABLE "EmployeeTaxProfile" DROP COLUMN "taxIdentificationNumber";
ALTER TABLE "EmployeeCompensation" DROP COLUMN "bankAccountNumber";
ALTER TABLE "EmployeeCompensation" DROP COLUMN "bankIban";
ALTER TABLE "EmployeeCompensation" DROP COLUMN "bankRoutingNumber";
ALTER TABLE "EmployeeCompensation" DROP COLUMN "taxIdentifier";
```
This file is committed by this task but is **not applied to any database,
including the throwaway one** — it is prepared for a future task, which must
also: rename every `*Enc` column back to the plain name (or update the codec
to read/write the `*Enc` name as primary — a decision for that later task),
update `payroll-run.service.ts`/`payroll-operations.service.ts` to route
through the decrypt codec (see Migration / data compatibility), and remove the
now-redundant `cnicHmac`-vs-`cnic` dual uniqueness. A prerequisite the
contract-phase task must re-verify: **every row's `*Enc` column is non-null**
before dropping the plaintext column it mirrors, or that row's data is lost.

## Backend impact
See "Files / modules affected" above. No new endpoints, no changed request/
response DTOs — every touched method keeps its existing signature and return
shape. The change is entirely inside each owning service's write (add `*Enc`
alongside plaintext) and read (decrypt `*Enc` onto plaintext, strip `*Enc`)
logic, via the shared `pii-field-codec.ts` helpers.

## Frontend impact
None. No app is touched. Every existing screen keeps receiving the same field
names with the same (already-masked, where applicable) values.

## Permission / RBAC impact
None. No new permission key, no new entity/privilege entry, no access-level
change. The existing permission checks that gate these fields
(`COMPENSATION_READ`/`COMPENSATION_MANAGE`/`PAYROLL_READ` etc.) are unchanged
and continue to gate the same fields under the same names.

## Tenant-isolation impact
None of the touched queries change their `where` clause. Every write and read
in scope already filters on `tenantId` from `request.user.tenantId` (verified
by reading each call site above); this plan only changes which columns are
written/decrypted within those already-tenant-scoped rows. No cross-tenant
read or write is introduced.

## Audit / event / logging impact
- `AuditService.log()` calls for `EmployeeBankAccount` already mask
  `accountNumber`/`iban` before logging (unchanged behavior). This plan
  additionally decrypts-then-masks (instead of masking the plaintext column
  directly) so the masked value is correct even after a row has migrated to
  ciphertext-primary, and strips the raw `*Enc` columns out of the snapshot so
  ciphertext does not clutter the audit JSON (not a security issue — ciphertext
  is not sensitive — just noise).
- No new logging is added anywhere in `pii-field-codec.ts` or the touched
  services. `SecretEncryptionService.decrypt()`'s existing fail-closed error
  message does not include the value it failed to decrypt (verified by
  reading the source) — this remains true after this change.
- The production backfill script's progress output logs row ids, counts and
  pass/fail status only — never a plaintext or ciphertext field value.

## Integration impact
None. `gateway/` (.NET), `apps/agent-desktop` and Stripe billing do not read
any of the columns in scope.

## Migration / data compatibility
- **Old code against new schema**: safe. New columns are nullable and unused
  by code that has not been redeployed; nothing reads or requires them.
- **New code against old (pre-migration) database**: unsafe until the expand
  migration is applied — this is normal migration-before-deploy ordering,
  documented in DEPLOYMENT_ORDER above.
- **New code, pre-migration rows (before backfill)**: every read path in scope
  falls back to the plaintext column when `*Enc` is null, so a row not yet
  backfilled is served exactly as it is today. No regression window.
- **Downstream `include`-based readers not rewired by this task**
  (`payroll-run.service.ts`, `payroll-operations.service.ts`): they read the
  plaintext column directly. This remains correct throughout expand and
  backfill because dual-write keeps the plaintext column populated and
  current. They must be migrated to the decrypt codec **before** the contract
  phase drops the plaintext columns they read — called out explicitly as a
  Risk below and as a contract-phase prerequisite above.

## Parallel-safe tasks
- Writing `pii-field-codec.ts` and its spec — no shared files with anything
  else in flight (`PARALLEL_SAFE`).
- Writing the backfill script and its spec — depends only on the codec
  existing (`DEPENDENCY_BLOCKED` on the codec, otherwise isolated).

## Dependency-blocked tasks
- Every owning-service wiring task (loans, employer-bank-accounts,
  employee-profiles/payroll.repository, employee-tax-profiles, employees) is
  `DEPENDENCY_BLOCKED` on the schema migration having been generated and the
  Prisma client regenerated, since each imports the new `*Enc` fields' types.
- All schema/migration work is single-writer per PLANS.md; verified via
  `node scripts/session.mjs check --paths services/api/prisma/schema.prisma,services/api/prisma/migrations`
  at plan time — returned `SAFE_PARALLEL` against the one other active session
  (SESSION-0098, not touching schema).

## Integration tasks
- Final validation run (`prisma:validate`, workspace `lint`/`check-types`/
  `test`, `backlog:check`) after every owning service is wired — `INTEGRATION`,
  runs last, this task.

## Testing strategy
- `npm run prisma:validate` — schema is syntactically and referentially valid.
- `npm --workspace api run check-types` — the new `*Enc` fields and codec
  types compile against every call site touched.
- `npm --workspace api run test` — full unit suite, including two new spec
  files:
  - `pii-field-codec.spec.ts`: round-trip (encrypt then decrypt returns the
    original value) for every model helper; decrypt-failure fails closed
    (wrong key throws rather than returning ciphertext or a corrupted string);
    `decrypt*Fields` falls back to the existing plaintext when `*Enc` is null;
    `decrypt*Fields` never returns the raw `*Enc`/`cnicHmac` keys in its
    result; a `Logger`/console spy asserts nothing in the codec ever receives
    a plaintext or ciphertext value as a log argument.
  - `backfill-pii-encryption.spec.ts`: running the batch-processing core twice
    over the same fixture rows encrypts each row exactly once (second pass
    reports 100% skipped, zero re-encrypted); a row whose `*Enc` write fails
    verification is reported as failed, not silently accepted; the script
    refuses to proceed when `SECRET_ENCRYPTION_KEY` is absent or below the
    required length.
- `npm run backlog:check` — the OBS-24 bug record validates.
- Manual verification performed for this task: expand migration applied and
  `prisma migrate deploy`-verified against throwaway database
  `dp_s10_pii_test` (never `dijipeople`, never production); a manual
  create/read round trip against that throwaway database for at least one
  model confirms plaintext in, ciphertext stored, plaintext back out.

## Risks
1. **Downstream `include`-based readers bypass the decrypt codec** (likelihood:
   certain today, impact: none *yet* — mitigation: dual-write keeps the
   plaintext column correct throughout expand+backfill; **must** be resolved
   before the contract phase drops plaintext, called out as a hard
   prerequisite above). This is the single largest risk this plan carries
   forward rather than closes.
2. **`cnicHmac` collision across differently-formatted CNICs** (e.g. one row
   stores a CNIC with dashes, another without) — likelihood: medium (no
   normalization is enforced on `cnic` today beyond `.trim()`), impact: the
   new `@@unique([tenantId, cnicHmac])` could reject a legitimate write that
   the old plaintext-based unique constraint would have accepted with
   different formatting, or two rows with equivalent-but-differently-formatted
   CNICs would independently get different hashes and NOT collide (silently
   defeating the intended dedupe). Mitigation: this plan hashes exactly the
   same normalized value (`.trim()`) that the existing plaintext write path
   normalizes to, so behavior is unchanged from today; true CNIC
   canonicalization (stripping dashes/spaces) is a separate, pre-existing gap
   this plan does not introduce or fix.
3. **A backfill run against production encrypts the wrong key generation** if
   `SECRET_ENCRYPTION_KEY` is rotated between the expand-phase deploy and the
   backfill run — likelihood: low, impact: high (rows encrypted with a
   now-orphaned key become undecryptable). Mitigation: the backfill script
   refuses to run without a key present and of sufficient length, and the
   runbook below states explicitly not to rotate the key between deploy and
   backfill.
4. **Data loss from the pre-migration dump being skipped** — likelihood: low
   if the runbook is followed, impact: severe (this is payroll/identity data
   with no tested restore per the audit's own §10 finding). Mitigation: the
   runbook makes the dump the literal first step, before the expand migration
   is even applied.

## Rollback considerations
- **Expand-phase migration**: reversible without data loss — it only adds
  nullable columns and one new unique index over currently-all-null data. A
  rollback migration would simply `DROP COLUMN`/`DROP INDEX` the additions;
  not written as a separate file because Prisma's model here is forward-only
  migrations, and re-running `prisma migrate diff` from the post-migration
  schema back to the pre-migration schema reproduces it trivially if ever
  needed. `ROLLBACK_CLASS: DATABASE_ADDITIVE`.
- **Backfill script**: rollback is "stop running it" — it never touches the
  plaintext column, so no data is at risk from a partial or aborted run. A
  row already encrypted can be left as-is (both plaintext and ciphertext
  remain valid and equal) even if the rest of the backfill is abandoned.
- **Contract-phase migration**: irreversible once applied — dropping a column
  is a hard data loss if the ciphertext column it's paired with were ever
  wrong. This is exactly why it is a separate, unapplied migration in this
  task: nothing here forces or schedules its application. The forward fix if
  it were ever applied prematurely and something were found wrong is restoring
  from the pre-migration dump (see backfill runbook) and repeating expand +
  backfill with the bug fixed.
- If the frontend or gateway shipped without this API change: no impact, since
  no request/response contract changed.
- If the API shipped without the migration: every write/read touching a `*Enc`
  column would throw a Prisma "unknown column" error — this is why
  DEPLOYMENT_ORDER is database-then-api, per repository convention.

## Definition of Done
- [ ] Every column in "Columns found" that is marked "yes" has a paired `*Enc`
      column and dual-write + transparent-decrypt wiring in its owning service.
- [ ] `Employee.cnicHmac` computed and uniquely indexed alongside the existing
      plaintext unique constraint.
- [ ] Contract-phase migration file exists, committed, and is **not** applied
      to the throwaway database or any other database.
- [ ] Production backfill script exists, is idempotent, batches with progress
      output, verifies each write, reports final counts, and refuses to run
      without a valid `SECRET_ENCRYPTION_KEY`. Runbook (including the
      mandatory pre-migration dump) is documented in this plan and in the
      script's own header comment.
- [ ] `npm run prisma:validate`, `npm --workspace api run lint`,
      `check-types`, `test`, `npm run backlog:check` all reported with exact
      results (see task final report).
- [ ] `npx eslint --fix` run on every changed file.
- [ ] OBS-24 bug record created via `npm run backlog:new-bug` with all
      required sections, and `npm run backlog:check` passing.
- [ ] No unrelated file changed; no opportunistic refactor.
- [ ] This plan updated if implementation diverged from it, with the
      divergence stated in the final report.

## Deviation note
Per PLANS.md, this ExecPlan should have been written before any code was
touched. A session interruption occurred after the expand-phase migration,
the codec, and the `EmployeeBankAccount` wiring were already implemented (see
the `wip(security): OBS-24 expand phase` commit on this branch), and before
this plan document existed. This plan was written immediately upon resuming,
before any further implementation continued, and every claim above was
verified against the code as committed at that point — it documents the
change actually being made, not a change invented to match code already
written blind. No schema or migration decision in this plan differs from what
would have been decided with the plan written first.
