---
ID: ITEM-0046
aliases: [ITEM-0046]
Title: Add landing loading error and not-found boundaries
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/landing]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0046 — Add landing loading error and not-found boundaries

## Summary

The public landing app has no App Router `loading`, `error` or `not-found`
boundary, so failures and misses fall through framework defaults instead of the
product's accessible shell and recovery paths.

## Why It Matters

Prospects encountering a failed fetch or bad marketing URL receive an
unbranded/unhelpful state at the top of the commercial funnel.

## Evidence

`docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md:57` records that
none exist. Current `apps/landing/app/` contains no matching boundary files.

## Proposed Approach

UI/UX specifies minimal accessible states using the existing landing shell;
Frontend implements the boundaries and Playwright verifies recovery/not-found.

## Acceptance Criteria

- Loading, unexpected error and not-found states render branded accessible copy.
- Error state offers a working retry or safe navigation action.
- Playwright covers not-found and an induced route error.

## Dependencies

None.

## Related Items

[[landing-architecture]] · [[commercial-onboarding-lifecycle]] · [[TASK-0005]]

## History

- 2026-08-17 — created at `0051180`.
