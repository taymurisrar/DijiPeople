---
ID: BUG-0627
aliases: [BUG-0627]
Title: Admin sign-out does not revoke the platform session when the refresh cookie has expired
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 389aa49
AffectedModules: [services/api/src/modules/auth, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: QA-AUTH-002
RegressionId: REG-221
RelatedBacklogItem: ITEM-0002
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0627 — Admin sign-out does not revoke the platform session when the refresh cookie has expired

## Summary

Signing out of the platform admin app clears the browser but leaves the session
live on the server whenever the refresh cookie has already expired — which is the
ordinary case, not an edge case. `AuthService.logout` keyed revocation on the
refresh token alone, and read it only from the cookie. With no refresh cookie
there was nothing to match, so the handler cleared the response cookies and
returned success without touching a single row.

The operator sees the login screen and believes they are signed out. The
`PlatformRefreshToken` row stays `revokedAt: null` until it expires on its own,
and anyone still holding that token can refresh a live admin session from it.

## Expected Behavior

Sign-out ends the session on the server. When the refresh cookie is gone but the
session cookie is still present — which every client forwards for exactly this
purpose — the persisted token for that session is revoked.

## Actual Behavior

`revokedAt` stays `null`. `POST /api/auth/logout` answers 201 and clears the
response cookies, so nothing anywhere reports a problem.

## Reproduction

1. Sign in to `apps/admin` as a platform user; note the `PlatformRefreshToken`
   row created for the session.
2. Delete the admin refresh cookie from the browser, keeping the access and
   session cookies — the state after the refresh cookie's TTL elapses.
3. Sign out. The admin route calls `POST /api/auth/logout` with
   `X-DijiPeople-App: admin` and forwards the surviving cookies.
4. Read the row back: `revokedAt` is still `null`.

Driven as an automated test in
`services/api/test/admin-logout-revocation.e2e-spec.ts`, which failed at step 4
before the fix.

## Evidence

- `services/api/src/modules/auth/auth.service.ts` — `logout()` opened
  `if (refreshToken) { … }` and did nothing outside it.
- `services/api/src/modules/auth/auth.service.ts` —
  `extractTokenFromRequest()` reads `req.cookies` and the `Cookie` header only.
  The admin route sends `body: { refreshToken }` as well, and the API never
  looks at it, so the body is dead weight rather than a fallback.
- `apps/admin/app/api/auth/logout/route.ts` — `revokeApiSession` forwards all
  three cookies, with the comment *"the API resolves the session from the
  forwarded Cookie header, so both must be present or the session stays live
  server-side."* That is the intended contract; the API did not hold up its end.
- Test output before the fix:
  ```
  ● revokes the persisted token when the refresh cookie has already expired
      Expected constructor: Date
      Received value: null
  ```

## Root Cause

The refresh token was treated as the only handle on a session, and it is the
shortest-lived of the three cookies. `PlatformRefreshToken.sessionId` has existed
all along — indexed as `@@index([appClientId, sessionId])` — and the session
cookie carries that id, but `logout` never read it.

This is the second half of [[BUG-0009]]. That record fixed the client: the admin
route stopped skipping the API call when the refresh cookie was absent. Nobody
checked what the API did on receiving that call, because the test that covered it
mocked `fetch`. A guard proving the request is *sent* says nothing about whether
anything is *revoked* — the same `assertion-without-a-check` shape [[BUG-0009]]
and [[BUG-0010]] were both closed on for three days.

## Impact

Every platform operator sign-out that happens after the refresh cookie expires,
on the surface with the widest blast radius in the product: `apps/admin` reaches
every tenant. The window is the remaining life of the refresh token, up to seven
days.

Reachable in production and routine rather than exceptional — the session-expired
modal's "sign in again" link is precisely the flow where the refresh cookie is
already gone. It is a failure to end a session rather than a way to obtain one,
so it needs a token that already leaked to be exploited; it removes the one
control a compromised operator has.

The same defect existed on the tenant and agent-desktop clients through the same
code path.

## Affected Areas

- `services/api/src/modules/auth/auth.service.ts` — `logout()`
- `POST /api/auth/logout` for all three clients
- `apps/admin/app/api/auth/logout/route.ts` — unchanged; it was already correct
- `PlatformRefreshToken`, `RefreshToken`

## Proposed Resolution

Revoke by the forwarded session cookie when the refresh cookie is absent. No
ExecPlan: no schema change, no migration, no contract change.

## Acceptance Criteria

- A sign-out carrying the session cookie but no refresh cookie revokes the
  persisted token for that session.
- A sign-out carrying the refresh cookie still revokes it, as before.
- A session id belonging to nobody revokes nothing.
- A session id belonging to a **different client** revokes nothing, so a tenant
  sign-out cannot close the attendance agent's session.
- The tenant client is asserted, not assumed.

## Regression Coverage

[[REG-221]] — `services/api/test/admin-logout-revocation.e2e-spec.ts`, six
DB-backed tests over real HTTP.

Proven by mutation, twice:

- removing the revocation call fails both primary tests, admin and tenant;
- removing `appClientId` from the filter fails the scope test.

The scope test earned that second probe. Its first version signed out as `web`
using an **admin** session id and asserted the platform token survived — which
passes whatever the filter says, because admin tokens live in a different table
and a `web` logout could never reach one. It stayed green with `appClientId`
deleted from the production code. It now uses two rows in the *same* table,
`web` and `agent-desktop`, which is the claim `appClientId` actually makes.

## Dependencies

None.

## Related Items

[[BUG-0009]] · [[BUG-0010]] · [[ITEM-0002]] · module [[auth|Auth]] · bug pattern
[[assertion-without-a-check]].

## Resolution

`AuthService.logout` now reads the session cookie alongside the refresh cookie.
When the refresh cookie is absent and the session cookie is present, it calls a
new `revokeSessionTokens(clientId, sessionId)`, which updates
`{ sessionId, appClientId, revokedAt: null }` on `PlatformRefreshToken` for
`admin` and `RefreshToken` for every other client.

`updateMany` rather than read-then-write: the filter is already exact, and a
token rotated between the read and the write would otherwise survive the
sign-out. `revokedAt: null` stays in the filter so an already-closed session
keeps the timestamp of when it was actually closed.

The refresh-token path is untouched. Fixed on branch
`agent/qa-verify-and-burndown`.

## QA Retest

```
npx jest --config ./test/jest-e2e.json \
  --runTestsByPath test/admin-logout-revocation.e2e-spec.ts
→ 6 passed
npx jest --testPathPatterns "auth|logout|session"
→ 16 suites, 173 tests, all passing
```

DB-backed, against a throwaway PostgreSQL migrated from `schema.prisma`.
Scenario `QA-AUTH-002`.

## History

- 2026-08-22 — created from qa run at `389aa49`.
- 2026-08-22 — found while closing [[ITEM-0002]], which asked for a live API and
  database proof of admin sign-out. The proof was written first and failed; the
  item was a test gap hiding a defect.
- 2026-08-22 — Architect triage: FIX_NOW. Session revocation on the platform
  surface, one file, no schema change, and the test that proves it was already
  written.
- 2026-08-22 — fixed and verified. [[REG-221]] registered.
- 2026-08-22 — QA retest passed against a real database; scenario QA-AUTH-002 promoted from PARTIAL to full and now drives this behaviour.
