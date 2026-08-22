# Auth

> Written from repository evidence at `389aa49`, plus the live reproduction that
> produced [[BUG-0627]] on 2026-08-22.

Sibling note: [[platform-auth]] covers the **authorization** boundary between the
platform and its tenants. This one covers **authentication** — sessions, tokens,
and the one operation that is easiest to get wrong, ending them.

## The three cookies, and why the shortest-lived one is the trap

Every client — `web`, `admin`, `agent-desktop` — holds three cookies, named per
client by `getAuthCookieNames`:

| Cookie | Carries | Lifetime |
|---|---|---|
| access | the JWT | shortest — minutes |
| refresh | the credential that mints a new access token | medium — days |
| session | the raw `sessionId`, the row's own name | longest, and it outlives both |

The refresh token is the **credential**; the session id is the **identifier**.
Conflating them is the mistake this note exists to record.

## Where a session actually lives

Two tables, split by client:

```
admin              → PlatformRefreshToken   (platformUserId, sessionId, appClientId)
web, agent-desktop → RefreshToken           (tenantId, userId, sessionId, appClientId)
```

Both carry `sessionId` and `appClientId`, and both index the pair. That split is
load-bearing in a way that is easy to misread as a security control — see the
false assertion below.

## Sign-out: revoking by identifier, not by credential

`AuthService.logout` does two independent things, and both matter:

1. clear the response cookies — always;
2. revoke the persisted token — *if it can find it*.

Step 2 originally matched the refresh token against candidate rows with
`bcrypt.compare`. That works only while the refresh cookie is in the jar, and it
is the first of the three to expire. So the ordinary sign-out — the one that
follows a session-expired modal, which is the *whole reason* a sign-out affordance
is on that screen — arrived with no refresh cookie, matched nothing, cleared the
browser and returned success.

The failure mode is the dangerous kind: **a session that appears closed.** The
operator sees the login screen and believes they are out. Nothing logs an error.
The token stays valid for the rest of its life.

The fix reads the session cookie too, and revokes by it when the refresh cookie
is absent:

```ts
const where = { sessionId, appClientId: clientId, revokedAt: null };
```

Three things about that filter, each of which is a decision:

- **`appClientId`** — the session id arrives from a cookie the caller controls,
  and `web` and `agent-desktop` rows share a table. Without it, a tenant sign-out
  closes the attendance agent's session too.
- **`revokedAt: null`** — an already-closed session keeps the timestamp of when
  it was actually closed, rather than being restamped by every later sign-out.
- **`updateMany`, not read-then-write** — the filter is already exact, and a
  token rotated between the read and the write would otherwise survive.

## Two lessons worth more than the fix

**A mock can prove a request was sent. It can never prove anything was revoked.**
[[BUG-0009]] fixed the client half — the admin route now calls the API even when
the refresh cookie is gone — and was closed on a test that mocked `fetch`. The
server half was never checked, and did nothing, for five days behind a green
suite. When a fix crosses a process boundary, it needs evidence on both sides of
it. See the bug pattern [[assertion-without-a-check]].

**A negative assertion can be true for the wrong reason.** The first scope test
for the fix signed out as `web` using an **admin** session id and asserted the
platform token survived. It passes whatever the filter says — the two clients use
different tables, so a `web` logout could never reach a `PlatformRefreshToken`.
It stayed green with `appClientId` deleted from the production code. The claim
`appClientId` actually makes lives *within* one table, and the test now uses
`web` and `agent-desktop` rows to make it. Mutation-test the negative cases too,
or the structure of the schema will quietly answer for the code.

## Where the evidence is

- `services/api/src/modules/auth/auth.service.ts` — `logout`,
  `revokeSessionTokens`, `extractTokenFromRequest`
- `services/api/src/common/config/auth.config.ts` — `getAuthCookieNames`
- `services/api/test/admin-logout-revocation.e2e-spec.ts` — REG-221, six
  DB-backed tests over real HTTP
- `apps/admin/app/api/auth/logout/route.ts` — forwards all three cookies, which
  is what made the fix possible without a contract change

## Related

Modules [[platform-auth]], [[tenant-isolation]] · bugs [[BUG-0009]],
[[BUG-0010]], [[BUG-0627]] · backlog [[ITEM-0002]] · pattern
[[assertion-without-a-check]].
