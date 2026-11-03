# DP-QA-053 — Tenant mail provider rows are all `CONSOLE`; production ignores them and sends through the platform SMTP relay, but no controlled delivery has been proven

| Field | Value |
|---|---|
| Category | Email readiness |
| Severity / Priority | Low / **P3** (CORRECTED from P2: the first reading was wrong, see below) |
| Status | Open — a real-delivery proof needs owner approval |
| Found | Post-deploy verification 2026-11-03 (read-only queries); sanitized |
| Evidence | [[PRODUCTION-VERIFICATION-2026-11-03]] section 8 |

**Correction.** The first version of this record said a tenant on `CONSOLE` never reaches SMTP and cannot receive activation, reset or MFA mail. That was inferred from an older architecture note and is **wrong for the deployed code**: `EmailProviderFactory.resolveProvider` (ADR-0015 / BUG-3501, present in production `2a473785`) *ignores* CONSOLE and DEV rows in production (`sinkProvidersRetired`), so a tenant whose only row is CONSOLE falls through to the platform relay (`EffectiveEmailProviderService.resolveForTenant`). The delivery log agrees: CONSOLE deliveries stop on 2026-09-11 (marked `NOT_DELIVERED` after ADR-0015) and 46 messages went `SENT` through SMTP up to 2026-11-02.

**What is true.** Three tenants carry an enabled `CONSOLE` row (the demo tenant, an earlier customer tenant and a QA sign-up tenant) and one has none. In production those rows are inert clutter; the tenant's mail leaves through the platform SMTP relay with the platform's sender identity, not a tenant-specific one. `MAIL_DELIVERY_MODE=log` is read only by the generic mailer service, not by tenant notifications. A sign-in on the demo tenant during the verification issued an MFA challenge whose code therefore most likely went by e-mail to that owner (the owner's own address; inferred, not observed).

**Remaining gap.** No controlled delivery to an owner-approved mailbox has been run, so activation, reset, link and branding rendering are unproven in production. Tenant-specific sender identity requires configuring a real tenant provider, which changes a customer's configuration and needs approval.

**Resolution.** (1) One controlled delivery to an approved test mailbox (password reset on a synthetic test tenant). (2) Optionally remove the inert CONSOLE rows (owner approval; the rows are harmless). The remediation stops `seed:config` from overwriting an existing tenant provider (DP-QA-039).

| Run | Result |
|---|---|
| Post-deploy verification 2026-11-03 | **OPEN, severity corrected to P3** — a real-delivery proof was not run |
