# Control readiness register

> **DijiPeople holds no certification or attestation, and this register asserts none.**
> It is not a SOC 2 report, an ISO/IEC 27001 certificate, a HIPAA assessment or a
> GDPR compliance statement. It is an engineering inventory of technical controls
> that exist in this repository, what each one does not cover, and which framework
> themes each one could later serve as evidence for.
>
> **Last verified:** 2026-11-22, branch `agent/dependency-alert-remediation`
> (SESSION-0137, WP8). Evidence is file paths read in the repository. "No evidence
> found" means a search of `services/api/src`, `docs/`, `scripts/` and `.github/`
> found nothing, not that the control is absent in production. Nothing here was
> tested at runtime, and nothing here describes hosting-provider configuration or
> contracts.

Framework abbreviations: ASVS = OWASP ASVS chapter; ISO = ISO/IEC 27001 Annex A
theme; SOC2 = Trust Services criterion; CSF = NIST CSF function; PRIV = GDPR/privacy.

## 1. Implemented technical controls

| # | Control | Evidence | Does NOT cover | Framework themes |
|---|---|---|---|---|
| 1 | Authentication with per-client JWT secrets (`web`, `admin`, `agent-desktop`); token `appClientId`/`aud` checked against the requesting client | `services/api/src/common/guards/jwt-auth.guard.ts`; `AGENTS.md` (Tenant Isolation); `services/api/src/modules/auth/PASSWORD-LOGIN-POLICY.md` | Federated SSO/SAML/OIDC: no evidence found. Password policy and lockout are in `password-policy.service.ts`, `login-lockout.service.ts`, `platform-login-lockout.service.ts`; their strength against a given standard was not assessed | ASVS V2, V3; ISO A.5.15-5.17, A.8.5; SOC2 CC6.1; CSF PR.AA; PRIV security of processing |
| 2 | Session handling: session row checked live on every request, logout, refresh, expiry, remember-me; concurrent sessions allowed by decision | `jwt-auth.guard.ts`; `services/api/src/modules/auth/auth-session-lifecycle.spec.ts`; `docs/decisions/ADR-0010-concurrent-sessions-are-allowed-by-default.md` | Unit-level tests only; no evidence found of a session-revocation test across a deployed environment. Concurrent sessions are permitted by default | ASVS V3; ISO A.8.5; SOC2 CC6.1, CC6.6; CSF PR.AA |
| 3 | TOTP MFA for tenant and platform users (RFC 6238, recovery codes) | `docs/decisions/ADR-0019-totp-mfa-for-tenant-and-platform-users.md`; `services/api/src/modules/auth/mfa/` (`totp.ts`, `mfa.service.ts`, `recovery-codes.ts`); `docs/decisions/ADR-0021-owner-decisions-countersign-platform-mfa-legal-publishing.md` | Phishing-resistant factors (WebAuthn/FIDO2): no evidence found. Whether MFA is mandatory per tenant or platform is a policy setting, not asserted here; ADR-0019 should be read for enforcement scope | ASVS V2.8; ISO A.8.5; SOC2 CC6.1; CSF PR.AA |
| 4 | RBAC: two permission systems (legacy `@Permissions` keys plus matrix `@RequirePermission`), both enforced by `PermissionsGuard`, plus row-level scope helpers | `services/api/src/common/guards/permissions.guard.ts`; `common/constants/permissions.ts`, `rbac-matrix.ts`; `common/security/rbac-query-scope.ts`; `common/security/permission-evaluation.ts`; invariant `common/constants/wiring-invariants.spec.ts`; `common/security/elevated-tenant-roles.ts` | Row-level scope is applied by hand in services, not centrally. `hasElevatedTenantRole` bypasses the guard entirely by design. Two systems increase drift risk | ASVS V4; ISO A.5.15, A.5.18, A.8.3; SOC2 CC6.1-6.3; CSF PR.AA; PRIV access limitation |
| 5 | Tenant isolation by convention: services pass `user.tenantId` (from the JWT) into every Prisma `where` | `AGENTS.md` (Tenant Isolation); `common/security/rbac-query-scope.ts`; `services/api/test/attendance-integrations-isolation.e2e-spec.ts` | **Not enforced by the database.** No PostgreSQL row-level security and no global tenant Prisma middleware (the existing `$use` middleware scopes by business unit and is inert on the installed client). A single missed `tenantId` filter is a cross-tenant leak. No automated proof that every query is scoped: no evidence found | ASVS V4.1, V4.2; ISO A.5.15, A.8.3, A.8.31; SOC2 CC6.1, C1.1; CSF PR.AA, PR.DS; PRIV confidentiality |
| 6 | Audit logging with before/after snapshots; tenant audit and separate platform audit stream | `services/api/src/modules/audit/audit.service.ts`, `audit-snapshot.ts`, `audit-canonical-writes.spec.ts`, `lifecycle-audit-coverage.spec.ts`, `platform-audit-authorization.spec.ts` | Immutability or tamper-evidence of the log (append-only storage, hash chaining, external log shipping): no evidence found. Retention period for audit rows: no evidence found. Coverage depends on each service calling `AuditService.log()` | ASVS V7; ISO A.8.15, A.8.16; SOC2 CC7.2, CC4.1; CSF DE.CM, PR.PS; PRIV accountability |
| 7 | Secret encryption at the application layer: AES-256-GCM `SecretEncryptionService` for integration credentials; `pii-field-codec.ts` dual-writes ciphertext for bank, IBAN, SWIFT, national and tax identifiers | `services/api/src/common/security/secret-encryption.service.ts`, `pii-field-codec.ts` | The PII codec is in an **expand phase**: plaintext columns stay authoritative and are not yet removed (header of `pii-field-codec.ts`), so ciphertext does not yet protect the data at rest. Key rotation, KMS/HSM custody: no evidence found. Passphrase of any length is digested to the key | ASVS V6; ISO A.8.24; SOC2 CC6.1, C1.1; CSF PR.DS; PRIV security of processing |
| 8 | Rate limiting: `PublicRateLimitGuard` on public endpoints, a global authenticated-traffic interceptor, login lockouts, an invariant spec for public write routes | `common/guards/public-rate-limit.guard.ts`, `public-write-rate-limit.invariant.spec.ts`; `common/interceptors/authenticated-rate-limit.interceptor.ts`; `main.ts` (registers the interceptor); `common/security/client-ip.ts`, `proxy-trust.ts` | Limiter store, and so behaviour across multiple instances, was not examined. No WAF or DDoS control in the repo: no evidence found | ASVS V11 (business logic/anti-automation), V13; ISO A.8.6, A.8.20; SOC2 A1.1, CC6.6; CSF PR.IR |
| 9 | Input validation: global `ValidationPipe` with `whitelist`, `transform`, `forbidNonWhitelisted`; `class-validator` DTOs | `services/api/src/main.ts`; DTO folders per module; `AGENTS.md` (Backend) | Business-rule validation is per service; file-upload content scanning (malware): no evidence found | ASVS V5; ISO A.8.28; SOC2 CC6.8; CSF PR.PS |
| 10 | Error logging with sanitisation and a standard error contract | `services/api/src/common/errors/sanitize-error-log.ts`; `modules/error-logs/error-logs.service.ts` (calls `sanitizeForErrorLog`); `HttpExceptionFilter` and `common/errors/error-catalog.ts` | Redaction is rule-based; completeness against all secret shapes not assessed. Log retention and alerting: no evidence found in this scan | ASVS V7, V8; ISO A.8.15; SOC2 CC7.2; CSF DE.AE; PRIV data minimisation |
| 11 | Tenant lifecycle: retention window (`TENANT_RETENTION_DAYS`, declared default 60), legal/billing retention holds, ordered whole-tenant erasure | `services/api/src/modules/billing/services/cancellation.service.ts`; `retention-hold.service.ts`; `modules/tenant-control-plane/tenant-erasure.constants.ts` and its spec; `docs/engineering/enterprise-hardening-register.md` (default listed) | Whole-tenant only. See control 15 for individual data subjects. Erasure of backups and of third-party copies (email provider, object storage): no evidence found | ISO A.5.33, A.8.10; SOC2 P4.3, C1.2; CSF PR.DS; PRIV storage limitation, erasure |
| 12 | Backups and recovery | `docs/knowledge/architecture/deployment-architecture.md` (rollback rules; `DATABASE_DESTRUCTIVE` = restore from backup) | **No evidence found** of backup schedule, retention, encryption, restore testing, RPO or RTO in the repository. The deployment doc assumes a backup exists | ISO A.8.13, A.5.30; SOC2 A1.2, A1.3; CSF RC.RP, PR.DS |
| 13 | Dependency scanning: production-advisory gate (no critical advisory; high/moderate need written disposition) and Dependabot weekly updates targeting `develop` | `scripts/check-production-advisories.mjs`; `.github/dependabot.yml`; `docs/engineering/enterprise-hardening-register.md` section 1 (alert inventory) | Open GitHub alerts are scored against `main`, so they persist until a release; the register records 111 open alerts on 2026-11-21, mostly dev-scope. No SAST, secret scanning or container scanning evidence found by this scan of workflow names; not exhaustively checked | ASVS V14; ISO A.8.8, A.8.25, A.8.28; SOC2 CC7.1; CSF ID.RA, PR.PS |
| 14 | CI gates: `.github/workflows/ci.yml` (single `CI required gate`), `governance.yml`, framework validation (`scripts/validate-framework.mjs`), lint/typecheck/tests | `.github/workflows/ci.yml`, `.github/workflows/governance.yml`; `docs/development/ci.md`; `docs/engineering/ci-reliability.md`; `docs/engineering/policy-catalogue.json` | A local pass is not a CI pass. Gate depends on correct required-check configuration in GitHub, which is outside the repo; `npm run branch:policy` is read-only verification | ISO A.8.25, A.8.29, A.8.32; SOC2 CC8.1; CSF PR.PS |
| 15 | Branch protection: `main` protected with no admin bypass (`enforce_admins: true`); `develop` as integration branch; read-only verifier | `scripts/verify-branch-policy.mjs`; `AGENTS.md` (Working Agreements, branch model); `docs/engineering/ci-reliability.md` | Live GitHub settings were not queried here (no network). Review requirements for `develop` are intentionally lighter (no PR or human approval needed) | ISO A.8.32, A.5.3; SOC2 CC8.1, CC6.8; CSF PR.PS |
| 16 | Data export for privacy requests: permissioned employee export; data management and data-job modules | `services/api/src/modules/employees/employees.controller.ts` (`GET export`, `employees.export`); `modules/data-management/`, `modules/data/` | No evidence found of a data-subject access request workflow (assemble all of one person's data across modules). Export is an operational feature, not a DSAR tool | PRIV access and portability; ISO A.5.34; SOC2 P5.1, P6.7 |
| 17 | Individual erasure or anonymisation | Open record `docs/bugs/BUG-3186-no-individual-erasure-or-anonymisation-path-exists-and-emplo.md` (Status OPEN, HIGH, P1) | **Control does not exist.** Employee deletion is soft and personal data survives (per that record, dated 2026-09-10; state at current HEAD not re-verified) | PRIV erasure; ISO A.5.34; SOC2 P4.3 |
| 18 | Email and notification controls: all tenant mail through the `notifications` module (catalog, orchestrator, queue, processor); platform mail stored separately; provider credentials via `SecretEncryptionService` | `services/api/src/modules/notifications/` (`email/email-execution.service.ts`, `email/platform-email-provider.resolver.ts`); `modules/platform-communications/platform-email-settings.service.ts` | Delivery-provider contract, SPF/DKIM/DMARC: no evidence found. Message content is not encrypted end to end | ISO A.5.14, A.8.12; SOC2 CC6.7; CSF PR.DS; PRIV transfer |
| 19 | Transactional outbox for platform events | `services/api/src/modules/outbox/` | Delivery guarantees beyond the worker configuration were not examined | SOC2 PI1.2, A1.2; CSF PR.IR |
| 20 | Security headers (HSTS/CSP via `helmet` or equivalent) | Searched `services/api/src` and `services/api/package.json` for `helmet`: **no evidence found**. CORS is configured through `buildCorsOptions` in `main.ts` | Web-app headers in `apps/web`/`apps/admin` Next config were not examined | ASVS V14.4; ISO A.8.9, A.8.26; SOC2 CC6.6; CSF PR.PS |

Controls counted: 20 rows. Rows 12, 17 and 20 are rows where the control is absent or no evidence was found; the rest have some implemented evidence with the stated limits.

## 2. HIPAA applicability

What the repository indicates about health data:

| Indicator | Evidence | Meaning |
|---|---|---|
| Benefit types `MEDICAL`, `DENTAL`, `LIFE`, `DISABILITY`, `WELLNESS`, `INSURANCE` | `enum BenefitType` in `services/api/prisma/schema.prisma` (about line 1700) | Records that an employee is enrolled in a benefit category. This describes employer benefits administration, not clinical data |
| `insuranceFee` decimal | `schema.prisma` (about line 9761) | A monetary amount |
| Leave module (leave types, attachments, documents) | `services/api/src/modules/leave/`, `modules/documents/` | A sick-leave type or an uploaded medical certificate could be stored as a leave attachment or document. Whether any model is purpose-built for medical certificates was not established; the schema search found no model or field named `diagnosis`, `condition` or similar |
| Diagnoses, treatment, medical record numbers, health-plan IDs | Searched `schema.prisma` for medical, sick, health, insurance, diagnos: only the matches above (the other `health` hits are project and device health) | No structured PHI fields found |

Honest conclusion:

- HIPAA applies only if a customer is a US covered entity or business associate **and**
  the platform stores or transmits PHI on that customer's behalf. Employer-held
  employment records (sick-leave dates, benefit enrolment held by an employer in its
  role as employer) are excluded from the HIPAA definition of PHI, but free-text and
  uploaded files can still carry health information, and a health-care customer's own
  workforce data is a different question for counsel.
- Nothing in the repository identifies a US or healthcare customer, and no code path
  is designed around PHI. Applicability is therefore **not established either way**;
  it is a customer and legal question.

Technical gaps a Business Associate Agreement would expose:

1. No evidence found of database-level encryption at rest or key custody (application-level
   encryption exists but is expand-phase only, control 7).
2. No evidence found of a BAA-capable hosting arrangement. Hosting-provider contracts are
   outside the repository and nothing is claimed about them.
3. Audit log immutability and retention: no evidence found (control 6).
4. Backups, restore testing, retention: no evidence found (control 12).
5. Breach-notification procedure and 60-day style timelines: no evidence found.
6. Minimum-necessary access: row scope exists (control 4) but is by convention, not DB-enforced.
7. Upload scanning, field-level classification of health data and a way to disable health
   attachments for a tenant: no evidence found.
8. Email delivery of content that could include health data (control 18) has no confirmed
   BAA-capable provider evidence.

## 3. Control ownership by type

| Type | Items | Status in this repository |
|---|---|---|
| (a) Technical, implementable in code now | Security headers; DSAR assembly and individual anonymisation (BUG-3186); finishing PII-codec contract phase (drop plaintext); audit-log tamper evidence and retention job; automated tenant-isolation test across all tenant models; key rotation for `SecretEncryptionService`; upload malware scanning; SAST and secret scanning in CI; session revocation integration test | Gaps; see section 4 |
| (b) Organizational and policy | Information security policy; access-review procedure; security training; risk register; vendor and sub-processor management; incident-response and breach-notification plan; business continuity and disaster-recovery plan; change-management policy; background checks | Documented in `AGENTS.md` and `docs/engineering/` as engineering practice, but no evidence found of approved company policies, training records, a formal risk register or an incident-response plan |
| (c) Legal and contractual | Data Processing Agreement; Business Associate Agreement; Standard Contractual Clauses for transfers; data-residency commitments (Qatar, Pakistan, GDPR/EEA); sub-processor list; privacy notice; retention schedule approval | The working tree has an untracked draft master agreement template (`docs/DijiPeople_SaaS_Master_Agreement_Final_Template.md`), not reviewed here. `legal` module versions and tracks acknowledgement of legal documents. No evidence found of a DPA, BAA, SCCs or a residency commitment. Hosting region is not asserted by this register |
| (d) Third-party audit | SOC 2 Type I then Type II (auditor, observation window); ISO/IEC 27001 certification (ISMS, Statement of Applicability, certification body); independent penetration test; HIPAA risk assessment by a qualified party | Not started according to the repository: no evidence found. A prior internal audit exists at `docs/engineering/audits/2026-09-10-full-technical-audit/` and is not an independent attestation |

## 4. Gaps ranked by risk

| Rank | Gap | Risk | Tag |
|---|---|---|---|
| 1 | Tenant isolation is convention only: no DB row-level security, no automated all-models scoping proof (control 5) | Cross-tenant data exposure, the highest-impact failure in a multi-tenant HRM | IMPLEMENT_NOW (test and review tooling); OWNER_DECISION (adopt RLS) |
| 2 | PII ciphertext columns are dual-written but plaintext remains authoritative (control 7) | Bank and national-id data readable at rest; encryption gives no protection yet | IMPLEMENT_NOW (contract phase under an ExecPlan with backfill and rollback; destructive, so OWNER_DECISION before the drop) |
| 3 | No individual erasure or anonymisation, and no DSAR assembly (controls 16, 17; BUG-3186) | GDPR erasure and access-request exposure | IMPLEMENT_NOW (build); OWNER_DECISION (retention periods, what must be kept for payroll law) |
| 4 | No evidence of backup schedule, encryption, restore testing, RPO/RTO (control 12) | Unrecoverable data loss; blocks SOC 2 A1 and any BAA | OWNER_DECISION (provider plan, targets); EXTERNAL (provider evidence) |
| 5 | Audit log has no tamper-evidence or defined retention (control 6) | Records cannot be relied on as evidence; weakens SOC 2 CC7 and ISO A.8.15 | IMPLEMENT_NOW (retention and integrity design); OWNER_DECISION (retention length) |
| 6 | No evidence of security headers (`helmet`/CSP/HSTS) on the API (control 20) | Standard web hardening missing; cheap to fix | IMPLEMENT_NOW |
| 7 | No DPA, BAA, SCCs or data-residency position (section 3c) | Cannot lawfully serve EEA or US-health customers on request | OWNER_DECISION; EXTERNAL (counsel) |
| 8 | No evidence of approved security policies, risk register, training, incident-response plan (section 3b) | Blocks SOC 2 and ISO 27001 readiness regardless of code quality | OWNER_DECISION |
| 9 | No key rotation or KMS custody for the encryption passphrase (control 7) | Key compromise has no containment path | IMPLEMENT_NOW (rotation design); OWNER_DECISION (KMS spend) |
| 10 | Dependency alerts: 111 open on `main` as of 2026-11-21, 4 high at runtime scope per the hardening register; no SAST or secret-scanning evidence found | Known-vulnerable runtime packages until a release reaches `main` | IMPLEMENT_NOW (fixes on `develop`); OWNER_DECISION (release to `main`) |
| 11 | No MFA phishing-resistant factor and no SSO (controls 1, 3) | Enterprise customers commonly require SSO | OWNER_DECISION (roadmap, entitlement) |
| 12 | SOC 2 / ISO 27001 / penetration test not performed (section 3d) | Customer procurement blockers | EXTERNAL |

## 5. What this register did not verify

- Live GitHub branch protection and live Dependabot state (no network access).
- Hosting provider configuration: encryption at rest, backups, region, contracts.
- Runtime behaviour of any control; no test was executed to produce this register.
- Whether BUG-3186 is still open at the current HEAD (the record says OPEN, dated 2026-09-10).
- Frontend security headers in `apps/web` and `apps/admin`.
