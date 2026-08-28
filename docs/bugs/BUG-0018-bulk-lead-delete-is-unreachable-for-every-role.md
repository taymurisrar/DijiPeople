---
ID: BUG-0018
aliases: [BUG-0018]
Title: Bulk lead delete is unreachable for every role, including SUPER_ADMIN
Status: FIXED
Severity: LOW
Priority: P3
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/platform-auth, services/api/src/modules/super-admin]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-298
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-0018 — Bulk lead delete is unreachable for every role, including SUPER_ADMIN

## Summary

`resolvePlatformPermission` maps `GET`, `POST`, `PATCH` and `PUT` to
`<domain>.read` / `.create` / `.update`, and has **no `DELETE` mapping**. The
permission resolves to nothing and `PlatformPermissionsGuard` throws, so
`DELETE /api/super-admin/leads` answers 403 for every role.

## Expected Behavior

Either the route works for a role that should hold it, or it does not exist.

## Actual Behavior

403 for every caller including `SUPER_ADMIN`. The route is dead.

## Reproduction

Scenario C5.03: `DELETE /api/super-admin/leads` as a platform super admin.

## Evidence

QA run BUG-08. Verified still present at `main` `ad8f77f`:
`services/api/src/modules/platform-auth/platform-permissions.ts:332-334` maps
GET / POST / PATCH / PUT and falls through for DELETE.

## Root Cause

A method-to-permission mapping with no exhaustiveness check. Any future `DELETE`
route on the platform surface will be dead in exactly the same way, silently.

## Impact

Functional and UX only. It **fails closed**, so this is not a security defect —
which is why it is LOW rather than the HIGH its "authorization" type might
suggest.

## Affected Areas

`services/api/src/modules/platform-auth` (the resolver, shared by the whole
platform surface), and `super-admin` lead bulk actions.

## Proposed Resolution

Decide first whether bulk lead delete should exist at all — deleting leads
destroys commercial attribution history. If it should, add a `DELETE` mapping
and an exhaustiveness check so the next `DELETE` route is not dead too. If it
should not, remove the route.

## Acceptance Criteria

Either the route is removed, or a role holding `<domain>.delete` succeeds and a
role without it gets 403, with a test that fails when a method has no mapping.

## Regression Coverage

**None.** `services/api/src/modules/platform-auth/platform-permissions.spec.ts`
exists and would be the place for it.

## Dependencies

None.

## Related Items

Bug pattern [[defined-but-unwired-permission]]. Modules [[leads|Leads]],
[[platform-admin|Platform Admin]]. Same declared-but-unwired shape as
[[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried]], on a smaller
surface.

## Resolution

Decided and implemented 2026-08-28. The repository owner answered the question
this record leads with: **bulk lead delete should not exist.**

A lead carries commercial attribution — which partner referred whom, and when.
That history outlives the lead's own usefulness, because it is what a commission
is calculated from and what a partner dispute is settled with. Converted leads
were already refused; the rest are now withdrawn rather than removed, which is
the stance this platform already takes on plans, promotions and invoices.

Removed from all three surfaces, because leaving any one of them would offer an
action another refuses:

- `DELETE /api/super-admin/leads` on `admin-leads.controller`
- the `leads` arm of `PlatformRuntimeService.bulkDelete`
- the console action, via the module capability

**Single-record delete is unaffected.** The capability gated both, so
`delete: false` would have removed one lead at a time along with the selection —
and that was not the decision. `RuntimeModuleCapabilities` now separates
`bulkDelete` from `delete`, defaulting to `delete` when unset so every other
module is unchanged. Leads set it `false` explicitly.

The wiring defect this record describes was fixed separately, before today:
`resolvePlatformPermission` has a `DELETE` mapping, and
`platform-permissions.spec.ts` enumerates the controller's own route metadata
and asserts every route resolves — which is exactly the exhaustiveness check
this record asks for.

Guarded by REG-298.

## QA Retest

Not retested in a browser. `bulk-delete-withdrawn.spec.ts` asserts the absence
on all three surfaces, and asserts single-record delete survives — that last one
matters most, because the obvious implementation would have removed it too.

The browser check: select several leads and confirm no bulk delete action is
offered; open one lead and confirm delete still is.

## History

- 2026-08-15 — found during the commercial onboarding E2E.
- 2026-08-15 — re-verified against `main` `ad8f77f`; deferred with a reason.
- 2026-08-28 - premise verified stale: the DELETE mapping and the exhaustiveness check both exist. Reclassified PRODUCT_DECISION - whether bulk lead delete should exist is unanswered.
- 2026-08-28 - owner decided bulk lead delete should not exist. Removed from the REST route, the runtime arm and the console; single delete kept by separating the capability. REG-298.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-auth]], [[super-admin]]
- Regression — REG-298 (see the regression register)

<!-- GRAPH:END -->
