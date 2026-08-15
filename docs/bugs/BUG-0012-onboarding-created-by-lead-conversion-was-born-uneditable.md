---
ID: BUG-0012
aliases: [BUG-0012]
Title: Every onboarding created by lead conversion was born un-editable
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/super-admin]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-010
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-15
---

# BUG-0012 — Every onboarding created by lead conversion was born un-editable

## Summary

`convertLeadToCustomer` seeded `CustomerOnboarding` with
`status: NOT_STARTED, subStatus: 'Agreement executed'` — a pair absent from
`CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[NOT_STARTED]`, which is
`['Awaiting kickoff', 'Kickoff scheduled']`.

## Expected Behavior

A record created by the system is valid against the system's own catalogue.

## Actual Behavior

`updateCustomerOnboarding` validates the effective sub-status on every call, so
**every** later PATCH failed — including a notes-only edit — with "Onboarding
sub-status is not valid for the selected onboarding status." The only escape was
to guess that a status change had to be sent in the same request.

## Reproduction

Convert a qualified lead with an executed agreement, then
`PATCH /super-admin/customer-onboarding/:id {notes}` → 400. Scenario A8.x in the
QA run.

## Evidence

QA run Bugs Found section;
`services/api/src/modules/super-admin/platform-lifecycle.onboarding-seed.spec.ts`.

## Root Cause

**A seed that never validated itself against the catalogue it seeds into.** The
writer and the validator read the same catalogue and disagreed, because only one
of them actually consulted it.

## Impact

Blocked the primary commercial journey at the first step after conversion. Every
converted customer, not an edge case.

## Affected Areas

`services/api/src/modules/super-admin` — lead conversion and customer onboarding.

## Proposed Resolution

Resolved: the seed asks the catalogue via `getDefaultSubStatus`.

## Acceptance Criteria

The seeded onboarding's sub-status is valid for its status; a notes-only PATCH
returns 200; **every** `CustomerOnboardingStatus` has a valid default sub-status.

## Regression Coverage

[REG-010](../qa/regressions/index.md) — 11 assertions; 4 fail without the fix
(counted with REG-011 in the run's proof table).

## Dependencies

None.

## Related Items

Bug pattern [[unvalidated-seed-state]]. Modules [[customer-onboarding|Customer Onboarding]],
[[leads|Leads]], [[customers|Customers]]. Requirement [[requirement-commercial-onboarding|Commercial Onboarding]].

## Resolution

Fixed 2026-08-15 on branch `agent/qa-commercial-onboarding-e2e`.

## QA Retest

FIX2.01–03 PASS.

## History

- 2026-08-15 — found during the commercial onboarding E2E, fixed, REG-010 added.
- 2026-08-15 — imported into the durable bug system.
