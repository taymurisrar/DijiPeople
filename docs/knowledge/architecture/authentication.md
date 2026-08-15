# Authentication

> Generated from repository evidence at `ad8f77f`.

Two distinct identity systems, three JWT clients, and a cookie-based session in
each frontend.

## Two identities, deliberately separate

| Identity | Subject | Lives in | Reaches |
|---|---|---|---|
| **Tenant user** | `authSubjectType: 'user'` | a tenant | that tenant's data only |
| **Platform user** | `authSubjectType: 'platform-user'` | the platform | across tenants, on explicitly platform-guarded routes |

A platform admin is **not** a tenant user with extra permissions. Merging them
would make every tenant endpoint a potential cross-tenant endpoint — the
separation is what keeps [[multi-tenancy]] enforceable at the query level.

## Per-client secrets

`JwtAuthGuard` verifies with a **per-client secret** — `web`, `admin`,
`agent-desktop` — and checks the token's `appClientId`/`aud` matches the
requesting client. An admin token replayed as the `web` client is rejected
(QA scenario C3.03, verified 2026-08-15).

The session row is then confirmed live, so a revoked session fails even with a
structurally valid token.

## Frontend session handling

`apps/web/lib/server-api.ts` and the admin equivalent handle cookie auth, the
`X-DijiPeople-App` header, refresh-on-401 and error normalisation. Route
handlers under `app/api/` are **thin proxies** — no business logic, and no
authorization or tenant decisions. The API is the only authority.

## Sign-out is the fragile path

Three defects, all on the same flow, all found in one audit:

- [[BUG-0008-session-expired-sign-in-again-returned-405]] — the session-expired
  modal linked to a route that exported only `POST`. 405, a browser error page
  outside the app, and no route back to `/login`. Reproduced in production.
  `apps/web` already exported both methods and **hid the admin gap**.
- [[BUG-0009-session-revocation-depended-on-the-refresh-cookie]] — revocation
  only attempted while the refresh cookie survived, so a "sign out" could leave
  the platform session live server-side.
- [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500]] — a
  cookie-configuration validator invoked unguarded on the failure path.

The lesson generalises: **sign-out must not depend on configuration being right
or on any particular cookie surviving**, because it is the flow users reach
precisely when something is already wrong.

The last two remain `FIXED` rather than `VERIFIED` — neither is observable
without a running API holding a real session. See [[ITEM-0002]].

Pattern: [[route-method-mismatch]].

## Public endpoints

24 `@Public()` handlers across 10 controllers at the documented baseline,
including **partially** public controllers where most handlers are guarded.
Never assume a controller is uniformly one or the other.

Every public endpoint additionally needs `PublicRateLimitGuard`, strict input
validation, and no tenant enumeration in responses or error messages. One was
missing it: [[BUG-0013-public-lead-endpoint-had-no-rate-limiting]]. The
mechanical check that would stop the next omission is [[ITEM-0013]].

## Related

[[multi-tenancy]] · [[rbac]] · [[api-architecture]] · [[platform-admin]] ·
[[tenant-application]]

Source: root `AGENTS.md`, `.agent/context/auth-rbac.md`,
`docs/architecture/authentication.md`, QA runs 2026-08-14 and 2026-08-15.
