# commercial-onboarding-lifecycle

Durable rules for the path a company travels from a public enquiry to a live
tenant: `leads`, `contracts`, `partners`/`partner-experience`, `super-admin`
(customers, customer-onboarding, provisioning) and `tenant-control-plane`.
Evergreen — update in place.

Verified end to end on 2026-08-15 by
[`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`](../../qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md)
(156 scenarios against a live database and a running API).

---

## The two journeys, as actually implemented

`DOMAIN_RULE`

```
POST /api/public/leads                     POST /api/public/partners/inquiries
  → Lead(NEW, source='Website')              → Partner(INQUIRY) + PartnerInquiry(NEW)
  → CONTACTED → QUALIFIED                    → qualify → Partner(APPROVED_AWAITING_AGREEMENT)
  → Contract(from-source lead)               → MASTER_PARTNER_AGREEMENT
  → submit-approval → signature-request      → signed via /public/signatures/:token
  → signed via /public/signatures/:token     → send-onboarding-link (runtime action)
  → POST /super-admin/leads/:id/convert      → public onboarding submit → review approve
  → CustomerAccount + CustomerOnboarding     → activate → Partner(ACTIVE) + referral link
  → readiness → create-tenant                       ↓
  → Tenant(PENDING_SETUP)                    referral code on POST /public/leads
  → owner → readiness → activate             → Lead(source='Partner Referral', ATTRIBUTED)
                                             → same Lead→Customer→Tenant journey
```

Both journeys converge: a partner-referred lead is not a separate flow. It is
the same lead pipeline with attribution columns populated.

## Commercial gates are queries, not flags

`DOMAIN_RULE` · `SECURITY_RULE`

This is the single most important thing to know before changing anything here.

Lead conversion does not check a boolean. `assertGoverningAgreementExecuted`
asks the database whether an executed contract exists whose `relatedLeadId` is
this lead (`leadAgreementScope`), and tenant provisioning asks a similar
question of the customer. **Therefore any code that can write `relatedLeadId`,
`customerAccountId`, `contractType` or a contract's status is part of the
authorization surface**, whether or not it looks like it.

REG-009 is exactly this: `ContractsService.update()` allowed a `FULLY_EXECUTED`
agreement to be re-pointed at a different lead, and that lead — which had never
signed anything — converted into a real customer. Before adding a field to
`UpdateContractDto`, ask whether a gate reads it.

## There are two conversion gates and they are not the same

`DOMAIN_RULE`

- `PATCH /super-admin/leads/:id {status: CONVERTED}` → `assertGoverningAgreementExecuted`:
  requires one of `SUBSCRIPTION_AGREEMENT`, `CUSTOMER_AGREEMENT`,
  `MASTER_SERVICES_AGREEMENT` at `FULLY_EXECUTED` or beyond. Not disableable.
- `POST /super-admin/leads/:id/convert` → `assertRequiredCustomerAgreements`:
  reads `PlatformSetting['customer-settings'].requiredAgreementTypes`, accepts
  `FULLY_SIGNED` as well, and is skipped entirely when
  `agreementRequiredForLeadConversion === false`.

Only the second creates a `CustomerAccount`. The first merely marks the lead
`CONVERTED`, which is **terminal and read-only**, so a lead pushed through the
first path can never take the second. Treat `POST …/convert` as the conversion
and the `PATCH` status route as something a UI should not offer.

`EXECUTED_CONTRACT_STATUSES` deliberately excludes `FULLY_SIGNED`, and a final
signature moves a contract straight to `FULLY_EXECUTED` — there is no
`FULLY_SIGNED` intermediate for the last signer.

## Sub-status is a controlled vocabulary, and creation paths must honour it

`DOMAIN_RULE`

`LEAD_SUB_STATUS_OPTIONS`, `CUSTOMER_SUB_STATUS_OPTIONS` and
`CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS` are validated on **every** update, and
the validator re-checks the *existing* sub-status a record inherited. A creation
path that writes a literal outside the vocabulary produces a record that can
never be updated again — REG-010, where every onboarding created by lead
conversion was un-editable from birth, including a notes-only PATCH.

**Rule:** creation paths call `getDefaultSubStatus(entity, status)`. Never write
a sub-status literal.

## Provisioning: the step catalogue is a contract with two implementations

`DOMAIN_RULE`

`TENANT_PROVISIONING_STEPS` (8 steps as of 2026-08-15) is consumed by two
different code paths:

- the **forward** path in `platform-lifecycle.service.ts`, which runs each step
  inline in order;
- the **retry** path in `tenant-operations.service.ts`, which dispatches by
  `key` and replays only steps marked `isRetryable`.

Adding a step to the catalogue therefore requires a branch in
`runRetryableStep` too, or retry dies at that step — REG-012, where the two new
workspace steps broke retry for every tenant. `tenant-provisioning-retry.spec.ts`
pins the two together.

`identities-and-billing` and `tenant-record` are non-retryable **on purpose**:
replaying them would create a second owner, a second subscription and a second
invoice.

## Known unresolved: a tenant that fails before `identities-and-billing` is unrecoverable

`BUG_REGRESSION` · open as of 2026-08-15

`identities-and-billing` is the only creator of a tenant's business unit, owner,
service account and subscription, and it is non-retryable. But
`TenantAccessService.create` refuses with *"This tenant has no business unit
yet"*, so an owner cannot be added by hand either. `countActiveOwners` stays 0,
so `changeStatus(ACTIVE)` is refused forever.

After REG-012's fix, retry reports **SUCCEEDED** and moves such a tenant to
`PENDING_SETUP`, so it now looks healthy while being permanently unusable.

Recommended direction (needs an ExecPlan): make the step idempotent against its
natural anchors — owner email uniqueness per tenant, one subscription per
tenant, invoice `idempotencyKey` — and mark it retryable. Do **not** let
`POST /access` bootstrap a business unit; that papers over a half-provisioned
tenant.

## Known unresolved: partner onboarding review has no state machine

`BUG_REGRESSION` · open as of 2026-08-15

`PartnerExperienceService.reviewOnboarding` writes the decided status with no
check on the current one. An application still in `INVITED`, with no submitted
data, can be approved and the partner activated; and an already-`APPROVED`
application can be flipped to `REJECTED` after activation, cascading a live
`ACTIVE` partner to `REJECTED`.

## Tenant activation has exactly one hard precondition

`DOMAIN_RULE`

`readiness` (`buildReadiness`) is **advisory** — `changeStatus` never consults
it. The only hard gate on `ACTIVE` is `countActiveOwners(tenantId) > 0`, which
counts non-service-account users with role key `global-admin` and status
`ACTIVE`. An `INVITED` owner does not count. A `reason` is mandatory and is
stored as `subStatus`.

Do not treat a green readiness card as "activation will succeed", and do not
treat activation succeeding as "readiness passed".

## Attribution is server-owned and survives conversion

`DOMAIN_RULE` · `SECURITY_RULE`

The public lead DTO accepts `referralCode` only — never `partnerId`.
`resolveReferral` decides attribution and records the code in
`referralCodeSnapshot` **even when it fails**, so a bad code is auditable
(`INVALID_CODE`, `INACTIVE_PARTNER`, `EXPIRED_LINK`, `DISABLED_LINK`).

Conversion carries `originatingPartnerId`, `originatingReferralLinkId` and
`referralCodeSnapshot` onto the customer, and contracts inherit `partnerId`.
**Not** carried: `attributionStatus`, `referralSource`, `referredAt` and
`source` — `CustomerAccount` has no origin-channel column at all, so "did this
customer come from the website or a partner?" is answerable only by joining back
through `sourceLead`.

Admins cannot change `partnerId` through `updateLead`; there is an audited
`PATCH /super-admin/leads/:id/attribution` action restricted to the three
platform admin roles, which also propagates the correction to already-converted
customers.

## Public surfaces

`SECURITY_RULE`

Every public surface carries `PublicRateLimitGuard` (20 POST / 120 GET per IP
per 10 minutes). `POST /api/public/leads` was the sole exception until REG-011;
it matters more than most because each accepted submission emails every active
platform user in the sales/admin roles.

`POST /api/public/leads` has a **honeypot**: a non-empty `website` field returns
`{submitted:true}` with no database write and no id. Partner inquiries are
deduplicated by a `submissionHash` unique constraint; public leads are **not**
deduplicated, so a double-click creates two leads.

Signing tokens are 32 random bytes, stored only as `sha256` in
`SignatureRecipient.accessTokenHash`; there is no plaintext column. Expiry is
evaluated lazily when a token is presented — there is no scheduled sweep, so
`SignatureRequestStatus.EXPIRED` is never set by a background job.
