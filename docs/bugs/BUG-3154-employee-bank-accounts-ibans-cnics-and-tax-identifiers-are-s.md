---
ID: BUG-3154
aliases: [BUG-3154]
Title: Employee bank accounts, IBANs, CNICs and tax identifiers are stored in plaintext beside an unused AES-256-GCM service
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/employees, services/api/src/modules/compensation]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3154 — Employee bank accounts, IBANs, CNICs and tax identifiers are stored in plaintext beside an unused AES-256-GCM service

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** The ExecPlan exists (EXECPLAN-0032) and the expand phase is written on agent/cs-s10-pii, deliberately not merged. It rewrites every stored bank account, IBAN and national id, and this database has no backup beyond an untested six-hour window (ITEM-0131). Sequencing, not scope, is what blocks it: take a dump, run the backfill attended, then contract.

## Summary

Employee bank accounts, IBANs, CNICs and tax identifiers are stored in plaintext beside an unused AES-256-GCM service

Identified by the 2026-09-10 full technical audit as OBS-24 (confidence: OBS-24=CONFIRMED).

## Expected Behavior

The same `SecretEncryptionService` applied to `EmployeeBankAccount.{accountNumber,iban,swiftOrRoutingCode}`, `EmployeeCompensation.{bankAccountNumber,bankIban,bankRoutingNumber}`, `EmployeeTaxProfile.taxIdentificationNumber` and `Employee.cnic`; the uniqueness constraint on `cnic` replaced by a deterministic HMAC column.

## Actual Behavior

Every employee's national id and full bank details are readable by anyone with database access, a replica, a backup file, or a leaked `DATABASE_URL`. Neon (the production database) provides volume-level encryption at rest; there is no field-level protection above it.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-24** (services/api/prisma/schema.prisma, services/api/src/common/security/secret-encryption.service.ts):

The service exists and works — `services/api/src/common/security/secret-encryption.service.ts:26` `const ALGORITHM = 'aes-256-gcm';`, 12-byte IV (`:28`), format `enc:v1:<iv>:<authTag>:<ciphertext>` (`:25`), key from `SECRET_ENCRYPTION_KEY` with fallback `APP_ENCRYPTION_KEY` (`:39-41`), and it fails closed in production (`:52-55`). `render.yaml` declares `SECRET_ENCRYPTION_KEY` as required.
Its own header states the threat it was built for (`:16-20`): *"written to the database as plain JSON… Masking them in API responses hid them from the screen but not from anyone with database access, a backup, or a replica."*
**The complete list of call sites** — `rg "\.encrypt\(|encryptSecrets\(" services/api/src --glob '!*.spec.ts'`:
```
modules/agent/dlp/dlp.service.ts:129            clipboard text
modules/agent/dlp/dlp.service.ts:183            screenshot bytes
modules/platform-communications/platform-email-settings.service.ts:169   smtp password
modules/attendance-integrations/integrations/attendance-integration.service.ts:585  connector secret
modules/notifications/notifications.service.ts:846                       provider config
```
(plus the decrypt counterparts and `gateway-configuration.service.ts:394`, `email-execution.service.ts:451`, `platform-email-provider.resolver.ts:94`).
**Not one touches an employee financial or identity column.**
Those columns are plain `String?` with no `@db.` annotation:
```
schema.prisma:9374  EmployeeBankAccount.accountNumber        String?
schema.prisma:9375  EmployeeBankAccount.iban                 String?
schema.prisma:9376  EmployeeBankAccount.swiftOrRoutingCode   String?
schema.prisma:10263 EmployeeCompensation.bankAccountNumber   String?
schema.prisma:10264 EmployeeCompensation.bankIban            String?
schema.prisma:10265 EmployeeCompensation.bankRoutingNumber   String?
schema.prisma:10266 EmployeeCompensation.taxIdentifier       String?
schema.prisma:4966  Employee.cnic                            String?
schema.prisma:10090 EmployeeTaxProfile.taxIdentificationNumber String?
schema.prisma:9411  EmployerBankAccount.accountNumber        String?
```
Contrast `schema.prisma:10895 ClipboardCaptureEvent.encryptedContent String?` — the one PII column that *is* encrypted, and documented as such at `:10870-10872`.
Values are written raw — `modules/loans/loans.service.ts:829-830`:
```ts
accountNumber: dto.accountNumber?.replace(/\s/g, '') || null,
iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null,
```
`Employee.cnic` additionally sits under `@@unique([tenantId, cnic])` (`schema.prisma:5113`), which structurally forecloses non-deterministic encryption of that column without a schema change.

---


Full finding text: OBS-24 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A single database credential leak, a mis-scoped read replica, or an unencrypted backup exposes the national identity number and bank account of every employee of every tenant. This is the highest-value dataset the product holds and it has the least protection of any secret in the codebase — less than an SMTP password.

## Affected Areas

services/api/src/modules/employees, services/api/src/modules/compensation

## Proposed Resolution

Expand/backfill/contract migration per `PLANS.md`: add `accountNumberEnc` columns, dual-write, backfill, switch reads, drop plaintext. Add `cnicHmac` for uniqueness and drop `@@unique([tenantId, cnic])`. Requires an ExecPlan.

(Difficulty: HIGH; Regression risk: HIGH; Fix now: LATER (but plan now))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/prisma/schema.prisma, services/api/src/common/security/secret-encryption.service.ts (audit id OBS-24).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-24=HIGH. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-24` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-24) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]

<!-- GRAPH:END -->
