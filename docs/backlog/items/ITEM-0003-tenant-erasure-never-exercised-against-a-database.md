---
ID: ITEM-0003
aliases: [ITEM-0003]
Title: Tenant erasure has no cross-tenant survival assertion
Type: TEST_GAP
Status: TRIAGE_REQUIRED
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md
RelatedADR:
RelatedImplementation: docs/knowledge/implementations/2026-08-14-tenant-control-plane.md
TargetMilestone:
BlockedBy:
---

# ITEM-0003 — Tenant erasure has no cross-tenant survival assertion

> **Reduced in scope on 2026-08-15.** The original item — "erasure has never been
> exercised against a database" — was **resolved** by the tenant-erasure work
> merged as `3c759ce`, which added two DB-backed suites. What remains is the
> half those suites do not cover.

## Summary

Tenant erasure is now exercised against a real PostgreSQL:
`services/api/test/tenant-erasure-order.e2e-spec.ts` and
`tenant-erasure-dry-run.e2e-spec.ts`, both under `describeWithDatabase()`.

They prove the **delete order** is correct — including the
`Payslip → PayrollRunEmployee → PayrollRun → PayrollPeriod` cascade that made
every tenant holding a single payslip permanently un-erasable — and that the dry
run is non-destructive and repeatable.

They do **not** prove that erasing one tenant leaves another intact.

## Why It Matters

For an irreversible cross-tenant operation, the assertion that matters most is
not "the tenant is gone" but **"the other tenant is untouched"**. Erasure walks a
delete order across ~285 models; a single missing `tenantId` predicate in that
walk deletes a neighbour's rows, and no existing assertion would notice.

The current suites both operate on a single fixture tenant. One of them creates
a second tenant (`scratch.createTenant('blocked')`), but only to prove a
`RESTRICT` refusal — it never asserts that tenant's rows survive an erasure of
the first.

## Evidence

- `services/api/test/tenant-erasure-order.e2e-spec.ts:169-196` — asserts the
  erased tenant and its rows are gone; no surviving-neighbour assertion.
- `services/api/test/tenant-erasure-dry-run.e2e-spec.ts:82-108` — dry-run
  behaviour only.
- Original source: `docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md`,
  follow-up 1.

## Proposed Approach

Extend the existing DB-backed suite with the two-fixture-tenant shape of
`services/api/test/tenant-isolation-pattern.e2e-spec.ts`: seed two tenants with
comparable data, erase one, and assert the second is **complete**, model by
model, across the erasure plan.

The plan is already enumerated as `TENANT_ERASURE_DELETE_ORDER`, so the
assertion can be driven from it rather than hand-listed — which also means a
model added to the plan later is covered automatically.

## Acceptance Criteria

Erasing tenant A leaves tenant B's row count unchanged for **every** model named
in `TENANT_ERASURE_DELETE_ORDER`, `TENANT_ERASURE_DETACHED_MODELS` and
`TENANT_ERASURE_LINK_CLEANUPS`.

## Dependencies

None. The DB-backed harness, the fixtures and the CI ephemeral PostgreSQL all
exist now.

## Related Items

Module [[tenant-control-plane|Tenant Control Plane]] · architecture [[multi-tenancy|Multi-Tenancy]] ·
[[ITEM-0002]] · bug pattern [[tenant-filter-missing]].

## History

- 2026-08-14 — raised as follow-up 1 of the tenant-control-plane QA run.
- 2026-08-15 — imported as a durable backlog item.

- 2026-08-15 — reduced in scope: the DB-backed erasure suites merged as
  `3c759ce` resolved the original gap. What remains is the cross-tenant
  survival assertion.
