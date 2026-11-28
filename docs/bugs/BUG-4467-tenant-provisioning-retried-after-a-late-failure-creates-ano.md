---
ID: BUG-4467
aliases: [BUG-4467]
Title: Tenant provisioning retried after a late failure creates another tenant for the same order
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-11-19
DetectedInSha: 6c780328
AffectedModules: []
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-695
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-19
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-20
---

# BUG-4467 — Tenant provisioning retried after a late failure creates another tenant for the same order

## Summary

ProvisioningRequestedHandler calls provisionTenantForCustomer, which creates the tenant, and only afterwards the handler records the tenant on the order. If anything between those two points throws, the order still has no tenantId, the outbox retries, and the retry provisions a second tenant ("provisioned as <slug>-1"), and a third.


One paragraph: what is wrong, for someone who has never seen this module.

## Expected Behavior

A retried provisioning request for an order reuses the tenant it already created, or the whole provisioning step is atomic.


What the system should do. State it before describing the failure.

## Actual Behavior

Each retry creates another tenant, owner invitation and activation email for the same order.


What it does instead.

## Reproduction

Run provisioning with TENANT_BASE_DOMAIN unset: hostname issuance throws TENANT_BASE_DOMAIN_NOT_CONFIGURED after the tenant exists; three attempts leave three tenants for one order (CI run 44629396014, Flow Q).


Numbered steps, with the exact request/state. A bug nobody can reproduce is a rumour.

## Evidence

CI browser-e2e log: PROVISIONING_REQUESTED RETRY_SCHEDULED attempt 3, lastError "No tenant base domain is configured..."; api.log shows "provisioned as qa-co-...-hp" then "-hp-1". The bootstrap warning says provisioning completes without a hostname, which contradicts the throw.


Paths with line numbers, request/response shapes, database rows, test output. **Never a credential, token or connection string.**

## Root Cause

The tenant-creation step and the order update are not one unit, and the retry guard (order.tenantId) is only set at the end.


Why it happens — not the symptom. Leave empty until it is actually established.

## Impact

Production sets TENANT_BASE_DOMAIN so the trigger is not reachable today, but any late exception (a failing welcome step, a database blip) can leave duplicate tenants for a paying customer.


Who is affected, how badly, and whether it is reachable in production.

## Affected Areas

services/api super-admin provisioning-requested.handler.ts, tenant-domains tenant-domain.service.ts.


Modules, endpoints, screens and consumers.

## Proposed Resolution

Record the tenant on the order as soon as it exists (or look up a tenant already created for the order before provisioning) and make the hostname step non-fatal as the bootstrap message promises; add a handler spec that throws after creation and asserts one tenant.


A direction, not a patch. Say if it needs an ExecPlan.

## Acceptance Criteria

A provisioning failure after tenant creation, retried, leaves exactly one tenant for the order and a finished order.


A provisioning failure after tenant creation, retried three times, leaves exactly one tenant for the order.


Verifiable statements QA can retest against.

## Regression Coverage

REG-695 — services/api/src/modules/super-admin/provisioning-requested.handler.spec.ts.


To be added with the fix (handler spec).


The test that must fail without the fix, and its `REG-nnn` entry once it exists.

## Dependencies

None.


Other records, decisions or infrastructure this waits on.

## Related Items

Flow Q in e2e/tests/flow-q-growth-bank-transfer-browser.spec.ts exposed it.


Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

provisionTenantForCustomer now takes subscriptionOrderId and points the order at the tenant inside the creating transaction; the handler, on a retry that finds order.tenantId, skips creation and runs the idempotent closing steps (finalize). The "retry path finds it" comment in platform-onboarding.service.ts is now true.


Open. CI now sets TENANT_BASE_DOMAIN so Flow Q tests the happy path.


What was actually changed, with the commit or branch. Filled at fix time.

Follow-up (2026-11-20, BUG-4484): failure-injection coverage exposed that the retry path was still incomplete. A retry that found order.tenantId ran only finalize(), so a failed owner invitation or a missing system hostname was never recovered (the retry reported PROCESSED with no invitation and no hostname). Provisioning is now split into createWorkspace (atomic, order linked in the same transaction) plus idempotent ensureOwnerInvitations (only when the account is INVITED and has no live invitation, so no duplicate email and never a second user) and ensureSystemDomain (skips an existing primary system domain), run by the handler on every attempt. The creating transaction also expired at Prisma default 5s under load (P2028) and is now given a 60s timeout.

## QA Retest

provisioning-requested.handler.spec.ts (2 cases); Flow Q in CI.


Not yet.


Which QA run verified the fix, and the scenario ids.

provisioning-requested.handler.spec.ts (9 cases), platform-onboarding.recovery.spec.ts (4), and the DB-backed services/api/test/provisioning-recovery.e2e-spec.ts (5): invitation step failing 3x, invitation created then throwing, hostname unconfigured 3x (TENANT_BASE_DOMAIN_NOT_CONFIGURED), markTenantReady failing 3x, recordOrderPayment failing 3x; each ends with one tenant, one subscription, one owner, one email, one hostname, order ACTIVATED, tenant READY. Covered by REG-696.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): provisioning-requested.handler.spec.ts 'links the order to the tenant it creates, in the creating call' and 'never creates a second tenant on a retry, and still finishes the order' assert the fix; passes.

## History

- 2026-11-19 — created from qa run at `6c780328`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-695 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
