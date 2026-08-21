---
ID: BUG-0422
aliases: [BUG-0422]
Title: An abandoned provisioning run blocked every retry with no route out
Status: FIXED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: fb7c771
AffectedModules: [services/api/src/modules/tenant-control-plane, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-189
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0422 — An abandoned provisioning run blocked every retry with no route out

## Summary

A provisioning run is created `RUNNING` and moved to `SUCCEEDED` or `FAILED` by
the same process that executes it. If that process restarts, is deployed over or
crashes mid-run, the row stays `RUNNING` for ever — nothing sweeps it. The
retry gate refused on the raw status, so the only control that could recover the
tenant was disabled permanently, under the sentence "A provisioning run is
already in progress."

## Expected Behavior

A tenant whose provisioning stopped can be recovered from the console, and the
screen says what to do.

## Actual Behavior

The tenant shows as provisioning, Retry is disabled, and the stated reason is
false. There is no sequence of actions in the console that changes it.

## Reproduction

1. Start provisioning and stop the API process before the run completes.
2. Open the tenant record → Operations.
3. State reads RUNNING, Retry is disabled with "A provisioning run is already in
   progress." It stays that way indefinitely.

## Evidence

- `services/api/src/modules/tenant-control-plane/tenant-operations.service.ts` —
  `retryBlockedReason` returned that sentence for any `RUNNING` run, with no
  time bound.
- `services/api/src/modules/tenant-control-plane/provisioning-operations.service.ts`
  — the provisioning **queue** already derived `AT_RISK`, `BREACHED` and
  `MANUAL_ACTION_REQUIRED` from the same rows. Two answers to one question, and
  the tenant page had the worse one.
- `schema.prisma` — `TenantProvisioningRunStatus` has three values and no
  terminal state for an abandoned run.

## Root Cause

`divergent-duplicate-guard`, plus a status vocabulary built for the recorder
rather than the reader. `RUNNING` spans "started ten seconds ago" and "process
died an hour ago", which need opposite responses from an operator, and the gate
treated them identically.

## Impact

A paid-for tenant permanently unusable with no console remedy. Reported as "is
not provisioned or stuck ... what to do? I am not sure", which is an accurate
description of a screen that states facts and recommends nothing.

## Affected Areas

`services/api/src/modules/tenant-control-plane`, and the tenant Operations panel
in `apps/admin`.

## Proposed Resolution

Derive a `STALLED` state — nothing recorded for thirty minutes — in the shared
`deriveProvisioningState`, use that derivation on the tenant page as well as the
queue, and allow retry from `STALLED` and `MANUAL_ACTION_REQUIRED` while still
refusing while a run is making progress. Replay is already idempotent by design:
only retryable steps re-run, and owner, subscription and invoice creation never
do. Surface a `recommendedAction` sentence above the panel.

## Acceptance Criteria

- A run silent for thirty minutes reports STALLED and is retryable.
- A run recording steps is not retryable, whatever its target says.
- A finished run is never reported STALLED, however old.
- The panel states the next action for every non-ready state.

## Regression Coverage

REG-189 — the stalled-run cases in
`services/api/src/modules/tenant-control-plane/provisioning-operations.service.spec.ts`.

## Dependencies

[[BUG-0015]] remains open and is **not** fixed by this: a tenant that failed at
or before the business-unit step still cannot be activated, and retry reports
SUCCEEDED. This record makes a stuck tenant recoverable; that one is why a
recovered tenant may still be unusable.

## Related Items

[[BUG-0014]], [[BUG-0015]] — the retry path's history.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Unit-verified. Not reproduced against a live provisioning run.

## History

- 2026-08-22 — reported as a tenant that "is not privisioned or stuck ... what
  to do? I am not sure".
