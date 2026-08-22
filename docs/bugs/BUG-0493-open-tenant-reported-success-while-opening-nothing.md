---
ID: BUG-0493
aliases: [BUG-0493]
Title: Open Tenant reported success while opening nothing
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 098a0e6
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-196
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-commands-monitoring-bulk-delete
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0493 — Open Tenant reported success while opening nothing

## Summary

"Open Tenant" showed the toast "Tenant workspace opened." and opened nothing.
It called `window.open(url, "_blank", "noopener,noreferrer")` and reported
success without looking at the result.

## Expected Behavior

The workspace opens, or the operator is told it did not and why.

## Actual Behavior

Passing **any** features string makes Chrome treat the call as a request for a
popup *window* rather than a tab, and popups are blocked far more readily. The
return value — `null` when blocked — was discarded, and success was reported
unconditionally.

## Reproduction

1. Open a tenant record and press **Open Tenant**.
2. With default pop-up settings, no tab opens.
3. The status line reads "Tenant workspace opened."

## Evidence

- `apps/admin/app/_components/tenants/use-tenant-record-actions.tsx` — the call
  and the unconditional `success: true`.
- `apps/admin/app/_components/runtime/runtime-module-list.tsx` — the same call
  from the list action.

## Root Cause

Two mistakes that only matter together: a features string that turns a tab into
a popup, and a success message asserted rather than observed. Either alone is
survivable; together they produce a control that silently does nothing and says
it worked.

This is the fourth defect of this shape in this codebase — a badge counting
nothing, a retry reporting SUCCEEDED while skipping a step, a preference stored
and never applied, a theme repainting nothing. The common factor is a claim
about an outcome the code never checked.

## Impact

Every operator following a customer into their workspace, which is the primary
action on the tenant record.

## Affected Areas

`apps/admin` — the tenant record and list actions.

## Proposed Resolution

`openExternal(url, what)`: no features string, sever `opener` on the handle, and
report the result. A blocked open returns a message naming the browser's
decision and carrying the URL so the operator can reach it anyway. A tenant with
no slug is refused before any of that, because opening the fallback would land
on the admin app's own login and call it the workspace.

## Acceptance Criteria

- A successful open reports success; a blocked one reports the block and the URL.
- No `window.open` in the console passes a features string.
- A tenant with no slug refuses with a reason.

## Regression Coverage

REG-196 — `apps/admin/lib/open-external.spec.ts`.

## Dependencies

Depends on [[BUG-0492]]: the URL had to be right before opening it could be.

## Related Items

[[BUG-0314]], [[BUG-0422]] — the same claim-without-a-check shape.

## Resolution

Fixed on `agent/tenant-commands-monitoring-bulk-delete`.

## QA Retest

Not opened in a browser; the popup-blocked path in particular is unobserved.

## History

- 2026-08-22 — reported as "'Open Tenant' button still doesnt do anything".
