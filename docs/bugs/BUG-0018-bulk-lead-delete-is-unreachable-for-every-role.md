---
ID: BUG-0018
aliases: [BUG-0018]
Title: Bulk lead delete is unreachable for every role, including SUPER_ADMIN
Status: VERIFIED
Severity: LOW
Priority: P3
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/platform-auth, services/api/src/modules/super-admin]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-298
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
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

## Reversal — 2026-08-28, later the same day

The decision above was reversed by the repository owner within hours of being
implemented, and the reversal is the durable part of this record.

**Bulk delete is generic across the admin console, and leads are not an
exception to it.** The trigger was a production error log: an operator selected
leads, pressed Delete, and got
`400 Bulk delete is not available for this module` — while deleting the same
leads one at a time worked. Asked whether to restore leads or leave them
withheld, the owner chose to restore, and to make the rule uniform rather than
per-module.

What was restored:

- `DELETE /api/super-admin/leads` on `admin-leads.controller`
- leads in the runtime's deletion path
- the console action, by removing the `bulkDelete` capability entirely so
  `delete` governs both

The attribution argument that justified the withdrawal was not refuted and is
not discarded. It is answered elsewhere: deletion is audited, the console
confirmation names the count and the records (BUG-1756's mechanism), and
converted leads are still refused individually by the service. What changed is
who decides, and they decided.

**The structural fix is the part worth keeping.** `remove` and `bulkDelete` were
two independent switch statements over the same modules, which is *why* they
could disagree — the withdrawal removed leads from one of them, and the console
still offered the action. There is now one method, `deleteRecords`, and
`generic-delete.spec.ts` asserts that every module answers identically through
both paths. A second list is what cannot exist.

Retention refusals are untouched: invoices, payments, commissions, executed
agreements, signature evidence, subscriptions, plans, templates, monitoring
incidents and tenants still refuse deletion in both directions, with the same
reason text.

**One authorization change, decided at the same time.** The two paths asked for
different things — module write for one record, a platform admin role for many.
They now require both. This narrows single-record delete for the presales roles,
which hold `leads.*` without being administrators: deleting a commercial record
is an administrative act at any quantity.

Guarded by REG-298 (rewritten) and QA-TENANT-050 (rewritten).

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/platform-runtime/generic-delete.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `generic-delete.spec.ts` drives both paths for all
seventeen runtime modules and asserts the answers are identical — including the
leads case that reached production as a 400, and including the eleven modules
that refuse deletion for retention.

Mutation-tested rather than assumed: reintroducing the leads exclusion fails two
of its assertions, and dropping the admin half of the authorization union fails
a third.

The browser check: select several leads and confirm the confirmation names the
count and the records, then confirm they are gone and no 400 reaches the error
log. On Invoices, confirm the bulk control still refuses with its retention
reason.

## History

- 2026-08-15 — found during the commercial onboarding E2E.
- 2026-08-15 — re-verified against `main` `ad8f77f`; deferred with a reason.
- 2026-08-28 - premise verified stale: the DELETE mapping and the exhaustiveness check both exist. Reclassified PRODUCT_DECISION - whether bulk lead delete should exist is unanswered.
- 2026-08-28 - owner decided bulk lead delete should not exist. Removed from the REST route, the runtime arm and the console; single delete kept by separating the capability. REG-298.
- 2026-08-28 - reversed by the owner the same day, after a production 400. Bulk delete restored for leads and made generic: one deletion method serves one record and many, so the two paths cannot drift again. Retention refusals unchanged. Deletion now requires module write AND platform admin.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/platform-runtime/generic-delete.spec.ts`

Proven by:

- `npm --workspace api run test` — 2016 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-auth]], [[super-admin]]
- Regression — REG-298 (see the regression register)

<!-- GRAPH:END -->
