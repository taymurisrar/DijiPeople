---
aliases: [Partner]
type: entity
model: Partner
last_verified: 2026-08-30
---

# Partner

## Purpose

A reseller, referrer or implementation partner who brings customers to
DijiPeople and is paid for it. Not tenant-scoped — a partner exists outside any
workspace, and may originate many.

`code` is **globally unique** and is the referral identifier: it is what
`PartnerReferralLink` resolves and what
[[entity-customer-account|CustomerAccount]] and [[entity-tenant|Tenant]] each
snapshot into `referralCodeSnapshot` at signup.

## Why the code is snapshotted rather than joined

Commission is owed on the terms that applied when the customer signed. If
attribution resolved live through `code`, changing a partner's code — or
reassigning it — would silently rewrite the history of who earned what.

So attribution is stored twice on purpose: a live foreign key
(`originatingPartnerId`) for "who is this partner now", and an immutable string
(`referralCodeSnapshot`) for "what did they present at the time". Both matter,
and neither replaces the other.

`defaultCommissionRate` is a `Decimal` on this model, but per-deal commission is
recorded on `PartnerCommission`. The rate here is a default for new arrangements,
not the authority on any existing one.

## Two status fields, and a 24-value lifecycle

`status` (`PartnerStatus`) is the **commercial** lifecycle. `accountStatus`
(`PartnerAccountStatus` — `NOT_PROVISIONED`, `INVITED`, `ACTIVE`, `SUSPENDED`,
`DISABLED`) is whether the partner can **sign in to the partner portal**.

They are genuinely different: a fully-signed partner who has never been invited
to the portal is `status: FULLY_SIGNED`, `accountStatus: NOT_PROVISIONED`.

`PartnerStatus` carries **24 values**, and reads as two overlapping funnels that
were merged rather than reconciled — `INQUIRY` beside `NEW_INQUIRY`,
`APPROVED_AWAITING_AGREEMENT` beside `AGREEMENT_IN_PROGRESS`,
`AGREEMENT_DRAFTING` and `AWAITING_SIGNATURE`, `SUBMITTED` beside
`UNDER_REVIEW`.

**Do not infer the flow from the enum.** Read
`modules/partners` and [[partner-onboarding]] for the transitions that are
actually taken; several of these values may be unreachable. Whether any are dead
is recorded as unverified in [[pending-verification]] rather than asserted here.

## Portal identity is separate again

`PartnerPortalUser` and `PartnerRefreshToken` are the partner's own auth, distinct
from both [[entity-user|User]] (tenant) and `PlatformUser` (DijiPeople staff).
That is the third identity system in the schema, and it exists for the same
reason as the second: a partner is not a tenant member and must not be modelled
as one.

`assignedToUserId` here points at a `PlatformUser` — the DijiPeople person who
owns the relationship.

## `applicationSnapshot` is a Json blob

It holds the onboarding application as submitted. Like `referralCodeSnapshot`, it
is deliberately frozen — the application is evidence of what was agreed, so it
must not be re-rendered from current data. Do not query into it; the structured
fields exist for that.

## Security

Platform and partner-portal surfaces only. Never expose `Partner` on a
tenant-facing route: a tenant learning which partner referred it, and on what
commission, is a commercial leak.

`taxId` and the named contact fields are third-party company data. Commission
rates must never be settable by a partner-portal caller.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **no** — platform-owned or global reference data |
| Primary key | `id` |
| Prisma accessor | `prisma.partner` |
| Owning module | `services/api/src/modules/partner-experience` |
| Domain | Commercial |
| Also touched by | `partners`, `contracts`, `super-admin` (reads), `leads` (reads), `platform-runtime` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | `String` | yes | unique |
| `type` | `PartnerType` (enum) | yes | default `COMPANY` |
| `partnershipModel` | `PartnershipModel` (enum) | no | — |
| `displayName` | `String` | yes | — |
| `legalName` | `String` | no | — |
| `companyName` | `String` | no | — |
| `contactFirstName` | `String` | no | — |
| `contactLastName` | `String` | no | — |
| `email` | `String` | yes | — |
| `phone` | `String` | no | — |
| `country` | `String` | no | — |
| `website` | `String` | no | — |
| `taxId` | `String` | no | — |
| `defaultCommissionRate` | `Decimal` | yes | default `0`, decimal(5,2) |
| `currencyCode` | `String` | yes | — |
| `status` | `PartnerStatus` (enum) | yes | default `DRAFT` |
| `accountStatus` | `PartnerAccountStatus` (enum) | yes | default `NOT_PROVISIONED` |
| `applicationSnapshot` | `Json` | no | — |
| `applicationSubmittedAt` | `DateTime` | no | — |
| `applicationSource` | `String` | no | — |
| `assignedToUserId` | `String` | no | — |
| `notes` | `String` | no | — |

### States

- `type` — `PartnerType`: `INDIVIDUAL`, `COMPANY`
- `partnershipModel` — `PartnershipModel`: `REFERRAL`, `RESELLER`, `IMPLEMENTATION`, `TECHNOLOGY`, `STRATEGIC`, `CONSULTANT`, `OTHER`
- `status` — `PartnerStatus`: `DRAFT`, `INQUIRY`, `NEW_INQUIRY`, `MORE_INFORMATION_REQUIRED`, `QUALIFIED`, `APPROVED_AWAITING_AGREEMENT`, `AGREEMENT_IN_PROGRESS`, `AGREEMENT_EXECUTED`, `ONBOARDING_PENDING`, `ONBOARDING_INVITED`, `ONBOARDING_IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `INFORMATION_APPROVED`, `AGREEMENT_DRAFTING`, `INTERNAL_APPROVAL`, `AWAITING_SIGNATURE`, `FULLY_SIGNED`, `APPROVED_FOR_ACTIVATION`, `ACTIVE`, `SUSPENDED`, `INACTIVE`, `TERMINATED`, `REJECTED`
- `accountStatus` — `PartnerAccountStatus`: `NOT_PROVISIONED`, `INVITED`, `ACTIVE`, `SUSPENDED`, `DISABLED`

### Relationships

**Belongs to** — this model holds the foreign key

- `PlatformUser` via `assignedToUser` (optional) — `onDelete: SetNull`

**Owns** — the foreign key lives on the other side

- `Lead` via `leads`[]
- `PartnerCommission` via `commissions`[]
- `Contract` via `agreements`[]
- `PartnerInquiry` via `inquiries`[]
- `PartnerOnboardingApplication` via `onboardingApplications`[]
- `PartnerPortalUser` via `portalUsers`[]
- `PartnerLeadReview` via `leadReviews`[]
- `SupportCase` via `supportCases`[]
- `PartnerReferralLink` via `referralLinks`[]
- [[entity-customer-account|CustomerAccount]] via `attributedCustomers`[]
- [[entity-tenant|Tenant]] via `attributedTenants`[]
- `LeadAttributionCorrection` via `previousAttributions`[]
- `LeadAttributionCorrection` via `correctedAttributions`[]
- `PartnerTimeline` via `timeline`[]

### Constraints and indexes

- Unique: `code`
- Indexes: 6
<!-- /GENERATED:schema-facts -->

## Related

[[entity-customer-account|CustomerAccount]] · [[entity-tenant|Tenant]] ·
[[partners]] · [[partner-onboarding]] · [[leads]] ·
[[commercial-onboarding-journey]] · [[pending-verification]] ·
[[data-model-overview]] · [[domain-map]]
