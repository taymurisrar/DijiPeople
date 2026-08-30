---
aliases: [Tenant]
type: entity
model: Tenant
last_verified: 2026-08-30
---

# Tenant

## Purpose

One customer's workspace, and the isolation boundary every other tenant-owned
row hangs off. `Tenant` is the most connected model in the schema by a wide
margin — **246 relation ends**, against 85 for [[entity-employee|Employee]] and
51 for [[entity-user|User]] — because almost every tenant-owned model declares a
back-reference to it.

That connectivity is a consequence of the isolation design, not a modelling
choice. Isolation is enforced **in application code only** — no row-level
security, no working Prisma middleware — so `tenantId` has to be a real column on
every owned model, and Prisma requires the reciprocal relation. See
[[tenant-isolation]] for the enforcement rules; this note covers the record.

## The distinction that catches people

A `Tenant` is **not** a customer. [[entity-customer-account|CustomerAccount]] is
the commercial party that signs and pays; `Tenant` is a workspace it owns, and
one `CustomerAccount` may own several — `@@index([customerAccountId, environmentType])`
exists precisely so a customer can hold a PRODUCTION tenant alongside UAT and
SANDBOX ones.

So: billing questions are answered by `CustomerAccount`, isolation questions by
`Tenant`. Reaching for the wrong one is the most common modelling mistake in this
area, and `environmentType` is what tells the two apart in a list.

## Identity and routing

`slug` is **globally unique** and is the label the workspace resolves on — the
subdomain in front of the tenant. It is the one field on this model whose
uniqueness is a routing guarantee rather than a data-hygiene rule, and it is
indexed separately from the unique constraint because routing looks it up on
every request. `tenantCode` is a separate, also-unique human reference that
routing does not use.

`tenantId: 'platform'` is a **string sentinel, not a row**. It routes audit
writes to `PlatformAuditLog` instead of the tenant log. It is the only sentinel
of its kind in the schema, and inventing another is called out as a defect in
[[tenant-isolation]].

## Two status axes, deliberately

`status` and `readinessStatus` answer different questions and are both required:

- **`status`** — the commercial and operational state of the workspace:
  `ONBOARDING`, `PENDING_SETUP`, `ACTIVE`, `INACTIVE`, `SUSPENDED`, `ARCHIVED`,
  `CHURNED`, `PROVISIONING`, `PROVISIONING_FAILED`, `DECOMMISSIONING`,
  `DECOMMISSIONED`.
- **`readinessStatus`** — whether the workspace is actually usable:
  `NOT_READY`, `PROVISIONING`, `READY`, `PARTIALLY_READY`, `BLOCKED`.

`PARTIALLY_READY` is the value that makes the split worth having. A tenant can be
commercially `ACTIVE` while provisioning has completed some steps and failed
others, and a single status field would have to choose which of those two facts
to represent. [[BUG-0015]] is what that failure looks like when the two are
conflated — a tenant that failed after identity creation but before billing had
no state that described it, and could not be recovered.

`subStatus` is an unconstrained `String` alongside both. Nothing in the database
restricts its values.

## Attribution: where the tenant came from

Four optional fields record commercial origin — `originatingPartnerId`,
`originatingLeadId`, `originatingReferralLinkId` and `referralCodeSnapshot`.

`referralCodeSnapshot` is a **snapshot by design**: the referral code as it stood
when the tenant was created. Partner commission is calculated against what was
promised at signup, so resolving the code live through
[[entity-partner|Partner]] would silently repay history whenever a partner's
code changed. The other three are live foreign keys; this one deliberately is
not.

## Lifecycle

Created by tenant provisioning, not by a tenant-facing route — see
[[tenant-provisioning]]. Provisioning is multi-step and each step can fail
independently, which is why `readinessStatus` exists and why
`PROVISIONING_FAILED` is a terminal-ish `status` a human resolves rather than an
error the caller sees.

`isDemoData`, `demoBatchId` and `seedSource` mark seeded tenants. They are what
`seed-demo` sets and what lets demo data be found and removed later without
guessing from names — see `docs/seed-architecture.md` for the seed contract.

Decommissioning moves through `DECOMMISSIONING` to `DECOMMISSIONED`. Note that
`TenantErasureReceipt` exists in the schema with **no code reading or writing
it** — the erasure record this lifecycle implies is modelled but not
implemented. See [[known-gaps]].

## Security

Every rule in [[tenant-isolation]] applies to reads *of* this model in the
inverse direction: `Tenant` itself is **not** tenant-scoped (it is the scope), so
listing tenants is a platform-only operation. Those routes live in `tenants`,
`tenant-control-plane` and `super-admin` and must be platform-guarded. Widening a
tenant-facing endpoint to return other tenants is the failure this boundary
exists to prevent.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **no** — platform-owned or global reference data |
| Primary key | `id` |
| Prisma accessor | `prisma.tenant` |
| Owning module | `services/api/src/modules/super-admin` |
| Domain | Commercial |
| Also touched by | `tenant-control-plane`, `tenants`, `billing`, `tenant-settings`, `demo-data`, `auth` (reads), `tenant-domains` (reads), `notifications` (reads), and 10 more |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `customerAccountId` | `String` | yes | — |
| `originatingPartnerId` | `String` | no | — |
| `originatingLeadId` | `String` | no | — |
| `originatingReferralLinkId` | `String` | no | — |
| `referralCodeSnapshot` | `String` | no | — |
| `ownerUserId` | `String` | no | — |
| `tenantCode` | `String` | no | unique |
| `name` | `String` | yes | — |
| `displayName` | `String` | no | — |
| `legalName` | `String` | no | — |
| `slug` | `String` | yes | unique |
| `environmentType` | `TenantEnvironmentType` (enum) | yes | default `PRODUCTION` |
| `environmentGroupId` | `String` | no | — |
| `status` | `TenantStatus` (enum) | yes | default `ACTIVE` |
| `subStatus` | `String` | no | — |
| `readinessStatus` | `TenantReadinessStatus` (enum) | yes | default `NOT_READY` |
| `readyAt` | `DateTime` | no | — |
| `dataRegion` | `String` | no | — |
| `isDemoData` | `Boolean` | yes | default `false` |
| `demoBatchId` | `String` | no | — |
| `seedSource` | `String` | no | — |

### States

- `environmentType` — `TenantEnvironmentType`: `PRODUCTION`, `UAT`, `SANDBOX`, `DEVELOPMENT`
- `status` — `TenantStatus`: `ONBOARDING`, `PENDING_SETUP`, `ACTIVE`, `INACTIVE`, `SUSPENDED`, `ARCHIVED`, `CHURNED`, `PROVISIONING`, `PROVISIONING_FAILED`, `DECOMMISSIONING`, `DECOMMISSIONED`
- `readinessStatus` — `TenantReadinessStatus`: `NOT_READY`, `PROVISIONING`, `READY`, `PARTIALLY_READY`, `BLOCKED`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-partner|Partner]] via `originatingPartner` (optional) — `onDelete: SetNull`
- `Lead` via `originatingLead` (optional) — `onDelete: SetNull`
- [[entity-customer-account|CustomerAccount]] via `customerAccount` — `onDelete: Restrict`
- `TenantEnvironmentGroup` via `environmentGroup` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `ownerUser` (optional) — `onDelete: SetNull`

**Owns** — the foreign key lives on the other side

- **241 child relations** — too many to list usefully. See [[domain-map]] for the full model inventory, grouped by domain.

### Constraints and indexes

- Unique: `tenantCode`, `slug`
- Indexes: 13
<!-- /GENERATED:schema-facts -->

## Related

[[entity-customer-account|CustomerAccount]] · [[entity-employee|Employee]] ·
[[entity-user|User]] · [[entity-subscription|Subscription]] ·
[[tenant-isolation]] · [[tenant-provisioning]] · [[multi-tenancy]] ·
[[workspace-routing-and-domains]] · [[data-model-overview]] · [[domain-map]]
