---
ID: BUG-0017
aliases: [BUG-0017]
Title: The admin-editable tenant base domain does not drive hostname issuance
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [packages/config, services/api/src/modules/tenant-control-plane]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem: ITEM-0006
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:
---

# BUG-0017 — The admin-editable tenant base domain does not drive hostname issuance

## Summary

Two sources of truth for one value, and the operator-facing one is inert.
`TenantProvisioningService.settings()` resolves `tenantBaseDomain` from the
`tenant-provisioning` PlatformSetting — which `/settings/tenant-provisioning`
edits — then env, then a default. But `createSystemDomain` issues hostnames
through `buildWorkspaceHostname` → `getPlatformDomainConfig`, which reads
**environment variables only**.

## Expected Behavior

Changing the tenant base domain in the admin UI changes the hostnames the next
tenant is provisioned with. Otherwise the control should not exist.

## Actual Behavior

The admin control has no effect on hostname issuance. Provisioning fails at the
`workspace-domain` step regardless of what an operator sets, unless
`TENANT_BASE_DOMAIN` is present in the API process environment.

## Reproduction

Clear `TENANT_BASE_DOMAIN` from the API environment, set a base domain through
`/settings/tenant-provisioning`, then provision a tenant. Scenario A10.04 in the
QA run — this is what blocked provisioning until `TENANT_BASE_DOMAIN` was
exported.

## Evidence

QA run BUG-07. Verified still present at `main` `ad8f77f`:
`packages/config/platform-domains.js` `getPlatformDomainConfig(env = process.env)`
resolves `tenantBaseDomain` from `TENANT_BASE_DOMAIN`,
`NEXT_PUBLIC_TENANT_BASE_DOMAIN`, `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`,
`WEB_APP_PROD_ROOT_DOMAIN`, `NEXT_PUBLIC_WEB_ROOT_DOMAIN` — every one an
environment variable, with no path to a PlatformSetting.

## Root Cause

`platform-domains.js` is shared by the API **and all three frontends**, so it
cannot read the database — a frontend has no Prisma client. The setting was
added on the API side without a mechanism to reach the shared resolver, and
nothing failed loudly.

## Impact

An operator-facing control that silently does nothing, on the value that decides
whether tenant provisioning can complete at all. The failure it produces
(`workspace-domain` step failure) gives no hint that the setting was ignored.

## Affected Areas

`packages/config/platform-domains.js`, `services/api/src/modules/tenant-control-plane`,
the admin tenant-provisioning settings screen, and every frontend that resolves
workspace hostnames.

## Proposed Resolution

Needs an **ADR**, because the shared module is consumed by four deployables and
any answer changes all of them. The options, none yet chosen:

- Make the API inject the resolved base domain into `buildWorkspaceHostname`
  at the call site, leaving `platform-domains.js` env-only.
- Remove the admin control and make the base domain env-only everywhere,
  documenting it as deployment configuration.
- Publish the setting into the environment at deploy time, keeping one reader.

Tracked as [[ITEM-0006]].

## Acceptance Criteria

Either the admin control demonstrably changes issued hostnames, or it is gone
and the base domain is documented as deployment configuration. **Not both
readers.**

## Regression Coverage

**None.** Add once the ADR chooses a direction.

## Dependencies

[[ITEM-0006]] — the ADR.

## Related Items

Bug pattern [[doc-code-drift]] in its configuration form: two declared sources
of truth, one inert. Modules [[tenant-provisioning|Tenant Provisioning]], [[settings|Settings]].
Architecture [[tenant-workspace-routing|Tenant Workspace Routing]]. Requirement [[requirement-tenant-workspace-domains|Tenant Workspace Domains]].

## Resolution

Not resolved.

## QA Retest

Not applicable.

## History

- 2026-08-15 — found during the commercial onboarding E2E.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN.
