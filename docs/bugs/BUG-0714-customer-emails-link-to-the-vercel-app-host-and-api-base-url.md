---
ID: BUG-0714
aliases: [BUG-0714]
Title: Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP
Status: FIXED
Severity: HIGH
Priority: P1
Type: INFRA
Source: DEPLOYMENT
DetectedDate: 2026-08-22
DetectedInSha: b486a60
AffectedModules: [services/api, apps/web, docs/deployment]
OwnerAgent: release-devops
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-228
RelatedBacklogItem: ITEM-0057
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt:
---

# BUG-0714 — Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP

## Summary

Two production environment variables on the Render service are wrong, and the
first one is customer-facing right now.

**`WEB_APP_URL = https://diji-people-web.vercel.app`.** Every activation,
invitation, password-reset and sign-in link the API mails to a tenant is built
from this value, so every one of them sends a paying customer to the Vercel
deployment host instead of `app.dijipeople.com` — or to their own workspace
subdomain, which is the address the product actually issues them.

**`API_BASE_URL = http://api.dijipeople.com/api`.** Plain HTTP, while
`API_ORIGIN` alongside it is correctly `https://`. `getApiBaseUrl` prefers
`API_BASE_URL`, so the insecure value is the one that wins.

Found on 2026-08-22 by reading the live Render configuration, after the user
confirmed `dijipeople.com` is live and asked for production to be checked.

## Expected Behavior

A link mailed to a tenant resolves to that tenant's workspace on the customer
domain. The API advertises itself over HTTPS.

## Actual Behavior

```
GET https://dijipeople.onrender.com/api/health
  "apiBaseUrl": "http://api.dijipeople.com/api"
```

and `buildTenantActivationUrl` produces
`https://diji-people-web.vercel.app/activate?...`.

## Reproduction

Read the service's environment, filtered to the URL fields:

```
GET https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g/env-vars
```

| Variable | Value in production | Should be |
|---|---|---|
| `WEB_APP_URL` | `https://diji-people-web.vercel.app` | `https://app.dijipeople.com` |
| `API_BASE_URL` | `http://api.dijipeople.com/api` | `https://api.dijipeople.com/api` |
| `APP_BASE_URL` | *(not set)* | — |
| `WEB_APP_PROD_ROOT_DOMAIN` | *(not set)* | `ws.dijipeople.com` |
| `NEXT_PUBLIC_WEB_ROOT_DOMAIN` | *(not set)* | `ws.dijipeople.com` |

`API_ORIGIN`, `ADMIN_APP_URL`, `LANDING_APP_URL`, `CORS_ALLOWED_ORIGINS` and
`TENANT_BASE_DOMAIN` are all correct — which is what makes the two wrong ones
easy to miss.

## Evidence

- Render service `srv-d7js7fqqqhas739v4i7g` environment, read 2026-08-22:
  `WEB_APP_URL=https://diji-people-web.vercel.app`,
  `API_BASE_URL=http://api.dijipeople.com/api`, and `APP_BASE_URL`,
  `WEB_APP_PROD_ROOT_DOMAIN`, `NEXT_PUBLIC_WEB_ROOT_DOMAIN` all unset.
- `GET https://dijipeople.onrender.com/api/health` reports
  `"apiBaseUrl":"http://api.dijipeople.com/api"`.
- `services/api/src/common/config/tenant-url.config.ts:55-95` — the resolution
  chain and the `tenantRootDomain` condition that never fires.
- `services/api/src/common/config/tenant-url.config.spec.ts:38-48` — a passing
  test asserting `https://diji-people-web.vercel.app/login`.

## Root Cause

`buildTenantLoginUrl` in `services/api/src/common/config/tenant-url.config.ts`
resolves its host through a chain — `APP_BASE_URL`, `NEXT_PUBLIC_APP_BASE_URL`,
`WEB_APP_URL`, … — and only rewrites to a per-tenant subdomain when
**`WEB_APP_PROD_ROOT_DOMAIN`** or **`NEXT_PUBLIC_WEB_ROOT_DOMAIN`** is set:

```ts
const url =
  appEnv === 'production' && !isLocalHost && tenantRootDomain
    ? new URL(`${protocol}//${slug}.${tenantRootDomain}${path}`)
    : new URL(path, appUrl);
```

Neither is set in production. `TENANT_BASE_DOMAIN = ws.dijipeople.com` **is**
set — but that variable is read by the hostname *issuer*, not by this URL
*builder*. So the platform issues a tenant `{slug}.ws.dijipeople.com` and then
mails them a link to `diji-people-web.vercel.app`.

Two variables for one concept is the underlying defect. The configuration is not
wrong by accident; it is wrong because it is possible to set half of it.

## Impact

**Corrected 2026-08-22 after reading production data.** I first wrote that this
was "live, customer-facing, and happening now". It is live and it is
customer-facing, but **no customer has received a wrong link yet**: production
holds three tenants, all `INACTIVE` with subStatus "Pending payment", zero users
and zero employees. Nobody has activated, so no activation mail has been sent.

That lowers the urgency and not the severity. It is still on the first thing a
new tenant ever does,
Activation and invitation links are how a workspace owner reaches their product
for the first time. The Vercel host resolves, so nothing breaks visibly — the
customer simply arrives somewhere that is not their address, does not match the
domain on their contract, and will not match it if the Vercel deployment is ever
renamed or the alias removed.

`API_BASE_URL` on `http://` is lower severity: the host 301s to HTTPS, so the
request completes. The exposure is the first hop travelling in plaintext, which
matters whenever a token rides in a URL.

Neither is a code defect. Both are dashboard values.

## Affected Areas

Render service `srv-d7js7fqqqhas739v4i7g`; `tenant-url.config.ts`;
`packages/config/index.js` (`getApiBaseUrl`, `getAppOrigin`);
`docs/environment-variables.md`; `render.yaml`.

## Proposed Resolution

**Requires the user's approval — writing a production environment variable is
outside the read-only posture in `docs/deployment/platform-access.md`, and it triggers a
redeploy.** Four changes, in one edit so the service restarts once:

1. `WEB_APP_URL` → `https://app.dijipeople.com`
2. `API_BASE_URL` → `https://api.dijipeople.com/api`
3. `WEB_APP_PROD_ROOT_DOMAIN` → `ws.dijipeople.com` *(new)*
4. `NEXT_PUBLIC_WEB_ROOT_DOMAIN` → `ws.dijipeople.com` *(new)*

Then, separately and in the repository, [[ITEM-0057]]: bring
`docs/environment-variables.md` and `render.yaml` to the same values, and
collapse `TENANT_BASE_DOMAIN` and `WEB_APP_PROD_ROOT_DOMAIN` to one variable so
this cannot be half-configured again.

## Acceptance Criteria

- `buildTenantActivationUrl` for a tenant produces a URL on the customer domain.
- `/api/health` reports an `https` `apiBaseUrl`.
- A test asserts the production shape, so the next deployment cannot regress it.

## Regression Coverage

None yet. `tenant-url.config.spec.ts` has a test named *"keeps production
single-host login URLs on the configured app host"* that asserts
`https://diji-people-web.vercel.app/login` — it encodes today's misconfiguration
as the expected result. That test is not wrong about the function; it is wrong
about which configuration it should be demonstrating, and it is why nothing
flagged this.

## Dependencies

Needs the user to approve a production environment change.

## Related Items

[[ITEM-0057]] · [[BUG-0061]] · module [[deployment-architecture]] ·
[[tenant-application]].

## Resolution

Applied 2026-08-22.

**The user approved the production write.** All four values are set on the Render
service `srv-d7js7fqqqhas739v4i7g` and read back to confirm:

| Variable | Now |
|---|---|
| `WEB_APP_URL` | `https://app.dijipeople.com` |
| `API_BASE_URL` | `https://api.dijipeople.com/api` |
| `WEB_APP_PROD_ROOT_DOMAIN` | `ws.dijipeople.com` *(new)* |
| `NEXT_PUBLIC_WEB_ROOT_DOMAIN` | `ws.dijipeople.com` *(new)* |

### Set but not yet in effect

Render did **not** redeploy on the change — the newest deploy is still the manual
one from 2026-08-21, and `/api/health` continues to report
`"apiBaseUrl":"http://api.dijipeople.com/api"` because the running process holds
the values it booted with.

So this stays `FIXED` rather than `VERIFIED`: the configuration is correct and
the behaviour is not, until the next deploy. That deploy is coming with
[[ITEM-0053]].

### A note on how the write was verified

The first attempt reported `HTTP 000` for all four and **did not apply**. A
single `PUT` on its own returns `200` with the new value echoed; the failure came
from combining `-o file -w "%{http_code}"` in the loop. This was caught only
because the values were read back afterwards rather than trusted from a status
code — worth keeping, because the same `000` on this machine is *sometimes* a
harmless curl artifact and sometimes a real failure, and only reading the state
back tells them apart.

## QA Retest

Pending the next deploy. Retest is: `/api/health` reports an `https` `apiBaseUrl`,
and a tenant activation URL resolves on the customer domain rather than the
Vercel host.

## History

- 2026-08-22 — found by reading the live Render configuration after the user
  confirmed `dijipeople.com` is live and asked for production to be checked.
  Raised rather than fixed: the fix is a production write.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0057]]
- Modules — [[api-architecture]], [[tenant-application]]
- Regression — REG-228 (see the regression register)

<!-- GRAPH:END -->
- 2026-08-22 — user approved. Four variables written and read back; not yet in effect because Render did not redeploy on the change.
