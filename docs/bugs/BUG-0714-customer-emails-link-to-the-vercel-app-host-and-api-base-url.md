---
ID: BUG-0714
aliases: [BUG-0714]
Title: Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: INFRA
Source: DEPLOYMENT
DetectedDate: 2026-08-22
DetectedInSha: b486a60
AffectedModules: [services/api, apps/web, docs/deployment]
OwnerAgent: release-devops
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
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

Filled at fix time. The fix is a production environment change and has not been
made — see Proposed Resolution.

## QA Retest

Pending. Retest is: read /api/health and confirm an https apiBaseUrl, and build
a tenant activation URL and confirm it lands on the customer domain.

## History

- 2026-08-22 — found by reading the live Render configuration after the user
  confirmed `dijipeople.com` is live and asked for production to be checked.
  Raised rather than fixed: the fix is a production write.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0057]]
- Modules — [[api-architecture]], [[tenant-application]]

<!-- GRAPH:END -->
