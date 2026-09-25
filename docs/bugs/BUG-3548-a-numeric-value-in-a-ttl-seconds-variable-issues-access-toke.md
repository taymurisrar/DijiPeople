---
ID: BUG-3548
aliases: [BUG-3548]
Title: A numeric value in a TTL_SECONDS variable issues access tokens that expire after one second
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/common/config]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-535
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3548 — A numeric value in a TTL_SECONDS variable issues access tokens that expire after one second

## Summary

`getClientAccessTokenTtl` reads a `*_ACCESS_TOKEN_TTL_SECONDS` environment
variable and passes its raw string value straight into `jwtService.sign({
expiresIn })`. The `jsonwebtoken`/`ms` library that `expiresIn` delegates to
interprets a bare digit string as **milliseconds**, not seconds, despite the
variable's own name. Setting `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800`
(intending 1800 seconds / 30 minutes) issues admin access tokens that expire
almost immediately.

## Expected Behavior

A variable named `*_TTL_SECONDS` should produce a token lifetime measured in
seconds equal to the configured number — `1800` should mean 30 minutes.

## Actual Behavior

`1800` (no unit suffix) is handed to `jwtService.sign` as `expiresIn`, which
is parsed as `1800` milliseconds by the underlying `ms`-based duration parser
jsonwebtoken uses for bare numeric strings — the token is issued with
`exp` effectively equal to `iat` (rounded to the nearest whole second), so it
expires almost as soon as it is minted.

## Reproduction

1. Set `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800` (a bare digit string, no
   `s`/`m`/`h` suffix) in the API's environment.
2. Sign in to `apps/admin` (or call `POST /admin/auth/login` directly).
3. Decode the returned access token's `exp`/`iat` claims.
4. **Live reproduction, 2026-09-25**: with
   `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800`, the admin access token had
   `exp = iat + 1` — a one-second lifetime, not 1800 seconds.

## Evidence

- `services/api/src/common/config/auth.config.ts:156-172`
  (`getClientAccessTokenTtl`):
  ```ts
  export function getClientAccessTokenTtl(
    configService: ConfigService,
    clientId: AuthClientId,
  ) {
    if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
      return getAgentAccessTokenTtl(configService);
    }
    return (
      configService.get<string>(
        `${getClientEnvPrefix(clientId)}_ACCESS_TOKEN_TTL_SECONDS`,
      ) ??
      configService.get<string>(
        `${getPublicClientEnvPrefix(clientId)}_JWT_ACCESS_TTL`,
      ) ??
      getAccessTokenTtl(configService)
    );
  }
  ```
  `getClientEnvPrefix('admin') = 'AUTH_ADMIN'` (`auth.config.ts:470-474`), so
  the key read is exactly `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS` — the value is
  returned **as the raw configured string**, with no unit normalization.
- `services/api/src/modules/auth/auth.service.ts:2377-2379`
  (`buildPlatformAuthResponse`):
  ```ts
  const accessTokenTtl = rememberMe
    ? this.configService.get<string>('JWT_ACCESS_TTL_REMEMBER_ME') || '30m'
    : getClientAccessTokenTtl(this.configService, clientId);
  ```
  then `this.jwtService.sign(accessPayload, { ..., expiresIn: accessTokenTtl
  as StringValue })` — the string is passed straight through to
  `jwtService.sign`, whose `expiresIn` option is documented (via the `ms`
  package jsonwebtoken depends on) to treat a bare number/numeric string as
  **milliseconds**, not seconds.
- Contrast the **tenant** path, `auth.service.ts:2297`:
  `const accessTokenTtl = \`${authPolicy.sessionTimeoutMinutes}m\`;` — always
  explicitly unit-suffixed (`m`), so the tenant path cannot hit this defect;
  only the platform (`admin`) and, potentially, the fallback chain's other
  bare-numeric env vars are exposed.
- `docs/environment-variables.md:167,215` documents the sibling
  `AUTH_ACCESS_TOKEN_TTL_SECONDS`/`AUTH_ADMIN_...` family with `15m`-style,
  explicitly unit-suffixed example values (e.g.
  `AUTH_ACCESS_TOKEN_TTL_SECONDS=15m`) — production's actual configuration
  uses suffixed values, so **production is not affected** by this specific
  input shape. The defect is in what the code accepts and how the variable is
  named, not in what production currently sets.
- `services/api/.env.example:83` and `.env.production.example:44` both show
  `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800` — a **bare digit string, no
  suffix** — as the example value, which is exactly the input shape that
  triggers the defect; an operator following the example file literally would
  reproduce it.

## Root Cause

`getClientAccessTokenTtl` treats its env var's value as an opaque string and
forwards it unchanged to `jwtService.sign({ expiresIn })`. The `expiresIn`
option's underlying parser (`ms`) interprets any bare numeric string as
milliseconds, which contradicts the variable's own name
(`*_TTL_SECONDS`) and its documented, suffixed convention
(`docs/environment-variables.md`). There is no validation or normalization
step converting a bare seconds count into either a suffixed duration string
(`"1800s"`) or a plain millisecond number multiplied by 1000 before it
reaches `jwtService.sign`.

## Impact

Any deployment or local environment that sets one of the `*_ACCESS_TOKEN_TTL_SECONDS`
variables to a bare digit string — which is exactly the shape shown in the
repository's own `.env.example`/`.env.production.example` files — issues
access tokens that expire almost immediately, breaking sign-in for that
client (repeated forced refresh, or an unusable session). Production's actual
configured values are suffixed and unaffected, but the example files that a
new environment setup would copy are not, so this is a live footgun for any
fresh deployment or new developer environment that follows the documented
example literally.

## Affected Areas

- `services/api/src/common/config/auth.config.ts` (`getClientAccessTokenTtl`
  and the sibling refresh/idle/absolute TTL getters, which share the same
  bare-string-passthrough shape)
- `services/api/src/modules/auth/auth.service.ts` (`buildPlatformAuthResponse`,
  and any other caller of `getClientAccessTokenTtl`/`getClientRefreshTokenTtl`)
- `services/api/.env.example`, `services/api/.env.production.example`
  (the misleading bare-digit example values)

## Proposed Resolution

Normalize the TTL value inside `getClientAccessTokenTtl` (and its sibling
getters) rather than relying on every caller/operator to remember to suffix
it: if the configured value is a bare digit string, append `s` (seconds)
before returning it, since the variable name itself commits to seconds. Fix
the misleading example values in `.env.example`/`.env.production.example` to
use an explicitly-suffixed value (e.g. `1800s` or `30m`), matching what
`docs/environment-variables.md` already documents. No ExecPlan needed — this
is a config-parsing fix plus a documentation/example correction, not a schema
or contract change.

## Acceptance Criteria

- Setting `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800` (bare digits) issues a
  token whose `exp` is `iat + 1800`, not `iat + 1`.
- `.env.example` and `.env.production.example` no longer show a bare-digit
  value for any `*_TTL_SECONDS` variable that flows through this code path.
- A unit test pins the normalization for at least one bare-digit and one
  already-suffixed input.

## Regression Coverage

REG-535 (`services/api/src/common/config/auth.config.spec.ts` — "BUG-3548 —
numeric TTLs are seconds everywhere they are consumed"). Proven to fail
against the pre-fix code by mutation: making `normalizeTokenTtl` return the
value unchanged fails 7 of the spec's 12 tests.

## Dependencies

None.

## Related Items

- TASK-0032 — the program that found and will fix this.

## Resolution

Fixed by commit `6e27aa37` on `agent/pah-wp03-mfa` (TASK-0032 WP-03, merged as
`f5b4b9d1`): `normalizeTokenTtl` now appends `s` to a bare-digit TTL before it
reaches `jwtService.sign`, so every numeric `*_TTL_SECONDS` value is
interpreted as seconds everywhere it is consumed (API, web and admin cookie
sizing); `accessTokenExpiresIn`/`refreshTokenExpiresIn` report the normalized
value with its unit suffix.

## QA Retest

Verified by TASK-0032 WP-09 live QA (sign-in sessions on the throwaway stack
remained live for their full configured lifetime) and the passing
`auth.config.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; live reproduction on a
  throwaway stack with `AUTH_ADMIN_ACCESS_TOKEN_TTL_SECONDS=1800`.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).
- 2026-09-25 — fixed at `6e27aa37` (WP-03); verified by WP-09 live QA;
  Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[deployment-architecture]]
- Regression — REG-535 (see the regression register)

<!-- GRAPH:END -->
