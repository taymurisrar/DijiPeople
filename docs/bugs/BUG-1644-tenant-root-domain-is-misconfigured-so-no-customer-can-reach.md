---
ID: BUG-1644
aliases: [BUG-1644]
Title: Tenant root domain is misconfigured so no customer can reach their workspace login
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [tenant-domains, tenants]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1644 — Tenant root domain is misconfigured so no customer can reach their workspace login

> **Architect triage, 2026-08-27 — `FIX_NOW`.** A paying customer cannot reach the product they bought, and the first half of the fix is a single environment variable. This supersedes [[BUG-1544]] in scope: same root cause, and that record only saw the landing-side display. Nothing else in the backlog outranks a login nobody can complete.


## Summary

`NEXT_PUBLIC_WEB_ROOT_DOMAIN` is `dijipeople.com` on production. Workspaces are
served from `ws.dijipeople.com`. That one wrong value breaks tenant login in two
places at once: a tenant's own subdomain is no longer recognised as a tenant, and
the company-code step then redirects to a hostname that does not exist.

**There is no working path through the UI to sign in to a workspace.** The
backend is fine — the same credentials authenticate immediately over the API.

## Expected Behavior

Opening `<slug>.ws.dijipeople.com/login` recognises the tenant from the host and
presents an email and password form. Entering a slug on the generic host
redirects to that tenant's real workspace.

## Actual Behavior

- `<slug>.ws.dijipeople.com/login` shows "Find your company" and asks for the
  slug, on the tenant's own subdomain.
- Submitting the slug navigates to `<slug>.dijipeople.com`, which does not
  resolve.
- `app.dijipeople.com/login` behaves identically, so both entry points are dead.

## Reproduction

1. Provision a tenant through the paid public signup and activate its owner.
2. Open `https://<slug>.ws.dijipeople.com/login`.
3. Observe "Find your company" rather than a credential form.
4. Enter the slug and continue.
5. Observe navigation to `https://<slug>.dijipeople.com`, which does not resolve.

## Evidence

Observed on production 2026-08-27 against tenant `dijipeople-demo`
(`91ab031f-8fa2-48b9-b346-7cdf326571ef`), owner `ACTIVE` and activated minutes
earlier.

DNS, checked independently of the browser:

```
dijipeople-demo.dijipeople.com      DOES NOT RESOLVE
dijipeople-demo.ws.dijipeople.com   RESOLVES, GET /login -> 200
```

The backend is unaffected. `POST /api/auth/login` with the same credentials and
`X-DijiPeople-App: web` returns the user, the tenant and a `system-admin` role.
The defect is entirely in how the frontend derives hosts.

## Root Cause

Established. `getTenantRootDomain()` in `apps/web/lib/tenant-resolution.ts:182`
reads `NEXT_PUBLIC_WEB_ROOT_DOMAIN`, falling back to `WEB_APP_PROD_ROOT_DOMAIN`.
Production resolves it to `dijipeople.com`, and the app builds every tenant host
from it. Two consequences follow from the single value.

**Host resolution rejects the tenant.** `tenant-resolution.ts:130-144` strips the
root domain from the host and requires what remains to contain no dot. With the
root domain wrong, `dijipeople-demo.ws.dijipeople.com` leaves `dijipeople-demo.ws`,
which contains a dot, so the hint is discarded and the page falls back to asking
which company. With the correct root domain it would leave `dijipeople-demo`, and
the check would pass.

**Redirects point nowhere.** `buildTenantPortalUrl` in `apps/web/lib/tenant-url.ts`
composes `${slug}.${tenantRootDomain}`, producing `<slug>.dijipeople.com`.
`company-code-login-step.tsx:51` then calls `window.location.assign` on it.

The value is not a typo in a dashboard — **the documentation prescribes it.**
`docs/environment-variables.md:303` and `:326` both state
`NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com`. Anyone configuring the deployment
from the documented reference reproduces this exactly.

## Impact

Critical, and it sits on the revenue path immediately after the one this
session already fixed.

A customer completes a paid signup, receives the activation email, sets a
password — and then cannot sign in. Both documented entry points fail: their own
workspace URL asks which company they are, and answering sends them to a
hostname that does not exist. Nothing tells them anything is wrong; the browser
simply fails to reach a server.

Every existing and future tenant is affected. It is not data loss and nothing is
corrupted — the workspace is live and serving on the correct host the whole time,
and the API authenticates normally. It is purely that no one can get to it.

The activation link is unaffected, because the API generates it server-side with
the correct host. That is why owner activation works and login does not, and why
this went unseen: every previous entry into a workspace during QA was made over
the API, never through the login screen.

## Affected Areas

- `NEXT_PUBLIC_WEB_ROOT_DOMAIN` on the **Vercel** project for `apps/web` —
  not Render, which serves only `dijipeople-api`
- `docs/environment-variables.md:303,326` — prescribes the wrong value
- `apps/web/lib/tenant-resolution.ts` — `getTenantRootDomain`, host hint parsing
- `apps/web/lib/tenant-url.ts` — `buildTenantPortalUrl`, `buildTenantLoginUrl`,
  `buildTenantActivationUrl`
- `apps/web/app/(public)/login/company-code-login-step.tsx`
- `apps/landing` reads the same variable; see [[BUG-1544]]

## Proposed Resolution

**Set `NEXT_PUBLIC_WEB_ROOT_DOMAIN=ws.dijipeople.com` on the Vercel project for
`apps/web`, then redeploy**, and correct both lines in
`docs/environment-variables.md`. That alone fixes both symptoms, because the dot
check passes once the root domain is right.

Two details that cost time on 2026-08-27 and belong here rather than in
somebody's memory:

- **It is not a Render variable.** `render.yaml` declares exactly one service,
  `dijipeople-api`. `app.dijipeople.com` answers with `Server: Vercel`. The
  owner set the correct value on Render first, where the API — which never reads
  it — happily ignored it. Nothing in the documentation says which platform
  serves which app, and this record is the second time that gap has bitten.
- **A restart is not enough.** `NEXT_PUBLIC_*` is inlined into the client bundle
  at build time, so the value only takes effect on a rebuild. A running
  deployment will keep serving the old string however the dashboard reads.

Then harden, because a configuration value that silently produces an unreachable
product is the actual defect:

- The login page should not offer a company-code step when it is already on a
  tenant subdomain that the API can resolve. Ask the API rather than inferring
  from string arithmetic.
- `buildTenantPortalUrl` should refuse to emit a host it cannot verify, or the
  deployment should fail its smoke check when the composed host does not resolve.
  `npm run smoke:deployment` is the natural home for that assertion.

[[BUG-1544]] is the same root cause seen from the landing app and should be
closed by the same change.

## Acceptance Criteria

- `<slug>.ws.dijipeople.com/login` presents a credential form directly, with no
  company-code step.
- Entering a slug on `app.dijipeople.com/login` navigates to
  `<slug>.ws.dijipeople.com`.
- A newly provisioned tenant's owner can sign in entirely through the UI,
  without touching the API.
- `docs/environment-variables.md` states the value that production actually
  needs.
- A deployment check fails when the composed tenant host does not resolve.

## Regression Coverage

None yet. Needs a test asserting `buildTenantPortalUrl` composes
`<slug>.ws.dijipeople.com` for the production root domain, and that host-based
resolution accepts a multi-label root domain. Requires a `REG-nnn` entry once
written.

## Dependencies

The configuration change needs access to the `apps/web` deployment settings.
Not fixable from the repository alone.

## Related Items

Same root cause as [[BUG-1544]], which recorded the landing-side symptom on
2026-08-26 and was dispositioned `FIX_NOW`. Found immediately after
[[BUG-1595]] was fixed, because that fix is what first made a workspace
reachable enough to try logging in to.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest by signing in through the browser only — the API path
authenticates regardless and would hide the defect, which is exactly how it
survived until now.

## History

- 2026-08-27 — found while entering a freshly provisioned tenant for the first
  time through the login screen rather than the API.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[workspace-routing-and-domains]], [[tenant-control-plane]]

<!-- GRAPH:END -->
