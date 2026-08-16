---
ID: BUG-0024
aliases: [BUG-0024]
Title: The start-onboarding API endpoint and its proxy have no caller
Status: VERIFIED
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/admin, services/api/src/modules/super-admin]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0024 — The start-onboarding API endpoint and its proxy have no caller

## Summary

The admin `start-onboarding` record action navigates to
`/onboarding/new?customerId=…` and never issues a request. The proxy route and
the API endpoint it was built for are both unreachable.

## Expected Behavior

Either the action calls the endpoint that exists to serve it, or the endpoint and
its proxy are removed.

## Actual Behavior

Three artefacts, none connected:

- `apps/admin/lib/runtime/runtime-record-action-handler.ts:98` — `router.push`,
  no API call.
- `apps/admin/app/api/super-admin/customers/[customerId]/start-onboarding/route.ts`
  — a proxy nothing calls.
- `services/api/src/modules/super-admin/super-admin.controller.ts:177` —
  `POST customers/:customerAccountId/start-onboarding`, no caller.

## Reproduction

Trigger "Start onboarding" on a customer record and observe the network tab: a
client-side navigation only.

## Evidence

QA run, UI / UX section, rated LOW. Verified at `main` `ad8f77f` by the four
references above — the only occurrences of the string in either workspace.

## Root Cause

The flow was changed to a navigation-first form (`/onboarding/new`) without
retiring the endpoint built for the direct-action form. Nothing detects an API
route with no consumer.

## Impact

Dead code in three places, and a reader of the API surface would reasonably
conclude the action posts. No user-facing failure — the navigation works, and
onboarding is created by `convertLeadToCustomer` in the primary journey
([[BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable]]).

## Affected Areas

`apps/admin` runtime record actions and API proxies;
`services/api/src/modules/super-admin`.

## Proposed Resolution

Establish which form is intended. If `/onboarding/new` is the product's answer,
remove the endpoint and the proxy. If the direct action is intended, wire the
handler to it. Either way, one of the three should go.

## Acceptance Criteria

No unreferenced `start-onboarding` route remains in either workspace.

## Regression Coverage

**None.** A repo-wide check that every `app/api/**` proxy has a caller would
catch this class — noted alongside [[ITEM-0012]], which proposes the same kind
of route/consumer cross-check for HTTP methods.

## Dependencies

None.

## Related Items

Modules [[customer-onboarding|Customer Onboarding]], [[customers|Customers]], [[platform-admin|Platform Admin]].

## Resolution

Fixed by removing the unreachable path, which is what this record's proposed
resolution called for: `/onboarding/new` is the product's answer, so the
endpoint built for the abandoned direct-action form goes.

Removed:

- `apps/admin/app/api/super-admin/customers/[customerId]/start-onboarding/route.ts`
- `POST customers/:customerAccountId/start-onboarding` in `super-admin.controller.ts`
- `SuperAdminService.startCustomerOnboarding`

Kept, deliberately: `PlatformLifecycleService.createOnboardingFromCustomer`. It
is **not** dead — `createCustomerOnboarding` calls it, and that is the working
`/onboarding/new` path. Removing it because its other caller went would have
broken the journey this record says is the intended one.

Also kept: the `start-onboarding` record action and its `router.push`. The
navigation works and is the intended flow; the action was never the problem.

## QA Retest

Verified against the repository at the merged SHA, one check per artefact this
record named:

- `grep -rn "start-onboarding|startCustomerOnboarding" services/api/src` → **0
  matches**. The controller route and the service wrapper are gone.
- `apps/admin/app/api/super-admin/customers/[customerId]/start-onboarding/` → the
  directory no longer exists.
- The only remaining references are the intended ones: the record action in
  `platform-module-registry.ts` and its `router.push` in
  `runtime-record-action-handler.ts`. (`apps/web`'s `StartOnboardingButton` is a
  different recruitment feature and was never part of this record.)

That satisfies the acceptance criterion — *no unreferenced `start-onboarding`
route remains in either workspace*.

**No automated guard, deliberately.** A permanent test asserting the absence of a
specific deleted symbol would pin a decision rather than a behaviour, and would
need deleting the day the endpoint is legitimately reintroduced. The general
failure mode — a surface nothing reaches — is covered by REG-028, which
checks that every runtime module's route renders that module.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN.

- 2026-08-15 — Architect triage: FIX_NOW. The product question the record poses is already answered by the code: `convertLeadToCustomer` creates the onboarding in the primary journey and the record action navigates to `/onboarding/new`, so the navigation-first form is what the product does. The direct-action endpoint and its proxy are dead and should be removed. Small, and it removes an API surface a reader would reasonably assume is live.
- 2026-08-16 — resolved by deletion. Confirmed first that the underlying
  lifecycle method has a live second caller, so only the unreachable wrapper
  chain was removed.
- 2026-08-16 — verified: every artefact named in the record is gone, and the
  intended navigation path is intact.
