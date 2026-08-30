---
ID: BUG-2458
aliases: [BUG-2458]
Title: Token refresh is throttled by the public login rate limiter, signing users out
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [api:auth, api:common]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-367
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2458 — Token refresh is throttled by the public login rate limiter, signing users out

## Summary

`POST /api/auth/refresh` is guarded by `PublicRateLimitGuard`, which allows
**20 non-GET requests per 10 minutes per (client IP, path)**. That budget was
designed for credential submission — login, password reset, public lead capture
— where 20 attempts in ten minutes is already generous. Token refresh is not a
credential submission. It is a machine-driven call every open tab makes on a
timer, and several people behind one office NAT share a single rate-limit
bucket. When the bucket empties, refresh returns `429`, the client treats the
failed refresh as a dead session, and the user is signed out of a session that
was perfectly valid.

## Expected Behavior

An authenticated client refreshing a live session succeeds. Refresh may be
protected against abuse, but the budget must be sized for automated refresh
traffic from many concurrent clients sharing an egress IP — not for hand-typed
credential attempts.

## Actual Behavior

`POST /api/auth/refresh` shares the 20-per-10-minutes non-GET budget with the
login endpoints. Once exceeded, every refresh from that IP fails with `429`
`RATE_LIMIT_EXCEEDED` until the window rolls, and the affected users are logged
out.

## Reproduction

1. From one client IP, call `POST /api/auth/refresh` 21 times inside ten
   minutes — for example by opening the tenant workspace in a handful of tabs
   and leaving them idle across a refresh cycle, or by two people working from
   the same office network.
2. The 21st call returns `429` with
   `{"errorCode":"RATE_LIMIT_EXCEEDED","message":"Too many requests. Wait a few minutes and try again."}`.
3. The client cannot refresh, so it falls back to the sign-in screen.

## Evidence

Production monitoring queue read at `https://admin.dijipeople.com/settings/monitoring`
on 2026-08-30 (API commit `ec1d58d`), aggregated over all 1,897 incidents:

```
[52 occ / 1 row] 429 | RATE_LIMIT_EXCEEDED | api | POST /api/auth/refresh
                 first 2026-08-30 .. last 2026-08-30T12:40
                 "Too many requests. Wait a few minutes and try again."
                 traceId req_0d4fabb1-a596-4723-9d1a-a9e882eca98c
```

52 throttled refreshes in a single day, on the busiest authenticated endpoint in
the platform.

The guard and its budget:

- `services/api/src/common/guards/public-rate-limit.guard.ts:20-22` —
  `const limit = request.method === 'GET' ? 120 : 20;` over a
  `now + 10 * 60_000` window, keyed by `${resolveClientIp(request)}:${request.path}`.
- `services/api/src/modules/auth/auth.controller.ts:100-101` —
  `@UseGuards(PublicRateLimitGuard)` immediately above `@Post('refresh')`.

The same queue carries the downstream symptom: `POST /api/auth/refresh` is the
single largest source of recorded failures, with 889 occurrences of
`AUTH_UNAUTHORIZED`, 557 of `SESSION_EXPIRED` and 397 of `SESSION_REVOKED`.
Throttling is not the cause of all of those, but a client that cannot refresh
produces exactly this shape.

## Root Cause

`PublicRateLimitGuard` applies one budget to every route it guards, and the
budget is sized for credential attempts. `POST /auth/refresh` was placed behind
it alongside `login`, `forgot-password` and `activate-account` without
distinguishing "a human typing a secret" from "a browser renewing a token it
already holds".

The per-IP key makes this sharply worse than the count suggests: NAT, corporate
proxies and the Next.js route handlers that proxy the tenant app all collapse
many users into one bucket. `resolveClientIp` already fixes the proxy case for
the address itself, but it cannot separate two colleagues on one office line.

## Impact

Authenticated tenant and admin users are signed out mid-session with no
explanation, on a platform whose sessions are supposed to renew silently. It is
reachable in production and observed there. Severity is HIGH because it breaks
an authenticated session for a legitimate user and looks to them like the
product losing their work.

## Affected Areas

- `POST /api/auth/refresh` (all three clients: `web`, `admin`, `agent-desktop`)
- `services/api/src/common/guards/public-rate-limit.guard.ts`
- `services/api/src/modules/auth/auth.controller.ts`

## Proposed Resolution

Give the guard a per-route budget rather than one global pair of numbers, and
set refresh to a limit sized for automated traffic. No ExecPlan needed: the
change is local to the guard and its decorator, and it loosens a limit rather
than a permission.

Keep a limit on refresh — an unbounded refresh endpoint is a real abuse
surface — but size it for what it is.

## Acceptance Criteria

- `POST /api/auth/refresh` no longer shares the credential-submission budget.
- Twenty-one refreshes from one IP inside ten minutes all succeed.
- The credential endpoints (`login`, `admin/auth/login`, `agent/auth/login`,
  `forgot-password`, `activate-account`, `public/subscribe`, `public/leads`)
  keep their existing 20-per-10-minutes budget — verified by test, because
  loosening those would undo [[BUG-0013]], [[BUG-0031]] and [[BUG-0033]].
- Refresh still refuses an implausible flood.

## Regression Coverage

A spec that drives `PublicRateLimitGuard` past 20 non-GET requests on the
refresh path and asserts success, alongside one that asserts the login path
still refuses the 21st. Registered as a regression entry once written.

## Dependencies

None.

## Related Items

[[BUG-2459]] — the other half of the refresh storm: clients that keep polling
after the session ends. [[BUG-2465]] — why these rows sat in the triage queue.
[[BUG-0013]], [[BUG-0031]], [[BUG-0033]], [[BUG-0075]] — the records that put
the rate limiter on the public endpoints in the first place; the fix must not
weaken them. [[BUG-0032]] — the proxy-collapses-every-visitor case that
`resolveClientIp` addresses.

## Resolution

`services/api/src/common/guards/public-rate-limit.guard.ts` now resolves a
per-route budget instead of one global pair of numbers. `POST /auth/refresh`
(and the `/admin` and `/agent` refresh routes, matched by suffix) gets 600 per
ten minutes — one per second sustained from a single address, far above any
plausible fleet of real tabs and far below what would make the endpoint worth
attacking. The endpoint still requires a valid refresh token; the limit is a
backstop, not the control.

The credential budget is untouched at 20 per ten minutes, and
`public-rate-limit.guard.spec.ts` now asserts that for all seven credential
routes by name, so a future route override cannot widen onto one of them
quietly.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-367 (see the regression register)

<!-- GRAPH:END -->
