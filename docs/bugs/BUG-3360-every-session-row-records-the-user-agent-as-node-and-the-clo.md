---
ID: BUG-3360
aliases: [BUG-3360]
Title: Every session row records the user agent as node and the Cloudflare edge IP
Status: FIXED
Severity: LOW
Priority: P3
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: 118d22ed
AffectedModules: [api:auth, web:auth]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-445
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3360 — Every session row records the user agent as node and the Cloudflare edge IP

## Summary

`RefreshToken` carries `userAgent` and `ipAddress` columns so a session can be
attributed to a device. Neither holds anything useful in production. The user
agent is `node` on every row, because the browser's `User-Agent` is never
forwarded across the web app's proxy hop, and the address is a Cloudflare edge
address, because the row is written from the raw request rather than from the
forwarded-aware resolver the audit log uses two functions away.

The columns look populated, which is worse than empty: anything built on them —
an active-sessions screen, a "new device" notification, session-based anomaly
detection — will be confidently wrong.

## Expected Behavior

A session row identifies the device and network the session belongs to, or
records honestly that it could not. The value is resolved the same way the audit
log resolves it, through the shared trust boundary rather than from a raw
header.

## Actual Behavior

Every tenant sign-in and refresh reaches the API from a Next route handler or
from middleware, both of which run on the server. `forwardedClientHeaders`
forwards exactly one header, `X-Forwarded-For`, and nothing else. The browser's
`User-Agent` never crosses the hop, so the API sees the fetch client's.

`persistRefreshToken` then writes `userAgent: req?.headers['user-agent']` and
`ipAddress: req?.ip` directly. `req.ip` is the peer address, which behind
Cloudflare and Render is an edge address, not the visitor's.

`logTenantAuthEvent` in the same file does better for the address: it calls
`getAuthRequestInfo`, which reads `X-Forwarded-For` and falls back to `req.ip`.
So the audit row and the session row for the same sign-in disagree, and only one
of them is right.

## Reproduction

1. Sign in to a tenant workspace from a browser.
2. Read the `RefreshToken` row just created and the `AuditLog` row for
   `AUTH_LOGIN_SUCCEEDED` from the same second.
3. The session row's `ipAddress` is a Cloudflare address; the audit row's is the
   visitor's. Both `userAgent` values are `node`, not the browser's.

## Evidence

Production, tenant `91ab031f-8fa2-48b9-b346-7cdf326571ef`, API commit
`85c31d9d`, read 2026-09-11T21:41Z. Four `RefreshToken` rows written over six
hours by one person using one browser:

```
created 17:07:53.385  ip=172.71.194.232  ua=node
created 17:07:54.044  ip=104.22.104.148  ua=node
created 17:23:52.448  ip=172.71.195.74   ua=node
created 18:08:33.660  ip=104.22.105.5    ua=node
```

Four different addresses, all Cloudflare, none the visitor's. The `AuditLog`
rows for the same sign-ins all read `37.211.171.xxx`, the visitor's own address.

- `services/api/src/modules/auth/auth.service.ts:1699-1717` —
  `persistRefreshToken` writes `req?.headers['user-agent']` and `req?.ip`.
- `services/api/src/modules/auth/auth.service.ts:2492-2511` —
  `getAuthRequestInfo`, which the audit path uses and this one does not.
- `packages/config/client-ip.js:124-133` — `buildForwardedClientHeaders`
  forwards `X-Forwarded-For` and nothing else.
- `apps/web/lib/forwarded-headers.ts` — the wrapper, and its comment explaining
  that the hop exists precisely because the API would otherwise see the app's
  egress address.

## Root Cause

The forwarding helper was built for one purpose — keeping per-IP rate limiting
honest, after [[BUG-0032]] — and forwards exactly what that needed. Session
attribution was written later against the raw request, and nobody checked what
the raw request contains once there is a proxy hop in front of it. The audit
path was fixed for the address and the session path was not, because they are
different functions that happen to sit in the same file.

## Impact

No user-visible failure today, which is why this is LOW. It is a trap for
anything built next: an active-sessions list would show four identical `node`
entries from four Cloudflare addresses for one person on one laptop, and a
"sign-in from a new device" feature would either never fire or fire constantly.

It also cost time during the investigation behind [[BUG-3355]], where the
question of which session belonged to a browser and which to an automated client
could not be answered from the session rows at all.

## Affected Areas

- `services/api/src/modules/auth/auth.service.ts` — `persistRefreshToken`
- `PlatformRefreshToken` and `AgentRefreshToken` should be checked for the same
  pattern
- `apps/web/lib/forwarded-headers.ts` and `packages/config/client-ip.js`
- any future active-sessions or device-trust surface

## Proposed Resolution

No ExecPlan needed.

Forward the visitor's `User-Agent` alongside `X-Forwarded-For` in
`buildForwardedClientHeaders`, treating it as untrusted display data with a
length bound — it is already truncated to 500 characters at the write.

Have `persistRefreshToken` resolve both values through the same helper the audit
path uses, so the two rows for one sign-in cannot disagree. That helper's own
trust question is tracked separately in [[BUG-3235]]; this record is about the
session path not using it at all.

Where the device genuinely cannot be determined, write `null` rather than the
server's own identity.

## Acceptance Criteria

- A browser sign-in produces a `RefreshToken` row whose user agent is the
  browser's and whose address matches the audit row for the same sign-in.
- A request with no forwardable client information records `null`, not `node`.
- The invariant spec beside `forwarded-headers.ts` covers the added header.

## Regression Coverage

`packages/config/client-ip.test.js` asserts `buildForwardedClientHeaders`
relays a real `User-Agent` alongside the forwarded address, forwards nothing
for an absent/blank header, and truncates a forwarded value to 500 characters.
`apps/web/lib/forwarded-headers.invariant.spec.ts` asserts the same through
the web app's own `forwardedClientHeaders` wrapper, which is what every
proxied route handler actually calls. Registered as REG-445 with QA scenario
[[QA-AUTH-016]].

## Dependencies

None. Related to [[BUG-3235]] but independent of it.

## Related Items

[[BUG-3235]] — the trust check on the address the audit path already reads.
[[BUG-0032]] — why the forwarding hop exists at all. [[BUG-3355]] — the
investigation that surfaced this.

## Resolution

Fixed 2026-09-12. `packages/config/client-ip.js`'s `buildForwardedClientHeaders`
now forwards the visitor's `User-Agent` alongside `X-Forwarded-For`, bounded
to 500 characters — the same bound already applied where the value is
written. `AuthService.persistRefreshToken` and `persistPlatformRefreshToken`
(`services/api/src/modules/auth/auth.service.ts`) now resolve both
`userAgent` and `ipAddress` through `getAuthRequestInfo`, the same helper
`logTenantAuthEvent` already used for the audit row, instead of reading
`req.headers['user-agent']` / `req.ip` directly. The two rows for one sign-in
can no longer disagree.

`AgentRefreshToken` was checked and left alone: it has neither an `ipAddress`
nor a `userAgent` column (adding them would be a schema change, avoided per
this session's constraints), and the desktop agent reaches the API directly
with no proxy hop in front of it, so the defect this bug describes does not
apply there — it already has its own, richer device-identity mechanism
(`EmployeeDevice`/`deviceId`).

`BUG-3235`'s separate question — whether `getAuthRequestInfo`'s own address
resolution can itself be trusted — is unaffected either way; this fix routes
the session path through that helper, it does not change what the helper
does.

## QA Retest

Pending — automated regression coverage exists (REG-445, [[QA-AUTH-016]]) but
this has not yet had a live QA pass confirming a real browser sign-in against
a deployed environment now records its own user agent and address.

## History

- 2026-09-11 — created while trying to tell two sessions apart from their
  `RefreshToken` rows and finding that nothing in them distinguishes a browser
  from an automated client.
- 2026-09-12 — fixed on `agent/r-s3-auth`: the visitor's User-Agent is
  forwarded across the proxy hop, and session attribution resolves through
  the same helper the audit log already used.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-445 (see the regression register)

<!-- GRAPH:END -->
