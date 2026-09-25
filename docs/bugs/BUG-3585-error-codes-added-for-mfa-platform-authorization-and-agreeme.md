---
ID: BUG-3585
aliases: [BUG-3585]
Title: Error codes added for MFA, platform authorization and agreements reach clients as generic codes
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [services/api/src/common/errors, services/api/src/modules/auth, services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-624
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3585 — Error codes added for MFA, platform authorization and agreements reach clients as generic codes

## Summary

TASK-0032's own streams (WP-02 platform RBAC, WP-03 MFA, WP-05 agreement
guards) introduced new, specific `AppError` codes — e.g.
`CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`, MFA challenge/lockout codes, and
platform-permission-denial codes — without registering them in
`common/errors/error-catalog.ts`. An uncatalogued code falls back to the
generic `SYSTEM_UNEXPECTED_ERROR` at the `HttpExceptionFilter`, so a client
handling a specific failure mode (a signature field it should show as
read-only, an MFA lockout it should explain) saw the same undifferentiated
error as an unrelated server fault.

## Expected Behavior

Every `AppError` code a request can actually reach should be registered in
`error-catalog.ts` with its own message/description, so `HttpExceptionFilter`
renders the standard contract with the specific `errorCode` a frontend can
branch on, not the generic fallback.

## Actual Behavior

`HttpExceptionFilter` renders `errorCode: 'SYSTEM_UNEXPECTED_ERROR'` for any
thrown code `error-catalog.ts` does not recognise. Several codes this task's
own streams introduced were never added to the catalogue, so requests hitting
those paths returned the generic code and message instead of the specific one
the throwing code intended.

## Reproduction

1. Trigger one of the TASK-0032-introduced error paths — e.g.
   `PATCH /contracts/:id/document-fields` with a `signature.*` field.
2. Observe the response's `errorCode` is `SYSTEM_UNEXPECTED_ERROR` instead of
   the specific code the throwing code passed.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 live QA):
several of this task's new error paths surfaced `SYSTEM_UNEXPECTED_ERROR` to
the client instead of their intended specific code.

## Evidence

- `services/api/src/common/errors/error-catalog.ts` — missing entries for the
  codes this task's streams introduced.
- `services/api/src/common/errors/task-0032-error-codes.spec.ts` — the
  regression spec added by this fix, which fails without the catalogue
  entries.

## Root Cause

Each stream introduced its own new `AppError` code at the point it needed one,
but none of the three streams' authors also updated the shared
`error-catalog.ts` — a classic "new code, no matching catalogue entry"
omission across independently developed work packages integrating into one
branch.

## Impact

A frontend consuming any of the affected endpoints could not distinguish a
specific, actionable failure (e.g. "this field is not editable") from a
generic server error, degrading the error experience for users hitting these
new code paths across MFA, platform authorization and agreements.

## Affected Areas

- `services/api/src/common/errors/error-catalog.ts`
- `services/api/src/modules/auth` (MFA and platform-authorization codes)
- `services/api/src/modules/contracts` (agreement guard codes)

## Proposed Resolution

Add every code this task introduced to `error-catalog.ts` with its own
message/description, and add a spec that fails when a code thrown anywhere in
this task's changed files is not registered. No ExecPlan needed — catalogue
entries only, no schema or contract change.

## Acceptance Criteria

- Every error code TASK-0032 introduced (MFA, platform authorization,
  agreements) is registered in `error-catalog.ts`.
- `HttpExceptionFilter` renders the specific `errorCode` for each, never the
  generic fallback.
- `task-0032-error-codes.spec.ts` fails if a future change reintroduces an
  uncatalogued code among the ones this task added.

## Regression Coverage

REG-624 (`services/api/src/common/errors/task-0032-error-codes.spec.ts`),
proven to fail against the pre-fix catalogue (the catalogue entries this spec
requires did not exist before the fix).

## Dependencies

None.

## Related Items

- [[BUG-3581]] — the signature-date fix that introduced
  `CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`, one of the codes this fix
  catalogues.
- Modules — [[auth]], [[contracts-and-agreements]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commits `e52a345c` (`fix(api): catalogue the error codes TASK-0032
introduced`) and `bbb61ab5` (`test(api): import isErrorCode from app-error in
the TASK-0032 catalogue spec`): every code this task introduced is now
registered in `error-catalog.ts`, and `task-0032-error-codes.spec.ts` pins the
full set.

## QA Retest

Verified by TASK-0032 WP-09 live QA re-run against the throwaway stack after
the fix — see `docs/tasks/TASK-0032-streams/QA-summary.md` ("Error codes
introduced by this task were uncatalogued …": Fixed `e52a345c`, `bbb61ab5`) —
and the passing `task-0032-error-codes.spec.ts`.

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA.
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `e52a345c`/
  `bbb61ab5` and verified by WP-09 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]], [[contracts-and-agreements]]
- Regression — REG-624 (see the regression register)

<!-- GRAPH:END -->
