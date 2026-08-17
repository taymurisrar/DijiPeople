---
ID: ITEM-0035
aliases: [ITEM-0035]
Title: Web route handlers flatten upstream error status to 500
Type: TECH_DEBT
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0041
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0035 — Web route handlers flatten upstream error status to 500

## Summary

**125 of 416** route handlers hardcode `{ status: 500 }` in their `catch`,
collapsing every upstream failure — 400, 403, 404, 409, 422, 429, 503 — into a
generic server error, and discarding the `errorCode` and `traceId` the API's
error contract carries.

## Why It Matters

`apps/web/AGENTS.md` requires handlers to "Forward the API's error contract
through rather than flattening it", and root `AGENTS.md` describes that contract
(`success`, `traceId`, `statusCode`, `errorCode`, `message`, `fieldErrors`,
`support`) as the reason `HttpExceptionFilter` exists.

Three concrete costs:

- **A validation failure looks like an outage.** A 422 with `fieldErrors` becomes
  a 500 with a string, so the form cannot highlight the offending field.
- **A 403 becomes a 500**, so the UI shows "something went wrong" instead of the
  access-denied state that already exists (`module-access-denied-state.tsx`).
- **`traceId` is dropped**, so a user-reported error cannot be correlated with
  the API's error log — the one mechanism the platform has for that.

`proxyApiJsonResponse` does the right thing; the defect is in the `catch` blocks
around it.

## Evidence

Verified at `1af3690`: 125 files under `apps/web/app/api/**` contain a literal
`status: 500`. Only **8 sites across 6 files** do it correctly with
`isApiRequestError(error) ? error.status : 500` — e.g.
`app/api/designations/route.ts:35`, `app/api/employment-types/[id]/route.ts:38,59`,
`app/api/_lib/bulk-delete.ts:45`. The best example in the repository is
`app/api/lookups/dashboard-views/route.ts:44-53`.

`lib/server-api.ts` already exports everything needed — `ApiRequestError`
(`:51`), `isApiRequestError` (`:505`) — so this is adoption, not new capability.

## Proposed Approach

No ExecPlan needed; it is mechanical and the correct pattern is already in-tree.

Extract the pattern into a shared helper in `app/api/_lib/` (where
`bulk-delete.ts` already lives and already does it right), then migrate. A
codemod is reasonable here given 125 near-identical call sites.

Then add a check in the style of the four existing `scripts/check-*.mjs`: fail
if a file under `app/api/**` contains a literal `status: 500` without an
`isApiRequestError` guard in the same block.

## Acceptance Criteria

- A handler forwards the upstream status, `errorCode` and `traceId`.
- A 422 from the API reaches the browser as a 422 with its `fieldErrors`.
- A check fails on a newly added hardcoded 500.

## Dependencies

None. Independent of
[[BUG-0041-web-route-proxies-make-authorization-and-business-decisions]], though
both touch the same layer and could share one sweep.

## Related Items

[[BUG-0041-web-route-proxies-make-authorization-and-business-decisions]] ·
[[web-architecture]] · [[api-architecture]] · [[ITEM-0012]] ·
bug pattern [[silent-config-fallback]].

## History

- 2026-08-17 — raised by the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW`. Mechanical, the correct pattern
  already exists in six files, and it currently defeats the platform's own error
  contract on 30% of the app's request surface.
