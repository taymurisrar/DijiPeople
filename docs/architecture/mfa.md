# Multi-Factor Authentication (TOTP)

Standard, vendor-neutral TOTP second-factor authentication for both tenant
users and platform users, implemented under ADR-0019. Linked from
[`authentication.md`](authentication.md#multi-factor-authentication).

> **Last verified:** 2026-09-25
> **Verified against:** `services/api/src/modules/auth/mfa/` (`totp.ts`,
> `recovery-codes.ts`, `mfa-challenge.ts`, `mfa.service.ts`), `AuthController`,
> `AuthMfaController`, `PlatformUsersService`'s MFA methods, ADR-0019,
> TASK-0032 WP-03. Journeys confirmed by TASK-0032 WP-09 live QA
> (`docs/tasks/TASK-0032-streams/QA-summary.md`).

---

## Algorithm and where secrets live

RFC 6238 TOTP — HMAC-SHA1, 6 digits, 30-second step, ±1 step tolerance —
implemented on Node's built-in `crypto` (RFC 4226/6238 test vectors pinned in
`totp.spec.ts`; no third-party TOTP library was added). Compatible with
Microsoft Authenticator, Google Authenticator and any standard authenticator
app. QR codes are rendered server-side (the `qrcode` package — the one new
dependency this work added) from the `otpauth://` URI; the base32 key is also
shown for manual entry.

The seed lives **on the account that logs in** — `User` (per tenant account,
so one tenant's administrative reset can never touch another tenant's user)
and `PlatformUser` — never on the cross-tenant `Identity`, so a person with
access to several tenants keeps a separate MFA state per tenant account.

The seed is stored via `SecretEncryptionService` (`mfaSecretEncrypted`/
`mfaPendingSecretEncrypted`), never logged, audited or returned after setup.
**Setup refuses outright with `503 MFA_ENCRYPTION_UNAVAILABLE` when
`SECRET_ENCRYPTION_KEY` is not set** — the seed is never stored unencrypted,
confirmed live by TASK-0032 WP-09 QA.

## Setup

`GET /auth/mfa/status`, `POST /auth/mfa/setup`, `POST /auth/mfa/setup/confirm`
(tenant, `AuthMfaController`, `JwtAuthGuard` only — no business permission,
since this acts on the caller's own account); the platform equivalents are
`GET /platform-users/me/mfa`, `POST /platform-users/me/mfa/setup`,
`POST /platform-users/me/mfa/setup/confirm`.

- **Setup stays *pending* until a code from the new seed verifies.**
  Restarting setup replaces the pending seed; nothing is committed to the
  active seed until confirmation.
- Confirming returns **10 recovery codes, shown exactly once.**
- The QR/manual-key screen gates its "Done" action on an explicit
  acknowledgement that the codes have been saved (`mfa-recovery-codes`
  test id) — copy and download both work.

## Login challenge

After password verification (and every existing account/tenant/expiry check)
succeeds, an enrolled account receives a **challenge**, not tokens:

```json
{ "mfaRequired": true, "challengeKind": "VERIFY" | "SETUP_REQUIRED",
  "challengeToken": "...", "challengeExpiresIn": 300, "methods": ["TOTP"] }
```

- **No auth cookie is set before verification** — confirmed live (DevTools
  shows no cookie at the code-entry step).
- The challenge token is a JWT with `tokenUse: 'mfa_challenge'`, a 5-minute
  lifetime, carrying `rememberMe`. `JwtAuthGuard` already refuses any token
  whose `tokenUse` is not `access`, so no separate guard code had to be
  written or can be forgotten to enforce that a challenge token cannot be
  used as a session token.
- `POST /auth/mfa/verify` (tenant, public) / `POST /admin/auth/mfa/verify`
  (platform, public) accept a TOTP or a recovery code and only then issue the
  real session, through the same `completeTenantLogin`/`completePlatformLogin`
  path an ordinary password-only login uses.
- **Verify is single-use**: it is enforced by requiring a live refresh row
  carrying the challenge's own `sessionId` — the issued session takes over
  that id. A theoretical race (two concurrent verifies with two different
  valid codes for adjacent time steps, `s` and `s+1`) could both succeed; this
  is a documented residual risk, not closed by a stronger lock.
- **Tenant `security.mfaRequired`**: when on, an unenrolled user is sent
  through enrolment during login itself (`challengeKind: 'SETUP_REQUIRED'`) —
  QR and key, then recovery codes, then the session — before any tokens are
  issued. `mfaMethod` accepts `TOTP` (the only method with a UI control at
  this baseline; `EMAIL` remains catalog-only, per ADR-0019's rejection of
  email OTP as a primary factor).

## Invalid, expired and replayed codes

- **Replay**: the last accepted TOTP time step is stored per account
  (`mfaLastUsedStep`) — compare-and-set, not merely "was this exact code seen
  before" — so a code for that step or any earlier one is refused, closing
  the classic replay-within-window gap.
- **Expired challenge**: leaving the code step for more than 5 minutes and
  then verifying returns the caller to the password step ("This sign-in has
  expired. Sign in again.").
- **Wrong codes count toward account lockout** — the same
  `LoginLockoutService` a wrong password feeds (tenant), and the new
  `PlatformLoginLockoutService` (platform, below). A locked account gets the
  same generic failure message for a wrong password *or* a wrong code, so a
  caller cannot distinguish "your password was right but you're locked" from
  "your password was wrong."

## Recovery codes

10 single-use codes, `crypto.randomBytes`-generated, 50-bit Crockford-encoded
(`xxxxx-xxxxx` format, case/whitespace-normalised at verification), shown
once at generation, stored as **keyed hashes**
(`SecretEncryptionService.hmac`, bound to the account id — a stolen hash list
from one account cannot be replayed against another). Each is marked
`usedAt` on consumption and refused on reuse. **Regenerating invalidates every
previous code** — confirmed: after regeneration, the old codes are refused.

## Disable

`POST /auth/mfa/disable` (tenant) / `POST /platform-users/me/mfa/disable`
(platform) require **both** the current password and a current TOTP or
recovery code. A wrong password is refused with its own message ("Your
current password is not correct.") and still counts toward lockout.

## Administrative reset

- **Tenant**: `POST /users/:userId/mfa/reset`, gated by
  `@Permissions('users.update')` + `@RequirePermission(ENTITY_KEYS.USERS,
  'write')`, loaded by `{ id, tenantId: user.tenantId }` (never a bare id) plus
  the usual row-level scope from `buildScopedAccessWhere`. Not usable on your
  own record. Removes the seed and recovery codes, **revokes the target's
  live sessions**, and the administrator never sees or chooses a credential.
- **Platform**: `POST /platform-users/:userId/mfa/reset`, gated by
  `assertCanManage` → `platform-users.manage` (ADR-0018 — held only via
  `platform.*`). Same not-self restriction and session revocation.
- Both are audited (`AUTH_MFA_RESET`) with actor and target.

**ADR-0019 as written**: any in-scope holder of `users.update` can reset a
*tenant owner's* MFA, not only a narrower administrative tier — this was a
deliberate scope decision in the ADR, not a residual gap, and is flagged
there as an open question for future tightening ("whether other admins may
reset a tenant owner's MFA").

## Tenant `security.mfaRequired` enforcement

Read by `TenantAuthPolicyService` at sign-in (removed from the settings
catalog's inert-key list it previously sat on, since it now actually gates
behaviour). Turning it on does not retroactively lock anyone out: an
unenrolled user is walked through setup at their next sign-in
(`SETUP_REQUIRED`), never refused entry outright.

## Platform lockout (BUG-3146)

Before TASK-0032, **platform login had no lockout at all** — any number of
wrong admin passwords could be tried indefinitely. `PlatformLoginLockoutService`
now locks after **5 failures in 30 minutes** (atomic increment on
`PlatformUser.failedLoginAttempts`/`lockedUntil`), applied to both password
and MFA-code failures. The response is **identical** —
`"Invalid admin credentials."` — for an unknown address, a wrong password and
a locked account, so no response shape leaks which case applies
(anti-enumeration, spec-pinned). Confirmed live by TASK-0032 WP-09 QA: six
wrong admin passwords, then the correct one, still refused with the same
message.

## Audit

Every MFA lifecycle event writes to the audit log: `AUTH_MFA_ENABLED`,
`AUTH_MFA_DISABLED`, `AUTH_MFA_RESET`, `AUTH_MFA_RECOVERY_CODES_REGENERATED`,
`AUTH_MFA_RECOVERY_CODE_USED`. The login audit event's `mfaResult` field
(`AuditLog`/`PlatformAuditLog`) is now the **real outcome** — before
TASK-0032 it was a hardcoded literal `'NOT_REQUIRED'` regardless of what
actually happened. Platform sign-ins are now audited at all (BUG-3567,
previously zero platform-login audit rows existed): every outcome writes
`AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED` with `tenantId: 'platform'`,
carrying failure reason, real `mfaResult`, session id and forwarded IP/UA — an
unknown address has no actor (the entity recorded is the address tried), and
the password itself is never recorded anywhere.

## Rate limits

`PublicRateLimitGuard`'s `ROUTE_LIMITS` (`common/guards/public-rate-limit.guard.ts`)
carries a route-specific override for MFA code submission, tighter than the
general public-write default: **10 requests per 10-minute window**, keyed by
IP + path, covering `/auth/mfa/verify` (and, by suffix match, `/admin/auth/mfa/verify`)
and `/auth/mfa/challenge/setup/confirm`. This is a per-address backstop, not
the primary control — a caller here already holds a valid password, and a
six-digit code is a much smaller space than a password, so **the account
lockout above is the control that actually matters**; the rate limit exists
so a script cannot burn through guesses faster than a human could type them.

## What is never logged

The TOTP seed (pending or active), any submitted code, any recovery code, the
`otpauth://` URI, and the password submitted at any MFA step. Confirmed by
`Logger`/`AuditService` spies in `mfa.service.spec.ts` and
`platform-login-audit.spec.ts` — none of these values appear in a log line or
an audit snapshot at any point in the lifecycle.

## Frontend surfaces

- **Web**: My Profile → "Two-factor authentication" card
  (`data-testid="mfa-settings"`); login gains a code step after the password
  (`mfa-login-step.tsx`); Settings → Users → a user → Security tab shows
  status and "Reset MFA" (absent on your own record); Settings → Security →
  Login Rules → "Require two-factor authentication" toggles
  `security.mfaRequired`.
- **Admin**: `/security` (`data-testid="admin-mfa-settings"`) for a platform
  user's own MFA; login gains the same code step; `/settings/users` shows a
  "Two-factor" column and "Reset MFA" (not offered for your own record).

## Known residual risks

- Concurrent-verify race on adjacent time steps (see "Login challenge"
  above) — not closed, documented.
- `SETUP_REQUIRED` lets whoever currently holds the password enrol an
  unenrolled account — inherent to forced enrolment; an administrative reset
  is the recovery path if this is exploited.
- No `SETUP_REQUIRED` flow exists for platform operators — mandatory MFA for
  platform users was an explicit owner decision under ADR-0019 and defaults
  to **optional**; nothing forces platform enrolment today.

## Related

[[platform-auth]] · [`rbac.md`](rbac.md#platform-roles-adr-0018) ·
[ADR-0019](../decisions/ADR-0019-totp-mfa-for-tenant-and-platform-users.md).
