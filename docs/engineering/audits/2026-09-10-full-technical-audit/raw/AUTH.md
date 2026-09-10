# AUTH — Authentication, sessions and credential security

Auditor area: authentication across all four clients (`web`, `admin`,
`agent-desktop`, `landing`) plus the platform-admin subject type.
Branch `agent/full-technical-audit`, worktree `D:/My Work/hrm-dijipeople/dijipeople-audit`.

Two findings were verified by execution rather than by reading (AUTH-08 bcrypt
timing, AUTH-07 production `Set-Cookie` headers). Everything else is code-traced.

Summary by severity: **HIGH 7 · MEDIUM 10 · LOW 7 · INFORMATIONAL 2** (26 findings).

---

### AUTH-01 — Live password-reset links and invitation tokens are stored in the email delivery log and served to any tenant user with `notification.logs.read`

- **Category:** Credential leakage / Account takeover
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `services/api/src/modules/auth/user-invitations.service.ts`, `services/api/src/modules/notifications/`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:868` — the password-reset email is dispatched with the reset URL in the *persisted* metadata, not only in the rendered body:
  ```ts
        metadata: {
          userId: user.id,
          employeeId: user.employee?.id ?? null,
          resetUrl,
          source: 'forgot-password',
        },
  ```
  (identical block at `auth.service.ts:1040` for `sendPasswordResetEmail`, the admin-initiated reset)
  `services/api/src/modules/auth/user-invitations.service.ts:454` — the same for account activation:
  ```ts
        metadata: {
          userId: input.userId,
          invitationId: input.invitationId,
          activationUrl: input.activationLink,
          source: 'user-invitation',
        },
  ```
  `services/api/src/modules/notifications/email/email-execution.service.ts:293` — `buildMetadata` spreads the caller's metadata verbatim into `baseMetadata`, which every `createDeliveryLog` call then writes.
  `services/api/prisma/schema.prisma:7786` — `metadata Json?` on `model EmailDeliveryLog`.
  `services/api/src/modules/notifications/notifications.repository.ts:623` — the list query selects the whole row:
  ```ts
      db.emailDeliveryLog.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
  ```
  `services/api/src/modules/notifications/notifications.controller.ts:259` — exposed on a tenant-facing route behind an ordinary read permission:
  ```ts
    @Get('email-delivery-logs')
    @Permissions(NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_READ)   // 'notification.logs.read'
    @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  ```
- **Current behaviour:** Every password-reset and account-activation email writes a row to `EmailDeliveryLog` whose `metadata.resetUrl` / `metadata.activationUrl` contains the **raw, still-valid** credential-bearing token (a 24-hour `password-reset` JWT, or the 48-hour invitation token). `GET /api/notifications/email-delivery-logs` returns those rows in full to any user in the tenant holding `notification.logs.read` + `REPORTS:read`.
- **Expected behaviour:** Token-bearing URLs must never be persisted. Store the invitation id / user id and let the log link to the record, exactly as the platform-admin reset already does (`auth.service.ts:453` stores only `{ source, expiresIn }`).
- **Risk:** A tenant user with a notifications/reporting role — not necessarily an administrator — triggers "send password reset" for the tenant owner or the payroll administrator from the users screen, then reads the delivery log and follows the link. Full account takeover of any account in the tenant, including one with `hasElevatedTenantRole`, without ever seeing the victim's mailbox. It also permanently archives working credentials in a table that is copied by exports, backups and the tenant-erasure inventory (`tenant-erasure.constants.ts:291`).
- **Remediation:** Remove `resetUrl` from both metadata blocks in `AuthService.requestPasswordReset` and `AuthService.sendPasswordResetEmail`, and `activationUrl` from `UserInvitationsService.sendAccountActivationEmail`. Add a redaction pass in `EmailExecutionService.buildMetadata` that strips any value matching a token/URL shape, so a future caller cannot reintroduce it. Purge existing rows: `UPDATE "EmailDeliveryLog" SET metadata = metadata - 'resetUrl' - 'activationUrl'`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-02 — `resetPassword` unconditionally sets `status: 'ACTIVE'`, so a disabled user can reinstate their own account with an old reset link

- **Category:** AuthZ / Offboarding bypass
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:925` — the handler verifies the JWT and then never loads the user before writing:
  ```ts
      if (
        payload.type !== 'password-reset' ||
        !payload.sub ||
        !payload.tenantId
      ) {
        throw new UnauthorizedException(...);
      }
  ```
  `services/api/src/modules/auth/auth.service.ts:957` — the write:
  ```ts
        await tx.user.update({
          where: { id: payload.sub },
          data: {
            passwordHash,
            passwordChangedAt: new Date(),
            status: 'ACTIVE',
            updatedById: payload.sub,
          },
        });
  ```
  There is no read of `user.status`, `user.tenant.status`, or `Identity.status` anywhere in the method.
  Contrast `resetAdminPassword` at `auth.service.ts:504`, which does check: `if (!user || user.status !== 'ACTIVE' || currentVersion !== payload.passwordVersion)`.
- **Current behaviour:** A `password-reset` JWT is valid for 24 hours (`expiresIn: '1d'`, `auth.service.ts:851`). If the account is disabled during that window, redeeming the link sets a new password **and flips `status` back to `ACTIVE`**, and `mirrorPasswordToIdentity` propagates the credential to the shared identity. `AuthAccessService.loadAccessContext` then admits the session normally.
- **Expected behaviour:** Refuse the reset unless the user is currently `ACTIVE` (or `INVITED` for an activation flow) and the tenant is `ACTIVE`; never widen `status` as a side effect of a password write.
- **Risk:** Standard offboarding — an employee is terminated and their user disabled. If they asked for a password reset in the preceding 24 hours (a completely ordinary thing to do on the day you are let go), the link in their personal mailbox restores their account and every role attached to it: payroll, employee PII, documents. The audit trail records a password reset, not a reinstatement.
- **Remediation:** In `AuthService.resetPassword`, load the user with its tenant inside the transaction, reject unless `user.status !== 'DISABLED'` and `tenant.status === 'ACTIVE'`, and replace `status: 'ACTIVE'` with a conditional promotion of `INVITED → ACTIVE` only.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-03 — Tenant password-reset tokens are stateless and never consumed: replayable for 24 hours, including after the password has already been changed

- **Category:** Session/token management
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:844` — the token carries no `jti`, no `passwordVersion`, and no database row:
  ```ts
      const resetToken = this.jwtService.sign(
        { sub: user.id, tenantId: user.tenantId, type: 'password-reset' },
        { secret: getClientAccessTokenSecret(this.configService, 'web'), expiresIn: '1d' },
      );
  ```
  `services/api/src/modules/auth/auth.service.ts:924` — redemption checks only signature, `type`, `sub`, `tenantId`. No `PasswordResetToken` model exists in `schema.prisma`.
  The platform-admin equivalent does it correctly — `auth.service.ts:422`:
  ```ts
      const passwordVersion = createHash('sha256').update(user.passwordHash).digest('hex');
  ```
  and refuses at `:508` when `currentVersion !== payload.passwordVersion`.
- **Current behaviour:** The same reset link works an unbounded number of times for 24 hours. Using it does not invalidate it. A password changed by any other means does not invalidate it. Requesting a second reset does not invalidate the first.
- **Expected behaviour:** A reset token is single-use and is invalidated by any password change. The `passwordVersion` technique already in this file for platform admins is sufficient and needs no new table.
- **Risk:** Any exposure of a reset link — the delivery-log leak in AUTH-01, a forwarded email, a shared mailbox, a mail-gateway archive, a browser history sync — remains a working credential for the full 24 hours even after the victim has completed their own reset and believes the incident is closed. Combined with AUTH-02, it also re-enables a disabled account.
- **Remediation:** Add `passwordVersion: createHash('sha256').update(user.passwordHash).digest('hex')` to the payload in both `requestPasswordReset` and `sendPasswordResetEmail`, and verify it in `resetPassword` against the freshly-read hash, mirroring `resetAdminPassword`. Shorten `expiresIn` from `'1d'` to `'1h'` to match the admin flow.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-04 — Desktop-agent login bypasses account lockout entirely and is an unthrottled cross-tenant password oracle

- **Category:** Brute force / Authentication
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (adjacent to KNOWN `BUG-0033`, which closed the message/timing/tenant-lookup leaks but not the lockout gap)
- **Component:** `services/api/src/modules/agent/agent.service.ts`
- **Evidence:**
  `services/api/src/modules/agent/agent.service.ts:175` — the credential loop, over every tenant at once, comparing the *`User` row* hash:
  ```ts
      const candidates = await this.prisma.user.findMany({
        where: { email },
        include: { tenant: true, employee: true },
        orderBy: { createdAt: 'asc' },
      });

      let user: (typeof candidates)[number] | null = null;
      for (const candidate of candidates) {
        if (await bcrypt.compare(dto.password, candidate.passwordHash)) {
  ```
  `AgentService` never imports `LoginLockoutService`, `resolveLoginCredential`, `registerIdentityFailure` or `registerIdentitySuccess` — grep over `services/api/src/modules/agent/` returns zero matches for all four. Contrast `AuthService.validateCredentials` (`auth.service.ts:1288`), which checks `credential.identityLockedUntil`, `this.loginLockoutService.isLocked(user)`, `Identity.status === 'SUSPENDED'`, and calls `registerFailure` / `registerIdentityFailure` on every miss.
  The only control is `PublicRateLimitGuard` (`agent.controller.ts:50-53`), which is 20 requests per **(client IP, path)** per 10 minutes (`public-rate-limit.guard.ts:24`).
- **Current behaviour:** `POST /api/agent/auth/login` accepts unlimited password guesses against any account on the platform. It never increments `User.failedLoginAttempts`, never honours `User.lockedUntil`, never touches `Identity.failedLoginAttempts` / `lockedUntil`, and never refuses a `SUSPENDED` identity. An account locked out on the web login remains fully guessable here, and a successful guess here does not clear or trip anything.
- **Expected behaviour:** Every credential-verifying endpoint uses the same path: `resolveLoginCredential` (which enforces `Identity.status`), the tenant lock, the global identity lock, and both failure registrars.
- **Risk:** Two concrete consequences. (1) The platform's account-lockout control is a single HTTP header away from being irrelevant — an attacker simply targets `/agent/auth/login` instead of `/auth/login`. From a modest pool of rotating IPs, 20 guesses per IP per 10 minutes is thousands of guesses an hour against a named HR administrator with no account-side consequence and no lock ever engaging. (2) A platform-suspended identity (the "this person may not sign in anywhere" state) can still obtain a working agent-desktop token.
- **Remediation:** In `AgentService.login`, replace the direct `candidate.passwordHash` comparison with `resolveLoginCredential(this.prisma, candidate.id)`, and call `LoginLockoutService.isLocked` / `registerFailure` / `registerSuccess` and `registerIdentityFailure` / `registerIdentitySuccess` exactly as `AuthService.validateCredentials` does. Extract that sequence into one shared function so a third login endpoint cannot diverge again.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (agents with a stale `User.passwordHash` after an identity-only write would begin failing — which is the correct behaviour, but will surface as support load)
- **Fix now:** YES

---

### AUTH-05 — A client-supplied `startNewSession` flag on the public agent refresh endpoint resets the absolute session lifetime, so a stolen agent refresh token never expires

- **Category:** Session/token management
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/agent/agent.service.ts`, `services/api/src/modules/agent/dto/agent-auth.dto.ts`
- **Evidence:**
  `services/api/src/modules/agent/dto/agent-auth.dto.ts:36` — the flag is plain request input on a `@Public()` route:
  ```ts
    @IsOptional()
    @IsBoolean()
    startNewSession?: boolean;
  ```
  `services/api/src/modules/agent/agent.service.ts:285` — it disables the idle/absolute assertion:
  ```ts
      const startsNewSession = dto.startNewSession === true;
      const tokenRecord = await this.findMatchingRefreshToken(
        user.id, device.id, dto.refreshToken,
        { allowExpiredActiveSession: startsNewSession },
      );
  ```
  `services/api/src/modules/agent/agent.service.ts:1483` — `allowExpiredActiveSession` skips `assertAgentRefreshSessionActive` entirely.
  `services/api/src/modules/agent/agent.service.ts:314` — and it discards the carried-forward absolute expiry:
  ```ts
        sessionId: startsNewSession ? undefined : payload.sessionId,
        absoluteExpiresAt: startsNewSession ? undefined : tokenRecord.absoluteExpiresAt,
  ```
  which in `issueTokens` (`agent.service.ts:1430`) falls back to `new Date(now + getAgentSessionAbsoluteTimeoutMs(...))` — a fresh 30 days (`AUTH_CONFIG_DEFAULTS.agentAbsoluteTimeout = '30d'`, `auth.config.ts:23`).
- **Current behaviour:** The absolute session lifetime and the idle timeout are advisory: the holder of a refresh token decides whether they apply. Refresh tokens themselves live 90 days by default (`agentRefreshTtl: '90d'`). The only remaining server-side constraints are `User.status === ACTIVE` and the device row.
- **Expected behaviour:** Absolute expiry is a server-side ceiling and cannot be extended by a token holder. Starting a genuinely new session requires re-authentication, not a boolean.
- **Risk:** An agent refresh token exfiltrated from a workstation's OS credential store is a permanent credential. There is no absolute cap, no reuse detection (AUTH-09), and — per AUTH-15 — a password reset does not revoke it. The device fingerprint the refresh also checks is derivable from the machine's hostname and username (AUTH-16), so it is not a second factor.
- **Remediation:** Remove `startNewSession` from `AgentRefreshDto`. If the agent genuinely needs to begin a fresh attendance session after an idle expiry, that is a separate authenticated call, not a refresh-time flag. At minimum, always carry `tokenRecord.absoluteExpiresAt` forward and never re-derive it in `refresh`.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (deployed agents send this field; per `BUG-0035`, tightening a DTO the fleet already sends breaks them — remove the *behaviour*, keep the field accepted and ignored)
- **Fix now:** YES

---

### AUTH-06 — Tenant-uploaded SVG branding assets execute on the API origin, which shares the platform-admin session cookie

- **Category:** Stored XSS → platform privilege escalation
- **Severity:** HIGH
- **Confidence:** CONFIRMED (each primitive verified; the final step needs a platform admin to open the asset URL)
- **Known:** NEW
- **Component:** `services/api/src/modules/tenant-settings/branding-assets.service.ts`, `services/api/src/modules/tenants/public-tenants.controller.ts`, `services/api/src/main.ts`
- **Evidence:**
  `services/api/src/modules/tenant-settings/branding-assets.service.ts:50` — SVG is on the tenant-facing upload allowlist:
  ```ts
  const IMAGE_MIME_TYPES = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml',
  ];
  ```
  `services/api/src/modules/tenants/public-tenants.service.ts:196` — the serving guard admits it, because SVG starts with `image/`:
  ```ts
      if (!document?.storageKey ||
          !document.mimeType?.toLowerCase().startsWith('image/')) {
  ```
  `services/api/src/modules/tenants/public-tenants.controller.ts:54` — served inline with the stored content type, from the API origin, unauthenticated (`@Public()`):
  ```ts
      response.setHeader('Content-Type', asset.document.mimeType ?? 'application/octet-stream');
      response.setHeader('Content-Disposition', `inline; filename="${asset.document.originalFileName}"`);
  ```
  `services/api/src/main.ts` — no `helmet`, no `Content-Security-Policy`, no `X-Content-Type-Options`. Grep for all three over `services/api/src` returns zero matches. Confirmed live: the production response headers captured for AUTH-07 contain no `content-security-policy` and no `x-content-type-options`.
  Cookie scope confirmed in production (see AUTH-07): `admin_access_token=…; Domain=.dijipeople.com; … SameSite=Lax`.
- **Current behaviour:** Any tenant administrator can upload an SVG containing `<script>` as their workspace logo, favicon or login image. It is then served from `https://api.dijipeople.com/api/public/tenants/<slug>/assets/logo` as `Content-Type: image/svg+xml`, `Content-Disposition: inline`, with no CSP and no nosniff. A browser navigating to that URL executes the script **in the `api.dijipeople.com` origin**.
- **Expected behaviour:** User-supplied SVG is either rejected, sanitised, or served from a separate sandbox origin with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and a restrictive CSP.
- **Risk:** Script running on `api.dijipeople.com` is same-origin with the entire API. It does not need to read the `HttpOnly` admin cookie — it only needs to ride it: `fetch('/api/super-admin/tenants', { credentials: 'include' })` succeeds and the response is readable. A platform administrator who opens a tenant's logo URL (from the tenant record, from a support ticket, from a rendering issue report) hands the tenant full platform-admin API access across every customer. The same primitive works against tenant users on the `SameSite=Lax` web cookie.
- **Remediation:** Drop `'image/svg+xml'` from `IMAGE_MIME_TYPES` and `FAVICON_MIME_TYPES` in `branding-assets.service.ts`; rasterise or sanitise if SVG must stay. Independently, add `helmet()` in `main.ts` with `X-Content-Type-Options: nosniff` and a `default-src 'none'` CSP on the asset route, and change `Content-Disposition` to `attachment` for anything not on a rasterised-image allowlist.
- **Difficulty:** LOW
- **Regression risk:** LOW (tenants with an existing SVG logo need to re-upload; detectable with one query)
- **Fix now:** YES — and route the upload half to the file-upload specialist.

---

### AUTH-07 — All session cookies are issued with `Domain=.dijipeople.com` in production, so the platform-admin token is transmitted to every tenant workspace hostname

- **Category:** Cookie scoping / Session isolation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (executed against production)
- **Known:** NEW
- **Component:** `services/api/src/common/config/auth.config.ts`, production `AUTH_COOKIE_DOMAIN`
- **Evidence:**
  Executed 2026-09-10 against production:
  ```
  $ curl -sI -H "X-DijiPeople-App: admin" https://api.dijipeople.com/api/auth/me
  Set-Cookie: admin_access_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
  Set-Cookie: admin_refresh_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
  $ curl -sI -H "X-DijiPeople-App: web" https://api.dijipeople.com/api/auth/me
  Set-Cookie: dp_web_access_token=; Domain=.dijipeople.com; Path=/; …; HttpOnly; Secure; SameSite=Lax
  ```
  `services/api/src/common/config/auth.config.ts:296` — the domain is a single shared value with no per-client separation in practice:
  ```ts
    const domain =
      (clientId ? configService.get<string>(`${getPublicClientEnvPrefix(clientId)}_COOKIE_DOMAIN`) : undefined) ||
      configService.get<string>('AUTH_COOKIE_DOMAIN') ||
      configService.get<string>('COOKIE_DOMAIN') || undefined;
  ```
  `packages/config/platform-domains.js:180` — every surface lives under the one apex: `appHost` `app.<base>`, `adminHost` `admin.<base>`, `apiHost` `api.<base>`, and tenant workspaces at `<slug>.<tenantBaseDomain>`, defaulting to the same base.
  `auth.config.ts:369` — the only production guard on the value rejects `localhost` and `*.vercel.app`, not an over-broad apex.
- **Current behaviour:** A DijiPeople platform administrator's `admin_access_token` is attached by the browser to **every** request to any `*.dijipeople.com` host, including every tenant workspace. Symmetrically, a tenant user's `dp_web_access_token` is sent to `admin.dijipeople.com`. `HttpOnly` prevents JavaScript from reading them but not from causing them to be sent, and any host under the apex can *set* a same-named `Domain=.dijipeople.com` cookie that shadows the victim's.
- **Expected behaviour:** Host-only cookies (no `Domain`), or at minimum a separate registrable domain for the admin console. A platform-admin credential should never traverse a hostname a customer is served on.
- **Risk:** This is the amplifier for AUTH-06 and for any future subdomain takeover, misconfigured CNAME, or additional service under the apex: each one turns from "a bug on that host" into "platform-admin session compromise". Independently, it means the blast radius of a single XSS anywhere under `dijipeople.com` is the whole platform.
- **Remediation:** Unset `AUTH_COOKIE_DOMAIN` on the API service (and `apps/web`) so cookies become host-only, and verify the tenant workspace flow still works — each workspace hostname will then hold its own session, which is the correct isolation for a multi-tenant product. Extend `isInvalidProductionCookieDomain` in `auth.config.ts` to reject a bare apex for the `admin` client.
- **Difficulty:** MEDIUM (needs a session-continuity check across the workspace-routing flow)
- **Regression risk:** MEDIUM
- **Fix now:** YES

---

### AUTH-08 — The constant-time defence in `verifyIdentityCredential` is inert: the placeholder is a malformed bcrypt hash, leaving a 2,700× timing oracle for email existence

- **Category:** Account enumeration
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (measured)
- **Known:** NEW
- **Component:** `services/api/src/modules/users/identity.service.ts`
- **Evidence:**
  `services/api/src/modules/users/identity.service.ts:241` — the placeholder, and the comment stating precisely the property it fails to have:
  ```ts
  /**
   * The compare runs even when no identity exists, against a fixed hash. Skipping
   * it makes the unknown-address case measurably faster than the wrong-password
   * case, and that timing difference is the same oracle in a different costume.
   */
  const ABSENT_IDENTITY_HASH =
    '$2a$10$0000000000000000000000000000000000000000000000000000';
  ```
  A bcrypt hash requires 53 characters after the `$2a$10$` prefix (22-character salt + 31-character digest). This string has **52**. `bcryptjs` rejects it before doing any work.
  Measured with the repository's own `bcryptjs` (5-iteration average, same process):
  ```
  identity ABSENT_IDENTITY_HASH (malformed):  0.03 ms   → returns false immediately
  real cost-10 hash:                        211.50 ms
  real cost-12 hash:                       1012.85 ms
  agent TIMING_EQUALISATION_HASH (valid):  1250.69 ms   (agent.service.ts:116 — correct)
  ```
  Consumed by `verifyIdentityCredential` at `identity.service.ts:266`, reached from `AuthService.discoverWorkspaces` (`auth.service.ts:210`) via the `@Public()` route `POST /api/auth/discover-workspaces` (`auth.controller.ts:69`).
- **Current behaviour:** A registered address takes ~200–1000 ms to be refused (a real bcrypt compare); an unregistered address takes under a millisecond. Both return the identical `AUTH_INVALID_CREDENTIALS` body, so the message-level defence works and the timing defence does not. Note the discovery lock-out counter (`DISCOVERY_ATTEMPTS_BEFORE_BLOCK = 10`) only engages for addresses that *exist* — the fast path never records anything, so enumeration is unbounded apart from the 20-per-IP-per-10-minutes rate limit.
- **Expected behaviour:** The absent-identity compare must consume the same time as a real one, at the same cost factor used for stored passwords.
- **Risk:** A platform-wide oracle answering "does this email address have a DijiPeople account". For an HR product that is a customer-and-employee roster: an attacker can confirm which staff of a named company are on the platform before phishing them, and can confirm which companies are customers. It also silently undoes the mitigation the surrounding code was written to provide, which is the more dangerous property — the defence reports itself as present.
- **Remediation:** Replace the constant with a real hash generated at the current cost factor, e.g. `bcrypt.hashSync('absent-identity-placeholder', 12)` captured as a literal, and add a startup or unit assertion that `bcrypt.getRounds(ABSENT_IDENTITY_HASH) === 12` so a truncated literal cannot pass review again. `agent.service.ts:116` already carries a correct example.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-09 — No refresh-token reuse detection anywhere; `tokenFamilyId` is written and never read

- **Category:** Session/token management
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `services/api/src/modules/agent/agent.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:1373` — rotation revokes the presented token and issues a new one:
  ```ts
      const activeTokens = await this.prisma.refreshToken.findMany({
        where: { userId, tenantId, sessionId, appClientId: clientId, revokedAt: null },
      });
  ```
  A *revoked* token presented later simply fails the `revokedAt: null` filter, `hasActiveRefreshToken` returns false, and `refresh` throws `SESSION_REVOKED` (`auth.service.ts:604`). Nothing revokes the rest of the family.
  `tokenFamilyId: sessionId` is written at `auth.service.ts:1697`, `auth.service.ts:1984` and `agent.service.ts:1432`. Grep for `tokenFamilyId` across `services/api/src` returns only those three writes — no read anywhere.
  Same shape in `AgentService.refresh` (`agent.service.ts:296`) and `refreshPlatformSession` (`auth.service.ts:1990`).
- **Current behaviour:** Rotation is enabled (`isRefreshRotationEnabled` defaults true) but detection is not. When a stolen token is replayed after the legitimate client has rotated, the attacker gets one 401 and the victim's session continues unharmed — and, crucially, the reverse: when the **attacker** rotates first, the legitimate client's next refresh gets the 401 and silently signs the user out, while the attacker's rotated token continues indefinitely. Nothing is logged as a security event either way.
- **Expected behaviour:** Presenting a refresh token that exists but is already revoked is proof of compromise: revoke the whole `tokenFamilyId`, and raise an auditable event.
- **Risk:** Refresh-token theft is undetectable and, once the attacker has rotated once, unrecoverable except by an explicit "sign out everywhere". The victim experiences it as a random logout.
- **Remediation:** In `hasActiveRefreshToken` / `hasActivePlatformRefreshToken` / `findMatchingRefreshToken`, when no *live* token matches, re-scan the revoked rows for the same `tokenFamilyId`; on a hit, `updateMany` the family to revoked and call `AuditService.log` with a `AUTH_REFRESH_REUSE_DETECTED` action.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (a client that races two refreshes will look like reuse — throttle or grace-window the detection)
- **Fix now:** LATER

---

### AUTH-10 — No multi-factor authentication exists anywhere, including for platform super admins, while the tenant settings catalog advertises `mfaRequired`

- **Category:** Authentication design gap
- **Severity:** HIGH
- **Confidence:** NOT OBSERVED (searched specifically)
- **Known:** NEW (the inert setting is tracked; implementing MFA is not — no matching record in `docs/backlog/` or `docs/bugs/`)
- **Component:** platform-wide
- **Evidence:**
  Grep for `mfa|totp|otpauth|two_factor|twoFactor|authenticator` across `services/api/src`, `apps/web/app` and `apps/admin/app` returns no implementation. `services/api/prisma/schema.prisma` contains no MFA field, model or enum at all.
  The only occurrences are a hardcoded audit constant — `services/api/src/modules/auth/auth.service.ts:1764`:
  ```ts
            mfaResult: 'NOT_REQUIRED',
  ```
  and a catalog key that is explicitly declared dead — `services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts:311`:
  ```ts
    'security.mfaRequired': 'NOT_IMPLEMENTED',
    'security.mfaMethod': 'NOT_IMPLEMENTED',
  ```
  with a default at `tenant-settings.catalog.ts:685` (`mfaRequired: false`, `mfaMethod: 'EMAIL'`), and settings navigation still describing the screen as covering MFA (`apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts:326`).
- **Current behaviour:** A single password is the whole of authentication for every subject type: employees, tenant global administrators, and DijiPeople platform super admins whose session reaches every tenant's data. There is no step-up for privileged actions and no device trust.
- **Expected behaviour:** For a product holding national identifiers, salary and bank details across many customers, MFA on at least (a) platform-admin login and (b) tenant users with elevated roles, is table stakes — and is contractually required by most enterprise HR procurement.
- **Risk:** One phished or reused password on a platform super-admin account is a total, cross-tenant compromise with no second control in the way. Tenant-side, one phished HR administrator is that tenant's entire payroll and PII. Compounding: the tenant settings screen names MFA, so a customer can reasonably believe they have turned it on.
- **Remediation:** Implement TOTP enrolment for `PlatformUser` first (smallest surface, highest privilege): secret encrypted through `SecretEncryptionService`, enrolment gated behind the current password, single-use backup codes, replay protection by storing the last accepted time-step, and a per-account attempt counter on the code. Then extend to tenant users behind `security.mfaRequired`. Until then, remove `mfaRequired`/`mfaMethod` from the tenant settings catalog and navigation copy so the product does not claim a control it lacks.
- **Difficulty:** HIGH
- **Regression risk:** MEDIUM
- **Fix now:** LATER (but the misleading setting should be removed now)

---

### AUTH-11 — Platform-admin login has no account lockout of any kind

- **Category:** Brute force
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `services/api/src/modules/auth/admin-auth.controller.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:1471` — the whole of platform credential validation:
  ```ts
    private async validatePlatformAdminCredentials(dto: AdminLoginDto) {
      const normalizedEmail = normalizeEmail(dto.email);
      const user = await this.prisma.platformUser.findUnique({ where: { email: normalizedEmail } });
      if (!user) { … throw … }
      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isPasswordValid) { … throw … }
      return user;
    }
  ```
  No counter, no `lockedUntil`, no call into `LoginLockoutService`. `model PlatformUser` in `schema.prisma` has no `failedLoginAttempts` or `lockedUntil` field. `AuthService.adminLogin` (`auth.service.ts:374`) adds no check either.
  Also note the unknown-email branch returns **without** a bcrypt compare, giving the same timing oracle as AUTH-08 on the platform-admin login form.
  The only control is `PublicRateLimitGuard` at `admin-auth.controller.ts:20-22`: 20 per IP per 10 minutes, in-process.
- **Current behaviour:** The most privileged accounts on the platform are the only ones with no lockout. Tenant users get a 5-failure/30-minute account lock plus a 20-failure/60-minute identity lock; platform super admins get neither.
- **Expected behaviour:** At least the same lockout as a tenant user, with a security event on lock.
- **Risk:** Distributed password guessing against a known platform-admin address (`PLATFORM_SUPER_ADMIN_EMAIL` is a deployment constant, and the address pattern is guessable) is bounded only by a per-IP, per-process, in-memory counter. Success is unlimited cross-tenant access.
- **Remediation:** Add `failedLoginAttempts` and `lockedUntil` to `PlatformUser`, and mirror `LoginLockoutService`'s behaviour in `validatePlatformAdminCredentials`, including the dummy bcrypt compare on the unknown-email branch.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-12 — Placeholder and reset passwords are derived from `Date.now()`, and two of them are written into the shared identity credential

- **Category:** Weak credential generation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (predictability); LIKELY (the multi-workspace exploitation step)
- **Known:** NEW
- **Component:** `services/api/src/modules/super-admin/`, `services/api/src/modules/employees/employees.service.ts`
- **Evidence:**
  `services/api/src/modules/super-admin/super-admin.service.ts:1884` — no random component at all:
  ```ts
      const passwordHash = await bcrypt.hash(
        `owner-reset-${tenantId}-${Date.now()}`,
        12,
      );
  ```
  and it is mirrored to the shared identity at `:1899`: `await mirrorPasswordToIdentity(tx, owner.id, passwordHash);`
  `services/api/src/modules/super-admin/super-admin.service.ts:1502` — `` `tenant-access-reset-${tenantId}-${Date.now()}` ``, also mirrored (`:1521`).
  `services/api/src/modules/super-admin/tenant-identities-provisioning.service.ts:385` — `` `provision-${input.tenantId}-${input.email}-${Date.now()}` ``, under a comment reading *"Unguessable and never communicated."*
  `services/api/src/modules/super-admin/platform-onboarding.service.ts:241` — `` `onboarding-${tenant.id}-${Date.now()}` ``.
  `services/api/src/modules/employees/employees.service.ts:2113` — `` `invite-${employee.id}-${Date.now()}` ``.
  `services/api/src/modules/super-admin/super-admin.service.ts:1391` — `` `tenant-access-${tenantId}-${Date.now()}-${Math.random()}` `` (`Math.random` is not a CSPRNG).
  The correct pattern already exists in the codebase — `services/api/src/modules/tenant-control-plane/tenant-access.service.ts:983`:
  ```ts
  function unguessableSecret() { return randomBytes(32).toString('hex'); }
  ```
  `tenantId` is public: `GET /api/public/tenants/resolve?slug=…` returns `tenant.id` (`public-tenants.service.ts:317`), unauthenticated and unthrottled.
- **Current behaviour:** These "unguessable" values have roughly 10–20 bits of real entropy for an attacker who knows the tenant id (public) and the approximate time the action was taken. The two reset paths write the value into `Identity.passwordHash`, which is the credential `resolveLoginCredential` prefers for **every** workspace that identity belongs to.
- **Expected behaviour:** Every placeholder credential comes from `randomBytes`. Use the existing `unguessableSecret()`.
- **Risk:** All the creation paths set `status: INVITED`, which blocks login, so the exposure is narrow. The reset paths are not: if the reset subject holds an `ACTIVE` account in a *second* workspace, that workspace's login now accepts a password an attacker can enumerate over a known millisecond window. Tenant lockout (5 attempts) makes a wide search impractical, but the shape of the weakness — a credential whose entropy is a timestamp — should not survive a review.
- **Remediation:** Replace all six `Date.now()`-derived strings with `randomBytes(32).toString('hex')`; promote `unguessableSecret()` out of `tenant-access.service.ts` into `common/security/` and add an invariant spec that no `bcrypt.hash` argument in `services/api/src` contains `Date.now()`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-13 — The web proxy rewrites auth cookies to `SameSite=None` in production, and there is no CSRF token anywhere

- **Category:** CSRF
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (the code); LIKELY (net exploitability, which depends on which host actually issued the surviving cookie)
- **Known:** NEW
- **Component:** `apps/web/proxy.ts`, `services/api/src/main.ts`
- **Evidence:**
  `apps/web/proxy.ts:436` — the middleware re-issues all three cookies on every silent refresh:
  ```ts
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      sameSite: isProduction() ? "none" : "lax",
      secure: isProduction(),
      path: "/",
      maxAge: 15 * 60,
      ...getCookieDomainOption(),
    });
  ```
  (identical for refresh at `:445` and session at `:456`; `getCookieDomainOption()` at `:636` returns `{ domain: process.env.AUTH_COOKIE_DOMAIN }` — confirmed `.dijipeople.com` in production, AUTH-07.)
  This contradicts the API, which is asserted to `lax` in production — `services/api/src/common/config/auth.config.ts:414`:
  ```ts
      if (cookieOptions.sameSite !== 'lax') {
        throw new Error('AUTH_COOKIE_SAME_SITE must be lax for admin production.');
      }
  ```
  and confirmed live (AUTH-07 headers: `SameSite=Lax`).
  Grep for `csrf|xsrf` over `services/api/src`, `apps/web/lib`, `apps/web/proxy.ts` and `apps/admin/proxy.ts` returns **zero** matches. `main.ts:96` enables CORS with credentials and nothing else; the guard accepts a cookie-borne token (`jwt-auth.guard.ts:246`).
  `apps/admin/proxy.ts:373` correctly uses `sameSite: "lax"`.
- **Current behaviour:** The tenant web app and the API disagree about the `SameSite` attribute of the same three cookie names on the same domain. Whichever wrote last wins, and the web middleware writes on every token refresh. With `SameSite=None`, the browser attaches the tenant session to cross-site requests, and the API — which has no CSRF token, no origin check, and no custom-header requirement for cookie-authenticated writes — will act on them.
- **Expected behaviour:** One authority for cookie attributes. If `None` is genuinely required by the deployment topology, it must be paired with a CSRF token or a strict `Origin`/`Sec-Fetch-Site` check on every state-changing route.
- **Risk:** Any site a signed-in employee visits can issue authenticated `POST`/`PATCH` requests to the API as them — approving leave, changing bank details, altering timesheets — without reading the response. The divergence also makes the security posture unpredictable: it depends on whether the middleware happened to refresh recently.
- **Remediation:** Change `apps/web/proxy.ts` to `sameSite: "lax"` so it matches the API and `apps/admin`. Independently, add an `Origin`/`Sec-Fetch-Site` check for cookie-authenticated non-`GET` requests in a global interceptor, since the API is one `@Public()` mistake away from needing it regardless.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (verify the workspace-hostname flow still refreshes cleanly under `Lax`)
- **Fix now:** YES

---

### AUTH-14 — Account lockout is per-account only, with no per-IP dimension, so any known email can be locked out indefinitely

- **Category:** Denial of service
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/login-lockout.service.ts`, `services/api/src/modules/users/identity.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/login-lockout.service.ts:20` — defaults, and the design note acknowledging the trade:
  ```ts
  const DEFAULT_ATTEMPTS_BEFORE_LOCK = 5;
  const DEFAULT_LOCK_MINUTES = 30;
  ```
  ```
   * - The counter is on the account, not the request. Counting per address would
   *   be avoided by rotating addresses, which is exactly what an attacker does.
  ```
  `services/api/src/modules/users/identity.service.ts:196` — the global lock is likewise account-keyed: `GLOBAL_ATTEMPTS_BEFORE_LOCK = 20`, `GLOBAL_LOCK_MINUTES = 60`.
  `PublicRateLimitGuard` keys on `(ip, path)` (`public-rate-limit.guard.ts:53`) and is not consulted by the lockout at all, so the two controls share no state.
- **Current behaviour:** Five wrong passwords against a known address lock that account for 30 minutes; 20 lock the identity across every workspace for 60. Nothing distinguishes the attempts by source, and nothing rate-limits a *successful* lock. Repeating the five guesses every 30 minutes from any address keeps a named person permanently locked out.
- **Expected behaviour:** Combine the account counter with a per-source dimension: do not extend the lock for attempts from a source that has never succeeded for this account, or require a CAPTCHA / progressive delay before the lock engages.
- **Risk:** Targeted denial of service against an individual — a payroll administrator on payroll-run day, a manager during an approval deadline. Twenty attempts also locks them out of every workspace for an hour. This is cheap to execute and there is no operator-facing control to clear a lock (`registerSuccess` only clears on a correct password; no admin unlock endpoint exists).
- **Remediation:** Add a per-IP failure counter alongside the account one and require both thresholds; add an administrator "unlock account" action to the users module; log a security event when a lock engages so operations can see a targeted campaign.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### AUTH-15 — A password reset does not revoke desktop-agent sessions

- **Category:** Session/token management
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:975` — the reset transaction revokes exactly one table:
  ```ts
        await tx.refreshToken.updateMany({
          where: { userId: payload.sub, tenantId: payload.tenantId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
  ```
  Grep for `agentRefreshToken.updateMany` across `services/api/src` returns **zero** matches. The only writes to `agentRefreshToken` are the single-row `create` (`agent.service.ts:1428`), `update` on rotation (`agent.service.ts:296`) and `update` on logout (`agent.service.ts:1515`).
  The guard's agent path checks only the token row plus `AuthAccessService.loadAccessContext` — `jwt-auth.guard.ts:380`:
  ```ts
      const tokenRecord = await this.prisma.agentRefreshToken.findFirst({
        where: { sessionId: payload.sessionId, userId: payload.sub, tenantId: payload.tenantId, … revokedAt: null, … },
  ```
- **Current behaviour:** "My password may be compromised, I reset it" closes every browser session and leaves every desktop-agent session live — up to 90 days of refresh-token life, and unbounded given AUTH-05.
- **Expected behaviour:** A password reset revokes every session for that user on every client.
- **Risk:** An attacker who obtained a password, signed the agent in, and thereby holds an agent refresh token retains attendance-capture access (including DLP clipboard/screenshot capture where enabled) and the agent API surface after the victim has taken the one remediation step they know about. The same gap applies to `resetTenantAccessUserActivation` and `resetTenantOwnerPassword`.
- **Remediation:** Add an `agentRefreshToken.updateMany({ where: { userId, tenantId, revokedAt: null }, data: { revokedAt: new Date() } })` to the `resetPassword` transaction, to `UsersRepository.revokeAllSessions`, and to the two super-admin reset paths. Extend `users.repository.ts:768` so "sign out everywhere" means everywhere.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-16 — The agent device fingerprint is derived from hostname and username, and device enrolment silently reassigns an existing device to whoever presents it

- **Category:** Device enrolment / Data integrity
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/agent-desktop/src/main/api-client.ts`, `services/api/src/modules/agent/agent.service.ts`
- **Evidence:**
  `apps/agent-desktop/src/main/api-client.ts:485` — the fingerprint contains no secret:
  ```ts
  function createDeviceFingerprint(): string {
    const username = safeGetUsername();
    const raw = [os.hostname(), os.platform(), os.arch(), os.release(), username]
      .filter(Boolean).join("|");
    return crypto.createHash("sha256").update(raw).digest("hex");
  }
  ```
  `services/api/src/modules/agent/agent.service.ts:1339` — enrolment is an upsert keyed on `(tenantId, deviceFingerprint)` whose `update` branch **overwrites the owner**:
  ```ts
      where: { tenantId_deviceFingerprint: { tenantId: user.tenantId, deviceFingerprint: dto.deviceFingerprint } },
      …
      update: {
        employeeId: user.employee.id,
        userId: user.id,
        …
        isActive: true,
      },
  ```
  `services/api/src/modules/agent/agent.service.ts:270` — the fingerprint is also the only device binding on refresh, and it too comes from the request body (`AgentRefreshDto.deviceFingerprint`).
- **Current behaviour:** Any employee of a tenant who knows a colleague's machine hostname, OS version and Windows username — all routinely visible in an office, a Teams call, or a file share — can compute their fingerprint, log in with their **own** credentials while presenting it, and take ownership of that device row. The victim's agent then fails `assertOwnDevice` (`agent.service.ts:1309`) and stops working; the device's history, location requests and DLP permissions now hang off the attacker's employee id.
- **Expected behaviour:** Enrolment mints a server-side device secret on first registration and requires it thereafter; an upsert must never silently move a device between employees — that is an administrative action.
- **Risk:** Attendance is an input to payroll. Reassigning a device is both a denial of service against a colleague's time tracking and a way to muddy the attribution of captured activity. It also means the "device" in `assertOwnDevice` is not an authorisation boundary.
- **Remediation:** Add a `deviceSecret` column (random 32 bytes, hashed at rest) issued on first enrolment and required on subsequent login/refresh for that fingerprint. Change the `upsert` to refuse when the existing row's `userId` differs, surfacing a "this device is registered to another employee" error that an administrator must clear.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (needs a migration path for already-enrolled devices)
- **Fix now:** LATER

---

### AUTH-17 — bcrypt cost factor is inconsistent (10 vs 12) across password-setting paths, and the reset path uses the weaker one

- **Category:** Credential storage
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** repository-wide
- **Evidence:**
  Cost **12**: `auth.service.ts:524` (admin reset), `user-invitations.service.ts:239` (activation), `users.service.ts:115`, `tenants.service.ts:223` (signup), `partner-experience.service.ts:842`, all seed scripts.
  Cost **10**: `auth.service.ts:960` (**tenant password reset**), `platform-users.service.ts:81` (platform user creation), `platform-users.service.ts:270` (platform password change).
  ```ts
  services/api/src/modules/auth/auth.service.ts:960   const passwordHash = await bcrypt.hash(password, 10);
  services/api/src/modules/auth/auth.service.ts:524   const passwordHash = await bcrypt.hash(password, 12);
  ```
- **Current behaviour:** A user who set their password at activation is stored at cost 12; the same user, after one forgot-password cycle, is stored at cost 10 — four times cheaper to crack offline. Platform super admins are stored at cost 10 throughout. There is no single constant; each call site chooses.
- **Expected behaviour:** One exported constant, one cost, and an upgrade-on-login rehash.
- **Risk:** Modest on its own — cost 10 is still adequate — but the direction is wrong (the privileged accounts got the weaker factor) and it silently defeats the agent login's timing equalisation, which is calibrated to cost 12 (`agent.service.ts:113`: *"If password hashing ever moves off cost 12, regenerate this at the new factor"*). Measured: cost-12 ≈ 1010 ms, cost-10 ≈ 210 ms, so for a user whose hash is cost 10, the "unknown address" branch is now the *slower* one — an inverted enumeration oracle on `/agent/auth/login`.
- **Remediation:** Export `PASSWORD_HASH_ROUNDS = 12` from `common/security/`, use it at every `bcrypt.hash` call that stores a user credential, and add an invariant spec asserting no literal cost appears in `services/api/src`. Rehash on successful login where `bcrypt.getRounds(hash) < 12`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### AUTH-18 — JWT verification pins no algorithm, sets no issuer, and validates the audience by hand

- **Category:** Token design
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/guards/jwt-auth.guard.ts`, `services/api/src/modules/auth/auth.module.ts`
- **Evidence:**
  `services/api/src/common/guards/jwt-auth.guard.ts:69` — secret only:
  ```ts
        const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
          token,
          { secret: getClientAccessTokenSecret(this.configService, clientId) },
        );
  ```
  Same at `auth.service.ts:1620` (`verifyRefreshToken`), `auth.service.ts:1646` (`verifyAccessToken`), `auth.service.ts:496` (`resetAdminPassword`), `auth.service.ts:927` (`resetPassword`), `agent.service.ts:1449`.
  `services/api/src/modules/auth/auth.module.ts:37` — signing sets no `algorithm` and no `issuer`. Grep for `algorithms` / `algorithm:` across `services/api/src` returns zero matches.
  `aud` is a bare client-id string checked manually rather than via the library's `audience` option (`jwt-auth.guard.ts:86`).
- **Current behaviour:** `jsonwebtoken@9.0.3` (confirmed in `package-lock.json:14791`) rejects `alg: none` when a secret is supplied and refuses an asymmetric `alg` against a string key, so neither the `none` attack nor HS/RS confusion is reachable **today**. The protection is the library's default, not this code's. `clockTolerance` is unset, so the default of 0 applies — strict, which is correct.
- **Expected behaviour:** Pin `algorithms: ['HS256']` on every verify, set and verify an `issuer`, and pass `audience: clientId` so the library enforces it.
- **Risk:** The system is one dependency change or one migration to asymmetric keys away from a signature-confusion bypass, and nothing in the codebase or CI would catch it. Low today, but the mitigation costs one line per call site.
- **Remediation:** Add a shared `verifyOptions(clientId)` helper in `common/config/auth.config.ts` returning `{ secret, algorithms: ['HS256'], issuer: 'dijipeople', audience: clientId }` and use it at all six verification sites; add `issuer` and `algorithm` to the sign options.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (adding `issuer` invalidates every token in flight — ship the verify side tolerant first)
- **Fix now:** LATER

---

### AUTH-19 — Per-client JWT secrets are documented but not provisioned, so client separation rests entirely on an unsigned-by-configuration claim check

- **Category:** Token design / Key management
- **Severity:** MEDIUM
- **Confidence:** LIKELY (the fallback and the missing production assertion are CONFIRMED; the live values of `WEB_/ADMIN_/AGENT_JWT_*_SECRET` could not be read)
- **Known:** NEW
- **Component:** `services/api/src/common/config/auth.config.ts`, `render.yaml`
- **Evidence:**
  `services/api/src/common/config/auth.config.ts:44` — silent fallback to a single shared secret:
  ```ts
  export function getClientAccessTokenSecret(configService: ConfigService, clientId: AuthClientId) {
    const key = `${getPublicClientEnvPrefix(clientId)}_JWT_ACCESS_SECRET`;
    const value = configService.get<string>(key);
    if (value?.trim()) { return value.trim(); }
    return getAccessTokenSecret(configService);   // JWT_ACCESS_SECRET
  }
  ```
  `services/api/src/common/config/auth.config.ts:378` — `assertAuthEnvironment`'s `requiredInProduction` list contains `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` but **none** of the six per-client keys, so a deployment with all three clients sharing one secret starts cleanly.
  `render.yaml:79-82` declares only `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. The per-client keys appear only in `docs/environment-variables.md:161-166` and the `.env.example` files.
  The separation that remains is `jwt-auth.guard.ts:86`:
  ```ts
        if (normalizeAuthClientId(payload.appClientId) !== clientId ||
            normalizeAuthClientId(String(payload.aud ?? '')) !== clientId) {
  ```
  which is correct — I traced it: `clientId` comes from the attacker-controllable `X-DijiPeople-App` header (`auth.config.ts:257`), but flipping the header to another client makes the claim comparison fail, so cross-client replay is refused either way.
- **Current behaviour:** In all probability one HMAC key signs web, admin and agent-desktop access tokens (and one more signs all three refresh tokens). The `appClientId`/`aud` check is the only thing keeping them apart, and there is no startup assertion that the three secrets differ.
- **Expected behaviour:** Distinct secrets per client, asserted at boot in production. The architecture doc (`docs/architecture/authentication.md:36`) describes per-client secrets as the design; the deployment does not implement it.
- **Risk:** Defence in depth is absent rather than merely weak. The `aud` check is one refactor away from being dropped, at which point an agent-desktop token (90-day lifetime, stored on an employee's laptop) verifies as a web token. It also means one secret rotation logs out every client on every surface at once, which is why rotation gets deferred.
- **Remediation:** Generate six distinct secrets, set them on the Render service, declare them in `render.yaml` and `turbo.json` `globalEnv`, and add them to `requiredInProduction` in `assertAuthEnvironment` together with an assertion that no two of the three access secrets are equal.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (rotation signs everyone out once)
- **Fix now:** YES

---

### AUTH-20 — Login and tenant resolution distinguish "unknown tenant" from "inactive tenant", and `/public/tenants/resolve` is unthrottled

- **Category:** Enumeration
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `services/api/src/modules/tenants/public-tenants.controller.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:1546` and `:1582` — three distinguishable outcomes before any credential is checked:
  ```ts
        throw this.authUnauthorized('AUTH_TENANT_NOT_FOUND', 'Tenant was not found.');
        …
        throw this.authUnauthorized('AUTH_TENANT_INACTIVE', 'This tenant is not active.');
  ```
  `services/api/src/modules/tenants/public-tenants.controller.ts:18` — no rate-limit guard on the resolver, unlike its sibling public routes:
  ```ts
    @Public()
    @Get('resolve')
    resolve(@Query('slug') slug?: string, @Query('domain') domain?: string, …
  ```
  It returns the tenant **UUID**, `tenantCode`, `slug`, `displayName` and `status` (`public-tenants.service.ts:315-322`) plus branding. A miss is `404 TENANT_NOT_FOUND`.
- **Current behaviour:** The full DijiPeople customer list is enumerable by slug or domain, unauthenticated and unthrottled, along with each customer's internal tenant id and lifecycle status.
- **Expected behaviour:** Resolution is inherently semi-public (the workspace answers on a hostname), but it should be rate limited, and lifecycle status should not be disclosed to an anonymous caller.
- **Risk:** Competitive intelligence and target selection: an attacker learns which companies are customers, which are `SUSPENDED` or `DECOMMISSIONING` (a strong signal for a support-desk social-engineering attempt), and obtains the `tenantId` that AUTH-12's timestamp-derived passwords depend on.
- **Remediation:** Add `@UseGuards(PublicRateLimitGuard)` to `PublicTenantsController.resolve`; drop `tenant.id` and collapse `status` to a boolean `canSignIn` in `mapResolvedTenant`; return the same `404` for inactive tenants as for unknown ones.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### AUTH-21 — Login timing distinguishes a known from an unknown address within a named tenant

- **Category:** Enumeration
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:1294` — the unknown-user branch returns without ever calling bcrypt:
  ```ts
      const user = await this.usersService.findByTenantIdAndEmail(tenantContext.id, normalizedEmail);
      if (!user) {
        … throw this.authUnauthorized('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.');
      }
  ```
  whereas the known-user path reaches `bcrypt.compare` at `:1391`. Measured cost of that compare: 210 ms (cost 10) to 1010 ms (cost 12).
  `AgentService.login` (`agent.service.ts:193`) and `verifyIdentityCredential` both attempt to equalise this; `AuthService.validateCredentials` makes no attempt at all.
- **Current behaviour:** The message is identical for both cases — deliberately, per the comments — but the response time is not. Within a tenant whose slug is known (trivially, per AUTH-20), an attacker can enumerate which employees have accounts.
- **Expected behaviour:** A dummy bcrypt compare at the storage cost factor on the unknown-user branch, as the agent login already does.
- **Risk:** Employee-roster disclosure per customer, feeding targeted phishing and the lockout DoS in AUTH-14. Bounded by the 20-per-IP rate limit but not by anything account-side.
- **Remediation:** Add `await bcrypt.compare(dto.password, TIMING_EQUALISATION_HASH)` before the throw in `validateCredentials`, sharing the constant with `agent.service.ts` (and fixing AUTH-17 so the cost factor genuinely matches).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### AUTH-22 — `GET /auth/invitation-status` is public with no rate limit and returns the invitee's email, name and tenant

- **Category:** Enumeration / Information disclosure
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.controller.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.controller.ts:124` — the only `@Public()` route in the controller without `PublicRateLimitGuard`:
  ```ts
    @Public()
    @Get('invitation-status')
    invitationStatus(@Query() query: InvitationStatusQueryDto) {
  ```
  Every sibling — `signup`, `discover-workspaces`, `login`, `refresh`, `activate-account`, `forgot-password`, `reset-password`, `logout` — carries `@UseGuards(PublicRateLimitGuard)`.
  It returns `email`, `userId`, `employeeId`, tenant `{id, name, slug}` and `user.{firstName, lastName, status}` (`user-invitations.service.ts:178-196`).
- **Current behaviour:** Unlimited unauthenticated queries against invitation tokens. The token itself is 32 random bytes SHA-256-hashed at rest (`user-invitations.service.ts:60`), so guessing one is infeasible — but the route is also the only unmetered public endpoint in the auth surface, and it discloses PII for a valid token.
- **Expected behaviour:** Same rate limit as its siblings; return only what the activation screen needs.
- **Risk:** Low in isolation. It is a free, unmetered endpoint for an attacker probing availability, and any future weakening of the token generation becomes immediately exploitable at full speed.
- **Remediation:** Add `@UseGuards(PublicRateLimitGuard)` and add an invariant spec asserting every `@Public()` handler in the repository carries a rate-limit guard (`public-write-rate-limit.invariant.spec.ts` already exists for writes — extend it to reads).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-23 — A token with no `sessionId` bypasses revocation entirely

- **Category:** Session management
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:1219`:
  ```ts
      if (!payload.sessionId) {
        // Issued before sessions were recorded. Nothing to check, and refusing
        // would sign out every holder of an older token.
        return true;
      }
  ```
  The equivalent in `JwtAuthGuard.assertSessionIsActive` queries `sessionId: payload.sessionId`; with `undefined` that matches no row and correctly throws `SESSION_REVOKED` — so the guard and `/auth/me` still disagree, in the opposite direction from `BUG-2547`.
- **Current behaviour:** `/auth/me` treats a sessionless token as live indefinitely; the guard treats it as revoked. Every current mint path sets `sessionId` (`auth.service.ts:2093`, `:2207`, `agent.service.ts:1379`), so this is only reachable by a token predating the sessions work — but the compatibility branch has no expiry date and no counter.
- **Expected behaviour:** Delete the branch. Any token old enough to lack a `sessionId` has long since expired.
- **Risk:** Low today; it is a permanent unauthenticated-identity-disclosure branch guarded only by an assumption about token age.
- **Remediation:** Remove the `!payload.sessionId` early return in `isSessionStillLive`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### AUTH-24 — `tokenVersion` is hardcoded to 0 and never read; there is no global invalidation lever

- **Category:** Session management
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:2088` and `:2200` — both response builders:
  ```ts
      const tokenVersion = 0;
  ```
  It is placed in both the access and refresh payloads and compared nowhere: grep for `tokenVersion` across `services/api/src` returns only the two assignments, the two payload literals, and the interface declaration.
- **Current behaviour:** A claim that exists solely to support "invalidate everything" is present in every token and inert. There is no way to invalidate all tokens for a user, a tenant or the platform short of bulk-revoking refresh rows table by table (and, per AUTH-15, the agent table is not covered).
- **Expected behaviour:** Either read it against a `User.tokenVersion` / `Tenant.tokenVersion` column, or remove it so nobody mistakes it for a working control.
- **Risk:** Incident response has no fast lever. During a suspected key or database compromise the only options are per-table `updateMany` statements written by hand.
- **Remediation:** Add `tokenVersion Int @default(0)` to `User` and `PlatformUser`, populate the claim from it, and compare it in `JwtAuthGuard`. Provide a platform action that bumps it for a user or a whole tenant.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### AUTH-25 — Tenant access tokens default to an 8-hour lifetime, configurable by the tenant to 24 hours

- **Category:** Token design
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `services/api/src/modules/auth/auth.service.ts:2107` — the access-token TTL is the tenant's *session* timeout, not the 15-minute default in `AUTH_CONFIG_DEFAULTS`:
  ```ts
      const accessTokenTtl = `${authPolicy.sessionTimeoutMinutes}m`;
  ```
  `services/api/src/modules/auth/auth.service.ts:2167` — the value and its bounds:
  ```ts
        sessionTimeoutMinutes: readNumberSetting(values.get('sessionTimeoutMinutes'), 480, 15, 1440),
  ```
  Corroborated by the production incident note at `auth.service.ts:634` describing "the remaining 7.98 hours of an eight-hour access token".
- **Current behaviour:** An access token is a bearer credential valid for 8 hours by default and up to 24 hours if a tenant sets it. `AUTH_ACCESS_TOKEN_TTL_SECONDS` and the documented 15-minute default are overridden for the web client and never apply.
- **Expected behaviour:** A short access token (minutes) with the session length enforced by the refresh/idle machinery, which already exists and works.
- **Risk:** Substantially mitigated: `JwtAuthGuard.assertSessionIsActive` re-checks the session row on **every** request, so revocation is immediate and a leaked access token dies with its session. The residual exposure is a long-lived bearer token in logs, proxies and browser storage, and any code path that verifies the signature without the session check — `BUG-2547` was exactly that path, and there is nothing structural preventing another.
- **Remediation:** Decouple the two: keep `sessionTimeoutMinutes` as the idle/absolute session policy and set the access-token TTL to `getClientAccessTokenTtl` (15 minutes), relying on the existing silent-refresh in `apps/web/proxy.ts`.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (increases refresh traffic; `BUG-2458` records what happened last time refresh volume rose)
- **Fix now:** LATER

---

### AUTH-26 — `PlatformUsersController` carries no authorization guard; authorization is re-derived in every service method

- **Category:** AuthZ (structural)
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/platform-users/platform-users.controller.ts`
- **Evidence:**
  `services/api/src/modules/platform-users/platform-users.controller.ts:28` — authentication only:
  ```ts
  @UseGuards(JwtAuthGuard)
  @Controller('platform-users')
  ```
  No `PermissionsGuard`, no `PlatformPermissionsGuard`, and no method-level `@Permissions` / `@RequirePermission` anywhere in the file. Every sibling platform controller has one, e.g. `super-admin.controller.ts:73`: `@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)`.
  I enumerated all eleven public methods of `PlatformUsersService` (`list`, `listOwnerCandidates`, `create`, `getSecurityOverview`, `changeOwnPassword`, `getPreferences`, `updatePreferences`, `getModulePreference`, `updateModulePreference`, `update`, `disable`) and **every one** opens with `assertPlatformUser` or `assertCanManage` (`platform-users.service.ts:545-564`). So there is no live gap.
- **Current behaviour:** Correct, but by convention held in eleven places rather than by a guard held in one.
- **Expected behaviour:** `@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)` at the controller, with the service assertions retained as defence in depth.
- **Risk:** None today. One new method added without the assertion becomes an unauthenticated-to-any-tenant-user platform escalation, and nothing in review or CI would flag it — the controller looks like every other authenticated controller.
- **Remediation:** Add the guard at the controller and extend `platform-permissions.spec.ts` (which already enumerates the super-admin controller) to cover `PlatformUsersController`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

## Healthy — verified good

- **Session revocation is checked on every authenticated request, not only at refresh.** `jwt-auth.guard.ts:264-320` reads the live `refreshToken` / `platformRefreshToken` / `agentRefreshToken` row for the token's `sessionId` and throws `SESSION_REVOKED` when it is gone. Logout is therefore genuinely server-side, not a cookie clear.
- **Sign-out revokes by session id rather than by scanning token hashes.** `auth.service.ts:1271` (`revokeSessionTokens`) uses an exact `updateMany` on `{ sessionId, appClientId, revokedAt: null }`. The 20-row bcrypt scan that caused `BUG-2506` survives only as a fallback for clients that send no session cookie.
- **`/auth/me` asks the same liveness question as the guard.** `auth.service.ts:625-645` — the `BUG-2547` fix is present and correct, and the shared helper `isSessionStillLive` is written explicitly so the two cannot diverge again.
- **Account and tenant status are re-evaluated on every request.** `auth-access.service.ts:146` refuses when `user.status !== 'ACTIVE'` or the tenant is not `ACTIVE`; `loadPlatformAccessContext` (`:20`) does the same for `PlatformUser`. A deactivated employee loses every session immediately on every client, including agent-desktop.
- **Cross-client token replay is refused.** `jwt-auth.guard.ts:86` requires both `appClientId` and `aud` to equal the client the request claims to be, and `auth.service.ts:556` repeats the check on the refresh path. Flipping `X-DijiPeople-App` to reach another client's secret does not help, because the claim comparison fails.
- **Tenant users cannot obtain a platform context and vice versa.** Platform context is only loaded when the signed claim `authSubjectType === 'platform-user'` **and** the client is `admin` (`jwt-auth.guard.ts:96`); `PlatformPermissionsGuard` then requires `request.user.platform.id` before considering any permission (`platform-permissions.ts:347`). `adminLogin` reads only the `PlatformUser` table (`auth.service.ts:1471`).
- **Invitation tokens are done correctly.** 32 random bytes (`randomBytes(32)`), SHA-256-hashed at rest, unique-indexed, 48-hour TTL, single-use via `consumedAt` + `status: CONSUMED`, and every other pending invitation for that user revoked on acceptance — `user-invitations.service.ts:60`, `:196`, `:240-270`.
- **The platform-admin password reset is single-use.** `auth.service.ts:422` binds the token to `sha256(passwordHash)` and `:508` refuses once the hash has changed; the reset also revokes every live platform session in the same transaction (`:530`).
- **Platform password change revokes other sessions atomically.** `platform-users.service.ts:272-291` performs the hash update and the `platformRefreshToken` revocation inside one `$transaction`, keeps the caller's own session, and audits the count.
- **Disabling a platform user revokes their sessions first.** `platform-users.service.ts:518`.
- **Password policy is real and fails closed.** `password-policy.service.ts:27` uses a *stricter* fallback (12 chars, all four character classes) when tenant settings cannot be read, and `readLength` clamps a tenant's floor to 8 so a hostile or broken setting cannot weaken it (`:52`). Password history and expiry are implemented and read (`:141`, `:206`).
- **Workspace discovery requires a password before disclosing anything.** `auth.controller.ts:69` and `identity.service.ts:255` — discovery answers only for a caller who already proved the credential, and it has its own separate, gentler throttle (`DISCOVERY_ATTEMPTS_BEFORE_BLOCK = 10` / 15 minutes) that deliberately does not touch the credential lock.
- **Concurrent sessions are closed by default.** `auth.service.ts:1679` revokes prior live tokens for the same user and client unless the tenant explicitly sets `security.allowMultipleActiveSessions`.
- **Reset and activation links cannot be steered at another workspace.** `auth.service.ts:155` and `user-invitations.service.ts:395` resolve the hostname from the subject's own tenant via `TenantDomainService`, never from the request.
- **Cookies are `HttpOnly`, `Secure` and `SameSite=Lax` in production, and no token is reachable from JavaScript.** Verified live (AUTH-07 output). No token is written to `localStorage`/`sessionStorage` in any of the three Next.js apps — grep across `apps/web`, `apps/admin`, `apps/landing` finds only UI-preference storage.
- **Production cookie configuration fails closed on the obvious mistakes.** `auth.config.ts:329` throws if `SameSite=None` without `Secure`; `:335` throws on a `localhost` or `*.vercel.app` cookie domain; `:400-419` refuse to boot without `Secure`, `HttpOnly`, `SameSite=lax` and `Path=/` for the admin client.
- **The desktop agent stores its refresh token in the OS credential store,** not on disk in plaintext — `apps/agent-desktop/src/main/secure-store.ts` uses `keytar` exclusively and fails loudly if it is unavailable. No token is written by `config-manager.ts`.
- **The agent's own timing-equalisation hash is correct** — `agent.service.ts:116` is a valid cost-12 bcrypt hash and measurably consumes the same time as a real compare. (It is the identity module's copy that is broken; see AUTH-08.)
- **CORS is a strict allowlist with credentials,** not a reflected origin — `env.validation.ts:115-170`; a disallowed origin is refused by withholding the header rather than by throwing, which was itself an unauthenticated write-amplification fix (`BUG-0976`).
- **`main.ts` sets `whitelist`, `transform` and `forbidNonWhitelisted` globally** (`main.ts:98`), so an unexpected auth field is a 400 rather than silently accepted.
- **Refresh rotation is on by default** (`auth.config.ts:222`, `isRefreshRotationEnabled` defaults `true`) and refresh tokens are stored bcrypt-hashed, never in plaintext (`auth.service.ts:1678`, `:1964`, `agent.service.ts:1435`).
- **The auth surface is covered by real behavioural tests**, not just unit stubs — `auth-session-lifecycle.spec.ts`, `login-lockout.service.spec.ts`, `password-policy.service.spec.ts`, `agent-login-enumeration.spec.ts`, `agent-client-contract.spec.ts`, `jwt-auth.guard.spec.ts`, `platform-permissions.spec.ts`.

---

## Not examined / limits

- **I could not read the live values of `AUTH_COOKIE_SAME_SITE`, `WEB_/ADMIN_/AGENT_JWT_*_SECRET` or `AUTH_COOKIE_DOMAIN` on the Render service.** AUTH-07 was confirmed by observing production `Set-Cookie` headers; AUTH-19 rests on the absence of those keys from `render.yaml` and from `assertAuthEnvironment`'s production list, and is therefore rated LIKELY. Someone with dashboard access should confirm whether the three access secrets actually differ. Note also that whether the `SameSite=None` in `apps/web/proxy.ts` (AUTH-13) actually reaches a browser depends on which side wrote the cookie last, which I could not observe without a live session.
- **I did not authenticate to production or staging.** No finding was validated by logging in, so every claim about runtime behaviour after authentication is code-traced rather than executed. AUTH-01, AUTH-02, AUTH-03 and AUTH-05 are all straightforward to demonstrate with one test account and should be re-verified that way before they are scheduled.
- **AUTH-06's final step is unverified.** I confirmed the SVG allowlist, the inline serving with the stored MIME type, the absence of CSP/nosniff in production, and the cookie domain. I did not upload a payload or confirm that a platform administrator has any workflow that navigates to an asset URL. The primitive is real; the likelihood of the human step is a judgement.
- **`gateway/` (the .NET on-premise integration gateway) was not audited.** Its credential provisioning, storage and rotation are a distinct subsystem; my memory notes record that a paired gateway ignores `configure --url` and that `rotate-credential` retires nothing, which suggests it deserves its own pass. I covered only the agent-desktop half of "non-browser clients".
- **`attendance-integrations` device credentials** (ZKTeco and similar) were not examined; they are a separate credential store from `agent`/`EmployeeDevice`.
- **Rate limiting is covered only where it intersects account state.** I noted that `PublicRateLimitGuard` is a per-process in-memory `Map` (`public-rate-limit.guard.ts:10`) that resets on every deploy and does not coordinate across Render instances, but sizing that belongs to the rate-limiting specialist.
- **I did not run the API test suite or `npm run typecheck`.** No finding depends on one, and the briefing discourages slow checks.
- **Cross-checked against `docs/bugs/` and `docs/knowledge/`** for each finding. The adjacent existing records are `BUG-0033` (agent login enumeration — fixed; my AUTH-04 is the lockout gap it did not cover), `BUG-0035` (agent logout — fixed), `BUG-0627` / `BUG-2506` / `BUG-2547` (session revocation — all fixed and verified present in the current code), and `ITEM-0111` (`PROTECTED_ROUTE_PREFIXES` gaps — explicitly not an auth bypass, and I agree: the API is the authority and refuses regardless). Everything else I report is NEW.

---

## Routed to other specialists

- **File upload / AppSec:** `image/svg+xml` on the tenant branding allowlist (`branding-assets.service.ts:50`) and the echoed `Content-Type` + `Content-Disposition: inline` on `public-tenants.controller.ts:54`. See AUTH-06.
- **AppSec / HTTP hardening:** `helmet` is entirely absent — no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`, no HSTS from the application. Confirmed in production response headers.
- **Rate limiting:** `PublicRateLimitGuard` is a single-process in-memory map with no shared store; `/public/tenants/resolve` and `/auth/invitation-status` carry no guard at all.
- **Notifications / data exposure:** `GET /notifications/email-delivery-logs` returns whole rows including arbitrary `metadata`. Even after AUTH-01's tokens are removed, that endpoint returns unfiltered JSON written by every email-sending caller in the system.
- **AuthZ specialist:** `PlatformUsersController` has no controller-level guard (AUTH-26), and `hasElevatedTenantRole` grants the full `FOUNDATION_PERMISSION_DEFINITIONS` set in `auth-access.service.ts:191` — the breadth of that bypass is an authorization question, not an authentication one.
