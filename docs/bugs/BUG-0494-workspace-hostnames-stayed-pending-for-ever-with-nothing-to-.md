---
ID: BUG-0494
aliases: [BUG-0494]
Title: Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 098a0e6
AffectedModules: [services/api/src/modules/tenant-domains, services/api/src/modules/super-admin, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-197
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-commands-monitoring-bulk-delete
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0494 — Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it

## Summary

Workspace hostnames showed Status **Pending** and TLS **Pending** indefinitely,
with nothing on the screen saying whether that was waiting on an automated check
or on a person. It was waiting on a person, and even once that person acted, the
existing hostnames stayed Pending for ever.

## Expected Behavior

A status that can change, and a screen that says what changes it.

## Actual Behavior

`createSystemDomain` reads the `wildcardDnsReady` platform setting **once**, at
the moment it issues a hostname, and writes PENDING/PENDING when it is false.
Nothing re-reads it and nothing probes DNS per tenant, so a hostname issued
before the setting was confirmed stayed Pending permanently — including on
workspaces that were, by then, resolving perfectly.

The panel reported the platform flag as a fact and offered no explanation, no
link to where it is set, and no indication that "Pending" here means "nobody has
confirmed the wildcard record" rather than "a check is running".

## Reproduction

1. Leave `wildcardDnsReady` false and provision a tenant.
2. Confirm wildcard DNS at `/settings/tenant-provisioning`.
3. Reopen the tenant's Domains panel. The hostname is still Pending.

## Evidence

- `services/api/src/modules/tenant-domains/tenant-domain.service.ts` —
  `createSystemDomain` stamps from `isWildcardDnsReady()` at issue time.
- `apps/admin/app/_components/tenants/tenant-domains-panel.tsx` — the flag shown
  as a pill with a hint that says what it is not, and nothing about what it is.

## Root Cause

A derived value written once and stored, where the thing it derives from can
change afterwards. The stamp is correct at the moment it is made and wrong from
the next moment on, and nothing reconciles it — the same shape as the stale
sub-status in [[BUG-0463]], one table over.

## Impact

Every workspace hostname issued before wildcard DNS was confirmed. The tenant is
reachable; the console says it is not.

## Affected Areas

`tenant-domains`, the platform settings writer in `super-admin`, and the tenant
Domains panel.

## Proposed Resolution

`reconcileSystemDomainsAfterWildcardDns` — promote PENDING system subdomains
when the setting is saved true. Deliberately only `SYSTEM_SUBDOMAIN` rows: a
customer's own custom domain is verified against records they control, and the
platform wildcard says nothing about it. Sweeping those to VERIFIED would assert
something nobody checked.

And say it on the panel: manual, one-time, platform-wide, with a link to where
it is confirmed — plus the localhost case, where `*.localhost` resolves without
any DNS at all and confirming the setting is the whole task.

## Acceptance Criteria

- Confirming wildcard DNS promotes existing system subdomains.
- Custom domains are never promoted by it.
- The panel says whether Pending is waiting on us or on a person.
- The localhost case says there is no DNS to configure.

## Regression Coverage

REG-197 — the reconciliation cases in
`services/api/src/modules/tenant-domains/tenant-domain.service.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0312]] — why a hostname may be missing entirely.
[[BUG-0463]] — a stored value that its source outgrew.

## Resolution

Fixed on `agent/tenant-commands-monitoring-bulk-delete`.

## QA Retest

Not run against a live setting change.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-197 names `services/api/src/modules/tenant-domains/tenant-domain.service.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — reported as "how to resolve the DNS routing? The status say
  pending. Is it automated or manual?"
