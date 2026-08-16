---
ID: BUG-0042
aliases: [BUG-0042]
Title: apps/web reads 21 environment variables unregistered in turbo globalEnv
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web, packages/config]
OwnerAgent: release-devops
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0042 — apps/web reads 21 environment variables unregistered in turbo globalEnv

## Summary

Root `AGENTS.md` requires every new environment variable to be registered in
`turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md`.
`apps/web` reads **21 variables absent from `turbo.json`**, including the entire
cookie-naming family and three `NEXT_PUBLIC_*` values that are **inlined into
the bundle at build time**.

## Expected Behavior

Turborepo invalidates the `build` cache when a variable that affects the build
changes. That only happens for variables listed in `globalEnv`.

## Actual Behavior

Changing any of the 21 and rebuilding can return a **stale cached bundle with
the old value compiled in**. `docs/deployment/environments.md:98` states this
consequence explicitly; the code does not comply with it.

## Evidence

Unregistered, with read sites — verified against `turbo.json` `globalEnv`:

| Variable | Read at |
|---|---|
| `NEXT_STANDALONE` | `next.config.ts:8` |
| `API_INTERNAL_URL` | `proxy.ts:573` |
| `AUTH_WEB_COOKIE_PREFIX` | `lib/auth-config.ts:2` |
| `AUTH_WEB_COOKIE_ACCESS_NAME` | `lib/auth-config.ts:4` |
| `AUTH_WEB_COOKIE_REFRESH_NAME` | `lib/auth-config.ts:9` |
| `AUTH_WEB_COOKIE_SESSION_NAME` | `lib/auth-config.ts:14` |
| `AUTH_WEB_COOKIE_TENANT_SLUG_NAME` | `lib/auth-config.ts:16` |
| `AUTH_COOKIE_SAME_SITE` / `_SECURE` / `_HTTP_ONLY` / `_PATH` | `lib/auth-cookies.ts:33,36,39,45` |
| `WEB_COOKIE_DOMAIN` | `lib/auth-cookies.ts:28` |
| `JWT_ACCESS_TOKEN_TTL` / `JWT_REFRESH_TOKEN_TTL` | `lib/auth-cookies.ts:6,14` |
| `NEXT_PUBLIC_APP_BASE_URL` / `APP_BASE_URL` | `lib/tenant-resolution.ts:175,176` |
| `NEXT_PUBLIC_SESSION_WARNING_SECONDS` | `authenticated-shell-provider.tsx:77` |
| `NEXT_PUBLIC_SESSION_ACTIVITY_THROTTLE_SECONDS` | `authenticated-shell-provider.tsx:82` |
| `NEXT_PUBLIC_ENABLE_SESSION_WARNING_MODAL` | `authenticated-shell-provider.tsx:86` |
| `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME` | `lib/runtime/runtime-feature-flags.ts:3` |
| `WEB_PORT` | `scripts/next-with-port.mjs`, via `package.json:6,10` |

Note `turbo.json` registers `JWT_ACCESS_TTL` and `COOKIE_SAME_SITE`/`COOKIE_SECURE`
— **near-miss names the code does not read**, which is how this stayed invisible.

The inverse also holds: `SESSION_IDLE_TIMEOUT_SECONDS`,
`SESSION_ABSOLUTE_TIMEOUT_SECONDS`, `SESSION_REFRESH_THRESHOLD_SECONDS` and
`EXPOSE_DEV_AUTH_LINKS` **are** registered and are read nowhere in `apps/web`.

## Root Cause

Established: registration is a prose rule with no mechanical check, unlike the
loopback-URL, client-IP and native-prompt rules, which all have a
`scripts/check-*.mjs` and a required CI job.

## Impact

The `NEXT_PUBLIC_*` trio is the sharp end — those are compiled into the client
bundle, so a stale cache ships the old flag value to users with no signal.
`NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME` toggles a whole runtime path.

The cookie family is a slower failure: changing a cookie name or `secure` flag
and getting a cached build means the deployed app reads the old names, which
presents as "everyone is logged out" with no obvious cause.

Severity depends on whether Turborepo **remote** caching is enabled — local-only
caching limits the blast radius to one machine. `turbo.json` declares no
`remoteCache` block, but that can be configured outside the repository, so this
is not settled.

## Proposed Resolution

Register all 21 in `turbo.json` `globalEnv` and add the missing ones to
`docs/environment-variables.md`. `render.yaml` is genuinely not applicable —
`apps/web` is not deployed by Render.

The durable half: a check that every `process.env.X` read under `apps/*` and
`packages/*` appears in `globalEnv`, in the style of the four existing scripts.
That would also catch the four registered-but-unread variables.

## Acceptance Criteria

- Every variable `apps/web` reads is in `turbo.json` `globalEnv`.
- A check fails when a new unregistered read is added.

## Regression Coverage

**None.** The check above is the regression.

## Related Items

[[web-architecture]] · [[deployment-architecture]] · [[ITEM-0006]] ·
bug pattern [[silent-config-fallback]].

## Resolution

Not resolved.

## QA Retest

Not applicable — not yet fixed. Verified by grepping every `process.env` read in
`apps/web` and diffing against `turbo.json` `globalEnv` at `1af3690`. **A stale
cache was not reproduced**; the consequence is quoted from the repository's own
deployment documentation.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW`. Registration is mechanical and
  cheap; the check is the part worth planning, and it can follow.
</content>
