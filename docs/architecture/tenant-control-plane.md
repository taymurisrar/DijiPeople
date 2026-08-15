# Tenant Control Plane

How Platform Admin operates one tenant workspace, and where the boundary sits
between that and the tenant's own administration of its organization.

> **Scope.** This document describes the API module
> `services/api/src/modules/tenant-control-plane/` and the Platform Admin tenant
> record at `/tenants/:tenantId`. For the general metadata-driven record runtime
> see [`module-runtime-overhaul.md`](module-runtime-overhaul.md); for settings
> and branding see [`settings-and-branding.md`](settings-and-branding.md), which
> remains canonical for those.

---

## The boundary

> Platform Admin provisions, secures, operates and commercially manages a
> DijiPeople tenant. The Tenant Owner manages the organization and HRM
> configuration inside the tenant application.

Two consequences are enforced in code, not left to convention:

- **Branding is not managed from Platform Admin.** `TenantBranding` still exists
  and is still provisioned with a tenant; it is configured by authorized
  tenant-side users through the settings runtime. The Platform Admin tenant
  record no longer exposes it.
- **Only two identity types are reachable from Platform Admin**: Tenant Owner
  and Service Account. `TenantAccessService.resolveIdentityType` returns `null`
  for any other tenant user, and every read and write path treats `null` as
  "not found" — so an employee or an ordinary application user cannot be created,
  disabled, reset or deleted through this surface at all. The request DTO does
  not even have a shape that expresses one.

Third-party integration configuration lives under the module it belongs to
(attendance devices under the gateway, for example), not in a tenant-wide
Integrations tab. That is an information-architecture decision; the integration
services and models are unchanged.

---

## Lifecycle

`TenantStatus` gained four members. The original seven are untouched and no
existing row was rewritten.

| Status | Meaning |
|---|---|
| `ONBOARDING` | Record exists; agreement and commercials are not complete |
| `PROVISIONING` | A provisioning run is in flight |
| `PROVISIONING_FAILED` | A provisioning run failed and may be retryable |
| `PENDING_SETUP` | Provisioned; tenant-side configuration still required |
| `ACTIVE` | Live |
| `SUSPENDED` | Reversible platform-imposed block |
| `INACTIVE` | Dormant, no platform block |
| `DECOMMISSIONING` | Retirement in progress |
| `DECOMMISSIONED` | Retired; data still present |
| `ARCHIVED` / `CHURNED` | Historical terminal states |

**Suspend, decommission and erase are three different things** and are not
overloaded onto one flag:

- **Suspend** is temporary and reversible. It blocks tenant sign-in, revokes live
  refresh tokens immediately, and preserves data, subscription and history.
- **Decommission** is the business retirement process. Data is preserved.
- **Erase** permanently destroys tenant-scoped data. It is not a lifecycle state;
  it removes the row.

`TENANT_STATUS_TRANSITIONS` in `tenant-control-plane.constants.ts` is the
authority. The action menu hides transitions that are invalid from the current
state, and `TenantControlPlaneService.changeStatus` refuses them again — hiding a
button is a usability affordance, never the control. Activation additionally
requires at least one active Tenant Owner, so a workspace can never go live with
nobody able to administer it.

Every transition requires a reason, which is written to the tenant's audit log
and to `PlatformEvent`.

---

## Provisioning runs

Provisioning was previously observable only through `PlatformEvent` rows, which
record that something happened but not which step it was, how long it took, or
whether the remainder can safely be re-run.

`TenantProvisioningRun` and `TenantProvisioningStep` record each attempt.
`PlatformLifecycleService.createTenantFromOnboarding` writes them as it goes, and
`TenantProvisioningRunService` swallows its own failures — telemetry must never
fail the operation it describes.

Steps and their retry safety:

| Step | Retryable | Why |
|---|---|---|
| `tenant-record` | No | The row already exists |
| `workspace-domain` | Yes | Upsert on `TenantDomain` |
| `rbac-defaults` | Yes | `bootstrapTenantDefaults` is idempotent |
| `identities-and-billing` | **No** | Replaying it would create a second owner, subscription and invoice |
| `customization-defaults` | Yes | Publish is idempotent |
| `invitations` | Yes | Re-issued per identity from Access & Security |

`TenantOperationsService.retryProvisioning` replays only the steps that declare
themselves retryable, marks the rest `SKIPPED`, and moves the tenant to
`PENDING_SETUP` on success or `PROVISIONING_FAILED` on failure.

---

## Modules

Effective module state is the existing rule in
`FeatureAccessService.getResolvedTenantFeatures`, not a second implementation:

```
plan entitlement AND tenant override = effective state
```

A missing override means "follow the plan". The consequence worth stating is
that **an override cannot grant what the plan does not sell**:
`TenantModulesService.update` rejects an attempt to enable a module the plan
excludes rather than writing a row that resolves to disabled anyway. A lapsed
subscription removes plan entitlement entirely, which the UI reports rather than
leaving an operator to infer from a screen full of disabled modules.

---

## Apps

`TENANT_APP_CATALOG` lists the DijiPeople applications a tenant can run. Platform
Admin itself is not in it — it is DijiPeople's own console — and neither is the
marketing site.

| App | Channel | Telemetry source |
|---|---|---|
| DijiPeople Web | Cloud | None; hosted and always current |
| Attendance Desktop Agent | Desktop | `EmployeeDevice` — device name, OS, `agentVersion`, `lastSeenAt` |
| Attendance Gateway | On-premise | `IntegrationGateway` — version, heartbeat, queue depth, device counts |

`TenantAppAssignment` holds the per-tenant policy on top of the global
`ApplicationRelease` catalogue: release channel, update policy
(`AUTOMATIC` / `MANUAL` / `PINNED`), a pinned release and a minimum supported
version. Production tenants default to `STABLE`.

Only telemetry the platform receives is displayed. There is no synthetic health.

---

## Erasure

Erasure is deliberately awkward and is implemented as an orchestrated sequence,
not a cascade.

**Why not `prisma.tenant.delete()` alone.** Most tenant-owned models cascade from
`Tenant`, but 87 foreign keys *between* tenant-owned models are declared
`Restrict`, and PostgreSQL enforces RESTRICT immediately — it does not care that
the referencing row is about to be removed by the same cascade. A single delete
fails part-way through.

`tenant-erasure.constants.ts` therefore holds a topologically ordered delete list
derived from `schema.prisma`, using only the foreign keys that can block a delete.
`tenant-erasure.constants.spec.ts` re-derives that order on every test run and
fails if a new model is missing or misplaced, so the list cannot silently rot.

What happens, in order, inside one transaction:

1. **Detach and keep** — `Contract`, `SupportCase` and `CustomerOnboarding` have
   their `tenantId` set to null, *and* their references into the delete set
   cleared (`Contract.subscriptionId`, `SupportCase.subscriptionId`,
   `SupportCase.invoiceId`). The legal and support trail outlives the workspace
   it described.
2. **Remove link rows that cannot be detached** — `SupportCaseIncident` joins a
   retained support case to a tenant error log with a NOT NULL foreign key. There
   is no null to write, so the join goes; it is scoped through its `errorLog`
   relation so the delete stays tenant-scoped.
3. **Null blocking self-references** — four models carry a self-referencing
   `Restrict` foreign key that would block a single-statement delete of their own
   table.
4. **Delete in dependency order** — every remaining tenant-owned model.
5. **Delete the tenant row.**

Because it is one transaction, a failure erases nothing.

> **The failure mode steps 1 and 2 exist for.** Ordering the delete set is not
> enough. A row that *survives* erasure can still hold a blocking foreign key
> **into** the delete set, and that row is not in the set to be ordered. A
> support case pointing at an invoice kept the invoice alive and rolled the whole
> transaction back with nothing but a constraint name. The spec re-derives every
> such inbound reference from `schema.prisma` and fails if one is not covered by
> a `clearFields` entry or a link cleanup.

**When the response goes missing.** Erasure is one long transaction behind the
admin app's proxy, so a 502, a 504 or a dropped connection can arrive *after* the
work has committed. The UI therefore never treats a transport failure as a
failed erasure: it reads the receipt, which is written before anything is deleted
and outlives the tenant, and reports which of three situations the operator is
actually in — it completed, it failed for a stated reason, or it never started
and is safe to retry. The admin proxy also distinguishes "the API could not be
reached" from "the API said no", and names the path, method and API base URL in
both cases, because a bare `Bad Gateway` with no trace id is indistinguishable
from any other outage.

When an erasure does fail, the receipt and the log record the phase, the model
being processed, the constraint name, the Prisma error code and how far the run
had got — and the operator is told that something outside the tenant still
references data being erased, rather than being handed raw Postgres text.

**Cancelling first.** A live subscription blocks erasure, so
`POST /platform/tenants/:id/subscription/cancel` exists as its own operation with
its own reason. It was previously reachable only through the general subscription
editor, which also required a plan and a price — which made cancellation, and
therefore erasure and decommissioning, effectively unavailable. Cancelling sets
`CANCELLED`, ends the term, stops auto-renewal and records the reason. It does
**not** cancel anything in Stripe: this codebase receives Stripe subscription
state through webhooks and has no server-initiated cancel call, so a Stripe-backed
subscription requires an explicit acknowledgement and the response says what still
has to be done in Stripe.

**Safeguards.** Authorization plus an elevated platform role; a written reason;
the tenant's exact name typed; the literal phrase `ERASE TENANT`; an explicit
acknowledgement; and an extra acknowledgement when unpaid invoices exist. All of
them are re-checked server-side. An `ACTIVE` tenant or a live subscription blocks
erasure outright — suspension or decommissioning comes first, so an erasure is
always preceded by a decision someone could have undone.

**The receipt.** `TenantErasureReceipt` deliberately has no relation to `Tenant`:
erasure destroys the tenant's own audit log, so a receipt joined to the tenant
would be destroyed alongside the thing it exists to evidence. It holds
identifiers, actors, reason, timings and per-model row counts — never tenant HR or
business content. `PlatformEvent` rows are preserved for the same reason.

Stored files are removed after the transaction commits, since object storage
cannot join it; the outcome is reported rather than allowed to fail an erasure
that has already succeeded.

---

## Timeline and audit are not the same thing

- **Timeline** (`TenantControlPlaneService.timeline`) is readable operational
  history: a sentence per event, an actor name, a category filter. It never
  renders raw before/after snapshots.
- **Audit** is the immutable technical record. `AuditLog` keeps the full
  snapshots, actor, entity, source module and trace id; `PlatformEvent` keeps
  platform-side telemetry with correlation ids.

A tenant's audit rows are written under **that tenant's** id, not the platform
operator's. Reading them with `user.tenantId` matched nothing, which is why the
tenant timeline previously came back empty however much had happened — see
`PlatformRuntimeService.timeline`.

---

## Presentation metadata

The record page is still schema-driven, but the schema is not the whole story:

```
Prisma schema → runtime metadata → business presentation metadata → shared components
```

`RuntimeFieldDefinition` carries `displayValueField`, `displayHref` and
`renderAs`. Schema says `customerAccountId` is a required string; only
presentation metadata says it should read as "Maseer Group" and link to the
customer record. Read-only fields render as values rather than as disabled
inputs — which is what fixed blank dates (an ISO string is invalid in a
`datetime-local` input), raw enum values, and lookups falling back to their id.
