---
ID: BUG-0057
aliases: [BUG-0057]
Title: Self-service settings context allows arbitrary organization preview
Status: IN_PROGRESS
Severity: HIGH
Priority: P0
Type: AUTHORIZATION
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 3f9063f
AffectedModules: [services/api/src/modules/tenant-settings]
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

# BUG-0057 - Self-service settings context allows arbitrary organization preview

## Summary

Ordinary employees can supply arbitrary same-tenant organization and context
identifiers to resolved settings/context endpoints.

## Expected Behavior

SELF callers resolve only their own employee context; explicit organization
preview requires settings read access above SELF.

## Actual Behavior

Base employees receive `dashboard.view`, which is incorrectly treated as
authority for arbitrary context, and `/tenant-settings/resolved` checks only
that a requested organization belongs to the tenant.

## Reproduction

As an employee, supply another organization/employee/business-unit id to the
two resolved endpoints.

## Evidence

`settings-context.controller.ts` derives authority from `dashboard.view`;
`tenant-settings.controller.ts` performs membership but not caller-access
validation.

## Root Cause

Navigation/dashboard capability and tenant membership were mistaken for
object-level settings authorization.

## Impact

Intra-tenant exposure of organization-specific configuration and resolved
application context.

## Affected Areas

Resolved application context and tenant settings preview.

## Proposed Resolution

Move access decisions into services, derive SELF context from the linked
employee, and honor supplied identifiers only with effective SETTINGS read
scope above SELF.

## Acceptance Criteria

Employee input cannot alter own resolution; authorized settings admins can
preview allowed organizations; inaccessible/cross-tenant ids do not resolve.

## Regression Coverage

Pending WP-03 settings authorization tests.

## Dependencies

Dual permission metadata and scope-resolution tests.

## Related Items

[[ITEM-0043]].

## Resolution

In progress in WP-03.

## QA Retest

Pending.

## History

- 2026-08-17 - confirmed by the WP-03 missing-both audit and atomically
  reserved under `SESSION-0003`.
