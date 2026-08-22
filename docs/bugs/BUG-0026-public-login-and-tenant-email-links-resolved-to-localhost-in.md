---
ID: BUG-0026
aliases: [BUG-0026]
Title: Public Login and tenant email links resolved to localhost in production
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-16
DetectedInSha: 344a832
AffectedModules: [apps/landing, apps/web, apps/admin, services/api, packages/config]
OwnerAgent: integration
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-production-url-integrity-344a832.md
RegressionId: REG-016
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/production-url-integrity
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
---

# BUG-0026 — Public Login and tenant email links resolved to localhost in production

## Summary

Seven separate places in shipped application code resolved another app's URL
themselves and fell back to a hardcoded loopback address when the environment
variable was absent. Nothing required those variables, so a production build
succeeded and Next.js inlined `http://localhost:3001` into the served HTML. The
public "Login" button on `www.dijipeople.com` was the visible symptom; the same
defect class also put loopback URLs into tenant activation, invitation and
sign-in **emails**, and into the workspace URL returned by tenant provisioning.

## Expected Behavior

A cross-app URL is configuration. In production it is either configured
correctly or the deployment fails loudly at build/boot. A loopback address is a
development answer and must never be a production fallback.

## Actual Behavior

Each call site silently substituted a loopback URL, producing links that look
correct in code review, build without warning, and are dead for every customer.

## Reproduction

1. Build `apps/landing` with `VERCEL=1` (or `APP_ENV=production`) and **without**
   `NEXT_PUBLIC_WEB_APP_URL`.
2. Before the fix, the build succeeds.
3. Load any landing page and inspect the header "Login" anchor.
4. `href` is `http://localhost:3001/dashboard`.

The same shape reproduces for tenant emails by booting the API in a
production-like environment without `WEB_APP_URL` and calling
`buildTenantActivationUrl`.

## Evidence

Root cause chain, verified at `344a832`:

- `apps/landing/app/_components/site-shell.tsx:13-16` — resolved
  `NEXT_PUBLIC_WEB_APP_URL`, then `NEXT_PUBLIC_APP_PORTAL_URL`, then the literal
  `"http://localhost:3001/dashboard"`. **`NEXT_PUBLIC_APP_PORTAL_URL` is defined
  nowhere in the repository** — not in `turbo.json` `globalEnv`, not in any
  `.env*.example`, not in `docs/environment-variables.md` — so that middle
  fallback was always `undefined` and the literal was the effective value.
- `packages/config/index.js:187-189` — `validateDeploymentEnv` required only
  `NEXT_PUBLIC_API_BASE_URL` for non-API apps. It never required the app URLs
  each surface links to, so the misconfiguration could not fail the build.
- `packages/config/index.js:105-121` — `getAppOrigin` *does* throw in
  production. Every one of the seven call sites bypassed it.
- Six further sites with the same pattern:
  `apps/landing/lib/env.ts:9`, `apps/admin/lib/env.ts:9`,
  `apps/admin/lib/tenant-url.ts:58`, `apps/web/lib/tenant-resolution.ts:174`,
  `apps/web/proxy.ts:573`,
  `services/api/src/modules/tenant-domains/tenant-domain.service.ts:601`.
- `services/api/src/common/config/tenant-url.config.ts:59` — the fallback used
  to build **customer activation and invitation email links**.
- `apps/web/app/(public)/partner-login/partner-login-form.tsx:14` — a fully
  hardcoded `http://localhost:3000/partners` anchor, not env-driven at all.

Regression proof: the new suite fails 10/13 against `344a832` and passes 13/13
after the fix.

## Root Cause

Two independent gaps that had to both be closed:

1. **Environment validation did not cover the cross-app URLs.** A missing
   variable was not an error, so nothing forced it to be set.
2. **Call sites re-derived origins instead of using `@repo/config`.** Each
   carried its own `|| "http://localhost:…"`, which converted a missing
   variable into a plausible-looking wrong answer rather than a failure.

`isProductionLike()` was examined and found **not** to be the cause. It is
deliberately narrow — `APP_ENV`/`VERCEL`/`RENDER`, not `NODE_ENV` — so that a
local `npm run build` and CI keep working against loopback defaults. It was left
unchanged.

## Impact

Reachable in production and customer-facing:

- Every visitor to the public site who clicked "Login".
- Every newly provisioned tenant owner receiving an activation or invitation
  email, if `WEB_APP_URL` were unset — onboarding blocked with no error anywhere.
- Platform operators deep-linking into a tenant workspace from Admin.

## Affected Areas

`apps/landing` header/footer, `apps/web` proxy + partner login + tenant
resolution, `apps/admin` tenant deep links, `services/api` tenant URL builder
and tenant-domains workspace URLs, `packages/config` deployment validation.

## Proposed Resolution

Close both gaps rather than patching the visible link:

1. `validateDeploymentEnv` requires, per app, the canonical URLs that app emits
   links to — and rejects loopback, malformed and non-HTTP values in production.
2. All call sites resolve through `resolveAppUrls` / `getAppOrigin` /
   `buildAppUrl`.
3. A repository check refuses loopback literals in shipped source, because a
   literal never consults an environment variable and so is invisible to (1).

## Acceptance Criteria

- A production-like build of `landing`, `web`, `admin` or `api` fails when a
  canonical app URL is missing, loopback, malformed or non-HTTP.
- No loopback literal exists in shipped application source outside a documented
  allowlist.
- A local `npm run build` and CI, which set neither `APP_ENV` nor `VERCEL`,
  continue to build against loopback defaults.
- Tenant activation/invitation URLs refuse to build rather than emitting a
  loopback link in production.

## Regression Coverage

`packages/config/app-urls.test.js` — 13 assertions, run in CI as
`npm run test:app-urls`. Fails 10/13 without the fix.
`scripts/check-no-hardcoded-urls.mjs` — run in CI as
`npm run check:no-hardcoded-urls`.
`services/api/src/common/config/tenant-url.config.spec.ts` — asserts the mailer
path refuses a loopback fallback in production.

Registered as REG-016.

## Dependencies

**Deployment action required before the next production deploy of any frontend.**
The stricter validation makes these variables mandatory in production; a
deployment missing one will now fail its build rather than ship a dead link.
See `docs/environment-variables.md`.

## Related Items

[[BUG-0017]] — the tenant base domain setting not driving hostname issuance
touches the same `packages/config` domain resolution.
[[ITEM-0006]] — ADR for one source of truth for the tenant base domain.

## Resolution

Fixed on `agent/production-url-integrity`. `packages/config` gained
`resolveAppUrls`, `buildAppUrl`, `isLoopbackUrl` and `REQUIRED_APP_URLS`;
`validateDeploymentEnv` gained per-app URL requirements with loopback, URL and
scheme validation. All seven call sites now resolve through `@repo/config`.

## QA Retest

`docs/qa/runs/2026-08-16-production-url-integrity-344a832.md`.

Retested at the merged SHA `d1768cb` during the open-bug closure wave.

The linked regression suite runs green: 7 API suites / 85 assertions across
REG-013 – REG-021, `npm run test:app-urls` 16/16, and REG-020's
`commercial-bootstrap.e2e-spec.ts` in the `Database migration gate` against a
real PostgreSQL 16. Each of these tests was proven to fail without its fix when
it was written; re-running them is what confirms the fix still holds.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-16 — created from user report at `344a832`.
- 2026-08-16 — root cause established, fixed, regression coverage added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0017]]
- Modules — [[landing-architecture]], [[tenant-application]], [[platform-admin]], [[api-architecture]], [[deployment-architecture]]
- Regression — REG-016 (see the regression register)

<!-- GRAPH:END -->
