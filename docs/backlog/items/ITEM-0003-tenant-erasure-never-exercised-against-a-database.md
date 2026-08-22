---
ID: ITEM-0003
aliases: [ITEM-0003]
Title: Tenant erasure has no cross-tenant survival assertion
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-22
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

## Resolution — 2026-08-22, SESSION-0040

Closed by `services/api/test/tenant-erasure-survival.e2e-spec.ts` — five tests,
DB-backed, registered as [[REG-220]].

Two tenants are seeded with the same shape of data and one is erased through the
production sequence. The neighbour is then probed across all three collections
the acceptance criteria name:

| Collection | What is asserted |
|---|---|
| `TENANT_ERASURE_DELETE_ORDER` (242 models) | every row count unchanged |
| `TENANT_ERASURE_DETACHED_MODELS` | the model still present **and each cleared field still populated** |
| `TENANT_ERASURE_LINK_CLEANUPS` | the relation-scoped link row survives |

**Detachment is not deletion**, which is why the detached models are probed per
cleared field rather than per row count. Erasure nulls `Contract.subscriptionId`
and its siblings twice — once by `tenantId`, then again along the relation,
`{ subscription: { tenantId } }`. The second clear is the one that could reach a
neighbour's row while leaving the row itself present, so a count would report
"still there" while the record had been quietly gutted. These are contracts,
orders, refunds and support history belonging to a **different paying customer**.

The full commercial chain is therefore seeded, not stubbed: subscription,
invoice, contract, support case, onboarding, order, refund, and the
`SupportCaseIncident` that joins a retained case to an erased error log. An
unseeded probe compares zero to zero and passes without asserting anything —
the same defect class this item was raised about.

### Proven to fail

Two mutation probes, each naming the exact loss:

- dropping the `tenantId` predicate for one model in the delete loop →
  `delete:employee: 1 → 0`
- dropping the tenant scope from the relation-scoped detach and the link
  cleanup → `detached:contract.subscriptionId`,
  `detached:supportCase.subscriptionId`, `detached:supportCase.invoiceId`,
  `detached:subscriptionOrder.subscriptionId` and `link:supportCaseIncident`,
  all `1 → 0`

### Two tests guard the guard

The seed asserts every probe group is actually populated, and a final test
asserts the probe count equals the plan size. Neither an empty collection nor an
empty seed can make the survival assertion vacuously true — which matters more
here than usual, because "an assertion that cannot fail" is exactly what this
item was reporting.

### Incidental fix

`DbFixtures.tryDelete` now treats `P2025` as cleanup succeeding. A suite that
legitimately removes its own fixture — tenant erasure being the obvious one —
otherwise ended every run warning that the row was "left behind", which is the
opposite of what happened.

### Verification

```
npx jest --config ./test/jest-e2e.json --runTestsByPath   test/tenant-erasure-survival.e2e-spec.ts   test/tenant-erasure-order.e2e-spec.ts   test/tenant-erasure-dry-run.e2e-spec.ts
→ 3 suites, 12 tests, all passing
```

Against a throwaway PostgreSQL migrated from `schema.prisma`. The populated
development database was not touched.

## History

- 2026-08-14 — raised as follow-up 1 of the tenant-control-plane QA run.
- 2026-08-15 — imported as a durable backlog item.

- 2026-08-15 — reduced in scope: the DB-backed erasure suites merged as
  `3c759ce` resolved the original gap. What remains is the cross-tenant
  survival assertion.

- 2026-08-15 — Architect triage: FIX_NOW. Bounded, no dependencies, and the assertion can be driven from `TENANT_ERASURE_DELETE_ORDER` so a model added later is covered automatically. For an irreversible cross-tenant operation this is the assertion that matters most.

- 2026-08-22 — resolved in SESSION-0040. Cross-tenant survival assertion added as `tenant-erasure-survival.e2e-spec.ts`, driven from all three erasure collections and registered as REG-220.
