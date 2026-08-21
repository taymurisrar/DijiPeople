---
ID: BUG-0353
aliases: [BUG-0353]
Title: The API resolved a workspace hostname from a variable nothing sets
Status: FIXED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 0d10a9d
AffectedModules: [services/api/src/modules/tenants, packages/config]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-184
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/ux-round-two
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---

# BUG-0353 — The API resolved a workspace hostname from a variable nothing sets

## Summary

`http://xoul-ltd.localhost:3001/login` answered `TENANT_NOT_FOUND` for a tenant
that exists and is ACTIVE. [[BUG-0312]] and [[BUG-0313]] fixed the two copies of
the workspace-URL rule that *build* such a link. This is the third copy — the
one that *reads* it — and it was keyed on a variable nothing in this repository
sets.

## Expected Behavior

One rule decides which workspace a hostname addresses, and the side that builds
a link and the side that resolves it agree by construction.

## Actual Behavior

`PublicTenantsService.getTenantSlugFromHost` parsed the host itself against
`WEB_APP_PROD_ROOT_DOMAIN`. The web app routes on `TENANT_BASE_DOMAIN`. With
`TENANT_BASE_DOMAIN` configured and `WEB_APP_PROD_ROOT_DOMAIN` unset, the web
app routed `xoul-ltd.localhost` to a workspace and the API resolved no slug at
all from the same hostname — so the login it forwarded to could only answer
`TENANT_NOT_FOUND`.

## Reproduction

1. Configure `TENANT_BASE_DOMAIN=localhost` and leave `WEB_APP_PROD_ROOT_DOMAIN`
   unset, which is this repository's own development configuration.
2. Open `http://xoul-ltd.localhost:3001/login?next=%2F` for an ACTIVE tenant
   whose slug is `xoul-ltd`.
3. The API responds `{"errorCode":"TENANT_NOT_FOUND"}`.

## Evidence

- `services/api/src/modules/tenants/public-tenants.service.ts` (before) —
  `normalizeHost(this.configService.get('WEB_APP_PROD_ROOT_DOMAIN') ?? '')`,
  followed by a private re-implementation of suffix matching, nested-label
  rejection and a common-login-host exception.
- `packages/config/platform-domains.js` — `parseWorkspaceHostname`, which
  already does all of that and reads the variables the rest of the platform sets.
- Reported verbatim: `'http://xoul-ltd.localhost:3001/login?next=%2F' still
  doesnt work and API says '"errorCode":"TENANT_NOT_FOUND"'`.

## Root Cause

`divergent-duplicate-guard`, for the third time on the same concept. One rule —
"which workspace does this hostname address" — existed in three places under
three names for its input: `TENANT_BASE_DOMAIN`, `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`
and `WEB_APP_PROD_ROOT_DOMAIN`. Each copy was internally correct. Configuring
the platform correctly for two of them left the third inert, and an inert
hostname parser fails closed — which is the right failure mode and also a
completely silent one.

Worth naming precisely: the previous fix removed the duplicate that produced
dead *links*, verified the link was now correct, and did not ask whether anything
else parsed the same hostname. The defect survived a fix aimed directly at it.

## Impact

Every workspace login by hostname, in any environment where
`WEB_APP_PROD_ROOT_DOMAIN` is not set to the same value as `TENANT_BASE_DOMAIN`.
The user-visible symptom is a tenant that appears not to exist.

## Affected Areas

`services/api/src/modules/tenants/public-tenants.service.ts` and every caller
that resolves a tenant from a `Host` header.

## Proposed Resolution

Delete the private parser and call `parseWorkspaceHostname` from `@repo/config`,
reading values through `ConfigService` so a deployment that configures Nest
rather than the process environment behaves identically. Keep the service's own
reserved-slug check: that is a product-level list the host parser deliberately
knows nothing about.

## Acceptance Criteria

- A workspace subdomain resolves under a locally configured base domain, with or
  without a port.
- The same shape resolves against a deployed base domain.
- Platform hostnames (`admin.`, `api.`, `app.`, the bare domain) resolve to
  nothing.
- A nested label resolves to nothing rather than to its leftmost or rightmost
  part.
- A hostname that merely ends with the base domain as a substring resolves to
  nothing.
- With no base domain configured, nothing resolves — failing closed.

## Regression Coverage

REG-184 — `services/api/src/modules/tenants/public-tenant-host.spec.ts`, seven
assertions over the parsing, which is the half that was wrong.

## Dependencies

None.

## Related Items

[[BUG-0312]], [[BUG-0313]] — the first two copies of this rule.

## Resolution

Fixed on `agent/ux-round-two`.

## QA Retest

Unit-verified. Not retested against a running API and a browser.

## History

- 2026-08-21 — reported for the second time, after the link-building fix.
