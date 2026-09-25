# TASK-0032 WP-03 report — TOTP MFA, platform sign-in lockout and audit, token TTL units

Branch `agent/pah-wp03-mfa` (worktree `dp-pah-wp03`), on WP-01 `10d5d148`.
Decision implemented: ADR-0019. Regression entries: `docs/qa/regressions/_incoming/wp03.md`
(REG-535..REG-543; REG-544..549 unused).

## IMPLEMENTED

- **BUG-3548** — `normalizeTokenTtl` in `common/config/auth.config.ts`: a bare integer TTL
  becomes `<n>s` in every getter (access/refresh, per-client, agent, platform remember-me),
  so the signed JWT lifetime, `accessTokenExpiresIn`/`refreshTokenExpiresIn`, cookie
  `maxAge` and refresh-row `expiresAt` agree. Blank values fall back to defaults.
- **BUG-3146** — `PlatformLoginLockoutService` (5 failures / 30 min, atomic increment) on
  `PlatformUser.failedLoginAttempts/lockedUntil`, used by password and MFA failures; the
  identical `Invalid admin credentials.` response for unknown/wrong/locked.
- **BUG-3567 (platform sign-ins not audited)** — every platform sign-in outcome writes
  `AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED` with `tenantId: 'platform'` in the tenant
  snapshot shape (failureReason, real mfaResult, session id, forwarded IP/UA); an unknown
  address has no actor (entity = address tried); the password is never recorded.
- **ITEM-0197 (TOTP MFA)**:
  - `modules/auth/mfa/totp.ts` (RFC 6238 on node:crypto, base32, ±1 step, constant-time,
    returns the matched step), `recovery-codes.ts` (10 × 50-bit Crockford codes
    `xxxxx-xxxxx`, normalised, HMAC bound to the account id), `mfa-challenge.ts`,
    `dto/mfa.dto.ts`.
  - `MfaService` (User and PlatformUser): status; setup (encrypted pending seed, otpauth URI
    issuer `DijiPeople`, label `email (Tenant)` / `email`, server QR via `qrcode`, manual
    key); confirm (pending→active, records the confirming step, 10 codes returned once);
    second-factor verify (compare-and-set on `mfaLastUsedStep`; recovery code
    `usedAt: null`); regenerate (TOTP only); disable (password + TOTP or recovery code);
    tenant admin reset (`{id, tenantId}` + USERS write row scope, not self, revokes
    sessions); platform reset (not self, revokes sessions). Refuses setup when
    `SECRET_ENCRYPTION_KEY` is unset.
  - Sign-in: tenant `login` / platform `adminLogin` return
    `{ mfaRequired, challengeKind, challengeToken, challengeExpiresIn, methods }` and set no
    cookie; tenant `security.mfaRequired` → `SETUP_REQUIRED`. Challenge = 5-minute JWT
    (`type`/`tokenUse: 'mfa_challenge'`, client access secret; sub, tenantId, sessionId,
    authSubjectType, appClientId/aud, rememberMe). Verify re-validates account, tenant, lock
    and identity lock, is single-use (the issued session takes the challenge sessionId) and
    goes through shared `completeTenantLogin` / `completePlatformLogin`.
  - Endpoints: `GET /auth/mfa/status`, `POST /auth/mfa/setup`, `/setup/confirm`,
    `/recovery-codes`, `/disable` (new `AuthMfaController`, JwtAuthGuard only); public
    `POST /auth/mfa/verify`, `/auth/mfa/challenge/setup`, `/auth/mfa/challenge/setup/confirm`;
    `POST /users/:userId/mfa/reset` (`users.update` + USERS:write);
    `GET /platform-users/me/mfa`, `POST /platform-users/me/mfa/{setup,setup/confirm,recovery-codes,disable}`,
    `POST /platform-users/:userId/mfa/reset` (assertCanManage); public `POST /admin/auth/mfa/verify`.
  - `security.mfaRequired`/`mfaMethod` read by `TenantAuthPolicyService` and removed from
    the inert-key list; catalog default `mfaMethod: 'TOTP'`; web settings control "Require
    two-factor authentication" (Security → Login Rules).
  - Audit actions `AUTH_MFA_ENABLED/DISABLED/RESET/RECOVERY_CODES_REGENERATED/RECOVERY_CODE_USED`.
  - `GET /users/:id` returns `mfaEnabled`/`mfaEnabledAt`; `GET /platform-users` returns `mfaEnabled`.
- **Web**: the login route classifies the API answer (`lib/auth-login-classify.ts`) and
  passes a challenge through with no cookie; `/api/auth/mfa/verify` and
  `/api/auth/mfa/challenge/setup[/confirm]` set cookies only on tokens; self-service
  proxies; `/api/users/[userId]/mfa/reset`. Login MFA step (`mfa-login-step.tsx`), shared
  panels (`app/components/security/mfa-panels.tsx`), My Profile `MfaSettingsCard` (also
  shown when no employee is linked), user-record Security widget shows two-factor status and
  "Reset MFA" (Dialog confirmation; shown with `users.update`, not on your own record).
- **Admin**: `lib/admin-login-classify.ts`, `lib/admin-session-response.ts` (cookie writer
  shared by login and verify), `/api/auth/mfa/verify`, `/api/platform-users/me/mfa*`,
  `/api/users/[userId]/mfa/reset`; login MFA step, Security page "Two-factor
  authentication" card (`app/(internal)/security`, not `settings/security`), Users & access
  "Two-factor" column and "Reset MFA".

## CHANGED_BEHAVIOR

- API responses report bare-integer TTLs as `<n>s` (e.g. `1800s`); tokens configured with a
  bare integer now live that many seconds instead of about one second.
- `POST /auth/login` and `POST /admin/auth/login` return a challenge (no tokens, no cookies)
  for enrolled accounts or users of MFA-required tenants. Nobody is enrolled at release, so
  no existing sign-in changes until someone enrols or a tenant turns `mfaRequired` on. The
  agent desktop signs in through `/agent/auth/login` and is unaffected.
- Platform sign-in locks after 5 failures for 30 minutes and writes platform audit rows.
- Tenant and platform login audit rows carry the real `mfaResult`.
- A wrong password when disabling MFA counts toward the lockout.

## RISK_AREAS

- Challenge single-use is enforced by checking for a refresh row with the challenge
  `sessionId`; two concurrent verifies with two different valid codes (steps s and s+1)
  could both succeed.
- SETUP_REQUIRED lets whoever holds the password enrol an unenrolled account (inherent to
  forced enrolment; an admin reset clears it).
- `PublicRateLimitGuard` still gives the verify routes the default budget (see UNRESOLVED);
  account lockout is the real control.
- No browser run (Turbopack/junction constraint): UI verified by typecheck, lint and unit
  tests only. The MFA forms use native inputs because they need `inputMode="numeric"` and
  `autocomplete="one-time-code"`, which `TextField` does not expose.
- A tenant owner's MFA can be reset by any in-scope holder of `users.update` (ADR-0019 as written).

## KNOWN_MISTAKES_AVOIDED

- Anti-enumeration: identical 401 body for unknown/wrong/locked on both login paths (spec-pinned).
- No bare-id lookups on tenant-owned rows; tenant reset loads `{ id, tenantId }` plus row scope.
- No seed, code, recovery code, password or otpauth URI in logs or audit (Logger and AuditService spies).
- Specs mutation-tested (validation that only mentions a behaviour passes after it is deleted).
- CRLF-safe edits; Markdown written with the file tool, not heredocs.
- Moving the login fetch into a helper would have silently shrunk the forwarded-headers
  invariant; it now counts helper callers and checks the helper forwards the address.
- The self-service MFA controller is listed as service-authorized in the wiring invariant
  rather than editing guards.

## TESTS_ADDED

- `services/api/src/common/config/auth.config.spec.ts` — BUG-3548: signs real JWTs, exp−iat equals the configured seconds; cookie maxAge agrees; `15m`/`7d` unchanged; agent TTLs; blank → default.
- `services/api/src/modules/auth/platform-login-lockout.spec.ts` — BUG-3146 through `adminLogin`.
- `services/api/src/modules/auth/platform-login-audit.spec.ts` — BUG-3567: success/wrong/unknown/locked rows, identical response, no password.
- `services/api/src/modules/auth/mfa/totp.spec.ts` — RFC 4226 App. D, RFC 6238 App. B SHA1, ±1 window, replay, malformed input, otpauth URI.
- `services/api/src/modules/auth/mfa/recovery-codes.spec.ts` — format, uniqueness, normalisation, account binding.
- `services/api/src/modules/auth/mfa/mfa.service.spec.ts` — pending setup, restart replaces, confirm, replay, recovery single-use and cross-account, regenerate invalidates, disable needs password and factor, tenant reset scope (cross-tenant, row scope, self), secrets never logged or audited, no key → refuse.
- `services/api/src/modules/auth/mfa/mfa-login.spec.ts` — challenge with no tokens and no cookie via both controllers, SETUP_REQUIRED flow, JwtAuthGuard refuses the challenge token, single-use verify with real mfaResult, recovery-code sign-in, cross-client refusal, wrong codes lock so both code and password are refused, platform challenge/verify/lockout.
- `services/api/src/modules/platform-users/platform-user-mfa-reset.spec.ts` — platform reset only via assertCanManage.
- `apps/web/lib/auth-login-classify.spec.ts`, `apps/admin/lib/admin-login-classify.spec.ts` — response classification.
- `apps/web/lib/forwarded-headers.invariant.spec.ts` — extended to `postToAuthApi` callers.
- Fixture `services/api/src/modules/auth/mfa/mfa-test-prisma.fixture.ts` — in-memory store that evaluates `where` clauses.

## TEST_HOOKS (for WP-09 browser QA)

Routes: web `/login` (code step after the password), `/my-profile` (card "Two-factor
authentication", `data-testid="mfa-settings"`), Settings → Users → user → Security tab
("Reset MFA"), Settings → Security → Login Rules → "Require two-factor authentication".
Admin `/login`, `/security` (`data-testid="admin-mfa-settings"`), `/settings/users`
("Two-factor" column, "Reset MFA"). Test ids: `mfa-manual-key` (setup key), `mfa-recovery-codes`
(list). The API needs `SECRET_ENCRYPTION_KEY`; without it setup answers `MFA_ENCRYPTION_UNAVAILABLE`.

Manual steps with an authenticator app (Microsoft or Google Authenticator):

1. Web: sign in as a tenant user → My Profile → Two-factor authentication → Turn on. Scan
   the QR code (or type the setup key), enter the current code → Verify and turn on. Ten
   recovery codes appear; Copy and Download work; Done is enabled only after ticking
   "I've saved these codes". Status On, recovery codes left 10.
2. Sign out and sign in with the password: the code step appears and no auth cookie exists
   yet (DevTools). Enter the code → signed in. Reusing the same code in a new sign-in within
   the same 30 s is refused.
3. Sign in → "Use a recovery code" → one code → signed in; codes left 9; the same code again is refused.
4. Five wrong codes in the code step lock the account: the next correct code returns to the
   password step ("This sign-in has expired. Sign in again.") and the password then gives
   "Invalid credentials." for 30 minutes.
5. Leave the code step for more than 5 minutes → verifying returns to the password step.
6. My Profile → New recovery codes (needs a current code) → previous codes stop working.
7. Turn off requires the current password and a code or recovery code; a wrong password
   shows "Your current password is not correct."
8. Tenant admin with users.update: Settings → Users → a user → Security tab shows
   "Two-factor authentication: On" and "Reset MFA" → confirm → the user's sessions are
   revoked and MFA is off. The action is absent on your own record.
9. Turn on "Require two-factor authentication": an unenrolled user signing in gets the QR
   and key, then recovery codes, then lands signed in.
10. Admin app: /security → same enrol, regenerate and disable flow; admin sign-in then asks
    for the code; /settings/users shows Two-factor On and "Reset MFA" (Super Admin, not for
    yourself). Five wrong admin passwords lock the operator for 30 minutes.

Computing a valid TOTP in a script: read `[data-testid="mfa-manual-key"]` (spaces are
cosmetic), then in Node:

```js
const crypto = require('node:crypto');
function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const out = [];
  for (const c of s.replace(/[\s=-]/g, '').toUpperCase()) {
    value = (value << 5) | A.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(key, nowMs = Date.now()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30000)));
  const h = crypto.createHmac('sha1', base32Decode(key)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
```

Each code works once, and the setup confirmation code is also spent: for the next sign-in use
`totp(key, Date.now() + 30000)` (inside the ±1 step window) or wait for the next 30-second
boundary. Inside the API, `totpAt(secret, ms)` in
`services/api/src/modules/auth/mfa/totp.ts` computes the same value.

## RECORD_CLOSURES

- **BUG-3548** — numeric `*_TTL_SECONDS` issued one-second tokens. Commit `6e27aa37`. Spec
  `services/api/src/common/config/auth.config.spec.ts`. Fails without the fix: yes (7 of 12 by mutation). REG-535.
- **BUG-3146** — platform login had no lockout. Commit `d19e62b6` (MFA-failure wiring in
  `d67e7821`). Spec `services/api/src/modules/auth/platform-login-lockout.spec.ts`. Fails
  without the fix: yes (3 of 4). REG-536.
- **BUG-3567** — platform sign-ins not audited. Commits `d19e62b6` (failures and lock),
  `d67e7821` (success and MFA), `f8336e65` (unknown address and spec). Spec
  `services/api/src/modules/auth/platform-login-audit.spec.ts`. Fails without the fix: yes (4 of 5). REG-543.
- **ITEM-0197** — TOTP MFA. Commits `5b46d850`, `9acbb72e`, `d67e7821`, `95695851`,
  `c09cfe71`, `20027574`, `c20e3418`, `7c460b98`, `7b8fc644`, `9ab6f226`, `a49f0983`,
  `aa9b3132`, `8b247f2e`, `b06d294b`. Specs as in TESTS_ADDED. Replay and reset-scope
  properties proven by mutation; the rest is new behaviour. REG-537..REG-542.

## VALIDATION

- api `npx tsc --noEmit -p tsconfig.build.json` — pass.
- api targeted suites (auth, mfa, platform-users, users, common/security, tenant-settings, audit) — pass.
- api full `npx jest` — see the final message for counts.
- `npx eslint --fix` on every changed api file — 0 errors.
- `npm --workspace web run check-types` — pass; `npm --workspace web run test` — pass after the
  forwarded-headers invariant update (one run hit a Jest worker out-of-memory on `api-error.spec.ts`, passing on rerun).
- `npm --workspace admin run check-types` — pass; `npm --workspace admin run test` — 48 suites, 429 tests pass.
- eslint on changed web and admin files — 0 errors.
- No DB-backed e2e spec: covered by unit specs over a where-evaluating in-memory store.

## UNRESOLVED

- PERMISSION_NEEDED (WP-02 file `common/guards/public-rate-limit.guard.ts`): add to
  `ROUTE_LIMITS` `'/auth/mfa/verify': 10`, `'/admin/auth/mfa/verify': 10` and
  `'/auth/mfa/challenge/setup/confirm': 10` writes per 10 minutes per IP and path. Not edited.
- `AuthMfaController` added to `serviceAuthorizedControllers` in
  `common/constants/wiring-invariants.spec.ts`; WP-02 may edit the same list.
- `PlatformUsersService` gained MFA methods and an `MfaService` constructor dependency;
  `resetUserMfa` calls `assertCanManage`, so WP-02's conversion to `platform-users.manage` carries over.
- Owner decisions: mandatory MFA for platform operators (no platform SETUP_REQUIRED flow
  built); whether other admins may reset a tenant owner's MFA.
- `mfaMethod` has no UI control (TOTP is the only method).
