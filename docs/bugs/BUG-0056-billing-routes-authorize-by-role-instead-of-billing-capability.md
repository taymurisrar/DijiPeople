---
ID: BUG-0056
aliases: [BUG-0056]
Title: Billing routes authorize by role instead of billing capability
Status: IN_PROGRESS
Severity: HIGH
Priority: P0
Type: AUTHORIZATION
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 3f9063f
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0043
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0056 - Billing routes authorize by role instead of billing capability

## Summary

Eight authenticated tenant billing routes rely on tenant roles rather than
billing read/manage capability and matrix scope.

## Expected Behavior

Billing reads and mutations require explicit, distinct billing permissions and
tenant-administration matrix access.

## Actual Behavior

`system-customizer` can perform billing writes without billing capability while
a CEO holding `billing.view` is rejected by the role gate.

## Reproduction

Call billing read/write routes as those two role/permission combinations.

## Evidence

The billing controller uses `RolesGuard` for plans, health, subscription,
invoices, checkout, portal, and reconciliation routes.

## Root Cause

Role names were used as a proxy for the billing capability model.

## Impact

Unauthorized subscription mutations and broken legitimate billing reads.

## Affected Areas

Tenant billing plans, subscription, invoices, checkout, portal, and reconcile.

## Proposed Resolution

Use `PermissionsGuard`, separate billing read/manage legacy keys, matching
tenant-administration matrix privileges, and preserve tenant scoping.

## Acceptance Criteria

CEO read succeeds; unprivileged reads fail; writes require manage capability;
system-customizer without it is denied; tenant isolation tests pass.

## Regression Coverage

Pending WP-03 billing authorization tests.

## Dependencies

Permission catalog and role-grant reconciliation in WP-03.

## Related Items

[[ITEM-0043]].

## Resolution

In progress in WP-03.

## QA Retest

Pending.

## History

- 2026-08-17 - confirmed by the WP-03 alternate-guard audit and atomically
  reserved under `SESSION-0003`.
