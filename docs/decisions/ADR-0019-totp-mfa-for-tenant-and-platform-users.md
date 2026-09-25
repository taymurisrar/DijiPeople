---
ID: ADR-0019
aliases: [ADR-0019]
Title: Standard TOTP multi-factor authentication for tenant and platform users
Status: ACCEPTED
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
---
# ADR-0019 — Standard TOTP multi-factor authentication for tenant and platform users

## Status

Accepted — 2026-09-25, by the Architect under the owner's TASK-0032 instruction
("standard authenticator apps compatible with TOTP … do not couple MFA to one
vendor").

## Context

There is no MFA. `security.mfaRequired` / `security.mfaMethod` exist only as
catalog data marked `NOT_IMPLEMENTED`; the login audit writes a hardcoded
`mfaResult: 'NOT_REQUIRED'`. Tenant login (`POST /auth/login`) and platform login
(`POST /admin/auth/login`) both issue tokens in one step. Platform login has no
lockout at all (BUG-3146).

## Decision

- **Algorithm:** RFC 6238 TOTP — HMAC-SHA1, 6 digits, 30-second step, ±1 step
  tolerance — implemented on Node `crypto` (RFC 4226 test vectors pinned in a
  spec). Compatible with Microsoft Authenticator, Google Authenticator and any
  standard app. QR codes are rendered server-side with the `qrcode` package from
  the `otpauth://` URI; the base32 key is also shown for manual entry.
- **Where it lives:** on the account that logs in — `User` (per tenant account,
  so a tenant admin's reset can never affect another tenant) and `PlatformUser`.
  Not on the cross-tenant `Identity`.
- **Secrets:** the TOTP seed is stored encrypted with `SecretEncryptionService`
  and never logged, audited or returned after setup. Setup stays *pending* until
  a code from the new seed verifies; restarting setup replaces the pending seed.
- **Replay:** the last accepted time step is stored; a code for that step or an
  earlier one is refused.
- **Recovery codes:** 10 single-use codes, generated from `crypto.randomBytes`,
  shown once, stored as keyed hashes (`SecretEncryptionService.hmac`), each
  consumed on use; regenerating invalidates all previous codes.
- **Login:** after the password (and every existing account/tenant/expiry check)
  succeeds, an enrolled user receives `{ mfaRequired: true, challengeToken }`
  instead of tokens. The challenge token is a JWT with `tokenUse: 'mfa_challenge'`,
  5-minute lifetime, carrying `rememberMe`; `JwtAuthGuard` already refuses any
  token whose `tokenUse` is not `access`. `POST …/mfa/verify` accepts a TOTP or a
  recovery code and only then issues the session. No auth cookie is set before
  verification.
- **Brute force:** a wrong MFA code counts toward the same account lockout as a
  wrong password (tenant `LoginLockoutService`; a new equivalent for platform
  users, which also fixes BUG-3146); verify endpoints get a tight
  `PublicRateLimitGuard` budget.
- **Tenant policy:** when `security.mfaRequired` is on, a user who has not
  enrolled is sent through enrolment during login (challenge kind
  `SETUP_REQUIRED`) before any session is issued. `mfaMethod` accepts `TOTP`.
- **Platform users:** MFA is available to every platform user and optional by
  default. Whether it becomes mandatory for platform users is an owner decision
  recorded in TASK-0032, not a code default.
- **Disable:** requires the current password and a current TOTP or recovery code.
- **Administrative reset:** a tenant user's MFA can be reset by a tenant user
  holding `users.update`; a platform user's MFA by a platform user holding
  `platform-users.manage`. Reset removes the seed and recovery codes and revokes
  the target's sessions; the administrator never sees or chooses a credential.
  Every reset is audited with actor and target.
- **Audit:** `AUTH_MFA_ENABLED`, `AUTH_MFA_DISABLED`, `AUTH_MFA_RESET`,
  `AUTH_MFA_RECOVERY_CODES_REGENERATED`, `AUTH_MFA_RECOVERY_CODE_USED`, and the
  login event's `mfaResult` becomes the real outcome.

## Reasons

- TOTP is the vendor-neutral standard every mainstream authenticator supports.
- Per-account storage keeps tenant administrative reset inside the tenant.
- Reusing the `tokenUse` discriminator means no new guard code can be forgotten.

## Alternatives Considered

- **Email OTP (the catalog's `mfaMethod: 'EMAIL'`).** Rejected as the primary
  factor: it shares a channel with password reset. Can be added later.
- **`otplib`/`speakeasy`.** Rejected: TOTP is ~60 lines on `crypto`; one fewer
  dependency in the authentication path.
- **Store MFA on `Identity`.** Rejected: a tenant admin's reset would then
  affect the person's access to other tenants.

## Consequences

- Schema: MFA fields on `User` and `PlatformUser`, lockout fields on
  `PlatformUser`, two recovery-code tables.
- One new dependency (`qrcode`) in `services/api`.
- Both login screens gain a second step; both security pages gain MFA management.

## Migration / Compatibility Impact

Additive. Nobody is enrolled at release, so login behaviour is unchanged until a
user enrols or a tenant turns `mfaRequired` on.
