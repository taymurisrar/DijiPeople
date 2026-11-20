---
ID: BUG-4484
aliases: [BUG-4484]
Title: Self-service provisioning writes no TenantProvisioningRun, so Operations never shows it
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-11-20
DetectedInSha: 5c901a0a
AffectedModules: [services/api/src/modules/super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-696
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-20
UpdatedAt: 2026-11-20
ResolvedAt: 2026-11-20
---

# BUG-4484 — Self-service provisioning writes no TenantProvisioningRun, so Operations never shows it

## Summary

Tenants created by self-service provisioning (bank-transfer, Stripe and Safepay orders, via the outbox PROVISIONING_REQUESTED event) write no TenantProvisioningRun and no step rows. Platform Admin -> Operations -> Provisioning reads only that table, so a paid customer whose workspace is half-built (or just slow) is invisible: no status, no retry count, no failure message, no audit trail. A second defect found while closing BUG-4467's coverage gap: a retry that finds order.tenantId skipped the owner invitation and the hostname entirely, so those steps were never recovered.

## Expected Behavior

Every self-service provisioning shows in the Operations queue as one run keyed on the order, with step records, an attempt count, the failing step and message on failure, and an audit entry per lifecycle transition. A retried event updates the same run. A retry after a late failure finishes the invitation and hostname exactly once.

## Actual Behavior

The queue (provisioning-operations.service.ts listQueue) shows nothing for these tenants. The run columns subscriptionOrderId and customerAccountId exist and the queue already selects them, but nothing writes them. On a retry the handler ran only finalize(), so an owner whose invitation call failed never received one and a missing hostname was never issued.

## Reproduction

1. Complete a bank-transfer or Safepay order so PROVISIONING_REQUESTED is emitted.
2. Let the handler provision the tenant.
3. Query "TenantProvisioningRun" where subscriptionOrderId = the order: zero rows. Open /operations/provisioning in the admin app: the tenant is absent.
4. Make issueInvitation or provisionSystemDomain throw after the tenant exists, retry: the retry returns PROCESSED with no invitation / hostname.

## Evidence

- services/api/src/modules/super-admin/provisioning-requested.handler.ts (before): handle() called provisionTenantForCustomer then finalize(); no run, no audit; the existing-tenant branch called finalize() only.
- Only writers of tenantProvisioningRun.create: platform-lifecycle.service.ts:1798 and tenant-operations.service.ts:389 (operator paths); tenant-provisioning-run.service.ts start() could not accept subscriptionOrderId/customerAccountId.
- provisioning-operations.service.ts:200-310 listQueue selects subscriptionOrderId and customerAccount (populated by nothing).
- platform-onboarding.service.ts (before): invitations and domain issued only inside provisionTenantForCustomer, after the transaction.
- Also observed in the DB-backed run: the creating transaction expired at Prisma's default 5s (P2028) under load.

## Root Cause

The self-service handler was added as a consumer of the shared engine without the run bookkeeping the operator path has, and its idempotency guard (order.tenantId) jumped straight to the closing steps, leaving the two non-transactional steps (invitation, hostname) reachable only on the first attempt.

## Impact

Operators cannot see, triage or audit self-service provisioning, the only provisioning path customers use. A transient failure after tenant creation left a paid customer with no activation email or hostname and nothing on any screen. MEDIUM: no data loss or isolation leak.

## Affected Areas

services/api super-admin (provisioning-requested.handler, platform-onboarding.service), tenant-control-plane (tenant-provisioning-run.service, provisioning queue read path), Platform Admin Operations -> Provisioning.

## Proposed Resolution

Open or resume one run per order once the tenant exists; record steps; audit transitions; split provisioning into createWorkspace (atomic) plus idempotent ensureSystemDomain / ensureOwnerInvitations that the handler runs on every attempt. No schema change.

## Acceptance Criteria

- A self-service order produces exactly one TenantProvisioningRun (subscriptionOrderId set, requestedById null) that reaches SUCCEEDED, with every step SUCCEEDED or SKIPPED, and appears in listQueue.
- A throwing step marks the run FAILED with failedStepKey and message, audits TENANT_PROVISIONING_FAILED, and the error is rethrown.
- Three failures then success leave one run with attempt 4, one tenant, one subscription, one owner, one invitation, one email, one primary hostname, order ACTIVATED, tenant READY.

## Regression Coverage

REG-696 — specs: services/api/src/modules/super-admin/provisioning-requested.handler.spec.ts, platform-onboarding.recovery.spec.ts, services/api/test/provisioning-recovery.e2e-spec.ts.

## Dependencies

Composes with BUG-4467 (order.tenantId linked atomically); no migration.

## Related Items

[[BUG-4467]]; scenario QA-GROWTH-002.

## Resolution

Handler now opens/resumes a run keyed on the order (TenantProvisioningRunService.startOrResumeForOrder: reuses the row, attempt + 1, failed steps back to PENDING), records steps (the four atomic steps succeed together, customization-defaults SKIPPED, then workspace-domain, invitations, and workspace-routing-verified wrapping activation/readiness), finishes the run, and audits TENANT_PROVISIONING_STARTED / RESUMED / SUCCEEDED / FAILED to the platform log with a null actor. Failures are recorded and rethrown. PlatformOnboardingService is split into createWorkspace, ensureOwnerInvitations (only when the account is INVITED and has no live invitation) and ensureSystemDomain (skips an existing primary system domain); the creating transaction timeout is raised to 60s. Failures before the tenant exists leave no run (a run needs a tenant) and stay visible in the outbox only.

## QA Retest

provisioning-requested.handler.spec.ts (9), platform-onboarding.recovery.spec.ts (4), provisioning-recovery.e2e-spec.ts (5, DB-backed). Scenario QA-GROWTH-002.

## History

- 2026-11-20 — fixed on branch `agent/growth-closure-records`; run lifecycle, idempotent recovery steps, specs.
- 2026-11-20 — created from qa run at `5c901a0a`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]]
- Regression — REG-696 (see the regression register)

<!-- GRAPH:END -->
