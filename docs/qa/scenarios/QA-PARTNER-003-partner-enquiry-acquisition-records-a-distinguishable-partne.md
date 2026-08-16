---
SCENARIO_ID: QA-PARTNER-003
aliases: [QA-PARTNER-003]
TITLE: Partner enquiry acquisition records a distinguishable partnership model
AREA: partner-lifecycle
MODULE: services/api/src/modules/partner-experience
TYPE: API
RISK: MEDIUM
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/partner-experience/partner-inquiry-acquisition.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: [REG-022]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PARTNER-003 — Partner enquiry acquisition records a distinguishable partnership model

## Preconditions

The public partner enquiry surface.

## Steps

1. Submit an enquiry for each partnership model.
2. Read back the stored model and the contracting entity type.

## Expected Result

The two are stored as separate facts. One enum meaning two things makes every downstream report ambiguous.

## Notes

The `overloaded-enum` pattern.
