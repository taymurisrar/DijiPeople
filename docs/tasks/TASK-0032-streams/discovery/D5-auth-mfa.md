# D5 — Authentication architecture discovery, for TOTP MFA design

> Read-only discovery. No source, git state or database was modified. Worktree:
> `D:/My Work/hrm-dijipeople/dp-partner-admin` (branch
> `agent/partner-agreements-admin-hardening`).

## 1. Tenant login flow (`services/api/src/modules/auth`)

**Controller** — `auth.controller.ts:39-173`. `@Controller('auth')`, class-level
`@UseGuards(JwtAuthGuard, PermissionsGuard)`, all sign-in endpoints marked
`@Public()` + `@UseGuards(PublicRateLimitGuard)` individually:

- `POST /auth/signup` (`:49`)
- `POST /auth/discover-workspaces` (`:66-72`) — takes email+password, returns
  which tenants those credentials reach, **issues no token**. Documented reason
  in the code comment: answering "which workspaces reach this email" without a
  password is a customer-enumeration oracle.
- `POST /auth/login` (`:76-97`) — single call, straight to `setAuthCookies`.
- `POST /auth/refresh` (`:101-124`)
- `GET /auth/invitation-status`, `POST /auth/activate-account` (`:126-137`)
- `POST /auth/forgot-password`, `POST /auth/reset-password` (`:139-151`)
- `GET /auth/me` (`:153-157`)
- `POST /auth/logout` (`:166-172`)

**`AuthService.login`** (`auth.service.ts:283-396`) is entirely single-step:
`validateCredentials` → tenant/account-active check → password-expiry check →
`buildAuthResponse` (issues tokens) → persist refresh token → audit event.
**There is no branch anywhere in this method that stops short of returning
tokens.** Adding MFA means inserting a new terminal state between
`validateCredentials` succeeding and `buildAuthResponse` being called.

**`validateCredentials`** (`:1300-1455`) — full detail, since this is exactly
where an MFA gate would sit:
1. Resolve tenant (`resolveLoginTenant`, `:1554+`), look up `User` by
   `(tenantId, email)`.
2. `resolveLoginCredential(this.prisma, user.id)` (`:1348`) — reads from the
   `Identity` model where migrated, else falls back to `User.passwordHash`.
   Refuses outright if the `Identity` is `SUSPENDED`.
3. Two independent locks both must pass (`:1375-1410`): `credential.identityLockedUntil`
   (global, cross-tenant) and `this.loginLockoutService.isLocked(user)`
   (tenant-scoped, per `User.lockedUntil`).
4. `bcrypt.compare` (`:1412`). Failure → `loginLockoutService.registerFailure(user)`
   **and** `registerIdentityFailure` (dual counters).
5. Success → `loginLockoutService.registerSuccess(user)` + `registerIdentitySuccess`,
   returns the `User`.

Every failure path — unknown user, suspended identity, locked account, wrong
password — throws the **identical** `AUTH_INVALID_CREDENTIALS` /
`'Invalid credentials.'` (`:1332-1335`, `:1363-1366`, `:1406-1409`,
`:1443-1446`). This is a deliberate anti-enumeration pattern that any MFA
challenge response must not break (a distinguishable "MFA required" response is
fine — it only fires after the password is proven correct).

**`LoginLockoutService`** (`login-lockout.service.ts`) — 5 failures / 30 min
default, tenant-adjustable up to 20 failures / 24h via `TenantSettingsResolverService.getSecuritySettings`
(clamped, `:37-62`). Locks `User.lockedUntil` + resets `failedLoginAttempts`
(`:74-124`). Never throws (`:73` doc comment) — a bookkeeping failure must not
turn a wrong password into a 500.

**Session/token model.** `AuthTokenPayload`
(`common/interfaces/authenticated-request.interface.ts:47-61`):
```ts
type AuthTokenPayload = {
  sub: string; tenantId: string; email?: string; sessionId: string;
  tokenVersion: number;
  type?: 'access' | 'refresh' | 'agent-refresh';
  tokenUse?: 'access' | 'refresh';
  appClientId?: string; aud?: string; deviceId?: string;
  authSubjectType?: 'tenant-user' | 'platform-user';
  rememberMe?: boolean; platformRole?: PlatformUserRole;
};
```
`JwtAuthGuard.canActivate` (`common/guards/jwt-auth.guard.ts:79-88`) **rejects**
any token where `tokenUse !== 'access' && type !== 'access'` before doing
anything else. This is the load-bearing fact for MFA design: a new token
`type`/`tokenUse` value (e.g. `'mfa_challenge'`) is automatically unusable as an
access token everywhere else in the app, with zero new guard code.

**JWT issuance per client** — `buildAuthResponse` (tenant, `:2268-2347`) and
`buildPlatformAuthResponse` (platform, `:2349-2430+`). Both sign with
per-client secrets via `getClientAccessTokenSecret`/`getClientRefreshTokenSecret`
(`common/config/auth.config.ts`), keyed on `AuthClientId` (`web`/`admin`/`agent-desktop`).
Tenant path reads `TenantAuthPolicyService.resolveEffectivePolicy` for
`allowRememberMe`, `sessionTimeoutMinutes`, `refreshTokenExpiryDays`,
`absoluteSessionLifetimeDays`, `idleTimeoutMinutes` (`:2278-2280`,
`tenant-auth-policy.service.ts:33-125`, reads `TenantSetting` rows,
`category: 'security'`). Platform path (`:2377-2383`) reads **no policy at
all** — flat env-var TTLs — which is exactly BUG-2509 (below).

**`appClientId`** — arrives via header, resolved by `getAuthClientIdFromHeaders`
(`common/config/auth.config.ts`), must equal the token's `appClientId` **and**
`aud` (`jwt-auth.guard.ts:90-98`, `auth.service.ts:571`, `:1665`). Cookies are
named and scoped per client by `getAuthCookieNames`.

**Refresh** — `AuthService.refresh` (`:553-666`): verifies the refresh JWT,
re-checks `appClientId`/`aud` match, `hasActiveRefreshToken` /
`hasActivePlatformRefreshToken`, then `rotateRefreshToken` /
`rotatePlatformRefreshToken` with a grace window for the losing side of a
concurrent-rotation race (`wasRotatedWithinGraceWindow`, tested in
`auth-session-lifecycle.spec.ts:525-` — BUG-3359/EXECPLAN-0037). Rebuilds a
fresh `buildAuthResponse`/`buildPlatformAuthResponse` (`:629`, `:2106`).

**Logout** — `AuthService.logout` (`:1135-1235`) revokes by `sessionId` first,
falls back to the refresh cookie; separately queries `RefreshToken` vs.
`PlatformRefreshToken` by `appClientId` (`:1177`, `:1198`) — **never the wrong
table for the wrong subject**, per `auth-session-lifecycle.spec.ts:194`
("...and never the tenant one").

**Password reset/change** — `requestPasswordReset`/`resetPassword`
(`:807-1008`ish), `requestAdminPasswordReset`/`resetAdminPassword`
(`:433-553`, separate flow for platform admins, in the same service). Reset
tokens: raw random bytes, SHA-256 `tokenHash` stored, `expiresAt` — same shape
as invitations (see §3).

**Where the login audit event is written** — `logTenantAuthEvent`
(`:1757-1801`), called from every branch above. It writes through
`AuditService` with `AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED`.
`mfaResult: 'NOT_REQUIRED'` is hardcoded at `auth.service.ts:1786`, inside the
success snapshot payload — it is a **literal constant**, not read from any
config or computed from any check. `AuditService.log()` reads it back out of
`afterSnapshot` at `audit.service.ts:219` (`readSnapshotString(item.afterSnapshot, 'mfaResult')`)
purely for display — there is no branch anywhere that could currently produce
any other value.

**Prisma models used**: `User` (`schema.prisma:4342-4447` — `failedLoginAttempts`,
`lockedUntil`, `passwordHash`, `passwordChangedAt`, `passwordHistory` relation),
`RefreshToken` (`:4868-4899`, tenant sessions, `tokenHash` unique, `appClientId`,
`sessionId`, `absoluteExpiresAt`, `lastActivityAt`, `revokedAt`),
`PlatformUser` (`:4449-4498` — **no** `failedLoginAttempts`/`lockedUntil`
field exists), `PlatformRefreshToken` (`:4901-4927`, mirrors `RefreshToken`
minus `tenantId`), `UserInvitation` (`:4929+`, the one-time-token pattern to
copy — see §3), `Identity` (cross-tenant credential, referenced but not read
in full here), `PasswordHistory`.

## 2. Platform admin login

Same `auth` module, **not** a separate `platform-auth` module for
login/credentials — `platform-auth/platform-permissions.ts` only holds the
route→permission map for *authorization* (see `docs/knowledge/modules/platform-auth.md`),
it has no controller or credential logic of its own.

`AdminAuthController` (`admin-auth.controller.ts`) — `@Controller('admin/auth')`,
routes: `POST /admin/auth/login` (`:19-39`), `forgot-password` (`:43-46`),
`reset-password` (`:50-53`), all `@Public()` + `PublicRateLimitGuard`.

`AuthService.adminLogin` (`:398-431`) → `validatePlatformAdminCredentials`
(`:1490-1531`) → status check → `buildPlatformAuthResponse` → persist
`PlatformRefreshToken` + `lastActiveAt` touch. **No lockout call anywhere in
this path** — this is exactly BUG-3146 (confirmed at `auth.service.ts:1471`
in that record, current line is `:1490`; content matches).

`validatePlatformAdminCredentials` looks up `PlatformUser.findUnique({ email })`
directly (no tenant). A separate, seemingly dead/parallel method
`validateAdminCredentials` (`:1457-1488`) checks `User` rows against
`ADMIN_AUTH_ROLE_KEYS` — this is **not** what `adminLogin` calls; it appears to
be either legacy or used by a different caller. Worth confirming its call sites
before designing around it (not investigated further — out of scope for this
discovery, flagging as a follow-up question).

**Platform credential storage**: `PlatformUser.passwordHash`
(`schema.prisma:4454`), bcrypt-hashed, no MFA-related fields at all.

**Authorization boundary for platform routes**: `platform.id` is the only
trusted signal (`docs/knowledge/modules/platform-auth.md` — read in full,
summarized): `PlatformPermissionsGuard` fails closed, checks `platform.id`
first, then resolves the route's required permission via
`resolvePlatformPermission` (a path-substring matcher enumerated against
`SuperAdminController`'s route metadata in `platform-permissions.spec.ts`).
`JwtAuthGuard` routes a token to `loadPlatformAccessContext` specifically when
`clientId === 'admin' && payload.authSubjectType === 'platform-user'`
(`jwt-auth.guard.ts:102-108`) — this is the same discriminator an MFA challenge
token would need to preserve.

## 3. The intermediate-token pattern to reuse — **there is none for login**

Searched exhaustively (`preAuthToken`, `pendingAuth`, `challengeToken`,
`two-factor`/`2fa`, `mustChangePassword`/`forcePasswordChange`/`firstLogin`) —
**zero hits** in `services/api/src`. `mfaRequired`/`mfaMethod` exist only as
inert catalog entries (`tenant-settings.catalog.ts:695-696`) marked
`'NOT_IMPLEMENTED'` in `tenant-settings-dispositions.ts:311-312`.

**`AuthController.login` and `AdminAuthController.login` are both single-shot**:
credentials in, tokens out, in one HTTP call (§1, §2). There is no existing
"step 2 of login" endpoint, no partial/pre-auth JWT, no session row created
before full authentication completes. The closest adjacent patterns, useful as
raw material rather than as a ready-made mechanism:

- **`discover-workspaces`** (`auth.controller.ts:54-72`) — the one place the
  API already asks for a full credential and responds without issuing a token.
  Its documented rationale (don't leak existence without proof of the
  credential) is the same rationale an MFA challenge response needs: only
  disclose "MFA required" to a caller who already proved the password.
- **`UserInvitation`** / **password reset** tokens
  (`user-invitations.service.ts:58-60`, `:350-352`) — `randomBytes(32).toString('hex')`
  raw value, `createHash('sha256').update(token).digest('hex')` stored as
  `tokenHash` (unique), `expiresAt` column, single-use via a status/consumed
  field. **This is the pattern to copy for an MFA challenge token and for
  recovery codes** — a random value, hashed at rest, looked up by hash, time-
  boxed, single-use.
- **The `AuthTokenPayload.type`/`tokenUse` discriminator** (§1) — the
  mechanism to copy for a short-lived MFA challenge *JWT* if a JWT is preferred
  over an opaque DB-backed token (tradeoffs in §"Recommended MFA design"
  below).

**Conclusion for design purposes: there is no existing multi-step
login/pre-auth flow to slot into. The MFA challenge step must be designed from
scratch**, using the invitation/reset-token shape as the nearest precedent and
the `type`/`tokenUse` JWT discriminator as the safety mechanism that keeps a
challenge token from ever being accepted as an access token.

## 4. Frontend login pages

**`apps/web`**:
- `app/(public)/login/login-form.tsx` (361 lines) + `company-code-login-step.tsx`
  — already a multi-step **client-side** UI (tenant/company-code resolution
  before the credential step), so the app has *UI* precedent for a wizard-style
  login even though the API has no matching multi-step protocol. A new "enter
  your 6-digit code" step would fit this existing component shape.
- `app/api/auth/login/route.ts` — thin proxy. **Load-bearing detail for MFA**:
  `isLoginSuccessResponse` (`:169-182`) gates purely on
  `typeof data.tokens === 'object' && tokens.accessToken/refreshToken are strings`.
  A "MFA required" response from the API (no `tokens`) would **fail this check
  today** and be reported to the browser as `502 "Login response missing
  tokens."` — this route handler must be changed to recognize and pass through
  a distinct challenge-response shape rather than only success/hard-error.
  Cookie-setting (`buildAuthSessionCookies`, `:74-95`) must only run on the
  branch that actually received tokens.
- `app/api/auth/*` also has `activate-account`; no other auth sub-routes were
  found needing changes for MFA beyond `login`, plus a new route the frontend
  would call for the verify step (e.g. `app/api/auth/mfa/verify/route.ts`,
  net-new).

**`apps/admin`**:
- `app/login/login-form.tsx` (196 lines) — currently a **single-step** form,
  unlike `apps/web`. Adding an MFA step here has no existing multi-step
  precedent to lean on inside this app; it would be new.
- `app/api/auth/login/route.ts` — same shape as web's, same problem:
  `isLoginSuccessResponse` (`:204-220`) requires `accessToken`/`refreshToken`
  strings of length > 20; a challenge response fails this and falls into the
  generic error branch (`:75-83`, `502`). Also sets a `REMEMBER_ME_COOKIE`
  cookie directly (`:141-145`) that the web app does not have an equivalent
  for — note this asymmetry if `rememberMe` needs to survive across the
  challenge step.

**No forced-password-change or legal-acknowledgement intermediate step exists
in either app's login route** — confirmed by the same grep in §3
(`passwordSetupRequiredBeforeFirstLogin` is also `'NOT_IMPLEMENTED'` per
`tenant-settings-dispositions.ts:310`). Whatever step ordering MFA needs (e.g.
must a user with an expired password complete MFA first, or reset first?) is
an open product question with no precedent to copy — `AuthService.login`
currently checks tenant/account-active and password-expiry **before** any
token is issued (`:288`, `:329`), so MFA should probably slot in after those
two checks and before `buildAuthResponse`, matching that existing ordering.

## 5. Security / profile pages where MFA management would live

**`apps/web`**: `app/(authenticated)/profile/page.tsx` is a **bare redirect**
to `APP_ROUTES.me` = `/my-profile` (`lib/routes.ts:5`). The real profile page
is `app/(authenticated)/my-profile/page.tsx` (not read in full — flagged for
the implementation stream to inspect for where a "Two-factor authentication"
section would attach). No dedicated tenant-user security/account page distinct
from `my-profile` was found; the web app's Settings runtime
(`app/(authenticated)/settings/_lib/`) is tenant-admin configuration, not a
personal security page — confirm during implementation whether MFA management
belongs on `my-profile` or needs a new settings item.

**`apps/admin`**:
- `app/(internal)/security/page.tsx` — **real and functional**, the platform
  user's own security page: account summary, `ChangePasswordForm`
  (`app/_components/security/change-password-form.tsx`, posts to
  `POST /api/platform-users/me/password`), and a live "Active sessions" table
  sourced from `GET /platform-users/me/security`
  (`platform-users.controller.ts:47-50` → `PlatformUsersService.getSecurityOverview`,
  `platform-users.service.ts:119`). **This is where a "Two-factor
  authentication" section belongs** — same `me`-only pattern (no user id in
  the URL, scoped entirely to `@CurrentUser()`).
- `app/(internal)/account-settings/page.tsx` — a separate, mostly-redundant
  read-only summary (user id, email, tenant, role keys). Not wired to any
  mutation; not a natural MFA home.
- `app/(internal)/settings/security/page.tsx` — **cosmetic only**. Hardcoded
  `defaultValue`/`defaultChecked` strings ("Session inactivity timeout: 15
  minutes", toggles for "Require active user status" etc.) with **no fetch, no
  submit handler, no API call at all**. This page currently renders a fake
  settings screen. Do not treat any control on it as live, and do not build a
  tenant/platform-wide "require MFA for all admins" toggle here without wiring
  it end-to-end — it would be the second thing on this exact page that looks
  configured but is not.

**`platform-users.controller.ts`** `me` routes (`:47-79`) are the concrete
pattern for every new platform-side MFA endpoint: no id in the path, actor
resolved from `@CurrentUser()`, so a route can never be pointed at another
platform account by accident.

## 6. `mfaRequired`/`mfaMethod` tenant settings — current status

- Declared only as data: `tenant-settings.catalog.ts:695-696`
  (`security.mfaRequired: false`, `security.mfaMethod: 'EMAIL'`).
- Explicitly flagged `'NOT_IMPLEMENTED'` in
  `tenant-settings-dispositions.ts:311-312` (a disposition catalog that
  presumably drives some "not yet built" UI treatment — not inspected further).
- **Not read anywhere** — confirmed by the earlier grep across
  `services/api/src` for `mfaRequired`/`mfaMethod`/`MFA`: the only other hits
  are the audit `mfaResult` constant and its spec (§1).
- **No UI exposes it** — neither `apps/web` settings nor `apps/admin` settings
  screens reference `mfaRequired`/`mfaMethod` (grep found nothing outside the
  catalog/dispositions files).
- `TenantAuthPolicyService` (`tenant-auth-policy.service.ts:42-49`) is the
  live analog to extend: it already reads a fixed key list from
  `TenantSetting` rows with `category: 'security'`. Adding `mfaRequired`
  there (same table, same category, same read shape as `allowRememberMe`) is
  the natural way to make the setting real, rather than inventing a second
  settings-read path.

## 7. Encryption, hashing and rate limiting to reuse

**`SecretEncryptionService`** (`common/security/secret-encryption.service.ts`) —
AES-256-GCM, format `enc:v1:<iv>:<authTag>:<ciphertext>` (`:26-27`, `:100-115`),
key derived via SHA-256 of `SECRET_ENCRYPTION_KEY`/`APP_ENCRYPTION_KEY`
(`:39-67`), refuses to boot in production without the key (`:48-57`). API:
`encrypt(plainText)`/`decrypt(value)` (round-trip, for values that must be read
back — e.g. a TOTP secret, since a user re-scanning or an admin-assisted
recovery may need the plaintext seed again) and a separate **deterministic**
`hmac(value)` (`:87-94`, SHA-256 HMAC keyed off the same material) for values
that need a lookup/uniqueness index without ever being decrypted (`:73-86`
doc comment explains exactly this tradeoff). **This is directly the pair of
primitives an MFA design needs**: `encrypt`/`decrypt` for the TOTP secret
(must round-trip so the verify step can compute the current code), `hmac` for
recovery-code lookup (never decrypted, only compared).

**Hashing utility used elsewhere for one-time tokens**: plain
`createHash('sha256').update(token).digest('hex')`
(`user-invitations.service.ts:350-352`), **not** bcrypt — bcrypt is reserved
for passwords (`auth.service.ts:1412`, `:1464`, `:1510`) where deliberate slowness
matters; invitation/reset tokens use a fast, unsalted SHA-256 because the input
is already 32 random bytes (256 bits of entropy), so salting/slow-hashing buys
nothing an attacker could exploit by precomputation. **Recovery codes should
follow the token pattern (SHA-256 hash, stored, compared by exact hash match),
not the password pattern (bcrypt)** — same entropy argument, and bcrypt has a
72-byte input cap that plain SHA-256 doesn't need to worry about.

**Rate limiting**: `PublicRateLimitGuard`
(`common/guards/public-rate-limit.guard.ts`) — per `(client IP, path)`,
in-process `Map`, 10-minute window (`:10-13`), 20 writes / 120 reads default
(`:24-25`), with a documented per-route override list (`:42-44`, currently only
`/auth/refresh` at 600). **An MFA verify endpoint (`POST
/auth/mfa/challenge/verify` or similar) must be added to this guard as a
`@Public()` route** (the caller isn't authenticated yet — they only hold a
challenge token) and almost certainly needs its own override: 20 requests per
10 minutes per IP is very loose for a 6-digit TOTP guess (10^6 space), so a
tighter, code-specific budget (the comment block at `:15-23` explicitly asks
future routes to size their own budget rather than accept the default) should
be added the same way `/auth/refresh` was. Recovery-code verification should
get the same treatment, probably with the write default rather than a raise.

## 8. Admin credential-reset patterns

**Tenant admin resetting an employee's password** —
`EmployeesController` (`employees.controller.ts:778-785`):
```
@Permissions('employees.update')
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
sendResetPasswordLink(@CurrentUser() user, @Param('employeeId') employeeId)
  → this.employeeProfilesService.sendPasswordResetLink(user, employeeId)
```
**The admin never sets or sees the new password.** They trigger the same
forgot-password email flow the employee would trigger themselves; the employee
completes it. This is the pattern to copy for "admin MFA reset": a tenant
admin (or platform admin, for platform users) should get a `POST
.../mfa/reset` action that **disables the target's MFA and invalidates their
existing sessions**, not one that reads/rotates a secret on their behalf —
mirroring "the admin can force a fresh start, never read or reuse the
credential."

**Platform admin managing platform users** — `PlatformUsersController` has
`@Patch(':userId')`/`@Delete(':userId')` (`:97, :106`) for other platform
accounts, separate from the `me/*` block (§5) used for self-service. An MFA
reset for another platform user would follow the `:userId` shape, guarded by
whatever permission already gates `PATCH /platform-users/:userId` (not
independently investigated — check `platform-users.controller.ts` decorators
at those two lines before implementing).

No direct "admin sets a new password for a user" endpoint was found anywhere
(only the send-a-reset-link pattern) — consistent with the codebase's stated
preference (visible in the invitation/reset code comments) for never letting
one party learn or choose another party's credential.

## 9. Existing auth tests to extend

- `services/api/src/modules/auth/auth.service.spec.ts` — service-level unit
  tests; `login`/`adminLogin`/`validateCredentials` behavior lives here.
- `services/api/src/modules/auth/auth-session-lifecycle.spec.ts` — the most
  relevant file for MFA. Already structured around exactly the seams MFA
  needs: `describe('remember me changes how long a session lives', ...)`
  (`:364-459`, includes the platform "no policy able to refuse it" pin at
  `:432` — the BUG-2509 regression pin, must be revised together with any MFA
  work that also touches the platform auth-response builder),
  `describe('a revoked session is refused everywhere...')` (`:239-363`),
  `describe('refresh rotation grace window...')` (`:525-663`). An MFA
  challenge-token lifecycle (issued, verified, expired, single-use, rejected as
  an access token) fits this file's existing style of "pin the exact security
  property, name the bug/plan it came from."
- `services/api/src/modules/auth/login-lockout.service.spec.ts`,
  `password-policy.service.spec.ts` — pattern to copy for a new
  `mfa-policy.service.spec.ts`/`totp.service.spec.ts` if those become their own
  services.
- `services/api/src/modules/platform-auth/platform-permissions.spec.ts` —
  enumerates `SuperAdminController` routes and fails on any unmapped route;
  new platform MFA-management endpoints under `super-admin`/`platform-users`
  must be added to `resolvePlatformPermission`'s map or they will 403 every
  platform role (per `docs/knowledge/modules/platform-auth.md`'s documented
  failure mode).
- `services/api/test/permission-propagation.e2e-spec.ts` — likely needs new
  cases if MFA endpoints get their own permission keys.
- No test file anywhere currently exercises `mfaRequired`/`mfaMethod`,
  `mfaResult`, or a TOTP-shaped flow — this is genuinely greenfield.

---

## Recommended MFA design

### Schema (new Prisma models/fields — expand phase, per `prisma/AGENTS.md`)

```prisma
model User {
  // ...existing fields...
  mfaEnabled        Boolean   @default(false)
  mfaSecretEnc      String?   // SecretEncryptionService.encrypt() — TOTP seed
  mfaEnabledAt      DateTime?
  mfaRecoveryCodes  MfaRecoveryCode[]
}

model PlatformUser {
  // ...existing fields...
  mfaEnabled        Boolean   @default(false)
  mfaSecretEnc      String?
  mfaEnabledAt      DateTime?
  // BUG-3146 fields, needed regardless of MFA:
  failedLoginAttempts Int      @default(0)
  lockedUntil         DateTime?
  recoveryCodes       PlatformMfaRecoveryCode[]
}

// One table per subject type mirrors RefreshToken/PlatformRefreshToken's
// existing split rather than a polymorphic table — consistent with house style.
model MfaRecoveryCode {
  id          String    @id @default(uuid())
  tenantId    String
  userId      String
  codeHash    String    // SHA-256, same primitive as UserInvitation.tokenHash
  usedAt      DateTime?
  createdAt   DateTime  @default(now())
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([codeHash])
  @@index([tenantId, userId])
}

model PlatformMfaRecoveryCode {
  id             String       @id @default(uuid())
  platformUserId String
  codeHash       String
  usedAt         DateTime?
  createdAt      DateTime     @default(now())
  platformUser   PlatformUser @relation(fields: [platformUserId], references: [id], onDelete: Cascade)

  @@unique([codeHash])
  @@index([platformUserId])
}
```
`mfaSecretEnc` stores `SecretEncryptionService.encrypt(base32Secret)` (round-trip,
needed to verify a live TOTP code). Recovery codes are hashed only (SHA-256,
never round-tripped, following `UserInvitation.tokenHash`'s pattern) — the
plaintext is shown once at generation time and never again.

`TenantSetting` needs no schema change — `security.mfaRequired` /
`security.mfaMethod` already exist in the catalog; wire
`TenantAuthPolicyService` to read `mfaRequired` alongside `allowRememberMe`
(same table, same category) and drop the `'NOT_IMPLEMENTED'` disposition once
it is.

### Challenge token

Reuse the `AuthTokenPayload.type`/`tokenUse` discriminator (§1) rather than a
new DB-backed opaque token, because `JwtAuthGuard` already refuses anything
that isn't `type === 'access'` with zero new guard code, and it keeps the
challenge token stateless and short-lived like the access/refresh tokens it
sits next to:

```ts
type: 'mfa_challenge'; tokenUse: 'mfa_challenge';
sub: user.id; tenantId: user.tenantId; sessionId: <fresh uuid>;
appClientId: clientId; aud: clientId;
authSubjectType: 'tenant-user' | 'platform-user';
```
Signed with the **access-token secret** for that client (no new secret to
provision), TTL 5 minutes, not persisted to any refresh-token table — it never
needs revocation-by-row because it is single-purpose and short-lived; the
verify endpoint re-derives everything from `sub`/`tenantId` at the moment it's
used. `JwtAuthGuard` rejects it automatically everywhere else because
`tokenUse !== 'access'`.

### Endpoints

Tenant (`apps/web` facing, under the existing `auth` module):
- `POST /auth/mfa/setup/start` (authenticated) — generates a TOTP secret,
  encrypts and stores it *pending* (a `mfaPending`-style unconfirmed state, or
  simply don't set `mfaEnabled=true` until confirm), returns the base32 secret
  + otpauth:// URI for a QR code. Not `@Public()` — this is a settings-page
  action on an already-signed-in user (`my-profile`, §5).
- `POST /auth/mfa/setup/confirm` — body: one TOTP code. Verifies against the
  pending secret, sets `mfaEnabled=true`, `mfaEnabledAt=now()`, generates and
  returns N recovery codes **once** (hash-and-store, per §7's SHA-256 pattern),
  audits `AUTH_MFA_ENABLED`.
- `POST /auth/login` — unchanged signature, but after the existing
  tenant/password-expiry checks (`:288`, `:329`) and before `buildAuthResponse`
  (`:360`): if `user.mfaEnabled` (or tenant `mfaRequired` and not yet enrolled
  — a product decision on whether unenrolled-but-required blocks login or
  forces setup), return `{ mfaRequired: true, challengeToken, methods: ['TOTP','RECOVERY_CODE'] }`
  instead of tokens. **No cookies set** — `AuthController.login` must branch on
  this before calling `setAuthCookies`.
- `POST /auth/mfa/challenge/verify` — `@Public()` + `PublicRateLimitGuard` with
  a route-specific tight budget (§7) — body: `challengeToken` + `code`.
  Verifies the challenge token (rejects anything not `tokenUse: 'mfa_challenge'`,
  expired, or subject mismatch), verifies the TOTP code against the decrypted
  secret (window ±1 step per standard TOTP drift tolerance), on success calls
  the **existing** `buildAuthResponse` + `persistRefreshToken` +
  `logTenantAuthEvent` (with `mfaResult: 'PASSED'` replacing the hardcoded
  `'NOT_REQUIRED'` at `:1786` — this is the one line that currently prevents
  any real value from ever being recorded) exactly as `login` does today.
- `POST /auth/mfa/challenge/recovery` — same shape, body: `challengeToken` +
  `recoveryCode`. Looks up by `hmac`/SHA-256 hash, checks `usedAt IS NULL`,
  marks consumed, issues tokens the same way, audits `AUTH_MFA_RECOVERY_USED`
  (distinct action so an admin/security review can see recovery-code use was
  the path, not a normal TOTP pass).
- `POST /auth/mfa/recovery-codes/regenerate` (authenticated) — invalidates
  unused codes, issues a fresh set, audits `AUTH_MFA_RECOVERY_REGENERATED`.
- `POST /auth/mfa/disable` (authenticated, requires current password in the
  body — mirroring `ChangePasswordForm`'s requirement of the current
  password, §5) — sets `mfaEnabled=false`, clears secret and recovery codes,
  audits `AUTH_MFA_DISABLED`.
- `POST /employees/:employeeId/mfa/reset` (admin-triggered, mirrors
  `sendResetPasswordLink` at `employees.controller.ts:778-785`, same
  permission `employees.update`/`ENTITY_KEYS.EMPLOYEES,'write'`) — disables
  the **target's** MFA and revokes their active sessions; does not read or
  regenerate a secret on their behalf, exactly like the password pattern in
  §8. Audits `AUTH_MFA_ADMIN_RESET` with the admin as actor and the employee's
  user id as entity.

Platform (`apps/admin` facing):
- Same six shapes under `platform-users` (`me/mfa/setup/start`,
  `me/mfa/setup/confirm`, `me/mfa/disable`, `me/mfa/recovery-codes/regenerate`)
  following the exact `me`-only, no-id pattern already established at
  `platform-users.controller.ts:47-79`.
- `POST /admin/auth/mfa/challenge/verify` / `.../recovery` mirroring the
  tenant pair, under `AdminAuthController`, `@Public()` +
  `PublicRateLimitGuard`, dispatching to `buildPlatformAuthResponse` +
  `persistPlatformRefreshToken` on success.
- `POST /platform-users/:userId/mfa/reset` (admin resetting another platform
  user) — add to `resolvePlatformPermission`'s map (§9) immediately, or every
  platform role gets a silent 403 on it per the documented failure mode in
  `docs/knowledge/modules/platform-auth.md`.
- `adminLogin` (`:398`) gets the same insertion point as tenant `login`: after
  the `status !== 'ACTIVE'` check (`:402`), before `buildPlatformAuthResponse`
  (`:409`).
- **Do this together with BUG-3146** (add `failedLoginAttempts`/`lockedUntil`
  to `PlatformUser`, mirror `LoginLockoutService` in
  `validatePlatformAdminCredentials`) — an MFA challenge step sitting after an
  unthrottled password-guessing path just moves the attacker's target from
  "guess the password" to "guess the password, unlimited tries, then guess a
  6-digit TOTP code," which is not a meaningfully higher bar without the
  lockout fix landing first or alongside.

### Frontend / cookie changes

- `apps/web/app/api/auth/login/route.ts` and
  `apps/admin/app/api/auth/login/route.ts`: both `isLoginSuccessResponse`
  checks (`:169`, `:204`) must gain a sibling check for the challenge shape
  (`data.mfaRequired === true && typeof data.challengeToken === 'string'`) and
  return that payload straight through to the browser **without** setting any
  auth cookie — only the two new verify endpoints, called from a second
  client-side step, should ever cause `app/api/auth/mfa/verify/route.ts` (new,
  same proxy shape) to set cookies.
- `apps/web`'s `login-form.tsx` already has a multi-step shape
  (`company-code-login-step.tsx`, §4) to extend with an MFA step;
  `apps/admin`'s `login-form.tsx` does not and needs one built.
- `rememberMe` chosen on the original credential submission must survive into
  the verify call — either embed it in the (signed, tamper-proof) challenge
  token payload, or have the client resend it with the verify request and
  trust the token's `sub`/`tenantId` over anything else the client sends.
  Embedding it in the token is safer (matches the existing pattern where
  `rememberMe` already rides inside `AuthTokenPayload` for access/refresh
  tokens, §1) and avoids a client being able to claim `rememberMe: true` on a
  session it didn't originally request it for.

### Audit events

- `AUTH_MFA_ENABLED`, `AUTH_MFA_DISABLED`, `AUTH_MFA_RECOVERY_REGENERATED`,
  `AUTH_MFA_RECOVERY_USED`, `AUTH_MFA_ADMIN_RESET`, and replace the hardcoded
  `mfaResult: 'NOT_REQUIRED'` (`:1786`) with the real outcome
  (`'NOT_REQUIRED' | 'PASSED' | 'RECOVERY_CODE_USED' | 'FAILED'`) computed by
  the login/verify flow. `AuditService.log()` already reads `mfaResult` back
  out of `afterSnapshot` (`audit.service.ts:219`) — no change needed there,
  only to what gets written in.
- A failed MFA verify attempt should itself go through `logTenantAuthEvent`
  with `result: 'FAILED'`, `failureReason: 'MFA_CODE_INVALID'`, following the
  exact shape every other failure branch in `validateCredentials` already uses
  (§1) — and should count toward `LoginLockoutService`-style lockout on the
  challenge token/session, not the password, so a stolen-password attacker
  can't brute-force the TOTP code indefinitely once past step one.

### Rate limiting

- `POST /auth/mfa/challenge/verify` and `.../recovery`: add both to
  `PublicRateLimitGuard`'s `ROUTE_LIMITS` (`public-rate-limit.guard.ts:42-44`)
  with a budget sized for a 6-digit code (tighter than the 20/10min default —
  e.g. 10/10min per IP+path, plus the per-challenge-token lockout described
  above as the real control, matching the guard's own stated role as "a
  backstop rather than the control", `:38-41`).
- `POST /auth/mfa/setup/*` and `/disable`: authenticated, so
  `PublicRateLimitGuard` doesn't apply, but consider whether repeated
  setup/disable cycling needs its own throttle — not investigated further,
  flagged as an open question for the implementation stream.

### Open questions for the Architect / product owner (not answered by this discovery)

1. Does `security.mfaRequired = true` block login for an unenrolled user
   (forcing setup before they can proceed) or just nag? No precedent exists in
   this codebase (`passwordSetupRequiredBeforeFirstLogin` is also unimplemented
   — there's no "forced flow before dashboard access" mechanism to copy from).
2. Should platform admins have `mfaRequired` be mandatory (not a per-tenant
   setting, since `PlatformUser` has no tenant) rather than optional, given
   BUG-3146/BUG-2509 already flag this population as the least-governed today?
3. `validateAdminCredentials` (`auth.service.ts:1457-1488`) appears unused by
   `adminLogin` — confirm its actual call sites before deciding whether it also
   needs an MFA gate.
