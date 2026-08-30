---
ID: BUG-2506
aliases: [BUG-2506]
Title: Sign-out leaves the refresh token live whenever the tenant is busy
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: ade1fea7
AffectedModules: [services/api/src/modules/auth]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-375
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2506 — Sign-out leaves the refresh token live whenever the tenant is busy

## Summary

The ordinary sign-out — the one where every cookie is still present — did not
revoke the refresh token it was holding. It fell through to a scan of the twenty
most recently created live refresh tokens for that client **across the whole
deployment**, bcrypt-comparing each in turn. On any deployment that has issued
more than twenty refresh tokens since the session began, the signer-out's own
token is not in that list. The browser is cleared, the screen says signed out,
and the token stays valid for its full lifetime — up to thirty days with
remember-me.

## Expected Behavior

Signing out revokes the session server-side. A refresh token presented after
sign-out is refused.

## Actual Behavior

`AuthService.logout` revoked exactly by session id only inside the branch guarded
by `if (!refreshToken && sessionId)` — that is, **only when the refresh cookie
was missing**. With the refresh cookie present, control reached the token scan
instead, whose filter was `{ revokedAt: null, appClientId: clientId }` ordered by
`createdAt` descending with `take: 20`.

That filter carries no `tenantId`, no `userId` and no `sessionId`. It is the
twenty newest live tokens for the client id, globally. Miss, and nothing is
revoked at all — the loop simply ends and the cookies are cleared.

The busier the deployment, the more reliably sign-out fails. It is at its weakest
exactly when it matters most.

## Reproduction

1. Sign in to the tenant app as any user; capture the refresh cookie.
2. From any other browser or client, sign in more than twenty times, so that more
   than twenty live web refresh tokens exist newer than the one from step 1.
3. Return to the first browser and sign out.
4. Replay the captured refresh token against `POST /api/auth/refresh`.
5. It is accepted, and issues a fresh access token for a session the user
   believes they closed.

Step 2 is not contrived: twenty logins is a small tenant's morning.

## Evidence

- `services/api/src/modules/auth/auth.service.ts:1099-1170` before the fix — the
  `if (!refreshToken && sessionId)` guard, and beneath it the `take: 20` scan
  with no tenant, user or session filter.
- `services/api/src/modules/auth/auth-session-lifecycle.spec.ts` — the new spec.
  Its first case fails against the old code and passes against the fix.

## Root Cause

**A fallback was left carrying the primary case.** The exact revocation by session
id was added for BUG-0627, where the refresh cookie is typically already gone,
and it was guarded to that situation — so the path it was written for was the only
path that received it. The common case kept the older, weaker mechanism, and that
mechanism carried a bound (`take: 20`) which reads as an optimisation and behaves
as a correctness limit.

## Impact

Reachable in production, on every tenant, for the tenant app and the admin console
alike. A signed-out session stays resumable by anyone holding the refresh token —
a shared or stolen machine being the obvious case, since sign-out is exactly the
control a person reaches for when they stop trusting the device in front of them.
This is the third recurrence of the class after BUG-0035 (agent desktop) and
BUG-0627 (admin sign-out).

## Affected Areas

- `POST /api/auth/logout`, all clients (`web`, `admin`, `agent-desktop`)
- `services/api/src/modules/auth/auth.service.ts`

## Proposed Resolution

Revoke by session id whenever the session id is known, not only when the refresh
cookie is absent. `revokeSessionTokens` is an exact, indexed `updateMany` scoped
to one session and one client, so running it in both cases costs nothing and
cannot reach another person's session. The hash scan stays as the fallback for a
client that sent no session cookie.

## Acceptance Criteria

- Sign-out with every cookie present issues an `updateMany` filtered on
  `{ sessionId, appClientId, revokedAt: null }`.
- Sign-out with only the session cookie still does the same, preserving BUG-0627.
- An admin sign-out revokes `PlatformRefreshToken` and never `RefreshToken`.
- Sign-out with no session cookie still clears the browser and claims nothing.
- A second sign-out does not move the first one's `revokedAt`.

## Regression Coverage

[REG-375](../qa/regressions/index.md) —
`services/api/src/modules/auth/auth-session-lifecycle.spec.ts`, "revokes by
session id even when the refresh cookie is present".

## Dependencies

None.

## Related Items

- [[BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it]] — what
  makes the unrevoked window as long as thirty days.
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]

## Resolution

Fixed on `agent/attendance-correction-entry`: the guard became `if (sessionId)`,
with the reasoning recorded in place. Found while carrying out the auth validation
of SESSION-0084, which asked precisely whether logout revokes the refresh token or
only clears the cookie.

## QA Retest

Nine automated assertions in the spec above. A live retest — sign out, replay the
refresh token, expect a refusal — is folded into the post-deploy sweep.

## History

- 2026-08-30 - created from qa run at `ade1fea7`.
- 2026-08-30 - fixed; REG-375 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-375 (see the regression register)

<!-- GRAPH:END -->
