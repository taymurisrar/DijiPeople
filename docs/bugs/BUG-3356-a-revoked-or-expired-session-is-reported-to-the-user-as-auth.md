---
ID: BUG-3356
aliases: [BUG-3356]
Title: A revoked or expired session is reported to the user as AUTH_TOKEN_MISSING and is never logged
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: 118d22ed
AffectedModules: [web:auth, api:auth]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-441
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3356 — A revoked or expired session is reported to the user as AUTH_TOKEN_MISSING and is never logged

## Summary

When the web app cannot authenticate a server-side call, it sends the call to
the API **anyway, with no Authorization header**. The API answers `401`
`AUTH_TOKEN_MISSING`, "Access token is required", and that is what the user
sees. The real reason — the session was revoked, the session expired, the
refresh token was rejected — is computed one line earlier and thrown away.

The consequence is worse than a poor message. `AUTH_TOKEN_MISSING` is on the
expected-protocol-outcome allowlist, so these `401`s are deliberately kept out
of the error log as routine. A genuinely broken session therefore produces a
blocking modal for the user and **no server-side record at all**.

## Expected Behavior

When the session is gone, the user is told the session is gone, and the
platform records that it happened. A request that cannot be authenticated
should not be sent unauthenticated in the hope that the API will explain the
problem — the client already knows what the problem is.

## Actual Behavior

`apiRequest` looks for the access cookie. If it is absent and a refresh token
exists, it refreshes. If the refresh fails — `401` revoked, `401` expired, a
`403`, a marked-dead token — `refreshed` is `null`, `accessToken` stays
`undefined`, and execution falls straight through to the fetch. `buildRequestHeaders`
skips the Authorization header because there is no token, and the API is asked
an anonymous question it answers correctly.

The same happens on the retry path: a `401` from the API, a failed refresh, and
the original `401` is returned to the caller.

## Reproduction

1. Sign in to a tenant workspace, then revoke the session server-side — a second
   sign-in as the same user is enough, see [[BUG-3355]].
2. In the still-open browser, open a screen that loads data through a Next route
   handler, for example Settings then Subscription then Plans.
3. The error modal reads `ERROR AUTH_TOKEN_MISSING` / "Access token is required"
   with a `web_`-prefixed reference id.
4. Query `ErrorLog` for that reference id. There is no row.

## Evidence

The reported failure carried reference id
`web_3a6adaf7-dc57-49fb-84f4-33cf363dbbb7` at `2026-09-11T21:24:24.431Z`.
Searched in production at `85c31d9d`:

```
ErrorLog WHERE traceId = 'web_3a6adaf7-...'              -> 0 rows
ErrorLog WHERE createdAt > 2026-09-11T20:30:00Z          -> 0 rows
ErrorLog AUTH_TOKEN_MISSING in the last 24h              -> 2 rows, newest 17:07:41Z
```

The user's session had in fact been revoked at `18:08:33.648Z` by a second
sign-in. Nothing in the message, the modal or the log says so.

Code:

- `apps/web/lib/server-api.ts:110-123` — the pre-emptive refresh; when it
  returns `null` the function continues with `accessToken` still `undefined`.
- `apps/web/lib/server-api.ts:191-201` — `buildRequestHeaders` sets
  Authorization only `if (includeAuth && accessToken ...)`, so the request goes
  out anonymous.
- `apps/web/lib/server-api.ts:143-160` — the same fall-through on the retry
  path.
- `services/api/src/common/errors/error-catalog.ts:65` — `AUTH_TOKEN_MISSING`,
  "Access token is required."
- `services/api/src/modules/error-logs/expected-protocol-outcome.ts:45` —
  `AUTH_TOKEN_MISSING` is classified as a routine protocol outcome and kept out
  of the triage queue, which is correct for an anonymous caller probing a
  guarded route and wrong for this.

The reference-id prefix is the tell: `web_` ids are minted by
`apps/web/lib/server-api.ts:764`, so a `web_`-prefixed `AUTH_TOKEN_MISSING` is
always the app failing to authenticate its own call, never an outside caller.

## Root Cause

The refresh result is treated as an optimisation rather than as a decision. The
code asks "did I get a token?" and, on `no`, proceeds as if authentication were
optional for that path. Nothing distinguishes "this endpoint does not need auth"
from "I could not authenticate and gave up", so the API is left to produce an
error message for a condition the client had already diagnosed.

The observability half follows from the first: because the client downgrades
every session failure into the one code the platform has agreed to ignore, the
failure is invisible to monitoring by construction.

## Impact

Reachable in production and observed there. Two costs:

- **Users** are shown a message that misdescribes the problem. "Access token is
  required" reads as a bug in the application, not as "your session ended", so
  the natural response is to report a fault rather than to sign in again. The
  report that produced this record is exactly that.
- **Operations** cannot see it. Session failures do not appear in the monitoring
  queue, so nobody can tell how often users are being signed out, or notice a
  regression that starts signing everybody out.

## Affected Areas

- `apps/web/lib/server-api.ts` — both refresh paths
- every authenticated screen and route handler in `apps/web`
- `apps/admin` has an equivalent server-api layer and should be checked for the
  same fall-through
- `services/api/src/modules/error-logs/expected-protocol-outcome.ts`

## Proposed Resolution

No ExecPlan needed; the change is local to the web auth layer.

Stop sending a request that is known to be unauthenticatable. When
`includeAuth` is set, no access token could be obtained, and the path is not a
public one, raise an `ApiRequestError` carrying the reason the refresh actually
failed — revoked, expired, or unavailable — and let the existing error modal
and `classify-dashboard-error` present it as a session-ended state with a
sign-in action.

Preserve the refresh failure's status and error code rather than discarding it;
`performRefresh` already distinguishes `401`/`403` from transient failures for
its dead-token map, so the information exists.

Keep `AUTH_TOKEN_MISSING` on the expected-outcome allowlist for genuinely
anonymous callers, and record the new session-ended outcome instead, so the
monitoring queue gains the signal without regaining the noise that
[[BUG-2465]] removed.

## Acceptance Criteria

- A server-side call that cannot be authenticated never reaches the API without
  an Authorization header.
- The user-facing message for a revoked session names a session that ended, and
  the primary action is to sign in.
- A revoked-session failure produces exactly one durable record that an
  operator can find, and an anonymous probe of a guarded route still produces
  none.
- The `web_` reference id remains present and still matches the server-side
  record.

## Regression Coverage

`apps/web/lib/server-api.spec.ts` drives `apiRequest` with no access cookie and
a mocked refresh that returns `401 SESSION_REVOKED`, and asserts no fetch is
made to the originally requested path and that the returned response carries
the revoked reason and its `traceId`, plus the no-refresh-token and
`includeAuth: false` cases. Registered as REG-441 with QA scenario
[[QA-AUTH-012]].

## Dependencies

None. [[BUG-3355]] depends on this one, not the other way round.

## Related Items

[[BUG-3355]] — the revocation this misreports. [[BUG-2465]] — why
`AUTH_TOKEN_MISSING` was put on the expected-outcome allowlist in the first
place; the fix must not undo it. [[BUG-2459]] — the other half of the
after-session-ends traffic. [[BUG-2547]] — a revoked session still answering on
`/auth/me`.

## Resolution

Fixed 2026-09-12, in `apps/web/lib/server-api.ts`. `apiRequest` now computes
whether the request requires auth and cannot proceed (`authRequired &&
!accessToken`, after attempting a refresh where one is possible) *before*
calling `fetch`, and returns a synthetic `Response` built from the refresh
failure's own status/code/message/description/traceId — the same values the
API's own `/auth/refresh` handler already returned and logged — instead of
sending the doomed request. `performRefresh` was rewritten to return a
`RefreshOutcome` (`{ tokens } | { failure }`) carrying that information
instead of collapsing every failure into `null`.

`AUTH_TOKEN_MISSING` stays on `expected-protocol-outcome.ts`'s allowlist,
untouched — genuinely anonymous callers (`includeAuth: false`) are unaffected
and still send unauthenticated exactly as before. The `web_`-prefixed
reference id is preserved: `performRefresh` now sends the same id as both
`X-Request-Id` and `X-Trace-Id` on the `/auth/refresh` call, so the API's own
`RequestIdMiddleware` records that id as the failure's `traceId`, and the
synthetic response echoes it back — the durable record an operator finds by
that id is the refresh call's own `ErrorLog` row, not a second, unrelated one
for a call that (with this fix) no longer happens.

This unblocks [[BUG-3355]]'s third acceptance criterion and [[BUG-3358]],
both fixed in the same session.

## QA Retest

Pending — automated regression coverage exists (REG-441, [[QA-AUTH-012]]) but
this has not yet had a live QA pass against a deployed environment.

## History

- 2026-09-11 — created while diagnosing an unexplained sign-out; the misleading
  code is what made the diagnosis need a database read.
- 2026-09-12 — fixed on `agent/r-s3-auth`: `apiRequest` no longer sends a
  request it knows cannot be authenticated, and preserves the real refresh
  failure reason instead of discarding it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-441 (see the regression register)

<!-- GRAPH:END -->
