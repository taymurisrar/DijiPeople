---
ID: BUG-1644
aliases: [BUG-1644]
Title: Tenant root domain is misconfigured so no customer can reach their workspace login
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: INFRA
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [tenant-domains, tenants]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-271
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
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

### Re-verified on production 2026-08-28, still broken

Driven through the browser against the real tenant
`qa-e2e-signup-b-20260826`, after the documentation fix in `21dc63fe` shipped.

The API half is now provably correct. `GET /api/public/tenants/resolve` answers
`200` for **both** forms, so nothing server-side is confused about the domain:

```
?slug=qa-e2e-signup-b-20260826                       -> 200  TEN-000001 ACTIVE
?host=qa-e2e-signup-b-20260826.ws.dijipeople.com     -> 200  TEN-000001 ACTIVE
```

The browser half is unchanged. Entering the slug at `app.dijipeople.com/login`
and pressing Continue navigates to:

```
qa-e2e-signup-b-20260826.dijipeople.com     <- no `ws.`, DNS failure
```

**This narrows the fix from "set the variable" to "correct the value that is
already set."** `buildTenantPortalUrl` runs in the browser, so only a
`NEXT_PUBLIC_*` name is inlined into the bundle — `WEB_APP_PROD_ROOT_DOMAIN` is
invisible there. Had `NEXT_PUBLIC_WEB_ROOT_DOMAIN` been *absent*,
`supportsTenantSubdomains()` would have returned false and the fallback would
have kept the user on `app.dijipeople.com/login`. A `<slug>.dijipeople.com`
target can therefore only be produced by the variable being present and holding
`dijipeople.com`.

So the Vercel project for `apps/web` has the variable set to the value the
documentation used to prescribe. Editing it is not enough on its own:
`NEXT_PUBLIC_*` is inlined at **build** time, so the project must be redeployed
before the running bundle changes.

One earlier reading here was wrong and is corrected rather than removed. A
branded login page served from a *non-existent* subdomain was briefly taken as
proof that host resolution worked. It was not: that host resolves to no tenant
at all, and the emerald palette it rendered is the platform default, not tenant
branding. The tenant's own colours are teal (`#0f766e`). A page looking
tenant-specific is not evidence that a tenant was resolved.


### Resolved on production 2026-08-28 by the `e0aeabcd` deploy

Re-tested through the browser immediately after the release deployed. Entering
the slug at `app.dijipeople.com/login` now navigates to
`https://qa-e2e-signup-b-20260826.ws.dijipeople.com/login`, which renders
"Welcome to QA E2E Signup B 20260826 HR Portal" with a working sign-in form.

**The Vercel variable was correct the whole time. The running bundle was not.**
The owner set `NEXT_PUBLIC_WEB_ROOT_DOMAIN=ws.dijipeople.com` before this
release; no production build had happened since, so the bundle being served
still carried the previous value inlined. Merging this release rebuilt all three
Vercel projects, and that rebuild — not any change to the setting — is what
fixed it.

**The elimination argument recorded above was wrong, and is left in place rather
than deleted so the reasoning error stays visible.** It ran: the variable cannot
be absent, because an absent variable falls back to `app.dijipeople.com`;
therefore it is present and holds the wrong value. That enumerated two
possibilities when there were three. The third is the one that was true — the
variable is present and correct in the project settings, while the *deployed
bundle* was built before it was set and had the old value baked in.

The mistake is precisely the property the same paragraph names: `NEXT_PUBLIC_*`
is inlined at build time. Once that is true, the bundle's value is evidence
about the last build, never about the current setting. Reading a running bundle
as though it reports current configuration is the error, and no amount of
care about the *observation* would have caught it — the observation was correct
and the inference drawn from it was not.

The practical rule: a `NEXT_PUBLIC_*` symptom has two candidate causes — wrong
value, or right value and stale build — and they are indistinguishable from the
browser. Separate them by looking at whether a build has occurred since the
setting changed, before telling anyone to change a setting.


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
  it — happily ignored it.

  *Correction, later the same day:* this bullet first claimed nothing documents
  which platform serves which app. That was wrong.
  `docs/environment-variables.md` has said "Web: Vercel", "Admin: Vercel",
  "Landing: Vercel" and "API: Render" throughout. What the document had wrong
  was the *value*, not the platform — and this record's own first draft implied
  a single deployment, which is likelier what sent the variable to the wrong
  console.
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

Fixed 2026-08-28 by the `e0aeabcd` production deploy, which rebuilt all three
Vercel projects. `NEXT_PUBLIC_WEB_ROOT_DOMAIN` had already been corrected to
`ws.dijipeople.com` in the project settings; because the value is inlined at
build time, the running bundle kept serving the old one until a build happened.
No setting was changed to fix this.

`docs/environment-variables.md` was corrected in `21dc63fe`, so the reference
that produced the wrong value no longer prescribes it.

Guarded by REG-271 and QA-AUTH-006 —
`apps/web/lib/tenant-root-domain.spec.ts` asserts both directions, and is
mutation-tested: collapsing a multi-label root to its apex fails 2 of 6.

The fifth acceptance criterion — a deployment check that fails when the composed
tenant host does not resolve — is **not** met. It is the one guard that would
have caught this before a customer did, and it is filed rather than quietly
dropped.

## QA Retest

Retested 2026-08-28 through the browser against the live deployment. Entering
`qa-e2e-signup-b-20260826` at `app.dijipeople.com/login` navigates to
`https://qa-e2e-signup-b-20260826.ws.dijipeople.com/login`, which renders
"Welcome to QA E2E Signup B 20260826 HR Portal" and a working credential form.
The first, second and fourth acceptance criteria are met. The third — an owner
completing sign-in entirely through the UI — was verified as far as the
credential form; the tenant is due to be erased, so a live sign-in was not
repeated. PASS.

Superseded note: retest by browser only. Retest by signing in through the browser only — the API path
authenticates regardless and would hide the defect, which is exactly how it
survived until now.

## History

- 2026-08-27 — found while entering a freshly provisioned tenant for the first
  time through the login screen rather than the API.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0103]]
- Modules — [[workspace-routing-and-domains]], [[tenant-control-plane]]
- Regression — REG-271 (see the regression register)

<!-- GRAPH:END -->
