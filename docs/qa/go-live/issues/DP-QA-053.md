# DP-QA-053 — Every production tenant that has a mail provider row is on `CONSOLE`: tenant mail (activation, password reset, MFA) is not delivered

| Field | Value |
|---|---|
| Category | Email readiness |
| Severity / Priority | Medium / **P2** (blocks real onboarding of any tenant that must receive mail) |
| Status | Open — needs owner approval to change any real tenant's provider |
| Found | Post-deploy verification 2026-11-03 (read-only queries); sanitized |
| Evidence | [[PRODUCTION-VERIFICATION-2026-11-03]] section 8 |

**Observed.** `EmailProviderSetting` has three rows, all `providerType CONSOLE` and enabled (the demo tenant, one earlier customer tenant and one QA sign-up tenant); the most recent tenant has none. The delivery log shows 46 messages `SENT` through SMTP (latest 2026-11-02), 8 `SENT` through CONSOLE (to 2026-09-07) and 4 `NOT_DELIVERED` through CONSOLE (2026-09-08 to 09-11). The platform email setting is real SMTP. The service also has `MAIL_DELIVERY_MODE=log`. The tenant resolver prefers the tenant row, so a tenant on `CONSOLE` never reaches the SMTP path. A sign-in of an owner on such a tenant issued an MFA challenge, so that code most likely went to the console log, not to the owner (inferred from the provider row, not observed).

**Impact.** A customer on `CONSOLE` cannot receive activation, reset or MFA codes by e-mail.

**Resolution.** For each real tenant, switch to the SMTP provider or remove the row so the platform path applies, then prove one controlled delivery to a mailbox the owner controls (not run: it sends real mail and needs approval). The remediation stops `seed:config` from overwriting an existing tenant provider (DP-QA-039), so the correction will persist once it ships.

| Run | Result |
|---|---|
| Post-deploy verification 2026-11-03 | **OPEN** — a real-delivery proof was not run |
