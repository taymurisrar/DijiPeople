---
SCENARIO_ID: QA-PARTNER-001
aliases: [QA-PARTNER-001]
TITLE: Partner onboarding review follows a state machine, not a setter
AREA: partner-lifecycle
MODULE: services/api/src/modules/partner-experience
TYPE: API
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/partner-experience/partner-onboarding.state-machine.spec.ts
RELATED_BUGS: [BUG-0016]
RELATED_REGRESSIONS: [REG-014]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PARTNER-001 — Partner onboarding review follows a state machine, not a setter

## Preconditions

An enquiry in each review state.

## Steps

1. Walk the legal review path end to end.
2. Attempt each skip and each backwards move.
3. Approve an already-approved enquiry.

## Expected Result

Only legal transitions are accepted; every other move is refused with a domain error rather than silently writing the field.

## Notes

A setter with an enum column is not a state machine — the transitions have to be enumerated somewhere.
