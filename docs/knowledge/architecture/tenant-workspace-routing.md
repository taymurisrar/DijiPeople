# Tenant Workspace Routing

> Generated from repository evidence at `ad8f77f`.

**The hostname resolves the tenant.** A workspace is reached at its own
subdomain under the platform wildcard, and the domain resolver maps that
hostname back to exactly one tenant.

## Where hostnames come from

`packages/config/platform-domains.js` resolves the platform's domain
configuration: `baseDomain`, `tenantBaseDomain`, and the `app`, `admin`, `api`
and `landing` hosts. `buildWorkspaceHostname` issues a workspace hostname from
the tenant slug and the tenant base domain.

The module is consumed by **the API and all three Next.js apps**. That is the
constraint that shapes everything else here: a frontend has no Prisma client, so
this resolver cannot read the database.

`getPlatformDomainConfig(env = process.env)` therefore reads **environment
variables only** — `TENANT_BASE_DOMAIN`, `NEXT_PUBLIC_TENANT_BASE_DOMAIN`,
`NEXT_PUBLIC_TENANT_ROOT_DOMAIN`, `WEB_APP_PROD_ROOT_DOMAIN`,
`NEXT_PUBLIC_WEB_ROOT_DOMAIN`, falling back to the public base domain.

## The two-sources-of-truth defect

`TenantProvisioningService.settings()` resolves `tenantBaseDomain` from the
`tenant-provisioning` PlatformSetting — which the admin UI edits — then env,
then a default. `createSystemDomain` does not consult that setting at all.

**The admin control is inert.** Provisioning fails at the `workspace-domain`
step regardless of what an operator sets, unless the environment variable is
present. This blocked a full E2E run until `TENANT_BASE_DOMAIN` was exported.

[[BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance]], with
the architecture decision it waits on at [[ITEM-0006]]. It needs an ADR because
any answer changes four deployables.

## Routing is verified during provisioning

`workspace-routing-verified` is step 7 of 8: it re-resolves the primary hostname
and asserts it maps back to **this** tenant before anyone is invited to it. A
routing check against the resolver the web app actually uses, not a DNS probe.

That step was declared retryable and left unwired, so no failed provisioning
could ever be recovered:
[[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried]]. Pattern:
[[declared-but-unwired-step]].

## Isolation at the hostname boundary

`services/api/test/workspace-domain-isolation.e2e-spec.ts` covers the case that
matters: a hostname must never resolve to a tenant other than its own. This is
the same invariant as [[multi-tenancy]], enforced one layer earlier.

## Related

[[multi-tenancy]] · [[tenant-provisioning]] · [[tenant-control-plane]] ·
[[deployment-architecture]] · [[requirement-tenant-workspace-domains]]

Source: `packages/config/platform-domains.js`,
`docs/architecture/workspace-routing-and-domains.md`,
`services/api/src/modules/tenant-control-plane/`, QA run 2026-08-15.
