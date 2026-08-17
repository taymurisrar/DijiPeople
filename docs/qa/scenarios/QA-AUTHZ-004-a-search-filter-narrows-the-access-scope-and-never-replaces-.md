---
SCENARIO_ID: QA-AUTHZ-004
aliases: [QA-AUTHZ-004]
TITLE: A search filter narrows the access scope and never replaces it
AREA: authorization
MODULE: services/api/src/modules/employees
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/employees/employees.service.spec.ts
RELATED_BUGS: [BUG-0004]
RELATED_REGRESSIONS: [REG-004]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-17
---

# QA-AUTHZ-004 — A search filter narrows the access scope and never replaces it

## Preconditions

A scoped role whose visible set is a strict subset of the tenant.

## Steps

1. List with no search term and record the visible ids.
2. List with a search term that also matches records outside the scope.

## Expected Result

The second result is a subset of the first. A filter intersects with the scope `where`; it never overwrites it.

## Notes

The `search-filter-scope-overwrite` pattern — the search built a new `where` instead of extending the scoped one.
