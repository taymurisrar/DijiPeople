---
ID: BUG-0053
aliases: [BUG-0053]
Title: Self-scoped document readers can list and open tenant-wide documents
Status: IN_PROGRESS
Severity: HIGH
Priority: P0
Type: AUTHORIZATION
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 3f9063f
AffectedModules: [services/api/src/modules/documents]
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

# BUG-0053 — Self-scoped document readers can list and open tenant-wide documents

## Summary

An employee receives `documents:READ` at `SELF`, which also synthesizes the
legacy `documents.read` key. The general document list, detail, view and
download paths check only that key and query by tenant, so a self-scoped caller
can reach documents linked to other employees when an id or broad list is known.

## Expected Behavior

Document reads apply both endpoint permission families and enforce the caller's
effective document/employee scope before returning metadata or file content.

## Actual Behavior

`DocumentsController.findAll`, `findOne`, `view` and `download` pass only
`user.tenantId` to service methods. `DocumentsService.findByTenant`, `findById`,
`openForView` and `openForDownload` consequently accept any non-archived
document in that tenant. The scoped entity-specific path already demonstrates
the missing control through `assertEntityReadAccess`.

## Reproduction

1. Use an ordinary employee access context with `documents:READ` at `SELF`.
2. Request the general document list or a document id linked to a different
   employee in the same tenant.
3. Observe that the repository predicate contains `tenantId` and id/filter
   fields but no employee/access-scope predicate.

## Evidence

- `services/api/src/common/constants/rbac-matrix.ts` grants the employee role
  `documents:READ` at `SELF`.
- `services/api/src/modules/documents/documents.controller.ts` passes only
  `user.tenantId` on general list/detail/view/download routes.
- `services/api/src/modules/documents/documents.service.ts` scopes
  `findByEntity` through `assertEntityReadAccess`, but the general read paths do
  not call that guard.
- `services/api/src/modules/documents/documents.repository.ts` filters general
  list and id reads by tenant only.

## Root Cause

Endpoint permission was treated as object authorization. The later
entity-specific implementation added owning-employee scope but the original
general list/id/file paths retained their tenant-only contract.

## Impact

This is an intra-tenant object-level authorization gap on potentially sensitive
employee documents. It is HIGH severity; the observed predicates still prevent
cross-tenant access.

## Affected Areas

API document listing, metadata detail, inline view, download, and any caller
that uses those general routes.

## Proposed Resolution

Pass the authenticated user through every general read/file path, constrain the
repository query to document links whose owning employee is visible at the
caller's effective scope, and reuse one object-access assertion for direct ids.
Keep non-employee tenant documents limited to an explicit tenant-wide document
privilege rather than treating an unlinked record as automatically visible.

## Acceptance Criteria

- A SELF-scoped employee sees only their own employee-linked documents.
- Another employee's document id returns a non-enumerating refusal/not-found
  response for metadata, view and download.
- HR/manager access follows their matrix scope and remains tenant-isolated.
- Tenant-level document readers retain intended tenant document access.
- Controller routes declare consistent legacy and matrix permissions.

## Regression Coverage

Pending a focused document object-authorization regression in WP-03.

## Dependencies

None. The existing employee scope builder and document link model are present.

## Related Items

- [[ITEM-0043]] — the dual-permission inventory exposed the controller surface,
  but closing this bug also requires service-level object authorization.

## Resolution

In progress in WP-03.

## QA Retest

Pending implementation and negative same-tenant object-access tests.

## History

- 2026-08-17 — discovered while classifying matrix-only document routes during
  WP-03; reserved atomically as `BUG-0053` under `SESSION-0003`.
