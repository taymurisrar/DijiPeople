---
SCENARIO_ID: QA-AUTHZ-009
aliases: [QA-AUTHZ-009]
TITLE: Document authorization follows the owning employee
AREA: authorization
MODULE: services/api/src/modules/documents
TYPE: SECURITY
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/documents/documents-object-authorization.spec.ts
RELATED_BUGS: [BUG-0053]
RELATED_REGRESSIONS: [REG-041]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-AUTHZ-009 — Document authorization follows the owning employee

## Preconditions

Two employees in the same tenant and a caller with SELF-scoped document and
employee privileges.

## Steps

1. List and open the caller's own employee-linked document.
2. Repeat with the other employee's document id.
3. Attempt update, archive and upload against the other employee's record.
4. Repeat the read with a tenant-scoped document reader.

## Expected Result

SELF scope returns only the caller's documents and hides every foreign id
before storage or database mutation. Tenant-scoped readers retain intended
tenant access.

## Notes

Reusable coverage for `REG-041`; controller metadata is also covered by
`wiring-invariants.spec.ts`.
