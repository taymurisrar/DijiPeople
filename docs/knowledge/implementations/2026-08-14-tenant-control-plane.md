# Tenant Control Plane

**Category:** ARCHITECTURE_CHANGE
**Date:** 2026-08-14
**Branch:** `agent/tenant-control-plane`
**Commit range:** `aa35b74..ba1e818` (merge `032be56`)
**QA run:** [`docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md`](../../qa/runs/2026-08-14-tenant-control-plane-ba1e818.md) — PASS WITH RISKS
**Reviewer verdict:** APPROVE WITH FOLLOW-UPS

## What shipped

A single API module, `services/api/src/modules/tenant-control-plane/`, replacing
tenant administration that was previously spread across `super-admin`,
`platform-runtime` and ten bespoke `apps/admin` components. It covers tenant
overview, readiness, configuration, commercial data, timeline, system state,
access management, module and app assignment, provisioning operations, and
tenant erasure.

The Platform Admin tenant record at `/tenants/:tenantId` was rebuilt on the
platform runtime, with the ten `tenant-*` components replaced by a panel set
under `apps/admin/app/_components/tenants/`.

Schema: 4 new models, 4 `TenantStatus` members, 1 nullable column, 10 indexes.
Migration `20260814190000_tenant_control_plane` is strictly additive.

Full design: [`docs/architecture/tenant-control-plane.md`](../../architecture/tenant-control-plane.md).

## Why it is recorded here

Three decisions in this module generalise beyond it, and one process failure is
worth remembering. See
[`../modules/tenant-control-plane.md`](../modules/tenant-control-plane.md) for
the durable rules.

## Process note

This implementation was completed in an earlier task that stopped at
"implementation done" — nothing was committed, branched, pushed, merged,
QA-recorded, captured or synced. The work sat uncommitted in a working tree.

That gap is what produced
[`.agent/context/task-completion-contract.md`](../../../.agent/context/task-completion-contract.md).
The root cause was not a missing capability: `AGENTS.md` opened its Working
Agreements with "Do not commit or push unless asked", and that file outranks
every role document, so one line disabled the Integrator regardless of what
`integrator.md` said.

## Context updates recommended

- `.agent/context/api-contracts.md` — the control-plane routes authorize in
  services rather than via decorators; worth naming as a sanctioned exception.
- `.agent/context/database-prisma.md` — the `Restrict`-FK erasure ordering
  problem below is a schema-wide property, not a tenant-control-plane one.
