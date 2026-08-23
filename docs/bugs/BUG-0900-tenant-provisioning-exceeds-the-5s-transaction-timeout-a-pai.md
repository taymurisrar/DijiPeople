---
ID: BUG-0900
aliases: [BUG-0900]
Title: Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/permissions]
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

# BUG-0900 — Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace

## Summary

`PermissionBootstrapService.bootstrapTenantRbac` wrote a tenant's role
privileges with one `upsert` per row, sequentially, inside the caller's
interactive transaction. A tenant's system roles carry **6,345** privilege rows,
and Prisma's default interactive transaction timeout is **five seconds**.
Self-service provisioning therefore failed with `A query cannot be executed on an
expired transaction … 5001 ms passed since the start of the transaction` — after
the customer's card had already been charged. The outbox retried eight times,
marked `PROVISIONING_REQUESTED` as `FAILED`, and stopped. The buyer had paid and
had no workspace, and nothing would ever create one.

It succeeded only when the machine happened to be fast enough, which is why it
has looked healthy.

## Expected Behavior

A confirmed payment provisions a workspace. If provisioning cannot complete it
retries and eventually raises an operator-visible failure — it does not fail on
a timer that depends on machine speed.

## Actual Behavior

`PROVISIONING_REQUESTED` failed on a transaction timeout, retried to
`attemptCount = 8`, then settled at `status = FAILED`. The order stayed `PAID`
with `tenantId = null`. On a faster pass the identical code succeeded, so the
failure is timing-dependent, not deterministic.

## Reproduction

1. Bring up an API with `OUTBOX_WORKER_ENABLED=true` — see [[BUG-0904]].
2. Complete a self-service checkout through the browser and pay with the Stripe
   test card.
3. Watch `GET /api/public/onboarding/:id/status`. It reaches
   `PAYMENT_CONFIRMED` with `workspace-created = PENDING` and stays there.
4. Read the outbox:
   `select "eventType", status, "attemptCount", "lastError" from "OutboxEvent" order by "createdAt" desc`.

## Evidence

Outbox row after the failure:

```
eventType               | status | attemptCount
PROVISIONING_REQUESTED  | FAILED | 8
```

`lastError`:

```
billing.provisioning-requested.provision-tenant:
Invalid `db.rolePrivilege.upsert()` invocation in
  services/api/src/modules/permissions/permission-bootstrap.service.ts:194:30
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 5000 ms, however 5001 ms passed since the
start of the transaction. Consider increasing the interactive transaction
timeout or doing less work in the transaction.
```

The scale, counted on a successfully provisioned tenant:

```
roles: 9    rolePermission rows: 705    rolePrivilege rows: 6345
```

The loop, before the fix, at `permission-bootstrap.service.ts:193`:

```ts
for (const assignment of rolePrivilegeAssignments) {
  await db.rolePrivilege.upsert({ /* … */ });
}
```

The `rolePermission` block immediately above it already used a single
`createMany({ skipDuplicates: true })`.

## Root Cause

6,345 sequential round trips inside a five-second interactive transaction. The
work is inherently bulk and was written row-at-a-time; the sibling block for
role *permissions* had already been written as one statement, so the two halves
of the same bootstrap disagreed about how to write a large set.

Nothing bounded the growth either: the row count scales with
`SYSTEM_ROLE_PRIVILEGES` × the number of system roles, so it gets slower with
every entity added to the matrix.

## Impact

The most expensive failure the platform can have: money taken, nothing
delivered, and no automatic recovery once the event is `FAILED`. Every
self-service purchase was exposed to it, with the outcome decided by how loaded
the machine was at that moment. Reachable in production as soon as checkout and
the outbox worker are both on.

## Affected Areas

- `services/api/src/modules/permissions/permission-bootstrap.service.ts`
- `ProvisioningRequestedHandler` and every other `bootstrapTenantRbac` caller
  (`auth.service.ts` on login, `permissions.service.ts` on demand).

## Proposed Resolution

Write the set as a set: one `createMany({ skipDuplicates: true })` for the
inserts, then reconcile access-level drift with a small number of grouped
`updateMany` calls rather than 6,345 upserts. On a new tenant every row is an
insert and no update runs at all.

## Acceptance Criteria

- Provisioning a tenant completes inside the caller's transaction budget.
- `PROVISIONING_REQUESTED` reaches `PROCESSED`.
- Re-running `bootstrapTenantRbac` on an existing tenant still reconciles
  `accessLevel` drift against `SYSTEM_ROLE_PRIVILEGES`.

## Regression Coverage

Covered indirectly by `services/api/src/modules/permissions/` (15 tests pass
unchanged). A timing-dependent failure is poorly served by a unit test; the
durable check is the browser journey reaching `state: READY`, which is what
verified the fix here.

## Dependencies

Only observable once [[BUG-0904]] (outbox worker off in production) and
[[BUG-0898]] (no sellable price) are resolved, because without them provisioning
is never requested at all.

## Related Items

[[BUG-0898]], [[BUG-0902]], [[BUG-0904]]

## Resolution

Fixed on `agent/landing-e2e-go-live` in `permission-bootstrap.service.ts`: the
per-row upsert loop is replaced by one `createMany` plus grouped `updateMany`
calls keyed on `(roleId, privilege, accessLevel)`.

Verified end to end: `PROVISIONING_REQUESTED` reached `PROCESSED`, tenant
`qa-qamt5jeqw6` was created `ACTIVE`, and the order linked to it. Full API
suite: 211 suites / 1681 tests pass.

## QA Retest

Verified by driving the browser checkout (`e2e/drive-checkout.mjs`) and polling
the public onboarding status to `workspace-created = DONE`.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-23 — fixed and verified end to end.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-237 (see the regression register)

<!-- GRAPH:END -->
