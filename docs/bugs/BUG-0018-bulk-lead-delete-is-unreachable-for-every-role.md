---
ID: BUG-0018
aliases: [BUG-0018]
Title: Bulk lead delete is unreachable for every role, including SUPER_ADMIN
Status: PRODUCT_DECISION
Severity: LOW
Priority: P3
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/platform-auth, services/api/src/modules/super-admin]
OwnerAgent: backend-api
ArchitectDisposition: PRODUCT_DECISION
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
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

**The engineering half is already done, and the premise is stale.** Verified
2026-08-28 by reading `platform-permissions.ts` and running its spec.

This record says `resolvePlatformPermission` "has no `DELETE` mapping". It has
one: `actionFor` maps `DELETE` to `<domain>.update`, with a comment explaining
the choice — there is no `<domain>.delete` in the permission union and inventing
one would need a grant decision across sixteen roles, so it uses the closest
mutating permission that already exists and is already scoped per domain.

The second ask — "an exhaustiveness check so the next `DELETE` route is not dead
too" — also exists. `platform-permissions.spec.ts` enumerates the controller's
own route metadata rather than a hand-written list, asserts the verbs it reads
include `DELETE`, and asserts every route maps to a permission. 30 assertions,
all passing. That is precisely the check this record asks for, added after
BUG-0071 for the same reason.

**What remains is the first question, and it is the one this record leads with:
should bulk lead delete exist at all?** Deleting leads destroys commercial
attribution history — which partner referred whom, and when. That is a product
decision, not an engineering one, and it is why this is left `OPEN` under
`PRODUCT_DECISION` rather than closed.

The two answers lead to different work: keep it, and nothing more is needed;
remove it, and the route and its UI affordance should go rather than being left
reachable.

## QA Retest

Not applicable until the product question is answered.

If the answer is "keep it", the check is one request: `DELETE
/api/super-admin/leads` with a platform role holding `leads.update` should
succeed rather than 403. If the answer is "remove it", the check is that the
route no longer exists.

## History

- 2026-08-15 — found during the commercial onboarding E2E.
- 2026-08-15 — re-verified against `main` `ad8f77f`; deferred with a reason.
- 2026-08-28 - premise verified stale: the DELETE mapping and the exhaustiveness check both exist. Reclassified PRODUCT_DECISION - whether bulk lead delete should exist is unanswered.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-auth]], [[super-admin]]

<!-- GRAPH:END -->
