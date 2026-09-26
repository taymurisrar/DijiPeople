---
aliases: [CustomerAccount]
type: entity
model: CustomerAccount
last_verified: 2026-08-30
---

# CustomerAccount

## Purpose

**The commercial party** — the company that is sold to, signs, and pays. It is
not a workspace; that is [[entity-tenant|Tenant]], and one `CustomerAccount` may
own several.

`CustomerAccount` is not tenant-scoped, and could not be: it exists before any
tenant does. It is created during the commercial journey, and the tenant is
provisioned from it afterwards.

## The pairing that explains most of this schema's shape

| Question | Model |
|---|---|
| Who pays? Who signed? What plan did they choose? | `CustomerAccount` |
| Which rows belong together, and who may read them? | [[entity-tenant|Tenant]] |
| What are they entitled to right now? | [[entity-subscription|Subscription]] |

A customer with a PRODUCTION tenant and a UAT tenant has **one** account, two
tenants and — since `Subscription.tenantId` is unique — two subscriptions.

## It absorbs the lead

`@@unique([leadId])` makes the relationship to `Lead` **one-to-one**: a lead
converts into exactly one account and cannot convert twice. `status` then carries
the pre-tenant part of the funnel — `LEAD`, `PROSPECT`, `ONBOARDING` — before
`ACTIVE`.

That overlap with the `Lead` model is deliberate but easy to misread: `Lead` is
the enquiry, `CustomerAccount` is the party. Both carry a status, and they are
not the same status. See [[leads]] and [[commercial-onboarding-journey]].

`originatingPartnerId`, `originatingReferralLinkId` and `referralCodeSnapshot`
repeat the attribution fields on `Tenant`, for the same reason and with the same
snapshot semantics — commission is owed on what was promised at signup.

## Three different people can own it

`assignedToUserId` and `accountManagerUserId` point at
`PlatformUser` — DijiPeople's own staff. `primaryOwnerUserId` points at a
tenant-side [[entity-user|User]].

Mixing the two identity systems on one model is the thing to notice: a platform
user is a separate identity from a tenant user, by decision
([[decision-platform-admin-is-a-separate-identity]]). A screen that renders
"owner" without saying which of the three it means is
[[BUG-1550]] — a lead record showing two different owners on the same screen.

## Security

Platform-only. Every route touching it lives in `super-admin`, `platform-*` or
`tenants` and must be platform-guarded. It carries `taxId`,
`registrationNumber`, `stripeCustomerId` and named contact details for a real
company — none of which belongs on a tenant-facing surface.

`customPricingFlag` and `discountApproved` are **commercial controls**, not
display flags. Never let a client set either; the price a customer pays must
never be derived from anything the client sends.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **no** — platform-owned or global reference data |
| Primary key | `id` |
| Prisma accessor | `prisma.customerAccount` |
| Owning module | `services/api/src/modules/super-admin` |
| Domain | Commercial |
| Also touched by | `billing`, `leads`, `demo-data`, `platform-runtime` (reads), `contracts` (reads), `notifications` (reads), `payroll` (reads), `tenant-control-plane` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `companyName` | `String` | yes | — |
| `originChannel` | `CustomerOriginChannel` (enum) | no | — |
| `legalCompanyName` | `String` | no | — |
| `registrationNumber` | `String` | no | — |
| `taxId` | `String` | no | — |
| `primaryContactFirstName` | `String` | no | — |
| `primaryContactLastName` | `String` | no | — |
| `primaryContactEmail` | `String` | no | — |
| `primaryContactPhone` | `String` | no | — |
| `billingContactEmail` | `String` | no | — |
| `financeContactName` | `String` | no | — |
| `financeContactEmail` | `String` | no | — |
| `industry` | `String` | no | — |
| `companySize` | `String` | no | — |
| `contactEmail` | `String` | yes | — |
| `contactPhone` | `String` | no | — |
| `country` | `String` | yes | — |
| `stateProvince` | `String` | no | — |
| `city` | `String` | no | — |
| `addressLine1` | `String` | no | — |
| `addressLine2` | `String` | no | — |
| `website` | `String` | no | — |
| `estimatedEmployeeCount` | `Int` | no | — |
| `actualEmployeeCount` | `Int` | no | — |
| `selectedPlanId` | `String` | no | — |
| `preferredBillingCycle` | `BillingCycle` (enum) | no | — |
| `customPricingFlag` | `Boolean` | yes | default `false` |
| `discountApproved` | `Boolean` | yes | default `false` |
| `leadId` | `String` | no | — |
| `originatingPartnerId` | `String` | no | — |
| `originatingReferralLinkId` | `String` | no | — |
| `referralCodeSnapshot` | `String` | no | — |
| `status` | `CustomerAccountStatus` (enum) | yes | default `LEAD` |
| `subStatus` | `String` | no | — |
| `assignedToUserId` | `String` | no | — |
| `accountManagerUserId` | `String` | no | — |
| `primaryOwnerUserId` | `String` | no | — |
| `stripeCustomerId` | `String` | no | — |
| `isDemoData` | `Boolean` | yes | default `false` |
| `demoBatchId` | `String` | no | — |
| `seedSource` | `String` | no | — |

### States

- `originChannel` — `CustomerOriginChannel`: `WEBSITE`, `PARTNER_REFERRAL`, `DIRECT`, `OTHER`
- `preferredBillingCycle` — `BillingCycle`: `MONTHLY`, `ANNUAL`
- `status` — `CustomerAccountStatus`: `LEAD`, `PROSPECT`, `ONBOARDING`, `ACTIVE`, `SUSPENDED`, `CHURNED`, `ARCHIVED`

### Relationships

**Belongs to** — this model holds the foreign key

- `PlatformUser` via `assignedToUser` (optional) — `onDelete: SetNull`
- `PlatformUser` via `accountManagerUser` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `primaryOwnerUser` (optional) — `onDelete: SetNull`
- `Plan` via `selectedPlan` (optional) — `onDelete: SetNull`
- `Lead` via `sourceLead` (optional) — `onDelete: SetNull`
- [[entity-partner|Partner]] via `originatingPartner` (optional) — `onDelete: SetNull`
- `PartnerReferralLink` via `originatingReferralLink` (optional) — `onDelete: SetNull`

**Owns** — the foreign key lives on the other side

- [[entity-tenant|Tenant]] via `tenants`[]
- `CustomerContact` via `contacts`[]
- `CustomerNote` via `notes`[]
- `TenantEnvironmentGroup` via `environmentGroups`[]
- `CustomerOnboarding` via `onboardings`[]
- `Contract` via `contracts`[]
- `SupportCase` via `supportCases`[]
- `PayrollCostAllocationLine` via `payrollCostAllocationLines`[]
- `Promotion` via `promotions`[]
- `SubscriptionOrder` via `subscriptionOrders`[]
- `TenantProvisioningRun` via `tenantProvisioningRuns`[]
- `RefundRequest` via `refundRequests`[]
- `ConsentRecord` via `consentRecords`[]

### Constraints and indexes

- Unique: `@@unique([leadId])`
- Indexes: 11
<!-- /GENERATED:schema-facts -->

## Related

[[entity-tenant|Tenant]] · [[entity-subscription|Subscription]] ·
[[entity-partner|Partner]] · [[customers]] · [[leads]] · [[billing]] ·
[[commercial-onboarding-journey]] · [[tenant-lifecycle]] ·
[[data-model-overview]] · [[domain-map]]
