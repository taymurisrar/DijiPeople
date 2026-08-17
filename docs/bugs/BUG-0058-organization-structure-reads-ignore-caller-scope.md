---
ID: BUG-0058
aliases: [BUG-0058]
Title: Organization structure reads ignore caller scope
Status: VERIFIED
Severity: HIGH
Priority: P0
Type: AUTHORIZATION
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 3f9063f
AffectedModules: [services/api/src/modules/organization]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-045
RelatedBacklogItem: ITEM-0043
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0058 - Organization structure reads ignore caller scope

## Summary

Thirteen organization, business-unit, department, designation, and location
read routes return tenant-wide structure without caller capability or scope.

## Expected Behavior

Organization-structure reads require both permission families and respect the
caller's organization/business-unit access context.

## Actual Behavior

Controllers declare neither permission family and services/repositories query
by tenant only.

## Reproduction

As a scoped ordinary user, list or traverse organization structure and observe
sibling/out-of-scope records.

## Evidence

The five organization controllers and their service/repository read methods
pass only `tenantId`; the exact route set was reproduced by the WP-03 invariant.

## Root Cause

Reference-data convenience endpoints were treated as universally visible even
though they expose organizational structure.

## Impact

Intra-tenant organizational information disclosure and scope bypass.

## Affected Areas

Organizations, business units, departments, designations, and locations.

## Proposed Resolution

Use the canonical HIERARCHY entity and existing read keys where possible,
apply access-context predicates to list/detail/traversal queries, and add
negative sibling/cross-tenant tests.

## Acceptance Criteria

Unauthorized roles receive 403; scoped callers cannot reach sibling units;
authorized organization-level callers retain intended visibility; cross-tenant
ids remain hidden.

## Regression Coverage

Pending WP-03 organization authorization tests.

## Dependencies

Permission-role mapping reconciliation in WP-03.

## Related Items

[[ITEM-0043]].

## Resolution

Fixed 2026-08-17, integrated into develop at 2313bef. Organization structure reads and mutations resolve their targets through the RBAC scope filter rather than a bare tenant-keyed lookup, so caller scope is honoured.

## QA Retest

Verified by the regression specs organization-read-scope.spec.ts and organization-structure-tenant-scope.spec.ts; the latter was refreshed for the scoped lookup with its isolation guarantees intact. REG-045 records it Active: yes.

## History

- 2026-08-17 — fixed and verified in WP-03; integrated into develop at 2313bef with the CI required gate green on that exact SHA.
- 2026-08-17 - confirmed by the WP-03 missing-both audit and atomically
  reserved under `SESSION-0003`.
