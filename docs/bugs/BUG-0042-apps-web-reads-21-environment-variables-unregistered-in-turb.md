---
ID: BUG-0042
aliases: [BUG-0042]
Title: apps/web reads 21 environment variables unregistered in turbo globalEnv
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web, packages/config]
OwnerAgent: release-devops
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-051
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
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

## Reproduction

Compare every `process.env.*` read under `apps/web` with `globalEnv` in
`turbo.json`; the 21 reads listed below have no matching cache input.

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

## Affected Areas

`apps/web`, root `turbo.json`, and the environment-variable documentation
that defines deployment inputs.

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

## Dependencies

None for registering the variables. The mechanical check can follow as a
separate framework hardening step.

## Related Items

[[web-architecture]] · [[deployment-architecture]] · [[ITEM-0006]] ·
bug pattern [[silent-config-fallback]].

## Resolution

Fixed 2026-08-17.

Re-derived the set rather than trusting the record: **20** unregistered reads in
`apps/web` at this SHA, not the 21 originally listed. The scan also showed the
defect was never confined to `apps/web` — `apps/admin` had 16 and `apps/landing`
1, the same build-time inlining risk in the same class of app. Fixing only the
record's stated scope would have left two apps exposed for no reason, so all
**37** are now in `turbo.json` `globalEnv` (105 → 134 entries).

`scripts/check-env-registered.mjs` enforces it across the three Next apps, wired
as `npm run check:env-registered` and run in the required `lint` job beside the
repository's other invariants.

`services/api` reads a further 26 that remain unregistered, deliberately. It
resolves configuration at runtime and inlines nothing, so a missing entry cannot
bake a stale value into an artifact — and registering variables like
`DATABASE_URL`, which differs between every local, CI and deployment context,
would defeat build caching wholesale. That is a rule decision rather than a list,
and it is carried by [[ITEM-0049]].

Audited every `NEXT_PUBLIC_*` entry while here: 35 of them, all URLs, hosts,
names, feature flags and timings. No secret is exposed.
`NEXT_PUBLIC_AUTH_CLIENT_ID` is a public client identifier, which is what it
should be.

## QA Retest

Pass.

```text
check:env-registered   65 variables across 3 apps, all registered
apps/web check-types   PASS
apps/web tests         17 suites, 391 tests, all passing
```

Negative case: removing `NEXT_PUBLIC_APP_BASE_URL` from `globalEnv` fails the
check naming that variable and its read sites; restoring it passes.

The original record noted that a stale cache was never reproduced, and that
remains true. What this closes is the **unenforced rule**, which is what the
record is about; reproducing a Turborepo cache hit across an environment change
would need two deploy contexts and would not change the fix.

## History

- 2026-08-17 — fixed and verified. 37 variables registered across the three Next
  apps and gated by `check:env-registered`; the `services/api` scope question
  split to ITEM-0049.
- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW`. Registration is mechanical and
  cheap; the check is the part worth planning, and it can follow.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0049]]
- Modules — [[tenant-application]], [[deployment-architecture]]
- Regression — REG-051 (see the regression register)

<!-- GRAPH:END -->
