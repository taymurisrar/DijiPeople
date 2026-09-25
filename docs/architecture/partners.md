# Partners

The DijiPeople partner program: who a partner is, what its two independent
classification axes actually control, how a partner moves from a public
inquiry to an active, revenue-eligible account, and where its data intersects
leads, agreements and customers.

> **Last verified:** 2026-09-25
> **Verified against:** `services/api/src/modules/partners/`,
> `services/api/src/modules/partner-experience/`, `prisma/schema.prisma`
> (`Partner`, `PartnerType`, `PartnerStatus`, `PartnershipModel`), commit
> `0a84a58e` (TASK-0032, WP-04 and the Architect's post-QA fix). Scenario
> verdicts confirmed by TASK-0032 WP-09 live QA
> (`docs/tasks/TASK-0032-streams/QA-summary.md`).

---

## Model

`services/api/src/modules/partners/` (`PartnersService`, admin CRUD) and
`services/api/src/modules/partner-experience/` (`PartnerExperienceService`,
the public inquiry/onboarding funnel and the partner portal) both operate on
one `Partner` row (`prisma/schema.prisma`). A partner is a platform-level
record — `AuditService.log()` calls for it always pass `tenantId: 'platform'`,
routing to `PlatformAuditLog` — not a tenant-owned entity; it exists to be
DijiPeople's own commercial counterparty, independent of any tenant.

### `PartnerType` vs `PartnershipModel` — two different questions

These are separate columns answering separate questions, and until TASK-0032
neither drove any behaviour at all (BUG-3549):

| | `PartnerType` | `PartnershipModel` |
|---|---|---|
| Answers | **Who is the contracting entity?** | **What commercial relationship were they taken on under?** |
| Values | `INDIVIDUAL`, `COMPANY` | `REFERRAL`, `RESELLER`, `IMPLEMENTATION`, `TECHNOLOGY`, `STRATEGIC`, `CONSULTANT`, `OTHER` |
| Nullable | No (`@default(COMPANY)`) | Yes — partners created before this field existed have no recorded model; a value is never fabricated for them |
| Drives today | Required-field policy at admin create/update and at onboarding submission; the counterparty type (`ContractPartyType`) an agreement *should* record (see below) | Nothing behavioural — captured and carried through lead-to-partner conversion (ITEM-0030) and displayed for reporting only |

Single source of truth for both:
`services/api/src/modules/partners/partner-type-policy.ts`
(`PARTNER_TYPE_POLICY`, `PARTNERSHIP_MODEL_POLICY`). Every enforcement point —
admin create/update, the public inquiry, the onboarding submission and its
review — reads this one table rather than each keeping its own copy, which is
exactly the class of defect `docs/knowledge/modules/contracts-and-agreements.md`
(BUG-0011, "one rule, two implementations, and the copy is the one that
drifts") warns about.

`PARTNERSHIP_MODEL_POLICY` records, as a fact about this commit and not a
permanent guarantee, that every one of the seven models is currently
identical: `leadOwnershipAllowed: true`, `commissionApplicable: true`, and the
same `expectedAgreementType: 'PARTNER_AGREEMENT'` for all of them. `ContractType`
already defines `REFERRAL_ADDENDUM`, `COMMISSION_ADDENDUM` and
`TERRITORY_ADDENDUM` — types that read as designed for per-model
differentiation — but no code path selects among them by `partnershipModel`
today. This is a recorded gap for product triage, not something the module
papers over with an invented mapping. **If a future change makes any of these
depend on `partnershipModel`, `PARTNERSHIP_MODEL_POLICY` must change in the
same commit**, or the policy and the code drift apart the way
`contracts.service.ts`'s blocked-status list once did.

### Partner type behaviour matrix (as implemented)

| Dimension | INDIVIDUAL | COMPANY |
|---|---|---|
| Admin create/update required fields | `contactFirstName` + `contactLastName`. Never `companyName`. | `companyName`. |
| Onboarding submission required fields | `legalName`, `nationalIdNumber`, `registeredAddress`, `authorizedSigner`, `privacyConsent`, plus `taxInformation`/`bankingInformation` if `partner-settings` requires them. | Same, with `registrationNumber` in place of `nationalIdNumber`. |
| Lifecycle (`PartnerStatus`) | Identical — no type parameter in the state machine. | Identical. |
| Agreements | Same required agreement types (`PARTNER_AGREEMENT`/`MASTER_PARTNER_AGREEMENT`, per `partner-settings.requiredAgreementTypes`), same activation gate. Counterparty `ContractPartyType` *should* be `INDIVIDUAL` per this policy — **declared, not yet wired** into `contracts.service.ts`'s default-party inference (a `contracts`-owned file); today both types still record `PARTNER`. | `ContractPartyType.PARTNER` — already correct and unchanged. |
| Duplicate detection | Email + tax id are hard-blocking; company name is never checked (the field does not apply). | Email + tax id + company name (case-insensitive) are all hard-blocking. |
| Commission, portal, leads/referral relations | Identical code paths — no `type` branch anywhere in either service. | Identical. |

### Lifecycle

`PartnerStatus` (`prisma/schema.prisma`) — the same 24-state machine for both
types, driven by `partnerTransition()`:

```
DRAFT -> INQUIRY -> NEW_INQUIRY -> MORE_INFORMATION_REQUIRED -> QUALIFIED
      -> APPROVED_AWAITING_AGREEMENT -> AGREEMENT_IN_PROGRESS -> AGREEMENT_EXECUTED
      -> ONBOARDING_PENDING -> ONBOARDING_INVITED -> ONBOARDING_IN_PROGRESS
      -> SUBMITTED -> UNDER_REVIEW -> INFORMATION_APPROVED
      -> AGREEMENT_DRAFTING -> INTERNAL_APPROVAL -> AWAITING_SIGNATURE -> FULLY_SIGNED
      -> APPROVED_FOR_ACTIVATION -> ACTIVE
                                  -> SUSPENDED / INACTIVE / TERMINATED / REJECTED
```

`REJECTED` and `TERMINATED` are practical dead ends — no code path re-opens
either. Every review/decision transition (inquiry qualify/reject, onboarding
review approve/reject) throws *before* any write when the record is not in an
eligible from-state (the `partner-onboarding.state-machine.ts` pattern named
by BUG-0016, applied consistently to every new check TASK-0032 added).

Lead attribution and agreement source guards (see [`agreements.md`](agreements.md))
treat `TERMINATED`, `REJECTED`, `SUSPENDED` and `INACTIVE` as **unusable** —
a partner in one of these statuses cannot be newly attributed to a lead or
newly linked to an agreement. Every in-pipeline pre-`ACTIVE` status is left
usable: those states are the process that produces the eventual agreement, not
a reason to block it.

### Duplicate detection

`services/api/src/modules/partners/partner-duplicate-detection.ts` (BUG-3550)
— one function, used by every partner-creating path, replacing what was
previously **no check at all** on the admin create path and an email/company-
name-only check on the public inquiry path.

- **Precedence: email, then tax id, then company name.** Email and tax id are
  strong identifiers — a match on either is the same legal party by
  definition once normalised — so both are a hard `409 Conflict`, naming the
  existing partner's display name, code and status. Company name is weaker
  (two unrelated organisations can share a name) but this codebase already
  treats a company-name collision as blocking once an application is past
  pure inquiry stage, so `findPartnerDuplicate` keeps that precedent rather
  than inventing a softer, warning-only tier nothing in either frontend
  renders.
- **Normalisation**: email is lower-cased and trimmed; tax id and company
  name are trimmed, upper-cased and stripped of spaces/dashes
  (`normalizeIdentifier`) so `AB-123` and `ab 123` collide.
- **Company-name matching applies only to `COMPANY`** — an `INDIVIDUAL`'s
  `companyName` is unset, and matching on an absent field would collide every
  individual partner against every other one.
- **`findOnboardingIdentifierDuplicate`** — `registrationNumber`/
  `nationalIdNumber`/`taxInformation.taxId` exist only inside
  `PartnerOnboardingSubmission.data` (no dedicated column), so this scans the
  most recent submission per other partner (bounded to 500, most-recent-first,
  one comparison per partner) and blocks `submitOnboarding()` on a match.
  Acceptable at current partner volume; a dedicated column would be needed if
  the partner directory grows into the thousands.
- **Update excludes the record being updated** (`excludePartnerId`), so
  editing a partner's own unchanged email never self-collides.
- **The public inquiry's pre-existing merge-in-place check was left
  unchanged**: `submitInquiry()`'s own email/company-name check, which
  updates a still-`INQUIRY` record in place rather than blocking, has
  different semantics from a hard 409 and was not rewritten (it has its own
  pinned assertions in `partnership-model-conversion.spec.ts`).

### `PATCH /partners/:id` is a genuine partial update

`UpdatePartnerDto` was `extends CreatePartnerDto {}` (BUG-3566) — every field
was still required, so a caller sending only `{"notes": "x"}` got a 400
listing every other field as missing. It is now `PartialType(CreatePartnerDto)`.
`PartnersService.update()` validates the type policy and duplicate detection
against the **record as it would read after the patch** (existing values
merged with whatever the patch supplies), and writes only the columns the
patch actually mentions — never spreading the whole DTO and defaulting
missing fields, which previously risked silently resetting `status` to
`DRAFT`.

**Operational risk, not yet queried in production**: because the merged-record
check runs on every update, a legacy partner created before type-policy
enforcement (e.g. a `COMPANY` with no `companyName`) is refused on *any*
further edit — including an unrelated field — until the missing identity
field is supplied in the same request. Check before this reaches a real
tenant fleet:
```sql
SELECT count(*) FROM "Partner"
WHERE (type='COMPANY' AND (companyName IS NULL OR companyName = ''))
   OR (type='INDIVIDUAL' AND (contactFirstName IS NULL OR contactLastName IS NULL));
```

### Audit

`PartnersService` and `PartnerExperienceService` both gained an `AuditService`
dependency (BUG-3551) — previously zero calls in either file. Every mutation
now writes `AuditService.log({ tenantId: 'platform', ... })` (the same
pattern `LeadsService` already used, so it routes to `PlatformAuditLog`, not
the tenant `AuditLog`):

`PARTNER_CREATED`, `PARTNER_UPDATED`, `PARTNER_ACTIVATED` and every other
lifecycle transition, `PARTNER_APPLICATION_APPROVED`/`_REJECTED`,
`PARTNER_ONBOARDING_INVITATION_SENT`, `PARTNER_ONBOARDING_SUBMITTED`,
`PARTNER_COMMISSION_CREATED`/`_UPDATED`, referral-link
create/enable/disable/expire/`PARTNER_REFERRAL_LINK_REGENERATED`, and
`PLATFORM_LEAD_ATTRIBUTION_CORRECTED` (below). Snapshots exclude
`applicationSnapshot` (the raw original submission — duplicative) and
`notes`. `PartnerTimeline` — the partner's own readable history — is
unchanged and still written alongside, distinct from the audit log the same
way [`tenant-control-plane.md`](tenant-control-plane.md) describes for the
tenant timeline: a sentence-per-event history versus the immutable technical
record.

### Partner ↔ lead attribution

`PATCH /super-admin/leads/:leadId/attribution` (`LeadsService.correctAttribution`)
is the one audited, reassignable attribution path — distinct from the
automatic referral-code attribution `PartnerReferralResolverService.resolve()`
performs at lead capture:

- **Refuses a non-`ACTIVE` partner** — the same `status !== ACTIVE` rule
  `PartnerReferralResolverService.resolve()` already applies to automatic
  attribution, reused rather than re-implemented (the BUG-0011 "divergent
  duplicate guard" lesson applied directly).
- **No-ops on an identical resubmission** — reassigning a lead to the
  partner+referral-link it already has writes no new
  `LeadAttributionCorrection` row, no `PartnerTimeline` entry and no audit
  row, returning `{ attributionUnchanged: true }` instead.
- **Still gated by a platform role literal, not a permission** — deliberately
  kept as `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN` rather than
  converted to `platform.*` permission during TASK-0032's ADR-0018 sweep
  (WP-02), because attribution changes commission ownership and the owner
  chose to keep it at the platform-admin tier specifically. Confirmed as a
  deliberate decision, not a residual defect, by TASK-0032 WP-09 QA.
- **`getLead()` embeds the attributed partner** (`{ id, displayName, type,
  status }`) — REG-622. Before this, the admin's "Referral partner" field and
  the attribution panel's "current partner" state both read blank because the
  API returned only the scalar `partnerId` and the runtime form labels a
  lookup from the embedded object, not the bare id.
- **The admin `leads` form's `partnerId` field is read-only** — reassignment
  goes only through the dedicated `LeadAttributionPanel`
  (`apps/admin/app/_components/leads/lead-attribution-panel.tsx`), a
  searchable, server-filtered (`status=ACTIVE`) partner lookup showing type
  and status. The server-side filter is a UI convenience only; calling the
  API directly with a suspended/inactive partner id is still refused by
  `correctAttribution` itself — a read filter is never the access control.

### Partner ↔ customer

`CustomerAccount.originatingPartnerId` and the `Partner.attributedCustomers`
relation carry the partner attribution forward through lead-to-customer
conversion (ITEM-0030); a partner's `attributedTenants` relation does the same
for tenant provisioning. Neither relation gained new behaviour in TASK-0032 —
the residual pairwise consistency checks for partner+customer (and the
partner/customer leg of a partner+lead+customer triple) were named as
unimplemented in WP-05's agreement scenario matrix (see
[`agreements.md`](agreements.md), scenarios 5–6) and remain open follow-ups,
not implemented here.

### Deletion rules

`PartnerDeletionService` (`services/api/src/modules/partners/partner-deletion.service.ts`)
performs the same batch-delete pattern every platform-runtime module uses
(`_count` a fixed relation set, refuse by name if any is non-zero, delete
otherwise). Before commit `0a84a58e`, this check covered only leads,
commissions, agreements, referral links and portal users — five of eleven
`onDelete: Restrict` relations into `Partner`. The missing six (`inquiries`,
`onboardingApplications`, `previousAttributions`, `correctedAttributions`,
`leadReviews`, `supportCases`) meant a delete could still reach PostgreSQL and
fail as a raw foreign-key violation — surfaced to the operator as a bare
`500 Unexpected error` — for **almost every real partner**, since nearly all
of them originate from a public inquiry, and any partner ever re-attributed
to a lead appears in the attribution history (REG-620, found live by TASK-0032
WP-09 QA).

Every `onDelete: Restrict` relation into `Partner` is now checked and named in
the refusal:

| Relation | Refusal names |
|---|---|
| `leads` | lead(s) |
| `commissions` | commission(s) |
| `agreements` | agreement(s) |
| `referralLinks` | referral link(s) |
| `portalUsers` | portal user(s) |
| `inquiries` | "the partner application it came from" |
| `onboardingApplications` | onboarding application(s) |
| `previousAttributions` + `correctedAttributions` | lead attribution change(s) (combined count) |
| `leadReviews` | lead review(s) |
| `supportCases` | support case(s) |

`PartnerTimeline` is also `onDelete: Restrict`, but it is the partner's own
diary rather than business history anything else depends on: when no relation
above blocks the delete, the timeline is removed together with the partner in
one transaction (`prisma.$transaction`), rather than being a second reason to
refuse.

`LeadsService.bulkDeleteLeads` gained the equivalent check for leads
(REG-621): `LeadAttributionCorrection`, `Contract.relatedLeadId` and
`PartnerLeadReview` are all `Restrict` into `Lead` and were previously
unchecked (only a converted customer blocked the delete before this fix). A
lead with any of those is refused with a `400` naming what blocks it and
suggesting archiving instead; a lead with none is deleted.

Both fixes, and the `getLead()` partner-embedding fix above, are proven by
`services/api/src/modules/partners/partner-deletion.service.spec.ts` and
`services/api/src/modules/leads/lead-delete-and-partner.spec.ts`
(REG-620, REG-621, REG-622 — `docs/qa/regressions/_incoming/architect.md`).

---

## Related

[[agreements]] (governing-agreement gate for partner activation) ·
[[platform-auth]] (the platform-permission model these endpoints authorize
under) · [[contracts-and-agreements]] · See also
[`agreements.md`](agreements.md), [`rbac.md`](rbac.md#platform-roles-adr-0018).
