---
ID: ITEM-0003
aliases: [ITEM-0003]
Title: Tenant erasure has never been exercised against a database
Type: TEST_GAP
Status: TRIAGE_REQUIRED
Priority: P1
Severity: HIGH
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

# ITEM-0003 — Tenant erasure has never been exercised against a database

## Summary

Tenant erasure is the most destructive operation in the platform control plane
and has **unit tests only**. It has never been run against a real database, in
any form.

## Why It Matters

An irreversible operation verified by mocked Prisma is verified against whatever
the mock was told to return. A mock can "prove" a cascade that the schema does
not have, or a deletion order that a real foreign key would reject. The QA run
that recorded this said so in as many words and made it its first follow-up.

## Evidence

`docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md`, Known Limitations:
"Tenant erasure was never exercised, in any form. It is the most destructive
operation in the module and has unit tests only." Follow-up 1: "Exercise tenant
erasure against a disposable database before it is used in anger."

## Proposed Approach

Run erasure against the CI ephemeral PostgreSQL — the same service the
`database-migration` job already stands up — using the two-fixture-tenant shape
of `services/api/test/tenant-isolation-pattern.e2e-spec.ts`. The assertion that
matters is not "the tenant is gone" but **"the other tenant is untouched"**.

`scripts/assert-test-database.mjs` must gate it. This is the one test in the
repository where a wrong `DATABASE_URL` is unrecoverable.

## Acceptance Criteria

Erasure runs against a disposable database, deletes exactly one tenant's rows,
leaves a second fixture tenant complete, and the suite refuses to run against any
host `assert-test-database.mjs` does not recognise as disposable.

## Dependencies

None — the ephemeral database capability already exists in CI.

## Related Items

Module [[tenant-control-plane|Tenant Control Plane]] · architecture [[multi-tenancy|Multi-Tenancy]] ·
[[ITEM-0002]] · bug pattern [[tenant-filter-missing]].

## History

- 2026-08-14 — raised as follow-up 1 of the tenant-control-plane QA run.
- 2026-08-15 — imported as a durable backlog item.
