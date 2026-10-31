# DP-QA-026 — Tenant e-mail branding is not applied to generated e-mails (settings exist, behaviour is NOT_IMPLEMENTED)

| Field | Value |
|---|---|
| Category | Observation / product decision (branding is a Starter feature) |
| Severity / Priority | Low / **P3** |
| Status | Open — product decision |
| Test | `DPQA-BRAND-005` (passes: asserts what *is* delivered) |
| Env | candidate `22a21a14`, tenant `qa-prov-a`, local SMTP sink |

Activation and password-reset e-mails carry the tenant's **company name** and the tenant's **own host** in the link, never another tenant's, but the subject is fixed ("Reset your DijiPeople password" / "Activate your DijiPeople account for <company>"), the colour is the platform default `#0f766e`, and there is no tenant logo or footer.
The catalog keys `branding.emailSenderName`, `emailFooterText`, `showLogoInEmails` (and 7 more) are classified `NOT_IMPLEMENTED` in `tenant-settings-dispositions.ts`, and the Branding screen does not offer them — so customers are not misled, but the brief's "branding across generated e-mails" is **not met**. Decide: implement, or state in the plan description that e-mails are platform-branded.
Login-page branding works (`welcomeTitle` and brand name applied at once); the logo works for every role except payroll ([[DP-QA-016]] reopened).

| Run | Result |
|---|---|
| RUN-004 | OBSERVED |
