---
ID: BUG-3359
aliases: [BUG-3359]
Title: Refresh rotation has no grace window and the web middleware has no concurrency control
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: 118d22ed
AffectedModules: [api:auth, web:auth]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3359 — Refresh rotation has no grace window and the web middleware has no concurrency control

## Summary

`rotateRefreshToken` revokes the presented refresh token the instant it issues a
successor. There is no reuse window and no token-family grace period, so two
requests that legitimately carry the same refresh token cannot both succeed —
the second is told the session was revoked. `server-api.ts` protects itself
against this with an in-flight map that collapses concurrent refreshes into one.
`proxy.ts` has no such protection, and when its refresh returns `401` it calls
`redirectToLogout`, which ends the session outright.

Two navigations in flight at once, or two tabs of the same workspace, are
enough. Nothing about that is abusive, and the platform treats it as a dead
session.

## Expected Behavior

Concurrent refreshes of one live session converge on one new token pair and all
of them succeed. Presenting a just-rotated token within a short window is
tolerated, because it is indistinguishable from an ordinary race. Only reuse
well after rotation should be treated as suspicious.

## Actual Behavior

`rotateRefreshToken` bcrypt-matches the presented token among the session's live
rows, sets `revokedAt` on it, and writes the successor. From that moment
`hasActiveRefreshToken` cannot match the old token, so a second refresh
presenting it throws `SESSION_REVOKED`.

`persistRefreshToken` then compounds it: unless the tenant has opted into
multiple active sessions it also revokes every *other* live token for that user
and client, so two racing refreshes can each revoke the other's successor and
leave the browser holding whichever `Set-Cookie` landed last, which may be a row
that is already revoked.

In `apps/web/proxy.ts` there is no in-flight de-duplication. `refreshSessionTokens`
returns `shouldLogout: true` on any `401` or `403`, and `proxy` responds with
`redirectToLogout`. A lost race is therefore a sign-out, not a retry.

## Reproduction

1. Sign in to a tenant workspace and let the access token approach expiry, so
   `shouldRefreshAccessToken` returns true.
2. Issue two protected `GET` navigations at once — two tabs, or a click during
   an in-flight navigation.
3. Both carry the same refresh cookie. One rotation succeeds; the other receives
   `401 SESSION_REVOKED` and is redirected to logout.

## Evidence

- `services/api/src/modules/auth/auth.service.ts:1817-1868` —
  `rotateRefreshToken` sets `revokedAt: new Date()` on the presented token
  immediately; nothing records a grace period or a reuse window.
- `services/api/src/modules/auth/auth.service.ts:1779-1800` —
  `hasActiveRefreshToken` filters on `revokedAt: null`, so the old token cannot
  match once rotated.
- `services/api/src/modules/auth/auth.service.ts:1680-1697` — the revoke-all
  branch of `persistRefreshToken` that makes two successors mutually
  destructive.
- `apps/web/lib/server-api.ts:216-311` — `inFlightRefreshes` and
  `deadRefreshTokens`, the de-duplication that exists on this side, with a
  comment explaining it was added because eight parallel loads produced eight
  refresh calls.
- `apps/web/proxy.ts` — `refreshSessionTokens` has no equivalent map; its
  caller treats `401`/`403` as `shouldLogout`.

The schema already anticipates the fix: `RefreshToken.tokenFamilyId` exists and
is set to the session id, but nothing reads it, so the family cannot currently
be used to recognise a racing sibling.

Production carries `AUTH_REFRESH_ROTATION_ENABLED=true`, confirmed on the API
service at `85c31d9d`, so this path is live.

## Root Cause

Rotation was implemented as a strict single-use credential without the grace
window that makes single-use workable over an unreliable, concurrent transport.
The mitigation was then added in one client and not the other, which left the
middleware — the component that refreshes most often, on every navigation — as
the one without it.

## Impact

Reachable in production. A user with two tabs open, or who clicks while a page
is still loading, can be signed out at the moment the access token happens to be
near expiry. It is intermittent and unreproducible from the user's side, which
is the worst shape for a support report.

It also makes the session harder to reason about during incidents, because the
revocation reason recorded for a lost race is identical to the reason recorded
for a genuine second sign-in.

## Affected Areas

- `services/api/src/modules/auth/auth.service.ts` — `rotateRefreshToken`,
  `hasActiveRefreshToken`, `persistRefreshToken`
- the same functions on the platform path — `rotatePlatformRefreshToken`
- `apps/web/proxy.ts` — `refreshSessionTokens`, `redirectToLogout`
- `apps/admin` and `apps/agent-desktop`, which reach the same rotation

## Proposed Resolution

Two changes, neither needing an ExecPlan on its own. If a schema column is added
for the grace window, that part needs one under [`PLANS.md`](../../PLANS.md).

1. **Give rotation a grace window.** Accept a token that was revoked by rotation
   within a short period — tens of seconds — and return the current successor
   rather than minting another. `tokenFamilyId` already carries the session, so
   the sibling is findable without a schema change if the successor can be
   identified from the family; if a column is needed to record why a token was
   revoked, expand and backfill.
2. **De-duplicate in the middleware.** Give `proxy.ts` the same in-flight map
   `server-api.ts` has, and stop treating a single `401` as proof the session is
   gone — retry once against the cookie the browser now holds before redirecting
   to logout.

Reuse well outside the window should stay a revocation, and is worth recording
as a security event rather than silently.

## Acceptance Criteria

- Two concurrent refreshes of one live session both succeed and converge on one
  token pair.
- Presenting a token rotated moments earlier does not end the session.
- Reuse long after rotation is still refused.
- The middleware retries before signing a user out.

## Regression Coverage

A spec that fires two refreshes with the same token and asserts both callers end
up authenticated, plus one that asserts reuse after the window is refused.
Registered as a regression entry once written.

## Dependencies

Shares a likely resolution with [[BUG-3358]], which needs the same tolerance for
an unpersisted rotation.

## Related Items

[[BUG-3358]] — the other way a rotation is lost. [[BUG-3355]] — the revoke-all
behaviour that makes two successors destroy each other. [[BUG-3356]] — what the
user sees afterwards. [[BUG-2458]] — the previous defect on this endpoint, where
refresh was throttled by the credential rate limiter.

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created during the investigation behind [[BUG-3355]], from
  reading the rotation path rather than from an observed race.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
