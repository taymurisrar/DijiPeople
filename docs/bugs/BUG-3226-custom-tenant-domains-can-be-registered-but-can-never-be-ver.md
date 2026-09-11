---
ID: BUG-3226
aliases: [BUG-3226]
Title: Custom tenant domains can be registered but can never be verified or given a certificate; the feature is inert
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: bc3299f9
AffectedModules: [services/api/src/modules/tenant-domains]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3226 — Custom tenant domains can be registered but can never be verified or given a certificate; the feature is inert

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Custom tenant domains can be registered but can never be verified or given a certificate; the feature is inert

Identified by the 2026-09-10 full technical audit as INF-16 (confidence: INF-16=CONFIRMED).

## Expected Behavior

Either the feature is finished — DNS resolution plus ACME issuance, or delegation to Vercel's Domains API which does both — or the UI states that custom domains are not yet available.

## Actual Behavior

`POST` a custom hostname and it is stored `PENDING` with a TXT challenge token. Every verification attempt fails by design. The domain never becomes routable. System subdomains work, covered by a single platform wildcard certificate whose renewal is Vercel's (for `*.dijipeople.com` fronting the apps) and about which the platform stores nothing.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**INF-16** (services/api/src/modules/tenant-domains/tenant-domain.service.ts):

`tenant-domain.service.ts:426-455` — verification is a no-op that says so:
```ts
/**
 * This repository has no DNS resolver or certificate provider integration, so
 * this does NOT confirm anything: it records that verification was attempted
 * and leaves the domain PENDING with a stated reason.
 */
```
```ts
const reason =
  'DNS verification is not automated in this deployment. Confirm the TXT record with the DNS provider, then mark the domain verified through platform operations.';
```
and it returns `{ success: false, verified: false, … }` unconditionally.

System subdomains take a different path and rely on a wildcard certificate,
gated by a manually-set flag — `tenant-domain.service.ts:355-359`:
```ts
/* Covered by the platform wildcard certificate; no per-tenant issuance. */
tlsStatus: wildcardReady ? TenantDomainTlsStatus.ACTIVE : TenantDomainTlsStatus.PENDING,
```
where `isWildcardDnsReady()` (`:564-573`) reads a boolean out of a
`platformSetting` row keyed `tenant-provisioning` — an operator toggle, not a
probe.

Certificate expiry is not modelled at all: grepping `schema.prisma` for a
certificate or TLS expiry field on the domain model returns nothing.

---


Full finding text: INF-16 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Low technical risk; the design fails closed and the code is honest about why, which is the right call. The real risk is commercial: a tenant is offered a custom-domain field that cannot ever succeed, and support absorbs the confusion. Note the healthy counterpoint: **there is no expiring per-tenant certificate to go unrenewed**, because none is ever issued. The "expiring cert nobody renews" scenario does not currently exist here.

## Affected Areas

services/api/src/modules/tenant-domains

## Proposed Resolution

Preferred, and it is the operationally simple one: delegate to Vercel's Domains API from `attemptCustomDomainVerification` — Vercel already fronts the tenant app, already performs DNS verification, and already issues and renews certificates. Do not build ACME. If that is not scheduled, gate the custom-domain UI behind a feature flag that is off.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: LATER)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/tenant-domains/tenant-domain.service.ts (audit id INF-16).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: INF-16=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `INF-16` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (INF-16) at `bc3299f9`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[workspace-routing-and-domains]]

<!-- GRAPH:END -->
