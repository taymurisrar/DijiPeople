# Authentication

How DijiPeople authenticates users. Verified against the code.

Primary sources:
`services/api/src/common/config/auth.config.ts`,
`services/api/src/common/guards/jwt-auth.guard.ts`,
`services/api/src/modules/auth/`,
`services/api/src/modules/platform-auth/`,
`apps/web/lib/server-api.ts`, `apps/web/lib/auth-cookies.ts`.

---

## Model

JWT **access + refresh** tokens, issued per application client, with the refresh
token persisted (hashed) as a **session row**. Every authenticated request
re-validates the session against the database — the token alone is not enough.

## Auth clients

`AUTH_CLIENT_IDS` in `auth.config.ts`:

| Client id | App | Session table |
|---|---|---|
| `web` | `apps/web` (tenant users) | `RefreshToken` |
| `admin` | `apps/admin` (platform users, and tenant users where applicable) | `PlatformRefreshToken` for platform users, `RefreshToken` otherwise |
| `agent-desktop` | `apps/agent-desktop` (Electron) | `AgentRefreshToken` |

The client id arrives on the request via header
(`getAuthClientIdFromHeaders`). The token's `appClientId` **and** `aud` must
both normalise to the same client id, or the request is rejected with
`INVALID_TOKEN`. A `web` token cannot be replayed against `admin`.

Secrets and TTLs resolve per client with a fallback chain: a client-specific
variable (`WEB_JWT_ACCESS_SECRET`, `ADMIN_*`, `AGENT_*`) falls back to the
shared `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`. Development defaults exist in
`AUTH_CONFIG_DEFAULTS`; `assertAuthEnvironment()` refuses to boot with those
defaults in production or staging.

Defaults: access TTL `15m`, refresh TTL `8h`, idle timeout `8h`, absolute
timeout `12h`, activity throttle `60s`. The desktop agent is deliberately
longer-lived: refresh `90d`, idle and absolute `30d`.

## Token payload

`AuthTokenPayload` (`common/interfaces/authenticated-request.interface.ts`):

```ts
{
  sub, tenantId, email?, sessionId, tokenVersion,
  type?: 'access' | 'refresh' | 'agent-refresh',
  tokenUse?: 'access' | 'refresh',
  appClientId?, aud?, deviceId?,
  authSubjectType?: 'tenant-user' | 'platform-user',
  rememberMe?, platformRole?
}
```

## Request validation sequence

`JwtAuthGuard.canActivate()`:

1. `@Public()` → allow through.
2. Resolve the client id from headers.
3. Extract the token: `Authorization: Bearer` first, then the per-client cookie
   (`getAuthCookieNames`).
4. Verify the signature with the client-specific access secret.
5. Assert `tokenUse`/`type` is `access`.
6. Assert `appClientId` and `aud` both match the requesting client.
7. **Assert the session is still live** — a matching row in the appropriate
   refresh-token table with `revokedAt: null` and `expiresAt > now`.
   - `absoluteExpiresAt` in the past → `SESSION_EXPIRED`
   - Sliding sessions enabled and `lastActivityAt` older than the idle timeout →
     `SESSION_EXPIRED`
   - No row → `SESSION_REVOKED`
8. Load the access context from the database
   (`loadPlatformAccessContext` for `admin` + `platform-user`, otherwise
   `loadAccessContext(sub, tenantId)`).
9. Assert the token's `email` matches the stored user's current email.
10. Attach `request.user`, plus `sessionId` and `appClientId`.
11. Enforce `TimesheetAccessRestriction` (below).

Failure codes are explicit and distinct: `AUTH_REQUIRED`, `INVALID_TOKEN`,
`ACCESS_TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, and
`DATABASE_CONNECTION_FAILED` (503) when the database is unreachable — the guard
deliberately distinguishes "database down" from "you are not authenticated".

## Per-tenant idle timeout

For `web` tenant users, the idle timeout can be overridden by the tenant setting
`security.idleTimeoutMinutes`, clamped to **15–1440 minutes**. Platform users
and other clients use the configured default.

## Timesheet access restriction

`JwtAuthGuard` also enforces `TimesheetAccessRestriction` — an active,
non-overridden, unexpired restriction on the caller's employee record:

- `WARNING_ONLY` → no enforcement
- `LIMITED_ACCESS` → `GET` allowed, writes blocked
- otherwise → blocked

An allow-list of route prefixes always passes (`/timesheets`, `/approvals`,
`/notifications`, `/my-profile`, `/auth`, `/help`, and others — see the guard).
Platform users and the `system-scheduler` role are exempt. If you add a route a
restricted user must still reach, add its prefix to `alwaysAllowed`; do not
weaken the restriction.

## Cookies

- Names per client via `getAuthCookieNames` (`ACCESS_TOKEN_COOKIE`,
  `WEB_*`, `ADMIN_*`, `AGENT_*` environment overrides).
- Attributes from `COOKIE_DOMAIN` / `AUTH_COOKIE_DOMAIN`, `COOKIE_SECURE`,
  `COOKIE_SAME_SITE`.
- CORS runs with credentials enabled (`buildCorsOptions`,
  `CORS_ALLOWED_ORIGINS`), because the browser sends cookies cross-origin
  between the app hosts and the API host.
- Frontend cookie handling: `apps/web/lib/auth-cookies.ts`,
  `apps/web/lib/auth-config.ts`, and the admin equivalents.

## Frontend flow

`apps/web/lib/server-api.ts` (and the admin equivalent):

- Reads the auth cookies from the incoming request.
- Sends `x-auth-client-id` so the API selects the right secret and session table.
- On 401, attempts a refresh and re-issues the request, then rewrites the
  cookies from the refreshed tokens.
- Normalises API errors through `lib/api-error.ts` so the standard error
  contract survives to the UI.

Route handlers under `app/api/` proxy to the API so the browser never talks to
the API origin directly. **They must not make authentication or authorization
decisions.**

## Password and token storage

- Passwords hashed with `bcryptjs`.
- Refresh tokens stored hashed; never logged, never returned after issuance.
- Integration credentials encrypted at rest via
  `common/security/secret-encryption.service.ts`, which refuses to start in
  production without `SECRET_ENCRYPTION_KEY`.

## Public endpoints

Four controllers are `@Public()`:
`billing/controllers/public-billing.controller.ts`,
`billing/controllers/stripe-webhook.controller.ts`,
`leads/public-leads.controller.ts`,
`tenants/public-tenants.controller.ts`.

`PublicRateLimitGuard` provides an in-memory limiter keyed by IP + path — 20
writes / 120 reads per 10-minute window.

> **Note:** the limiter is in-process memory. With more than one API instance
> the effective limit multiplies by the instance count, and it resets on
> restart. Adequate as a speed bump; it is not a distributed rate limiter.

## Related flows

Invitations, activation and password reset live in
`modules/auth/user-invitations.service.ts` and the `auth` module, with
`apps/web/app/activate-account/`. Links derive their base URL from
`@repo/config` rather than hardcoded hosts.

> **Not fully verified here:** the complete refresh-rotation semantics
> (`AUTH_REFRESH_ROTATION_ENABLED`), MFA (no MFA implementation was found), and
> the platform-user login path in `platform-auth`. Read those modules directly
> before changing them.
