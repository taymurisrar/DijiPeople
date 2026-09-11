---
ID: BUG-3358
aliases: [BUG-3358]
Title: A Server Component render rotates the refresh token and cannot persist it, orphaning the browser
Status: OPEN
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
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3358 — A Server Component render rotates the refresh token and cannot persist it, orphaning the browser

## Summary

`apiRequest` refreshes the session when the access cookie is missing, then calls
`persistRefreshedAuthCookies` to write the new tokens back. In a Server
Component render that write is impossible — Next cannot set a cookie during
render — and the code knows it: the failure is caught and discarded with a
comment saying so. The comment is right that the current request can continue.
It is wrong that nothing else is lost.

With `AUTH_REFRESH_ROTATION_ENABLED=true`, which is the default and the
production setting, the API has already **revoked the refresh token the browser
still holds** and issued a replacement that now exists only in the memory of a
render that is about to end. The page renders perfectly and the session is dead
from that moment.

## Expected Behavior

A refresh either completes — new tokens reaching the browser — or it does not
happen at all. A context that cannot persist the result must not consume a
single-use credential.

## Actual Behavior

`persistRefreshedAuthCookies` wraps its three `cookieStore.set` calls in a
`try/catch` that swallows everything. During a Server Component render the very
first `set` throws, so no cookie is written. `apiRequest` continues with the
in-memory access token and the render succeeds.

The browser is left holding the previous refresh token, which
`rotateRefreshToken` revoked before returning. Every subsequent request that
presents it gets `401 SESSION_REVOKED` from `hasActiveRefreshToken`. In
`server-api.ts` that failure marks the token dead and the request is sent
unauthenticated, which surfaces as `AUTH_TOKEN_MISSING` — see [[BUG-3356]].

## Reproduction

1. Arrange a session whose access cookie is absent while the refresh cookie is
   present. Letting the access cookie reach its `Max-Age` is enough; see
   [[BUG-3357]] for why that happens sooner than expected.
2. Reach a Server Component page that fetches through `server-api` without the
   middleware refreshing first. A link prefetch is the easiest route, because
   `shouldRefreshForRequest` excludes prefetch requests from the middleware
   refresh while the render still happens.
3. The page renders. Inspect the cookies: the refresh cookie is unchanged.
4. Read the `RefreshToken` rows: the token the browser holds now has a
   `revokedAt`, and a newer row exists that the browser never received.
5. Any further request fails.

## Evidence

- `apps/web/lib/server-api.ts:329-366` — `persistRefreshedAuthCookies`, and its
  closing comment: "Server Components cannot mutate cookies; route handlers
  can. In either case the current request can continue with the refreshed
  access token."
- `apps/web/lib/server-api.ts:110-123` — the pre-emptive refresh that calls it,
  reached from any `apiRequest` with no access cookie.
- `services/api/src/modules/auth/auth.service.ts:617-640` — rotation is on
  unless disabled; `rotateRefreshToken` runs before the response is returned.
- `services/api/src/modules/auth/auth.service.ts:1817-1868` —
  `rotateRefreshToken` sets `revokedAt` on the presented token with no grace
  window, then persists the successor.
- `services/api/src/common/config/auth.config.ts:228-233` —
  `isRefreshRotationEnabled` defaults to `true`. Production carries
  `AUTH_REFRESH_ROTATION_ENABLED=true` explicitly, confirmed on the API service
  at `85c31d9d`.

A concrete caller: `apps/web/app/(authenticated)/settings/subscription/_lib/load-subscription-settings.ts`
issues three `apiRequestJson` calls from a Server Component through
`Promise.all`. That is the screen the reporting user was on when the session
failure surfaced.

`apps/web/proxy.ts` masks this for most navigations by refreshing in middleware,
where cookies can be written. It does not mask it for prefetch requests, which
`shouldRefreshForRequest` excludes, nor for anything under `/api`, which the
matcher excludes.

## Root Cause

A single-use credential is consumed in a context that cannot record the result.
The `try/catch` was added to keep Server Component renders working, which it
does, but it treats an unwritable cookie as a cosmetic failure. It is only
cosmetic when refresh tokens are reusable. Once rotation is on, the write is the
half that makes the refresh real, and discarding it converts a successful
refresh into a destroyed session.

## Impact

Reachable in production. The user is signed out with no action of their own —
often triggered by a link prefetch, so there is not even a click to associate it
with. Because the render that caused it succeeded, nothing anywhere records a
problem.

Limited by how often a Server Component render sees a missing access cookie
without the middleware having refreshed first, which is why it is MEDIUM rather
than HIGH. [[BUG-3357]] makes that window occur more often than intended.

## Affected Areas

- `apps/web/lib/server-api.ts` — `persistRefreshedAuthCookies` and both refresh
  call sites
- every Server Component that fetches through `server-api`
- `apps/web/proxy.ts` — `shouldRefreshForRequest` and the `/api` matcher
  exclusion, which decide when the middleware does not cover this
- `apps/admin` should be checked for the same pattern

## Proposed Resolution

No ExecPlan needed.

Do not refresh where the result cannot be persisted. Detect the unwritable
cookie store before refreshing rather than after, and in that case skip the
refresh and let the request fail as an ended session, which [[BUG-3356]] will
turn into a proper sign-in prompt. The middleware and the route handlers, which
can write cookies, keep doing the refreshing.

If refreshing during render is wanted, the alternative is a short reuse window
on the previous refresh token so an unpersisted rotation is survivable; that
change belongs with [[BUG-3359]], which needs the same window for a different
reason.

Either way, `persistRefreshedAuthCookies` must stop swallowing the failure
silently. It should report it.

## Acceptance Criteria

- A Server Component render never consumes a refresh token it cannot persist.
- A failed cookie write is surfaced, not discarded.
- Loading the subscription settings page with an absent access cookie leaves the
  browser holding a working refresh token.

## Regression Coverage

A spec that drives `apiRequest` with a cookie store whose `set` throws and
asserts no refresh was performed, alongside one that asserts the route-handler
path still refreshes and persists. Registered as a regression entry once
written.

## Dependencies

None, though the chosen resolution may be shared with [[BUG-3359]].

## Related Items

[[BUG-3356]] — what the user sees when this has happened. [[BUG-3359]] — the
other way rotation loses a session, and the fix the two may share.
[[BUG-3357]] — why the access cookie goes missing sooner than expected.
[[BUG-3355]] — the report that led here.

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created while tracing how a session could die between a
  successful page render and the next request.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]

<!-- GRAPH:END -->
