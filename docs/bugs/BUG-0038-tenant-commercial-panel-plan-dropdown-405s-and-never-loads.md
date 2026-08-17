---
ID: BUG-0038
aliases: [BUG-0038]
Title: Tenant commercial panel plan dropdown 405s and never loads
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: CI
DetectedDate: 2026-08-16
DetectedInSha: da72203
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-033
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0038 — Tenant commercial panel plan dropdown 405s and never loads

## Summary

`apps/admin/app/_components/tenants/tenant-commercial-panel.tsx:442` fetches
`/api/super-admin/plans` with no method — so `GET` — and that route exported
only `POST`. Next answered **405**, the panel's own error handler turned it into
"Unable to load plans", and the plan dropdown never populated.

## Expected Behavior

Opening the commercial panel for a tenant lists the plans available to assign.

## Actual Behavior

The dropdown is permanently empty and shows a generic failure. Nothing about the
message suggests a method mismatch, so it reads as a backend outage.

## Reproduction

1. Open a tenant in the admin console and expand the commercial panel.
2. Observe the network call to `/api/super-admin/plans` returning 405.
3. Observe "Unable to load plans" and an empty dropdown.

## Evidence

- Caller: `tenant-commercial-panel.tsx:442` — `fetch("/api/super-admin/plans")`,
  no `method`, so the browser sends `GET`.
- Route: `apps/admin/app/api/super-admin/plans/route.ts` — exported `POST`
  only.
- The API endpoint the panel needs, `GET /super-admin/plans`
  (`super-admin.controller.ts:510`), **existed the whole time**. Only the proxy
  was missing the half that reaches it.

## Root Cause

Exactly [[BUG-0008]]: each side individually correct, the pair wrong, and nothing
looking at pairs. The route legitimately served a create; the panel legitimately
wanted a list; no tool compared them.

## Impact

An operator cannot assign or change a plan from the tenant commercial panel. It
is not a data-integrity problem, but it is a primary admin journey that has been
silently unavailable.

## Affected Areas

`apps/admin/app/_components/tenants/tenant-commercial-panel.tsx` and
`apps/admin/app/api/super-admin/plans/route.ts`.

## Proposed Resolution

`GET` added to the proxy, forwarding to the API's existing list endpoint.

**Found by the check written for the previous instance.**
`scripts/check-route-method-callers.mjs` was built to close [[ITEM-0012]] —
raised after BUG-0008 — and reported this on its first run, before it was known
to exist. That is the check doing the job the item asked for.

## Acceptance Criteria

- The admin proxy exports the method its plan-list caller sends.
- Opening the tenant commercial panel can reach the existing API list endpoint.
- The route-method caller check reports no mismatch for this pair.

## Regression Coverage

`REG-033` and `npm run check:route-method-callers`.

## Dependencies

None.

## Related Items

[[BUG-0008]] — the first instance, on the admin logout route.
[[ITEM-0012]] — the cross-check, built because of it, which found this one.

## Resolution

The proxy now exports `GET` and forwards to the API's existing list endpoint.

## QA Retest

`npm run check:route-method-callers` — **72 caller/route pairs agree on
method**, was 1 offender.

Verified to fail: the check reported this exact file, line and mismatch before
the `GET` handler was added, naming both the method sent and the methods
exported. Admin typecheck clean.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-17 — found by `check-route-method-callers` on its first run while
  closing ITEM-0012, fixed and verified in the same change.
