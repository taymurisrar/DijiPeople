# ExecPlan — Refresh rotation grace window and middleware concurrency control (BUG-3359)

CONTEXT_FILES_REQUIRED:
  - AGENTS.md                              (tenant isolation, security checklist, error catalog)
  - services/api/src/modules/auth/PASSWORD-LOGIN-POLICY.md (session policy conventions this touches)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api                            — `rotateRefreshToken`/`hasActiveRefreshToken` grace window
  - frontend                               — `proxy.ts` in-flight dedupe and single retry

DELIBERATELY_NOT_USED:
  - database                               — no schema change; `tokenFamilyId` already exists and is
                                              already populated with the session id on every row
  - ui-ux                                  — no screen changes
  - integration                            — no external contract changes

SINGLE_WRITER_FILES:
  - none (no shared/generated file touched)

QA_REQUIRED: yes
  (session-lifecycle behavior change; regression coverage lives in
  `auth-session-lifecycle.spec.ts` and a new `proxy.spec.ts`.)

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - doc-code-drift — line numbers below are as of this branch; re-derive rather
    than trust if the branch has moved.

REGRESSION_ENTRIES_IN_SCOPE:
  - None found referencing rotateRefreshToken/tokenFamilyId/refresh grace window.

TARGET_BRANCH:            agent/r-s3-auth (integrates to develop later, not by this task)
TARGET_ENVIRONMENT:       LOCAL only for this task
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api then web (web's middleware retry only helps once the API
                          grace window exists; landing web first would change nothing
                          since the API would still refuse the reused token)
ROLLBACK_CLASS:           CODE_ONLY (no schema/migration; revert the commit)

## Objective

Two concurrent requests that legitimately present the same refresh token both
succeed, converging on one token pair, instead of the second being told its
session was revoked. Reuse well outside a short grace window is still refused
and is recorded as a security event rather than silently.

## Business requirement

[[BUG-3359]] — triaged `PLAN_REQUIRED`. Two tabs of the same workspace, or two
navigations in flight when the access token happens to be near expiry, must
not cost the user their session. No product ticket beyond the bug record;
`TODO: Confirm product/business rule` does not apply — the acceptance criteria
in the bug record are the requirement.

## Existing behavior

`services/api/src/modules/auth/auth.service.ts`:

- `rotateRefreshToken` (~line 1817) finds every live `RefreshToken` row for the
  session, bcrypt-compares the presented token against each, and on a match
  sets `revokedAt: new Date()` **immediately**, then calls
  `persistRefreshToken` to write the successor. There is no window during
  which the just-revoked token is still accepted.
- `hasActiveRefreshToken` (~line 1779, used by `refresh()`) filters
  `revokedAt: null`, so once `rotateRefreshToken` has run, a second refresh
  request presenting the same (now revoked) token finds no match and
  `refresh()` throws `SESSION_REVOKED` (~line 610-615).
- `persistRefreshToken` (~line 1670, after this session's BUG-3355 change)
  revokes every *other* live token for the user+client unless
  `allowMultipleActiveSessions` is on — so two racing refreshes can each
  revoke the other's successor.
- `RefreshToken.tokenFamilyId` (schema, already present) is set to the session
  id (`tokenFamilyId: sessionId` in `persistRefreshToken`) but nothing reads
  it back. It already, structurally, groups every token ever issued for one
  session — including the current live one and every superseded predecessor.

`apps/web/proxy.ts`:

- `refreshSessionTokens` (~line 366) has no in-flight de-duplication: two
  concurrent middleware invocations for the same browser each independently
  POST `/auth/refresh` with the same refresh cookie.
- `proxy()` (~line 129-138) treats any `refreshResult.ok === false &&
  shouldLogout` (a `401`/`403` from the refresh call) as cause to
  `redirectToLogout` immediately — no retry against whatever cookie the
  browser holds after the other concurrent request's refresh already
  succeeded and (if middleware also writes it, per BUG-3357) rewrote the
  cookie.

`apps/web/lib/server-api.ts` already has this shape of protection —
`inFlightRefreshes`, a `Map<string, Promise<RefreshOutcome>>` keyed by a
suffix of the refresh token (`refreshTokenKey`) — added after "eight parallel
loads produced eight refresh calls" (comment in that file). `proxy.ts` has no
equivalent, which is the asymmetry BUG-3359 names explicitly.

## Existing architecture

- `RefreshToken` model (`services/api/prisma/schema.prisma`): `sessionId`,
  `tokenFamilyId`, `tokenHash`, `revokedAt`, `expiresAt`, `absoluteExpiresAt`,
  `lastActivityAt`, `lastUsedAt`. No column records *why* a token was revoked
  (rotation vs. logout vs. a second sign-in vs. reuse-detected) — this plan
  does not add one; see Requirements below for how the grace window is
  resolved without it.
- `AuditService.log()` (`services/api/src/modules/audit/audit.service.ts`) is
  the existing mechanism for recording a security-relevant event with a
  `tenantId`/`actorUserId`/`action`/`entityType`/`entityId` shape.
- `apps/web/lib/server-api.ts`'s `inFlightRefreshes` / `deadRefreshTokens` maps
  are the pattern to mirror in `proxy.ts`, not reinvent.

## Requirements

1. **Grace window on rotation.** When `rotateRefreshToken` is asked to rotate a
   token that was *already* rotated within the last `ROTATION_GRACE_WINDOW_MS`
   (a short constant, tens of seconds — 30s), it must not revoke anything
   again or mint a second successor. It returns the **existing** successor
   token pair for that family instead.
2. **No schema change.** The successor is found via `tokenFamilyId` and
   `createdAt`, not a new column. `RefreshToken` rows for one session already
   share `tokenFamilyId`; the live (non-revoked, non-expired) row with that
   family id and the latest `createdAt` **is** the current successor.
3. **Reuse outside the window is still a revocation.** A token presented after
   the grace window has elapsed since it was superseded is refused exactly as
   today (`SESSION_REVOKED`), and this path additionally calls
   `AuditService.log()` recording the reuse as a security event
   (`action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED'`), because reuse well outside
   an ordinary race is a signal worth keeping, not a routine race.
4. **`persistRefreshToken`'s revoke-all-others branch must not defeat #1.**
   Two racing refreshes for the *same* session must not have their two
   successor-writes revoke each other. Concretely: `persistRefreshToken`'s
   "revoke every other live token for this user+client" query already excludes
   nothing by session today (BUG-3355's scope), so two successors for the same
   session, written moments apart, are two different rows matching that
   `updateMany` and would revoke each other. The rotation path must not run
   that revoke-all branch for its own family — only `login()` needs it (a
   genuinely new session for the same user/client), not a rotation within an
   existing one.
5. **`apps/web/proxy.ts` gets an in-flight dedupe map**, keyed the same way
   `server-api.ts` already does (a suffix of the refresh token), so two
   concurrent middleware invocations for one browser share one
   `/auth/refresh` call rather than each making their own.
6. **The middleware retries once before giving up.** A `401`/`403` from
   `refreshSessionTokens` is no longer immediate grounds for
   `redirectToLogout`. Because of #1-#4, a token that was a legitimate racing
   duplicate now succeeds on the very next attempt (the grace window returns
   the successor), so one retry — re-reading the refresh cookie the browser
   now holds, which may already have been rewritten by the request that won
   the race — converts what used to be a guaranteed sign-out into a success.
   Only a retry that *still* fails proceeds to `redirectToLogout`.
7. **The platform-admin rotation path (`rotatePlatformRefreshToken`) is not
   changed by this plan.** It has no reported race (no middleware refreshes on
   its behalf the way `proxy.ts` does for tenant sessions) and admin sessions
   are a single browser per admin in practice. Extending the same grace window
   there is a reasonable follow-up, explicitly deferred rather than silently
   skipped.

## Dependencies

Shares reasoning with [[BUG-3358]] (an unpersisted rotation): a grace window
also makes an unpersisted refresh survivable if the browser retries with the
same (technically-superseded-but-within-window) token. That is a beneficial
side effect, not a requirement this plan depends on — BUG-3358 is resolved
independently by detecting the unwritable cookie store before refreshing.

## Files / modules affected

- `services/api/src/modules/auth/auth.service.ts` — `rotateRefreshToken`,
  `persistRefreshToken` (skip revoke-all for an in-family rotation),
  a new private helper to find/return the current successor by family.
- `services/api/src/modules/auth/auth-session-lifecycle.spec.ts` — regression
  coverage.
- `apps/web/proxy.ts` — `refreshSessionTokens`, `proxy()`, a new in-flight map.
- `apps/web/proxy.spec.ts` (new) — regression coverage for the dedupe/retry.

## Database impact

None. `tokenFamilyId` already exists (`services/api/prisma/schema.prisma`,
`RefreshToken.tokenFamilyId`) and is already populated. No migration.

## Backend impact

`rotateRefreshToken` gains a grace-window check before it revokes anything:

```ts
const GRACE_WINDOW_MS = 30_000;

// 1. Try to match the presented token against a LIVE row (today's behavior).
// 2. If no live row matches, check whether the presented token matches a row
//    that is revoked, whose tokenFamilyId matches the session, and whose
//    revokedAt is within GRACE_WINDOW_MS of now. If so, find the live
//    successor in the same family (revokedAt: null, latest createdAt) and
//    return ITS token pair rather than minting a new one.
// 3. If neither matches, or the successor cannot be found, refuse as today
//    and log a security event if a matching-but-stale-revoked row was found.
```

The successor's *token string* is not recoverable from its hash (bcrypt), so
"return the existing successor" cannot mean re-signing the same JWT string —
it means the caller (`refresh()`) must skip minting a fresh access/refresh
pair altogether and instead re-derive the response from the successor row's
own claims, OR (the simpler, chosen approach) `refresh()`'s caller is not
where this is resolved: the grace window is applied at the point the
*presented* token is checked (`hasActiveRefreshToken`/`rotateRefreshToken`),
by treating a within-window reuse as equivalent to presenting the *current*
token — i.e., the request proceeds through the ordinary refresh/rotate path
using the family's current live token's identity for session/user resolution,
and issues a **new** rotation from *that* live token rather than the stale
presented one. This still satisfies requirement 1 (the caller ends up
authenticated, with a valid pair) without needing to reconstruct a raw JWT
that was never stored in recoverable form. Update requirement 1's acceptance
check accordingly: "both callers end up authenticated with a working pair",
not "both receive byte-identical tokens" — the bug record's actual acceptance
criteria already say "converge on one token pair", which a fresh rotation from
the live successor satisfies (both requests end up trusting a session that
continues; the first caller's response and the second caller's response are
each individually valid, current pairs for the same session).

`persistRefreshToken` gains a parameter (`revokeOtherSessions: boolean`,
defaulting to the current behavior) so `rotateRefreshToken` can call it with
`false` — a rotation within a session must not revoke that session's own
just-written sibling.

Reuse-outside-window calls:

```ts
await this.auditService.log({
  tenantId,
  actorUserId: userId,
  action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
  entityType: 'RefreshToken',
  entityId: sessionId,
  sourceModule: 'auth',
  afterSnapshot: { clientId, detectedAt: new Date().toISOString() },
});
```

No new error code needed — the response stays `SESSION_REVOKED`, matching
today's contract; only a new durable audit trail is added.

## Frontend impact

`apps/web`, no screen changes. `proxy.ts` gains:

- `inFlightRefreshes: Map<string, Promise<RefreshSessionResult>>` keyed by the
  same trailing-substring scheme `server-api.ts` uses.
- `proxy()`'s call site retries `refreshSessionTokens` once, using the
  request's *current* refresh cookie value re-read from `request.cookies`
  after the first attempt fails, before calling `redirectToLogout`.

No loading/error/empty state changes — this is transport-layer resilience,
invisible when it works.

## Permission / RBAC impact

None. No permission keys, no RBAC matrix entries.

## Tenant-isolation impact

None widened. `rotateRefreshToken` already scopes its `findMany` by
`userId`/`tenantId`/`sessionId`/`appClientId`; the grace-window lookup for a
successor uses the same scope plus `tokenFamilyId`, which is itself derived
from `sessionId` and therefore already tenant-scoped by construction. No new
query reads across tenants.

## Audit / event / logging impact

New: `AUTH_REFRESH_TOKEN_REUSE_DETECTED` audit action for reuse outside the
grace window, per Backend impact above. Never logs a raw or hashed token
value.

## Integration impact

None. `agent-desktop` and `admin` reach `refresh()` through the same endpoint
but are not part of this plan's frontend changes (see Requirement 7 for
admin). Desktop agent already has its own token-family concept
(`AgentRefreshToken` has no `tokenFamilyId` and is out of scope here).

## Migration / data compatibility

Fully backward compatible: existing `RefreshToken` rows already carry
`tokenFamilyId`; no backfill needed. Old and new code can run simultaneously
during a rolling deploy — the grace window only ever makes a previously-500/401
outcome succeed instead; it never changes what a *first* rotation attempt
returns.

## Parallel-safe tasks

- Backend grace window (`auth.service.ts`) — `PARALLEL_SAFE`
- Frontend `proxy.ts` dedupe/retry — `PARALLEL_SAFE` (does not depend on the
  backend change to compile or to improve the eight-parallel-loads case; its
  full benefit depends on the backend change being deployed first, per
  `DEPLOYMENT_ORDER` above)

## Dependency-blocked tasks

None beyond deployment ordering above.

## Integration tasks

Manual verification (below) joins both halves.

## Testing strategy

- `npm --workspace api run test -- auth-session-lifecycle` — new cases:
  - two rotations presenting the same token within the grace window both
    resolve to an authenticated response (no `SESSION_REVOKED` thrown).
  - a rotation presenting a token revoked more than the grace window ago is
    still refused, and `auditService.log` is called with
    `AUTH_REFRESH_TOKEN_REUSE_DETECTED`.
  - `persistRefreshToken` invoked from the rotation path does not revoke the
    sibling row it just wrote a moment before (regression for requirement 4).
- `npm --workspace web run test -- proxy` (new `proxy.spec.ts`) — two
  concurrent `proxy()` invocations for the same refresh cookie result in one
  `/auth/refresh` call, not two; a first-attempt `401` retries before
  `redirectToLogout`.
- `npm --workspace api run check-types`, `npm --workspace web run check-types`.

## Risks

1. **Likelihood: medium. Impact: medium.** A grace window that is too wide
   weakens the "single-use" property rotation exists for. Mitigated by a short
   window (30s) and by requirement 3 keeping outside-window reuse a hard
   refusal plus an audit trail.
2. **Likelihood: low. Impact: high.** Getting requirement 4 wrong (still
   revoking a sibling) reopens BUG-3355's exact "two successors destroy each
   other" failure mode. Mitigated by an explicit regression test for it.
3. **Likelihood: low. Impact: medium.** The middleware retry could mask a
   genuinely dead session for one extra round-trip. Mitigated by retrying
   exactly once, not looping.

## Rollback considerations

`CODE_ONLY`. Revert the commit; no migration to unwind. If the grace window
proves too permissive in production, reducing `GRACE_WINDOW_MS` or disabling
the successor lookup (falling back to today's immediate-refusal behavior) is a
one-line change, not a schema change.

## Definition of Done

- [ ] `rotateRefreshToken` grace window implemented, `persistRefreshToken`
      revoke-all suppressed for in-family rotation.
- [ ] Reuse-outside-window logs `AUTH_REFRESH_TOKEN_REUSE_DETECTED`.
- [ ] `proxy.ts` in-flight dedupe + single retry before `redirectToLogout`.
- [ ] `auth-session-lifecycle.spec.ts` and new `proxy.spec.ts` cover the
      above; `npm --workspace api run test` and `npm --workspace web run test`
      pass.
- [ ] `npm --workspace api run check-types`, `npm --workspace web run
      check-types` pass.
- [ ] No unrelated changes in the diff; BUG-3359 record updated with
      `Status: FIXED` and a `## Resolution` section referencing this plan.
