---
ID: BUG-2547
aliases: [BUG-2547]
Title: A revoked session still answers on /auth/me
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: fba846d1
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-377
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2547 — A revoked session still answers on /auth/me

## Summary

`GET /auth/me` accepted an access token whose session had been signed out, and
answered with the caller's identity, roles, permission keys and access context.
Every other authenticated route refused the same token. Measured live on
production: after sign-out, `/employees` returned `401 SESSION_REVOKED` and
`/auth/me` returned `200`, with 7.98 hours left on an eight-hour access token.

## Expected Behavior

Signing out ends the session everywhere. A token belonging to a revoked session
is refused by every route that reads it, including the one that reports who you
are.

## Actual Behavior

`/auth/me` verified the access token's signature, audience and expiry, then
loaded and returned the access context. It never asked whether the session
behind the token was still open.

The exposure is bounded — it discloses identity and entitlements, and does not
reach tenant business data, because everything behind `JwtAuthGuard` refuses the
token correctly. But it is the endpoint every client uses to answer "am I signed
in?", so a revoked session continued to report itself as live.

## Reproduction

Run against production at `fba846d1`, from `scripts` equivalent to the
SESSION-0084 sweep:

1. `POST /api/auth/login` with `tenantSlug`, capturing the three cookies.
2. `GET /api/auth/me` with the access cookie. `200`.
3. `POST /api/auth/logout` with all cookies. `201`, three `Set-Cookie` clears.
4. `POST /api/auth/refresh` replaying the pre-sign-out refresh token.
   `401 SESSION_REVOKED` — revocation did happen.
5. `GET /api/employees` with the pre-sign-out access token.
   `401 SESSION_REVOKED` — the guard refuses it.
6. `GET /api/auth/me` with the same access token. **`200`**, returning
   `taimurisrar806@gmail.com`.

Controls, so that step 6 is not simply an unguarded endpoint: `/auth/me` with no
cookie returns `401 SESSION_EXPIRED`, and with a tampered signature returns
`401 SESSION_EXPIRED`. It verifies the token. It just does not check the session.

## Evidence

- `services/api/src/modules/auth/auth.controller.ts:153-156` — `@Public()`
  `@Get('me')`, so the route never passes through `JwtAuthGuard`.
- `services/api/src/modules/auth/auth.service.ts:707-729` —
  `getProfileFromRequest` calls `verifyAccessToken` and then goes straight to
  `loadAccessContext`.
- `services/api/src/common/guards/jwt-auth.guard.ts:285-320` — what the guard
  does instead: `findFirst` for a live, unrevoked, unexpired token row matching
  `sessionId`, subject, tenant and client, throwing `SESSION_REVOKED` when there
  is none.
- Live transcript summarised under Reproduction, taken on 2026-08-30 against
  commit `fba846d1`.

## Root Cause

**`@Public()` bought an exemption from the guard, and the exemption was wider
than intended.** The route is public for a good reason — a signed-out visitor
should get an answer, not a 401 — but being outside the guard meant reimplementing
the guard's checks, and only some of them were reimplemented. Signature, audience
and expiry were; session liveness was not.

This is the second finding in one session where a security decision existed in two
places and the two disagreed. The other is BUG-2506.

## Impact

Reachable in production on every tenant and on the admin console. Bounded to
identity and entitlement disclosure for the remaining lifetime of the access
token, which on the tenant measured is eight hours. It also means a client whose
session an administrator has just revoked keeps rendering as signed in until its
token expires, since `/auth/me` is what it asks.

## Affected Areas

- `GET /api/auth/me`, all clients
- `AuthService.getProfileFromRequest`

## Proposed Resolution

Ask the guard's question in the same shape the guard asks it, and fall through to
the existing refresh path when the answer is no — that path already clears the
cookies and reports an expired session, which is what a revoked session should
look like to a client.

`agent-desktop` is excluded, because the guard does not use this check for it
either; it has its own device-session assertion, and a second opinion here would
be a third source of truth rather than one shared one.

## Acceptance Criteria

- `/auth/me` refuses an access token whose session row is revoked, and clears the
  cookies.
- The liveness query filters on session, subject, tenant, client, `revokedAt:
  null` and an unexpired row — the same filter the guard uses.
- A platform subject is checked against `PlatformRefreshToken`, never the tenant
  table.
- A token carrying no `sessionId` is still accepted, so holders of tokens issued
  before sessions were recorded are not signed out.
- The assertion is made against `getProfileFromRequest`, not only against the
  helper.

## Regression Coverage

[REG-377](../qa/regressions/index.md) —
`services/api/src/modules/auth/auth-session-lifecycle.spec.ts`, "/auth/me itself
refuses a revoked session, not merely the helper". Mutation-tested: with the
liveness check disabled the assertion fails and the other fourteen still pass,
which is the point of having it.

## Dependencies

None.

## Related Items

- [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i]] — the
  same session, the other half of sign-out.
- [[BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it]]
- [[QA-AUTH-010-signing-out-revokes-the-session-not-just-the-browser]]

## Resolution

Fixed on `agent/attendance-correction-entry`. `isSessionStillLive` mirrors the
guard's query, and `getProfileFromRequest` consults it before returning a
profile. Found by the SESSION-0084 live auth sweep rather than by reading code —
the endpoint looks correct until you sign out and ask it.

## QA Retest

Fifteen automated assertions. The live retest is step 6 of the reproduction,
re-run after deployment: it must return 401 where it returned 200.

## History

- 2026-08-30 - found during the SESSION-0084 production auth sweep at `fba846d1`.
- 2026-08-30 - fixed; REG-377 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-377 (see the regression register)

<!-- GRAPH:END -->
