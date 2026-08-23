---
ID: BUG-0902
aliases: [BUG-0902]
Title: markTenantReady has no caller, so a paid workspace is never marked ready and its URL is never shown
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-237
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt: 2026-08-23
---

# BUG-0902 — markTenantReady has no caller, so a paid workspace is never marked ready and its URL is never shown

## Summary

`OrderActivationService.markTenantReady` sets `Tenant.readinessStatus` to
`READY` and stamps `readyAt`. It is defined once and **called from nowhere in
the repository**. `getOnboardingStatus` derives both the final "Finishing setup"
step and the workspace link from that field, so every tenant ever provisioned
stayed `NOT_READY`: the buyer's success page sat on "Finishing setup — pending"
indefinitely and was never given the address of the workspace they had just paid
for.

The provisioning handler's own comment states the intent that was never
implemented — *"ACTIVE, not ONBOARDING: this workspace is paid for, and the
customer is about to be told it is ready."*

## Expected Behavior

Once provisioning has built the workspace, the tenant is marked ready, the
progress page completes, and the buyer is shown the hostname they can sign in
at.

## Actual Behavior

`Tenant.status` reached `ACTIVE` and a primary `TenantDomain` was created, but
`readinessStatus` remained `NOT_READY`. `GET /api/public/onboarding/:id/status`
therefore returned `state: PROVISIONING` forever, with
`workspace-ready = PENDING` and `workspace: null`.

## Reproduction

1. Complete a self-service checkout and pay (needs [[BUG-0898]], [[BUG-0904]]
   and [[BUG-0900]] resolved to get this far).
2. Wait for `workspace-created = DONE`.
3. Poll `GET /api/public/onboarding/:id/status`. It never leaves
   `PROVISIONING`; `workspace` stays `null`.
4. `select slug, status, "readinessStatus" from "Tenant"` — `ACTIVE` /
   `NOT_READY`.

## Evidence

Two tenants provisioned successfully in this run, both stuck:

```
slug            | status | readinessStatus
qa-qamt5jeqw6   | ACTIVE | NOT_READY
qa-qamt55r4cb   | ACTIVE | NOT_READY
```

The primary domain existed all along, so readiness was the only thing missing:

```
tenantId … | domain                  | type             | isPrimary
…          | qa-qamt5jeqw6.localhost | SYSTEM_SUBDOMAIN | true
```

The gate, at `subscription-order.service.ts:848`:

```ts
const tenantReady =
  order.tenant?.status === 'ACTIVE' &&
  order.tenant.readinessStatus !== 'NOT_READY';
```

and the search that establishes the defect:

```
$ grep -rn "markTenantReady" --include=*.ts .
./services/api/src/modules/billing/services/order-activation.service.ts:225:  async markTenantReady(input: {
```

One definition. No call sites.

## Root Cause

An unwired consumer — the same shape as the missing `PROVISIONING_REQUESTED`
subscriber documented at the top of `provisioning-requested.handler.ts`. The
service was written, was correct, and was never connected to the flow that
needed it. `OrderActivationService` was additionally not exported from
`BillingModule`, so `super-admin` could not have injected it even if it had
tried.

## Impact

Every self-service buyer. The purchase succeeds, the workspace exists and is
reachable, and the customer is never told — the page they are watching cannot
finish and hands back no link. Support-visible on the first real sale.

## Affected Areas

- `services/api/src/modules/billing/services/order-activation.service.ts`
- `services/api/src/modules/billing/billing.module.ts` (exports)
- `services/api/src/modules/super-admin/provisioning-requested.handler.ts`
- `apps/landing/app/subscribe/success/provisioning-progress.tsx` (the surface)

## Proposed Resolution

Export `OrderActivationService` from `BillingModule` and call `markTenantReady`
at the end of `ProvisioningRequestedHandler.handle`, after its own transaction —
the call is idempotent and opens its own transaction. `SuperAdminModule` already
imports `BillingModule`, and `BillingModule` does not import `super-admin`, so
there is no cycle.

## Acceptance Criteria

- After a completed purchase, `Tenant.readinessStatus` becomes `READY`.
- `GET /api/public/onboarding/:id/status` reports `state: READY` with all four
  steps `DONE`.
- The response carries a `workspace` object with `name`, `hostname` and `url`.

## Regression Coverage

The durable check is the public onboarding status reaching `READY` with a
workspace payload; asserted by the browser journey in this run. A unit test over
`getOnboardingStatus` would not have caught it, because that function was
already correct — the missing piece was a call site.

## Dependencies

Only observable after [[BUG-0900]] lets provisioning finish at all.

## Related Items

[[BUG-0898]], [[BUG-0900]], [[BUG-0904]]

## Resolution

Fixed on `agent/landing-e2e-go-live`:

- `billing.module.ts` — exports `OrderActivationService`.
- `provisioning-requested.handler.ts` — injects it and calls `markTenantReady`
  after the provisioning transaction.

Verified end to end: status returned
`state: READY`, all four steps `DONE`, and
`workspace: { hostname: "qa-qamt5ju23z.localhost", url: "https://qa-qamt5ju23z.localhost" }`.
Full API suite: 211 suites / 1681 tests pass.

## QA Retest

Verified by driving the browser checkout (`e2e/drive-checkout.mjs`) and polling
the public onboarding status to `READY`.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-23 — fixed and verified end to end.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]]
- Regression — REG-237 (see the regression register)

<!-- GRAPH:END -->
