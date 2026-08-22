---
ID: BUG-0492
aliases: [BUG-0492]
Title: The workspace URL was built by hand in two more places
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 098a0e6
AffectedModules: [services/api/src/modules/tenant-control-plane, packages/config]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-195
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-commands-monitoring-bulk-delete
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0492 — The workspace URL was built by hand in two more places

## Summary

The tenant record showed `https://xoul-ltd.localhost/` as the workspace URL: the
wrong scheme for a development environment and no port, so the link pointed at
443 on a host that answers on 3001. Two more hand-rolled copies of a rule
`packages/config` owns — the fourth and fifth found so far.

## Expected Behavior

One rule decides where a workspace is reachable, and every surface inherits it,
including the development port and the environment's protocol.

## Actual Behavior

`` `https://${primaryDomain.domain}` `` in two places on the tenant control
plane. A template literal cannot express either decision.

## Reproduction

1. Configure `TENANT_BASE_DOMAIN=localhost` and issue a workspace hostname.
2. Open the tenant record → Configuration.
3. Workspace URL reads `https://xoul-ltd.localhost/`. Following it fails.

## Evidence

- `services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts`
  — two sites, both `https://${domain}`.
- `packages/config/platform-domains.js` — `buildWorkspaceUrl` already carries a
  comment explaining the development-port branch, added for REG-179.

## Root Cause

`divergent-duplicate-guard`, fourth and fifth occurrence. Consolidating the
readers (REG-184) and the admin builder (REG-179) left the API's own response
builders untouched, because nothing enumerates who answers "where is this
workspace" — the search was for callers of the old helper, not for the concept.

## Impact

Every workspace link the tenant record renders, in any environment whose
protocol or port differ from the hardcoded assumption. This is what the
operator followed and found dead.

## Affected Areas

`services/api/src/modules/tenant-control-plane`.

## Proposed Resolution

`workspaceUrlFor(slug, hostname)` calling `buildWorkspaceUrl` with the issued
hostname. Returns null with no hostname rather than a slug-parameter fallback:
under a label that reads "Workspace URL" beside a hostname, a `?workspace=`
link would claim the workspace is addressable by name when it is not.

## Acceptance Criteria

- A development workspace URL carries the web app's port.
- A production URL never has a port grafted on.
- The protocol comes from the platform environment.
- No `https://${...}` template literal builds a workspace URL anywhere.

## Regression Coverage

REG-195 — `services/api/src/modules/tenant-control-plane/workspace-url.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0312]], [[BUG-0313]], [[BUG-0353]] — the first three copies.

## Resolution

Fixed on `agent/tenant-commands-monitoring-bulk-delete`.

## QA Retest

Unit-verified. Not followed in a browser.

## History

- 2026-08-22 — reported as "on localhost the port doesnt come up with the link".
