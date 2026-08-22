---
ID: BUG-0313
aliases: [BUG-0313]
Title: Admin builds workspace URLs from a second, divergent copy of the rule
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: aab6965
AffectedModules: [apps/admin, packages/config]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-179
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-landing-ux-program
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-21
---


# BUG-0313 — Admin builds workspace URLs from a second, divergent copy of the rule

## Summary

`packages/config/platform-domains.js` states, in its own comment, that
`buildWorkspaceUrl` is "the one function every email, invitation and Open
Workspace action goes through", because "building `https://${slug}.dijipeople.com`
by hand elsewhere is how a link ends up pointing at a hostname the tenant does
not actually own".

`apps/admin/lib/tenant-url.ts` was a second implementation of exactly that rule,
and the two had already diverged.

## Expected Behavior

Every surface produces the same workspace URL for the same workspace.

## Actual Behavior

The shared rule keys on `TENANT_BASE_DOMAIN`; admin keyed on
`NEXT_PUBLIC_TENANT_ROOT_DOMAIN` — the same concept under a name the other side
does not read. With this repository's own configuration admin therefore produced
`http://localhost:3001/login?tenant=xoul-ltd` while the API produced a subdomain
link for the same workspace.

Separately, `buildWorkspaceUrl` emitted no port. `xoul-ltd.localhost` resolves,
so configuring a local tenant base domain takes the hostname branch and produced
`http://xoul-ltd.localhost/login` — port 80, nothing listening. Every generated
workspace link was dead in development, and it presented as a DNS problem.

## Reproduction

1. Configure `TENANT_BASE_DOMAIN=localhost`.
2. `buildWorkspaceUrl("xoul-ltd", { path: "/login" })` returns
   `http://xoul-ltd.localhost/login`.
3. Press Open Tenant in admin: a different URL shape again.

## Evidence

- `packages/config/platform-domains.js` — `buildWorkspaceUrl` built
  `${protocol}://${hostname}` with no port.
- `apps/admin/lib/tenant-url.ts` — its own `isSubdomainMode` branch and
  `?tenant=` fallback.
- `apps/admin/app/_components/tenants/use-tenant-record-actions.tsx:119` —
  Open Tenant, reporting "Tenant workspace opened" whatever the URL resolved to.

## Root Cause

A rule documented as single-copy that was copied anyway, and a development case
the original never had to express: production terminates on 443, so no port was
needed until a local tenant base domain made the hostname branch reachable.

## Impact

Every workspace link an operator or a customer follows in development, and any
deployment addressing the workspace app on a non-default port.

## Affected Areas

`Open Tenant`, activation and invitation links, the tenant list's row action.

## Proposed Resolution

Delete admin's copy and delegate to `buildWorkspaceUrl`; teach that function to
inherit the web origin's port **in development only**, so production and staging
cannot have a port grafted onto a customer hostname.

## Acceptance Criteria

- Admin and the API produce identical URLs for the same workspace.
- A development URL carries the port the web app listens on.
- A production or staging URL never does.

## Regression Coverage

REG-179 — `packages/config/platform-domains.test.js` (three new cases) and
`apps/admin/lib/tenant-url.spec.ts` (five). The no-port rule is asserted for
production **and** staging, because a rule that only holds for one of the two
values it excludes is one that will be got wrong later. Verified to fail against
the defect: reverting the port fix fails exactly one test.

## Dependencies

None.

## Related Items

[[BUG-0312]] — the configuration half of the same report.

## Resolution

Fixed on `agent/admin-landing-ux-program`.

## QA Retest

Covered by the specs above.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-179 names `packages/config/platform-domains.test.js`, `apps/admin/lib/tenant-url.spec.ts`, and that is what was executed.

```text
node --test   PASS
npx jest --runTestsByPath, apps/admin   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — found while answering why the workspace login URL did not work.
