---
ID: BUG-0055
aliases: [BUG-0055]
Title: Partner administration routes use tenant role aliases instead of platform permissions
Status: IN_PROGRESS
Severity: HIGH
Priority: P0
Type: AUTHORIZATION
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 3f9063f
AffectedModules: [services/api/src/modules/partners]
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

# BUG-0055 - Partner administration routes use tenant role aliases instead of platform permissions

## Summary

All ten partner administration routes authorize through tenant role aliases
instead of the platform `partners.*` permission system.

## Expected Behavior

Platform partner roles are admitted according to `partners.read` or
`partners.manage`, and tenant identities cannot enter the platform surface.

## Actual Behavior

The controller accepts `system-admin`/`system-customizer`; the platform MEMBER
alias can therefore mutate partner data without `partners.*`, while intended
partner-management roles can be denied.

## Reproduction

Invoke a `/partners` read or mutation with a platform MEMBER identity mapped to
the accepted tenant-role alias but lacking `partners.*`.

## Evidence

`partners.controller.ts` uses `RolesGuard`; most `PartnersService` methods do
not receive the actor or assert platform permissions.

## Root Cause

A platform domain was wired to the tenant role guard and aliases instead of
the existing platform permission contract.

## Impact

Unauthorized same-platform disclosure and mutation of commercial partner data,
plus denial of legitimate partner-role workflows.

## Affected Areas

Partner list/detail, lifecycle, referral links, and commissions.

## Proposed Resolution

Thread the authenticated actor through every operation, require a platform
subject, assert `partners.read`/`partners.manage`, and remove the coarse tenant
role authorization.

## Acceptance Criteria

MEMBER without permission is denied; PARTNER_MANAGER can manage; PRESALES is
read-only; tenant JWTs are denied; all ten routes have regression coverage.

## Regression Coverage

Pending WP-03 platform partner authorization tests.

## Dependencies

None.

## Related Items

[[ITEM-0043]].

## Resolution

In progress in WP-03.

## QA Retest

Pending.

## History

- 2026-08-17 - confirmed by the WP-03 alternate-guard audit and atomically
  reserved under `SESSION-0003`.
