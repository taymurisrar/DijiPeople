---
ID: ITEM-0197
aliases: [ITEM-0197]
Title: TOTP multi-factor authentication for tenant and platform users
Type: SECURITY
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/auth, apps/web, apps/admin]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: TASK-0032
TargetMilestone: 
BlockedBy: 
---

# ITEM-0197 — TOTP multi-factor authentication for tenant and platform users

## Summary

No multi-factor authentication exists anywhere in DijiPeople today, for
either tenant users or platform admins. `mfaRequired`/`mfaMethod` exist only
as inert `tenant-settings` catalog entries, explicitly flagged
`'NOT_IMPLEMENTED'`, and `AuditService`'s `mfaResult` field is hardcoded to
the literal `'NOT_REQUIRED'` at every login — there is no branch anywhere that
could produce any other value. This item is the design and build of TOTP-based
MFA for both `AuthService.login` (tenant) and `AuthService.adminLogin`
(platform).

## Why It Matters

Every account in the system — tenant user or platform admin, including the
seeded `SUPER_ADMIN` root account — is protected by password alone. A
compromised password is a full account takeover with no second factor to stop
it. This is a materially higher-severity gap for platform admins specifically,
since [[BUG-3146]] already documents that platform admin login has **no
lockout at all**, meaning an attacker gets unlimited password guesses today
and, even after that is fixed, would face only a single factor. [[BUG-2509]]
separately documents the platform auth-response builder reading no tenant-
style security policy at all, so there is currently no mechanism to make MFA
mandatory for platform admins even if it existed.

## Evidence

- `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:695-696`
  — `security.mfaRequired: false`, `security.mfaMethod: 'EMAIL'` declared as
  data only.
- `services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts:311-312`
  — both flagged `'NOT_IMPLEMENTED'`.
- `services/api/src/modules/auth/auth.service.ts:1786` — `mfaResult:
  'NOT_REQUIRED'` is a literal constant in the login-success audit snapshot,
  read back for display by `AuditService.log()`
  (`audit.service.ts:219`) but never computed from any real check.
- Exhaustive search for an existing intermediate-token/challenge pattern
  (`preAuthToken`, `pendingAuth`, `challengeToken`, `two-factor`/`2fa`) across
  `services/api/src` returned zero hits — `AuthController.login` and
  `AdminAuthController.login` are both single-shot: credentials in, tokens
  out, in one call. There is no existing multi-step login protocol to extend.
- [[BUG-3146]] (OPEN, `FIX_NOW`) — no lockout on platform admin login at all.
- [[BUG-2509]] — the platform auth-response builder reads no tenant-style
  security policy (flat env-var TTLs only).

## Proposed Approach

Full design already produced by discovery stream D5 (read in full before
implementing) — recommends reusing existing primitives rather than inventing
new ones:

- **Challenge token**: reuse the existing `AuthTokenPayload.type`/`tokenUse`
  discriminator with a new value (`'mfa_challenge'`) rather than a new
  DB-backed opaque token — `JwtAuthGuard` already refuses anything that isn't
  `tokenUse === 'access'` with zero new guard code, so a challenge token is
  automatically unusable as an access token everywhere else. Signed with the
  access-token secret, 5-minute TTL, not persisted to any refresh-token table.
- **Secret storage**: `SecretEncryptionService.encrypt()`/`decrypt()`
  (`common/security/secret-encryption.service.ts`) for the TOTP seed
  (must round-trip so a verify step can compute the current code).
- **Recovery codes**: the `UserInvitation`/password-reset pattern — random
  bytes, SHA-256 hash stored, single-use, time-boxed — not bcrypt (bcrypt is
  reserved for passwords per house convention).
- **New endpoints**: `POST /auth/mfa/setup/start`, `/setup/confirm`,
  `/challenge/verify`, `/challenge/recovery`, `/recovery-codes/regenerate`,
  `/disable` (tenant, under the existing `auth` module); the equivalent six
  under `platform-users`/`AdminAuthController` for platform users, following
  the exact `me`-only, no-id pattern already established at
  `platform-users.controller.ts:47-79`.
- **Admin-triggered reset**: `POST /employees/:employeeId/mfa/reset` and
  `POST /platform-users/:userId/mfa/reset`, mirroring the existing
  `sendResetPasswordLink` pattern — disables the target's MFA and revokes
  their sessions, never reads or rotates a secret on their behalf.
- **Schema** (expand phase, additive): `User.mfaEnabled/mfaSecretEnc/mfaEnabledAt`
  + `MfaRecoveryCode` table; `PlatformUser` equivalents +
  `PlatformMfaRecoveryCode` (a second table, mirroring the existing
  `RefreshToken`/`PlatformRefreshToken` split rather than a polymorphic one).
  Also add `PlatformUser.failedLoginAttempts`/`lockedUntil` as part of the
  same schema change, since [[BUG-3146]] needs them and an MFA challenge step
  behind an unthrottled password path is not a meaningfully higher bar
  without lockout landing alongside it.
- **Frontend**: `apps/web`'s `login-form.tsx` already has a multi-step client
  shape (`company-code-login-step.tsx`) to extend; `apps/admin`'s
  `login-form.tsx` is single-step and needs a new step built. Both apps'
  `app/api/auth/login/route.ts` gate success purely on `tokens` being present
  and must gain a sibling check for the challenge-response shape.
- **This needs an ExecPlan under `PLANS.md`**: it adds new Prisma models/
  fields (schema change), new public unauthenticated endpoints, and changes
  the login contract for two frontends. Full design, endpoint list, schema and
  open product questions are in `docs/tasks/TASK-0032-streams/discovery/D5-auth-mfa.md`.

## Acceptance Criteria

- A tenant user can enroll in TOTP MFA, sign in with a valid code, and is
  refused with a normal error on an invalid code — matching the existing
  anti-enumeration behavior of `validateCredentials`.
- The identical flow works for a platform admin under `AdminAuthController`.
- A user can generate, view once, and later regenerate recovery codes; a
  recovery code is single-use.
- An admin (tenant or platform) can reset another user's MFA, disabling it
  and revoking their sessions, without reading or rotating a secret.
- `mfaResult` in the login audit event reflects the real outcome
  (`NOT_REQUIRED | PASSED | RECOVERY_CODE_USED | FAILED`), not the hardcoded
  constant.
- [[BUG-3146]]'s lockout fix lands together with or before this, per D5's
  explicit recommendation.

## Dependencies

- An ExecPlan under `PLANS.md` (ADR-level design decisions: does
  `security.mfaRequired = true` block login for an unenrolled user or only
  nag; is platform-admin MFA mandatory rather than a per-tenant setting —
  both flagged as open product questions in D5, not answered by discovery).
- [[BUG-3146]] (platform admin lockout) should land together with or before
  this.

## Related Items

- [[BUG-3146]] — no lockout on platform admin login.
- [[BUG-2509]] — platform auth-response builder reads no security policy.
- TASK-0032 — the program that found this gap and produced its design.

## History

- 2026-09-25 — created at `75fec5b9`; discovery stream D5 (full recommended
  design, schema, endpoint list and open questions in
  `docs/tasks/TASK-0032-streams/discovery/D5-auth-mfa.md`).
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032), pending an ExecPlan
  before implementation begins.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]], [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
