---
ID: BUG-3357
aliases: [BUG-3357]
Title: Remember me is overridden by the web middleware, which pins the cookies to 15 minutes and 1 hour
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: 118d22ed
AffectedModules: [web:auth, api:auth]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-442
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3357 — Remember me is overridden by the web middleware, which pins the cookies to 15 minutes and 1 hour

## Summary

The sign-in route honours **Remember me** correctly: it reads the lifetimes the
API returned and writes cookies that live that long. The web middleware then
undoes it. Every time `proxy.ts` refreshes a session it rewrites both auth
cookies with lifetimes of its own — a hardcoded **15 minutes** for the access
cookie and `AUTH_REFRESH_TOKEN_TTL_SECONDS` for the refresh cookie — and neither
value has anything to do with Remember me. A thirty-day remembered session
becomes a short-lived one the first time it is refreshed, and the user is never
told that the box they ticked stopped applying.

Remember me is weak on the API side too: it lengthens only the refresh token,
never the access token, and it is subject to an idle timeout it cannot override.

## Expected Behavior

If a user ticks **Remember me** and the tenant policy allows it, the cookies
that carry the session live for the remembered lifetime, and they keep doing so
across refreshes. Any component that rewrites an auth cookie preserves the
lifetime policy that issued it.

## Actual Behavior

Two layers write the same cookies with different rules.

`apps/web/app/api/auth/login/route.ts` reads `tokens.rememberMe`,
`tokens.accessTokenExpiresIn` and `tokens.refreshTokenExpiresIn` from the API
response and sets `maxAge` from them — correct.

`apps/web/proxy.ts`, in `continueWithRefreshedTokens`, sets the access cookie to
a literal `maxAge: 15 * 60` and the refresh and session cookies to
`getRefreshMaxAgeSeconds()`, which reads `AUTH_REFRESH_TOKEN_TTL_SECONDS`, then
`JWT_REFRESH_TOKEN_TTL`, then falls back to `8h`. The refresh response carries
`rememberMe` and both expiry strings; the middleware reads neither.

On the API side, `buildAuthResponse` computes `accessTokenTtl` from the tenant's
`sessionTimeoutMinutes` alone. `rememberMe` appears only in the refresh token's
TTL. So Remember me has never affected how long an access token is valid for a
tenant user.

## Reproduction

1. Sign in to a tenant workspace with **Remember me** ticked. Inspect the auth
   cookies: `Max-Age` reflects the remembered lifetimes.
2. Keep the tab open until the middleware refreshes once — any protected `GET`
   navigation where the access token is within five minutes of expiry, or where
   the access cookie is already gone.
3. Inspect the cookies again. The access cookie is now `Max-Age=900` and the
   refresh cookie carries the deployment's `AUTH_REFRESH_TOKEN_TTL_SECONDS`,
   regardless of what was ticked at sign-in.

## Evidence

- `apps/web/proxy.ts` — `continueWithRefreshedTokens` sets
  `maxAge: 15 * 60` on the access cookie and `getRefreshMaxAgeSeconds()` on the
  refresh and session cookies. No reference to `rememberMe` anywhere in the
  file.
- `apps/web/proxy.ts` — `getRefreshMaxAgeSeconds` resolves
  `AUTH_REFRESH_TOKEN_TTL_SECONDS ?? JWT_REFRESH_TOKEN_TTL ?? "8h"`.
- `apps/web/app/api/auth/login/route.ts` — the correct behaviour, for contrast.
- `apps/web/lib/server-api.ts` — `persistRefreshedAuthCookies` gets this right,
  branching on `tokens.rememberMe`. So of the three places that write these
  cookies, two honour the flag and one does not.
- `services/api/src/modules/auth/auth.service.ts` — `buildAuthResponse` sets
  `accessTokenTtl` from `authPolicy.sessionTimeoutMinutes`; `rememberMe` is used
  only for `refreshTokenTtl`.

Production API service at `85c31d9d` carries `AUTH_REFRESH_TOKEN_TTL_SECONDS=1h`
and `AUTH_IDLE_SESSION_TIMEOUT_SECONDS=1800`, with `SESSION_SLIDING_ENABLED=true`.
So on this deployment the middleware's rewrite shortens a remembered refresh
cookie to one hour, and a thirty-minute idle timeout applies on top.

The web app's own values could not be confirmed: every auth variable on the
`diji-people-web` Vercel project is stored with type `sensitive`, which is
write-only and cannot be read back through the API. The literal `15 * 60` is not
configurable and holds regardless.

Two variables set on the API service, `JWT_ACCESS_TTL_REMEMBER_ME=30m` and
`JWT_REFRESH_TTL_REMEMBER_ME=30d`, are read only by `buildPlatformAuthResponse`
— the platform-admin path. No tenant sign-in consults them, so an operator
tuning Remember me through those variables changes nothing for tenant users.

## Root Cause

Three components write the auth cookies and each was given its own idea of how
long they should live. The middleware was written to keep a session alive across
a navigation, and the lifetimes it uses are the deployment's default token TTLs
rather than the lifetimes of the session actually in hand — which the refresh
response was already telling it.

The API-side weakness has the same shape: Remember me was implemented for the
refresh token and never reconciled with the tenant session policy that governs
the access token.

## Impact

Users who tick **Remember me** are signed out far sooner than the label implies,
on a schedule none of them can predict, because whether it happens depends on
whether the middleware has refreshed yet. It contributed to the report behind
[[BUG-3355]]: the user's first question was why a remembered session ended, and
the honest answer has several parts.

Not a security exposure — every rewrite shortens the lifetime, never extends it.
It is a correctness and trust problem.

## Affected Areas

- `apps/web/proxy.ts` — `continueWithRefreshedTokens`, `getRefreshMaxAgeSeconds`
- `services/api/src/modules/auth/auth.service.ts` — `buildAuthResponse`
- the sign-in screen's **Remember me** control and its copy
- `apps/admin` has its own middleware and should be checked for the same rewrite

## Proposed Resolution

No ExecPlan needed.

Make the refresh response the single source of cookie lifetime. `proxy.ts`
already parses the refresh response; have it read `rememberMe`,
`accessTokenExpiresIn` and `refreshTokenExpiresIn` and apply them exactly as
`persistRefreshedAuthCookies` does, sharing one helper between the three writers
rather than three literals.

Separately, decide what Remember me should mean for the access token and write
it down. Either it lengthens `sessionTimeoutMinutes` for that session, or the
label and help text say plainly that it keeps you signed in across browser
restarts and nothing more.

## Acceptance Criteria

- After a middleware refresh, the auth cookie lifetimes match the lifetimes the
  API returned for that session, for both remembered and non-remembered
  sign-ins.
- Exactly one helper computes auth cookie options for all three writers, and a
  test fails if a writer sets `maxAge` from a literal.
- The documented meaning of **Remember me** matches what the code does.

## Regression Coverage

`apps/web/lib/auth-session-cookies.spec.ts` pins `buildAuthSessionCookies`'s
behaviour directly (remembered vs. non-remembered, session-cookie omission,
two different remembered expiries producing two different `maxAge`s).
`apps/web/proxy.spec.ts` runs the proxy's refresh branch with a remembered and
a non-remembered mocked `/auth/refresh` response and asserts the resulting
cookie `maxAge`s, including the specific assertion that a 30-minute remembered
access cookie is not the old literal `900` seconds. Registered as REG-442 with
QA scenario [[QA-AUTH-013]].

## Dependencies

None.

## Related Items

[[BUG-3355]] — the report this came from, and the other reason a remembered
session ends. [[BUG-3359]] — the same middleware refresh path, its concurrency
problem. [[BUG-3358]] — the third writer of these cookies and its silent
failure. [[BUG-2509]] — platform-admin Remember me with no policy able to refuse
it; the same feature on the other identity system.

## Resolution

Fixed 2026-09-12. Added `apps/web/lib/auth-session-cookies.ts`, exporting
`buildAuthSessionCookies()` — the single function that now computes the
`{name, value, options}` for all three auth cookies from a token response,
branching on `rememberMe` and reading `accessTokenExpiresIn` /
`refreshTokenExpiresIn` from the response with a fallback to this app's own
configured defaults only when the API omitted them. All three writers were
updated to call it:

- `apps/web/app/api/auth/login/route.ts` — refactored to build cookies through
  the shared helper instead of its own inline `durationSeconds`/
  `getAuthCookieOptions` calls.
- `apps/web/lib/server-api.ts`'s `persistRefreshedAuthCookies` — same.
- `apps/web/proxy.ts`'s `continueWithRefreshedTokens` — the actual defect.
  `refreshSessionTokens` (renamed internally to dedupe through
  `performMiddlewareRefresh`, see [[BUG-3359]]) now reads `rememberMe`,
  `accessTokenExpiresIn` and `refreshTokenExpiresIn` from the refresh
  response, which it previously discarded entirely. The hardcoded
  `maxAge: 15 * 60` and the locally-resolved `getRefreshMaxAgeSeconds()` /
  `getCookieDomainOption()` / `isProduction()` helpers were removed — dead
  code once nothing called them.

**Settled, per the bug's own proposed resolution:** Remember me lengthens the
refresh token's lifetime and keeps the browser signed in across restarts; it
does not lengthen an individual access token's lifetime, which stays governed
by the tenant's session policy regardless. Written down in
`services/api/src/modules/auth/PASSWORD-LOGIN-POLICY.md` and reflected in the
sign-in screen's own help text (`apps/web/app/(public)/login/login-form.tsx`).

## QA Retest

Pending — automated regression coverage exists (REG-442, [[QA-AUTH-013]]) but
this has not yet had a live QA pass against a deployed environment.

## History

- 2026-09-11 — created while answering a user's question about why a remembered
  session ended.
- 2026-09-12 — fixed on `agent/r-s3-auth`: one shared cookie-lifetime helper
  now used by all three writers, and Remember me's meaning for the access
  token documented.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-442 (see the regression register)

<!-- GRAPH:END -->
