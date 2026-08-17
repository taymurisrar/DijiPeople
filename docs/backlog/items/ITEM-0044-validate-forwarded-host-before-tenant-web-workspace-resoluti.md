---
ID: ITEM-0044
aliases: [ITEM-0044]
Title: Validate forwarded host before tenant web workspace resolution
Type: SECURITY
Status: READY
Priority: P1
Severity: MEDIUM
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0044 — Validate forwarded host before tenant web workspace resolution

## Summary

`apps/web/proxy.ts` prefers `x-forwarded-host` over `Host` for every request,
while the API trusts forwarded headers only when the deployment proxy is
trusted. Establish and enforce the same boundary in tenant-web routing.

## Why It Matters

An attacker-controlled forwarded host can influence workspace classification
when a request reaches Next.js without a sanitising edge. API authorization may
limit impact, but routing, branding and discovery must not trust the header.

## Evidence

- `apps/web/proxy.ts:163-165` unconditionally prefers `x-forwarded-host`.
- `services/api/src/modules/tenant-domains/request-hostname.ts:14-31` has the
  repository's existing trusted-proxy rule.
- `docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md:51,119` records the risk.

## Proposed Approach

ExecPlan required because workspace routing is a tenant boundary. Verify the
deployment header contract, reuse a shared trust rule where possible, and add
negative tests for direct/spoofed requests before changing precedence.

## Acceptance Criteria

- Direct requests cannot override `Host` with a forged forwarded header.
- Requests from the configured trusted proxy still resolve the external host.
- Spoofed workspace hosts fail closed without tenant enumeration.

## Dependencies

Deployment proxy behavior must be verified; independent work does not wait.

## Related Items

[[workspace-routing-and-domains]] · [[tenant-isolation]] · [[TASK-0005]]

## History

- 2026-08-17 — created at `0051180`.
