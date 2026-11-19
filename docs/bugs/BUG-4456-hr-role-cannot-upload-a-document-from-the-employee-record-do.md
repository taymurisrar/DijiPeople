---
ID: BUG-4456
aliases: [BUG-4456]
Title: HR role cannot upload a document from the employee record Documents tab (403 ACCESS_DENIED, employees.documents.upload not granted)
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-11-19
DetectedInSha: fefab9da
AffectedModules: [services/api/src/modules/employees, services/api/src/common/constants/rbac-matrix.ts]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-19
UpdatedAt: 2026-11-19
ResolvedAt:
---


# BUG-4456 — HR role cannot upload a document from the employee record Documents tab (403 ACCESS_DENIED, employees.documents.upload not granted)

## Summary

The HR role can upload a document through `documents/upload` but not from the employee record's Documents tab: the tab's route requires `employees.documents.upload`, which no HR grant reaches.

## Expected Behavior

An HR user who manages an employee record can attach a document to it from that record.

## Actual Behavior

The upload from the employee record returns 403 `ACCESS_DENIED`. The same user can upload through `documents/upload`.

## Reproduction

1. Sign in as the demo HR user. 2. Open an employee record, Documents tab. 3. Upload a file: 403.

## Evidence

Browser flow P, test GP-D2 (`test.fixme`, `e2e/tests/flow-p-growth-hr-browser.spec.ts`); the admin variant GP-D1 passes. The check is `employee-access.service.ts` (`user.permissionKeys.includes('employees.documents.upload')`).

## Root Cause

Not established beyond the missing grant: `employees.documents.upload` is listed only in the unused `BASE_ROLE_PERMISSION_KEYS`, and the matrix mapping that actually grants keys does not give it to HR.

## Impact

HR cannot complete document upload from the employee record in a Growth demo; an admin can.

## Affected Areas

services/api rbac-matrix grants, employees documents route, apps/web employee record Documents tab.

## Proposed Resolution

Product decision: grant HR the employee-document upload privilege (extend the matrix, not the dead constant) with a wiring-invariant and an e2e assertion, or document that uploads are admin-only and hide the tab action for HR.
