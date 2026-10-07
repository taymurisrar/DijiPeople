# Partners

The DijiPeople partner program: who a partner is, what its two independent
classification axes actually control, how a partner moves from a public
inquiry to an active, revenue-eligible account, and where its data intersects
leads, agreements and customers.

> **Last verified:** 2026-10-08
> **Verified against:** `services/api/src/modules/partners/`,
> `services/api/src/modules/partner-experience/`,
> `packages/config/partner-lifecycle.js`, `prisma/schema.prisma`
> (`Partner`, `PartnerType`, `PartnerStatus`, `PartnerAccountStatus`,
> `PartnershipModel`, `PartnerCommission`), branch
> `agent/partner-module-completion` after EXECPLAN-0055 WP-01..WP-08
> (TASK-0037). The sections on lifecycle, account status, commissions,
> agreements, invitations, contacts, referral links, timeline, deletion and the
> admin record page were rewritten then; the type, duplicate-detection and
> attribution sections date from TASK-0032 (`0a84a58e`).

---

## Model

`services/api/src/modules/partners/` (`PartnersService`, admin CRUD) and
`services/api/src/modules/partner-experience/` (`PartnerExperienceService`,
the public inquiry/onboarding funnel and the partner portal) both operate on
one `Partner` row (`prisma/schema.prisma`). A partner is a platform-level
record — `AuditService.log()` calls for it always pass `tenantId: 'platform'`,
routing to `PlatformAuditLog` — not a tenant-owned entity; it exists to be
DijiPeople's own commercial counterparty, independent of any tenant.

### Partner number

Every partner carries `partnerNumber` (`PART-000001`), the human-readable
number (ADR-0027, EXECPLAN-0055 WP-03).

- **Issued by the server only.** `PlatformNumberingService.next('partner', tx)`
  (`services/api/src/common/numbering/`) runs a single
  `UPDATE "PlatformNumberSequence" … RETURNING` on the create's own
  transaction. Concurrent creates serialise on the row lock, a rolled-back
  create releases its number, and duplicates are impossible (proven against
  PostgreSQL by `test/platform-numbering.e2e-spec.ts`). All three creation
  paths allocate this way: the admin create (`PartnersService.create`), the
  public inquiry (`submitInquiry`) and inquiry qualification
  (`qualifyInquiry`).
- **Immutable.** No DTO accepts it and no update writes it
  (`partner-number-assignment.spec.ts`).
- **Format** is `prefix + separator + lpad(n, padding) + suffix`, configured
  under Admin Settings → Numbering. A change only affects numbers issued
  afterwards. The next number may only be raised, because every lower value
  has already been issued.
- Existing partners were numbered by the WP-02 migration in creation order.
- `code` (`PTR-…` / `DP-P-…`) is unchanged. It stays as the internal and
  legacy reference, shown as "Partner code".

Endpoints (`super-admin/platform-settings/…`, so `settings.read` for GET and
`settings.manage` for PATCH; a change also needs the administrator tier, and
each one is audited as `PLATFORM_NUMBER_SEQUENCE_UPDATED`):

| Method | Path |
|---|---|
| `GET` | `/super-admin/platform-settings/numbering` |
| `GET` | `/super-admin/platform-settings/numbering/:key` |
| `PATCH` | `/super-admin/platform-settings/numbering/:key` — `prefix`, `separator`, `suffix` (`[A-Z0-9-_/.]`, up to 12), `padding` (1–12), `nextValue` (raise only) |

Every response carries `preview`, the next number as it will be issued.

### Partner currency

A partner's `currencyCode` must be an **enabled** platform currency
(`platform-defaults.enabledCurrencies`, ADR-0026 D4) when it is chosen: on
create, on inquiry qualification, and on an update that changes it. A currency
disabled later stays valid on the partners that already carry it, and the
admin form still shows it.

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

### Lifecycle (ADR-0026)

`PartnerStatus` (`prisma/schema.prisma`) has 24 values, the same for both
types. They are listed, labelled and grouped into phases in **one shared
module**, `packages/config/partner-lifecycle.js`. The API imports it to enforce
transitions and the admin imports it to decide which commands to offer and how
to label the header, so the two cannot disagree. `partner-lifecycle.test.js`
fails if a status is added to the schema without a phase.

**Status changes only through lifecycle actions.** A partner is created at
`DRAFT`. Neither the create nor the update DTO accepts `status`,
`accountStatus`, `partnerNumber` or `code`, and the header status is read-only
for partners (the API refuses `change-status` with
`PARTNER_STATUS_ACTION_REQUIRED`).

The record shows three values, never a 24-option dropdown:

| Header label | Source | Values |
|---|---|---|
| **Status** | the *phase* derived from `PartnerStatus` (`partnerPhaseOf`), never stored | Prospect, Onboarding, Active, Suspended, Closed |
| **Sub-status** | the exact `PartnerStatus`, labelled from the shared table | e.g. "Approved, awaiting agreement", "Onboarding invited" |
| **Account** | `PartnerAccountStatus` (portal access) | Not provisioned, Invited, Active, Suspended, Disabled |

The phases are:

- **Prospect:** DRAFT, INQUIRY, NEW_INQUIRY, UNDER_REVIEW,
  MORE_INFORMATION_REQUIRED, QUALIFIED.
- **Onboarding:** APPROVED_AWAITING_AGREEMENT through APPROVED_FOR_ACTIVATION
  (agreement drafting and signing, the onboarding invitation, submission and
  approval).
- **Active:** ACTIVE.
- **Suspended:** SUSPENDED.
- **Closed:** INACTIVE, TERMINATED, REJECTED.

The record's process bar draws the five phases.

Lifecycle actions (`PARTNER_LIFECYCLE_ACTIONS`). The API enforces the
from-states; the admin offers each command only in them.

| Admin command | API action | Allowed from | Result |
|---|---|---|---|
| Start review | `start-review` | INQUIRY, NEW_INQUIRY, MORE_INFORMATION_REQUIRED | UNDER_REVIEW |
| Approve application | `approve` | INQUIRY, NEW_INQUIRY, UNDER_REVIEW, MORE_INFORMATION_REQUIRED | APPROVED_AWAITING_AGREEMENT |
| Request information | `request-information` | INQUIRY, NEW_INQUIRY, UNDER_REVIEW | MORE_INFORMATION_REQUIRED |
| Reject (reason required) | `reject` | the approve states and APPROVED_AWAITING_AGREEMENT | REJECTED |
| Create agreement | none (opens the agreement form) | APPROVED_AWAITING_AGREEMENT, ACTIVE | — |
| Send onboarding link | `send-onboarding-link` | AGREEMENT_EXECUTED, FULLY_SIGNED, ONBOARDING_PENDING, ONBOARDING_INVITED, ONBOARDING_IN_PROGRESS | ONBOARDING_INVITED (a resend from IN_PROGRESS keeps IN_PROGRESS) |
| Activate partner | `activate` | INFORMATION_APPROVED, APPROVED_FOR_ACTIVATION | ACTIVE, account INVITED |
| Suspend (reason required) | `suspend` | ACTIVE | SUSPENDED, account SUSPENDED |
| Deactivate (reason required) | `deactivate` | ACTIVE, SUSPENDED | INACTIVE, account DISABLED |
| Reactivate | `reactivate` | SUSPENDED, INACTIVE | ACTIVE |

Every action writes a `PartnerTimeline` entry and a `PlatformAuditLog` row with
the operator as actor. Inquiry qualification and rejection, and contract
signing, never move a partner that has already been live
(`PARTNER_POST_ACTIVATION_STATUSES`) back into the funnel. `REJECTED` and
`TERMINATED` are dead ends: no code path re-opens either.

### Account status

`PartnerAccountStatus` records **portal access** and is system-controlled. The
form shows it read-only, with the action that sets each value:

| Value | Set by |
|---|---|
| NOT_PROVISIONED | the default: no portal account yet |
| INVITED | Activate partner, which sends the portal activation invitation |
| ACTIVE | the partner contact accepting that invitation |
| SUSPENDED | Suspend; Reactivate restores access |
| DISABLED | Deactivate; Reactivate restores access |

### Onboarding invitation (EXECPLAN-0055 D6)

Send onboarding link creates or rotates the partner's
`PartnerOnboardingApplication` and emails the link.

- **States.** The application moves INVITED → IN_PROGRESS → SUBMITTED →
  UNDER_REVIEW → APPROVED, with CHANGES_REQUESTED and REJECTED from review. A
  send is refused as "already onboarded" once the partner is SUBMITTED,
  INFORMATION_APPROVED, APPROVED_FOR_ACTIVATION or ACTIVE.
- **Resend.** The email idempotency key includes the token hash, so a resend
  delivers a new link and the previous one stops working. Resends have a
  60-second cooldown (`PARTNER_INVITATION_COOLDOWN`).
- **No token leaves the server.** It is never returned to the console, logged,
  audited or written to the timeline.
- **A failed send is a failure.** A provider error rolls the send back and
  returns `PARTNER_INVITATION_DELIVERY_FAILED`. Every send, delivered or not, is
  audited (`PARTNER_ONBOARDING_INVITATION_SENT` / `_FAILED`).

### Commissions (ADR-0026 D3)

- **Rate.** A percentage from 0 to 100 with two decimals, stored as
  `Decimal(5,2)` on `Partner.defaultCommissionRate`,
  `Contract.commissionPercentage` and `PartnerCommission.commissionRate`, and
  shown as `n%`.
- **Commission records are an operator-created ledger.** Add commission (on
  the partner's Summary tab, or Commissions → New) records a base amount, rate,
  currency and, optionally, the lead, customer or invoice it is for.
  - The server computes `amount = base × rate / 100`.
  - A blank rate takes the partner's default and a blank currency the partner's
    currency. A partner with no default needs an explicit rate
    (`PARTNER_COMMISSION_RATE_REQUIRED`).
  - A linked lead, customer or invoice must belong to the partner
    (`PARTNER_COMMISSION_LINK_INVALID`).
  - Money terms are immutable: a wrong entry is voided and re-created.
- **Status machine.** PENDING → APPROVED → PAYABLE → PAID, with VOID allowed
  from any state except PAID. Each change is conditional on the current state,
  audited and written to the timeline.
- **No automatic accrual.** Nothing generates commissions from collected
  invoices; that is ITEM-0227, a product decision.

### Agreements and the commission snapshot

A new partner agreement **snapshots** the partner's default commission (when it
is above zero) and currency into its own `commissionPercentage` and currency
when it is created. Later edits to the partner never change an existing
agreement, and an explicit agreement rate is never overwritten. Agreements
created before this keep their render-time fallback until they are next saved.

### Contacts

The record's Contacts tab shows the partner's **primary contact** (the
`contactFirstName`, `contactLastName`, `email` and `phone` columns) and a grid
of **contacts**, which are `PartnerPortalUser` rows.

`POST /partners/:id/contacts` (`partners.manage`) adds a contact (first name,
last name, email) as a portal user with status `NOT_INVITED` and an unusable
password hash.

- **Nothing is sent.** Sign-in requires `ACTIVE`. Portal access is still
  granted only by Activate partner, which invites the partner's business email
  (and finds an existing contact by that email), and by the portal's own flows.
- **Email is unique across all partners**, because portal sign-in is keyed on
  it. An email any portal user already holds is refused with
  `PARTNER_CONTACT_EMAIL_IN_USE` on the email field.
- **Audited.** Each add writes a `CONTACT_ADDED` timeline entry and a
  `PARTNER_CONTACT_CREATED` audit row.
- A contact is a portal-user row, so it blocks deleting the partner (see
  Deletion rules).

### Referral links

- `GET /partners/:id` returns each referral link with `url`, built on the
  server from the configured public site (`PUBLIC_SITE_URL` /
  `LANDING_APP_URL`, `buildPublicSiteUrl`) as `<site><targetPath>?ref=<code>`.
  `ref` is the parameter `apps/landing/lib/referral.ts` captures. The URL is
  null when production has no public site configured, never a loopback link.
- `POST /partners/:id/referral-links` creates a link for an ACTIVE partner,
  audited as `PARTNER_REFERRAL_LINK_CREATED`.
- `POST /partners/:id/referral-links/:linkId/action` enables, disables, expires
  or regenerates one.
- `submissionCount` and `lastUsedAt` are maintained by the referral resolver as
  leads arrive.

### Timeline

`PartnerTimeline` is the partner's readable history. `GET
/platform-runtime/partners/:id/timeline` returns it newest first, with each
actor's name.

A note added from the Timeline tab is written there as a `NOTE` entry, with the
operator as actor, and audited as `PARTNER_NOTE_ADDED`. EXECPLAN-0055 D5: notes
used to go only to the platform audit log, which the tab never read. Those
older notes are read back from the audit log, so none is lost.

### The admin record page

`/partners/:id` is the runtime record page, with the partner's declarations in
`apps/admin/lib/runtime/platform-module-registry.ts`.

- **Highlight header** (`RecordHighlightHeader`, from the `highlight`
  declaration). It shows the name, Partner number, Owner, Status (phase),
  Sub-status, Account, Type and Partnership. Owner is the only control and
  reassigns through the governed `assign` route. Status and Sub-status are
  read-only values that carry their reason.
- **Tabs and what each reads.** Every subgrid reads
  `GET /platform-runtime/partners/:id/related/<key>`, which serves the arrays
  `PartnersService.get()` returns.

| Tab | Content | Add |
|---|---|---|
| Summary | identity, commercial terms, owner, internal notes; Commissions grid (`commissions`) | Add commission → runtime `POST /platform-runtime/commissions` with `partnerId` |
| Application | application details; Partner application (`inquiries`, opens `/partner-inquiries/:id`); Onboarding applications (`onboardingApplications`, opens `/partner-onboarding/:id`) | — |
| Contacts | primary contact; Contacts (`portalUsers`) | Add contact → `POST /partners/:id/contacts` |
| Agreements | Partner agreements (`agreements`) | Create agreement command |
| Referral Links | `referralLinks` with code, URL, status, leads, last used; Copy link, Disable, Enable, Regenerate | Add referral link → `POST /partners/:id/referral-links` (active partners) |
| Referred Leads | `leads`: company, contact, status, attribution (referral link code or manual correction), referred date, converted customer | — |
| Customers | `attributedCustomers` | — |
| Tenants | `attributedTenants`: tenant, workspace slug, customer, status | — |
| Timeline | `PartnerTimeline` with notes | Add note |
| System | id, created, updated | — |

- **No Documents tab.** A partner has no document relation, so the tab is not
  declared.
- **Quick create.** Add opens `RuntimeQuickCreatePanel`, a right-edge sheet
  driven by the subgrid's `quickCreate` declaration. It renders the child
  module's own runtime fields, attaches the partner itself, refuses a second
  submission while one is in flight, shows field errors beside their fields,
  and reloads the grid without leaving the record.
- **Gating.** Add buttons and the referral-link commands are shown only to
  holders of `partners.manage`. That is a convenience; the API enforces it.

### Unusable partners

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
`PARTNER_REFERRAL_LINK_CREATED`/enable/disable/expire/`_REGENERATED`,
`PARTNER_CONTACT_CREATED`, `PARTNER_NOTE_ADDED`, partner deletion and delete
refusal, and `PLATFORM_LEAD_ATTRIBUTION_CORRECTED` (below). Snapshots exclude
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
- **Kept at the platform administrator tier** — attribution changes
  commission ownership, so only `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN`
  may correct it. Since ITEM-0204 that tier is the `platform.administer`
  permission (`isPlatformAdminTier()`) rather than a role list; the holders
  are unchanged.
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

### Deletion rules (EXECPLAN-0055 D5)

Deleting a partner asks what depends on it first.
`GET /platform-runtime/partners/:id/dependencies` returns one entry per related
area, `{ area, count, policy, reason, href }`, and the admin delete dialog (on
the record and on the list) shows them with links to the tab that lists them.
The classification lives in
`services/api/src/modules/partners/partner-dependencies.ts`, and
`partner-dependencies.spec.ts` fails on any relation into `Partner` that it
does not classify.

The schema's `onDelete` is **not** the policy. Several relations are `SetNull`
or `Cascade` in the schema and are still kept, because deleting would erase a
business fact:

| Relation | Schema | Policy | Why |
|---|---|---|---|
| `commissions` | Cascade | BLOCKS | Financial records; never deleted with a partner |
| `leads` | SetNull | RETAIN (blocks) | Deleting would erase lead attribution |
| `attributedCustomers` | SetNull | RETAIN (blocks) | The attribution commission is computed from |
| `attributedTenants` | SetNull | RETAIN (blocks) | As above |
| `agreements` | Restrict | BLOCKS | Contract evidence with its own retention |
| `inquiries` | Restrict | BLOCKS | The partner's origin record |
| `onboardingApplications` | Restrict | BLOCKS | Remove onboarding deliberately |
| `portalUsers` (contacts) | Restrict | BLOCKS | Portal accounts and contacts |
| `referralLinks` | Restrict | BLOCKS | Leads and customers cite them |
| attribution corrections (previous and corrected) | Restrict | BLOCKS | Attribution history |
| `leadReviews`, `supportCases` | Restrict | BLOCKS | Business history |
| `timeline` | Restrict | CASCADE | The partner's own diary, removed with it |

- **The delete re-checks inside its transaction**, under a row lock, so a
  dependency added between the dialog and the confirmation still refuses.
- **A refusal is named.** It is returned in `data.message` (for example
  "Nothing was deleted. Kept 1: Acme — it still has the partner application it
  came from") and shown in red. A foreign-key failure that slips past the check
  becomes the same named refusal, never a bare 500.
- **Both outcomes are audited.** Deletions and refusals each write a
  `PlatformAuditLog` row.

In practice, almost every real partner is kept: nearly all originate from a
public inquiry. Deletion is for partners created in error that nothing has
touched yet.

`LeadsService.bulkDeleteLeads` gained the equivalent check for leads
(REG-621): `LeadAttributionCorrection`, `Contract.relatedLeadId` and
`PartnerLeadReview` are all `Restrict` into `Lead` and were previously
unchecked (only a converted customer blocked the delete before this fix). A
lead with any of those is refused with a `400` naming what blocks it and
suggesting archiving instead; a lead with none is deleted.

The partner rules are proven by `partner-deletion.service.spec.ts` and
`partner-dependencies.spec.ts`; the lead rule and the `getLead()`
partner-embedding fix by
`services/api/src/modules/leads/lead-delete-and-partner.spec.ts`
(REG-620, REG-621, REG-622 — `docs/qa/regressions/_incoming/architect.md`).

---

## Related

[[agreements]] (governing-agreement gate for partner activation) ·
[[platform-auth]] (the platform-permission model these endpoints authorize
under) · [[contracts-and-agreements]] · See also
[`agreements.md`](agreements.md), [`rbac.md`](rbac.md#platform-roles-adr-0018).
