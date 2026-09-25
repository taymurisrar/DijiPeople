# D2 — Partner model, partner types, onboarding lifecycle, and partner↔lead/customer relationships

Discovery only. No source, git state or database was modified. Worktree:
`D:/My Work/hrm-dijipeople/dp-partner-admin` (branch
`agent/partner-agreements-admin-hardening`).

## 1. Prisma models

`services/api/prisma/schema.prisma`.

### Enums

- `PartnerType` (`schema.prisma:424`): `INDIVIDUAL | COMPANY` — the **contracting
  entity type**. A comment directly above it (`:275-280`) is explicit that this
  is a different axis from the commercial relationship.
- `PartnershipModel` (`:281`): `REFERRAL | RESELLER | IMPLEMENTATION |
  TECHNOLOGY | STRATEGIC | CONSULTANT | OTHER` — added later (ITEM-0030) to
  capture the commercial relationship that `PartnerType` cannot express.
- `PartnerStatus` (`:429`): 23-value lifecycle enum spanning inquiry → review →
  agreement → onboarding → `ACTIVE` → `SUSPENDED/INACTIVE/TERMINATED/REJECTED`.
  Several of these values (`SUBMITTED`, `UNDER_REVIEW`,
  `INFORMATION_APPROVED`, `AGREEMENT_DRAFTING`, `INTERNAL_APPROVAL`,
  `AWAITING_SIGNATURE`, `FULLY_SIGNED`, `APPROVED_FOR_ACTIVATION`) are declared
  but **not** written by any code path found (see §7 — dead enum values).
- `PartnerAccountStatus` (`:456`): `NOT_PROVISIONED | INVITED | ACTIVE |
  SUSPENDED | DISABLED` — the partner **portal account**, separate from
  `PartnerStatus` (the commercial relationship).
- `PartnerReferralLinkStatus`, `PartnerInquiryStatus`, `PartnerOnboardingStatus`,
  `PartnerLeadReviewStatus`, `PartnerCommissionStatus`, `LeadAttributionStatus`
  — one state machine each, all present.

### Models

- **`Partner`** (`:2868`): `code` (unique), `type` (`PartnerType`, default
  `COMPANY`), `partnershipModel` (nullable — pre-ITEM-0030 partners have no
  value, deliberately not backfilled), `displayName`, `legalName`,
  `companyName`, contact fields, `email`, `taxId`, `defaultCommissionRate`
  (`Decimal(5,2)`), `currencyCode`, `status` (`PartnerStatus`), `accountStatus`
  (`PartnerAccountStatus`), `applicationSnapshot` (Json), `assignedToUserId`.
  Relations: `leads`, `commissions`, `agreements` (`Contract[]`), `inquiries`,
  `onboardingApplications`, `portalUsers`, `leadReviews`, `supportCases`,
  `referralLinks`, `attributedCustomers` (`CustomerAccount[]`),
  `attributedTenants` (`Tenant[]`), `previousAttributions` /
  `correctedAttributions` (`LeadAttributionCorrection[]`), `timeline`
  (`PartnerTimeline[]`). No `tenantId` — Partner is a platform-level entity, not
  tenant-owned, which is correct (partners exist before/across tenants).
- **`PartnerInquiry`** (`:3549`): `referenceNumber` (unique), `status`, `type`
  (`PartnerType`), `partnershipModel`, contact fields, `consentAcceptedAt`
  (required), `marketingConsent` (separate, optional — comment at `:3570`
  explicitly says a partnership inquiry must be submittable without marketing
  consent), attribution capture (`sourcePage`, `utm*`, `correlationId`),
  `submissionHash` (unique, dedup key), `partnerId` (nullable FK, `Restrict`).
- **`PartnerOnboardingApplication`** (`:3599`): `partnerId` (required),
  `status` (`PartnerOnboardingStatus`, default `INVITED`),
  `invitationTokenHash` (unique), `tokenExpiresAt`, `submittedAt`,
  `reviewedAt`/`reviewedById`/`reviewNotes`, `version`. `onDelete: Restrict`
  on the partner relation.
- **`PartnerOnboardingSubmission`** (`:3619`): `applicationId`, `version`
  (`@@unique([applicationId, version])`), `data` (Json — the actual submitted
  compliance/KYC payload), `submittedFromIp`.
- **`PartnerPortalUser`** (`:3632`): `partnerId`, `email` (unique),
  `passwordHash`, `status` (plain `String`, default `"INVITED"` — **not** an
  enum, unlike every other status column in this area), `invitationTokenHash`
  (unique), `invitationExpiresAt`, `activatedAt`, `lastActiveAt`.
- **`PartnerRefreshToken`** (`:3652`): the portal-user session table, mirrors
  `RefreshToken`/`PlatformRefreshToken`/`AgentRefreshToken` — a fourth,
  independent JWT/session family for the partner portal actor type.
- **`PartnerLeadReview`** (`:3665`): `leadId` (`@unique` — one review per lead),
  `partnerId`, `status` (`PartnerLeadReviewStatus`), `lockedAt`, `submittedAt`,
  `reviewedAt/By`, `rejectionReason`, `approvedAt`. This is the partner-authored
  lead flow (a partner submits a prospect through the portal; it goes through
  its own draft → submit → review pipeline distinct from `Lead.status`).
- **`PartnerReferralLink`** (`:2930`): `partnerId`, `code` (unique),
  `targetPath` (default `/request-demo`), `isDefault`, `status`, `expiresAt`,
  `submissionCount`, `replacedById` (self-relation for regeneration chains).
  Relations to `leads` and `customers` (`CustomerAccount[]` via
  `"ReferralLinkCustomers"`).
- **`PartnerCommission`** (`:2992`): `partnerId` (Cascade), `leadId`,
  `customerAccountId`, `invoiceId` — **all three are plain `String?` scalar
  columns with only an `@@index`, no `@relation` and no `onDelete` rule.**
  Referential integrity to `Lead`/`CustomerAccount`/`Invoice` is not enforced
  by the database; a commission can point at an id that no longer exists.
  `commissionNumber` unique, `baseAmount`/`commissionRate`/`commissionAmount`
  all `Decimal`.
- **`PartnerTimeline`** (`:2978`): `partnerId`, `eventType` (free string),
  `actorType`/`actorId`, `message`, `metadata` (Json). This is the **only**
  persistent history for most partner-side state changes (see §6 — audit gap).
- **`LeadAttributionCorrection`** (`:2957`): `leadId`, `previousPartnerId`,
  `correctedPartnerId`, `previousReferralLinkId`/`correctedReferralLinkId`,
  `previousReferralCode`/`correctedReferralCode`, `reason` (required),
  `changedById`. The audited record of a manual re-attribution.

### Lead / CustomerAccount attribution fields

- **`Lead`** (`:2748`) carries `partnerId`, `partnerReferralLinkId`,
  `referralCodeSnapshot`, `referralSource`, `referredAt`, `attributionStatus`
  (`LeadAttributionStatus`, default `DIRECT`) directly on the row — a lead
  already references a partner today, no junction table needed
  (`@@index([partnerId])`, `@@index([partnerReferralLinkId])`,
  `@@index([attributionStatus, referredAt])`).
- **`CustomerAccount`** (`:2608`) carries the same attribution forward:
  `leadId` (`@@unique([leadId])` — one lead → at most one customer, DB
  enforced), `originatingPartnerId`, `originatingReferralLinkId`,
  `referralCodeSnapshot`. `originChannel` (`CustomerOriginChannel?`, nullable —
  ITEM-0008) records acquisition channel independently of partner attribution,
  and is left `NULL` rather than backfilled with a guess for pre-existing rows.

## 2. API surface

### `services/api/src/modules/partners/` — internal/admin partner CRUD

`partners.controller.ts` (`@UseGuards(JwtAuthGuard)` only — no
`PermissionsGuard`/`@Permissions`/`@RequirePermission`; authorization is done
**inside the service**, see §5):

| Method | Route | Delegates to |
|---|---|---|
| GET | `/partners` | `listForUser` |
| POST | `/partners` | `createForUser` |
| GET | `/partners/:partnerId` | `getForUser` |
| PATCH | `/partners/:partnerId` | `updateForUser` |
| POST | `/partners/:partnerId/lifecycle` | `lifecycleActionForUser` |
| GET | `/partners/:partnerId/referral-links` | via `getForUser` |
| POST | `/partners/:partnerId/referral-links` | `createReferralLinkForUser` |
| POST | `/partners/:partnerId/referral-links/:linkId/action` | `referralLinkActionForUser` |
| POST | `/partners/:partnerId/commissions` | `createCommissionForUser` |
| PATCH | `/partners/:partnerId/commissions/:commissionId` | `updateCommissionForUser` |

**Lifecycle state machine** (`partners.service.ts:576`, `partnerTransition()`):

```
INQUIRY/NEW_INQUIRY/MORE_INFORMATION_REQUIRED --start-review--> UNDER_REVIEW
INQUIRY/NEW_INQUIRY/UNDER_REVIEW/MORE_INFORMATION_REQUIRED --approve--> APPROVED_AWAITING_AGREEMENT
...(+APPROVED_AWAITING_AGREEMENT) --reject--> REJECTED
INQUIRY/NEW_INQUIRY/UNDER_REVIEW --request-information--> MORE_INFORMATION_REQUIRED
ACTIVE --suspend--> SUSPENDED
SUSPENDED/INACTIVE --reactivate--> ACTIVE
ACTIVE/SUSPENDED --deactivate--> INACTIVE
```

`update()` (`:403`) additionally guards the generic `PATCH` against bypassing
this machine: entering `ACTIVE` via plain update is refused (must use
governed activation), and **leaving** `ACTIVE` via plain update is also
refused (comment at `:412` explicitly documents this was the mirrored gap that
used to exist — a prior fix). `createCommission` spreads `...dto` into
`prisma.partnerCommission.create`, but `CreatePartnerCommissionDto`
(`dto/partner.dto.ts:80`) whitelists only safe fields (no `partnerId`,
`status`, `commissionAmount`), so the spread is not exploitable given
`forbidNonWhitelisted: true` — worth flagging only because it is fragile if a
field is ever added to the DTO without re-checking this call site.

### `services/api/src/modules/partner-experience/` — onboarding lifecycle, portal, public inquiry

Three controllers in `partner-experience.controller.ts`:

- `PublicPartnersController` (`@Controller('public/partners')`,
  `PublicRateLimitGuard`): `POST inquiries`, `GET/POST onboarding/:token`,
  `POST activate`.
- `PartnerAuthController` (`@Controller('partner-auth')`,
  `PublicRateLimitGuard`): `POST login`, `POST refresh` — a fourth,
  independent auth client (alongside `web`/`admin`/`agent-desktop`) for the
  partner-portal actor.
- `PartnerPortalController` (`@Controller('partner-portal')`,
  `PartnerAuthGuard`): `GET me`, `GET/POST leads`, `PATCH leads/:reviewId`,
  `POST leads/:reviewId/submit`, `GET/POST referral-links`, `GET contracts`,
  `GET contracts/:contractId`.
- `PartnerExperienceAdminController` (`@Controller('partner-experience')`,
  `JwtAuthGuard` only): `GET/POST inquiries/:id/{qualify,reject}`,
  `GET onboarding`, `POST onboarding/:id/:decision`,
  `POST partners/:id/activate`, `POST lead-reviews/:id/:decision`.

**Onboarding review state machine** — `partner-onboarding.state-machine.ts`
(full file, 113 lines). This is a **fix already landed** for what the
2026-08-15 QA run recorded as BUG-06 (there tracked as **BUG-0016** in the
durable record, per the file's own comment at `:9`):

- `PARTNER_ONBOARDING_REVIEWABLE_STATUSES = [SUBMITTED, UNDER_REVIEW,
  CHANGES_REQUESTED]` — a decision is refused unless the application is in one
  of these **and** `submittedAt` is set (`:107`), closing exactly the
  "approve an application that never submitted anything" hole QA reproduced.
- `PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW = [ACTIVE, SUSPENDED,
  INACTIVE, TERMINATED]` — a review decision is refused once the partner has
  left onboarding's jurisdiction, closing the "flip an already-`ACTIVE`
  partner to `REJECTED`" hole.
- `reviewOnboarding()` (`partner-experience.service.ts:622`) calls
  `partnerOnboardingReviewRefusal()` before writing anything (`:644`).
- Unit coverage: `partner-onboarding.state-machine.spec.ts` (pure function
  tests) and the guard is exercised indirectly by
  `partner-activation.workflow.spec.ts`.

**Full state machine as implemented today:**

```
Inquiry:      NEW --qualify--> [Partner created/updated, status=APPROVED_AWAITING_AGREEMENT], inquiry.status=CONVERTED
              NEW/QUALIFYING --reject--> REJECTED (+ cascades Partner.status=REJECTED if partnerId set)

Onboarding:   sendOnboardingInvitation (partners.service via partner-experience) blocked until a
              PARTNER_AGREEMENT/MASTER_PARTNER_AGREEMENT is FULLY_EXECUTED/FULLY_SIGNED/ACTIVE
              --> PartnerOnboardingApplication created, status=INVITED, invitationTokenHash issued
              INVITED --(public submit via token)--> SUBMITTED (validatePartnerOnboardingData enforced)
              SUBMITTED/UNDER_REVIEW/CHANGES_REQUESTED --approve--> APPROVED, Partner.status=INFORMATION_APPROVED
                                                        --changes--> CHANGES_REQUESTED, Partner.status=ONBOARDING_IN_PROGRESS
                                                        --reject--> REJECTED, Partner.status=REJECTED
              (blocked entirely once Partner.status is ACTIVE/SUSPENDED/INACTIVE/TERMINATED)

Activation:   activatePartner() requires onboardingApplications[0].status===APPROVED AND a
              PARTNER_AGREEMENT/MASTER_PARTNER_AGREEMENT in {FULLY_SIGNED, FULLY_EXECUTED, ACTIVE}
              --> Partner.status=ACTIVE, accountStatus=INVITED, default referral link ensured,
                  PartnerPortalUser upserted (status=INVITED) and an activation email sent.
```

### Duplicate detection

Only one duplicate check exists, in `submitInquiry()`
(`partner-experience.service.ts:74-95`): `Partner.findFirst` on
`email` OR case-insensitive `companyName`. If a match exists **and** its
status is not `INQUIRY`/`NEW_INQUIRY`, the request is refused
("A partner application already exists..."); if it is still fresh, the
existing `Partner` row is silently **updated in place** with the new
submission's data (`:108-128`) rather than creating a second row.

**No duplicate detection exists anywhere on `taxId` or `registrationNumber`**,
and **no duplicate detection exists at all on the internal admin create path**
(`PartnersService.create()`, `partners.service.ts:391`) — an operator can
create any number of `Partner` rows with the same email, company name, or tax
id through `POST /partners`. This is an asymmetry: the public inquiry funnel
has weak (email/company-name) dedup; the internal admin path has none.

### Rejection / re-application handling

- Inquiry rejection (`rejectInquiry`, `:380`): sets `PartnerInquiry.status =
  REJECTED` and, if a `Partner` row already exists for it, cascades
  `Partner.status = REJECTED` too (no state-machine check here — this write
  goes directly to Prisma, not through `partnerTransition()`).
- A partner in `REJECTED` has no code path back to any other status (not
  reachable from any `from` set in `partnerTransition()`, and blocked by
  `PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW`... actually `REJECTED` is
  **not** in that closed list, meaning a rejected partner remains
  onboarding-reviewable in principle, but there is no route back into
  `PARTNER_ONBOARDING_REVIEWABLE_STATUSES` from `REJECTED` in practice since a
  new onboarding application is never created against a rejected partner by
  any code path found). Net effect: `REJECTED` is a practical dead end,
  matching intent, but not because a from-set explicitly says so.

## 3. Lead ↔ Partner: existing capability today

**Yes — an existing partner can be assigned to an existing lead today**, via a
dedicated, audited endpoint:

`PATCH /super-admin/leads/:leadId/attribution` →
`AdminLeadsController.correctAttribution` (`admin-leads.controller.ts:66`) →
`LeadsService.correctAttribution()` (`leads.service.ts:744`).

- Guarded to `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN` only (`:749-759`,
  a manual role check, not `PermissionsGuard`).
- Requires a non-empty `reason` (`:762`).
- Accepts `partnerId` and/or `referralLinkId`; validates the link belongs to
  the given partner (`:770-773`) and that the partner exists (`:774-781`).
- Inside one `$transaction` (`:783`): writes a `LeadAttributionCorrection` row
  (full before/after), updates `Lead.{partnerId, partnerReferralLinkId,
  referralCodeSnapshot, attributionStatus: 'CORRECTED'}`, propagates the same
  three fields to any already-converted `CustomerAccount` for that lead
  (`:806-812` — so attribution correction reaches a customer that already
  converted), and writes a `PartnerTimeline` entry
  (`LEAD_ATTRIBUTION_CORRECTED`) if a partner is set.
- After the transaction: `AuditService.log()` with action
  `PLATFORM_LEAD_ATTRIBUTION_CORRECTED`, full before/after snapshot
  (`:831-844+`).

**The generic lead editor refuses to do this silently.** `updateLead()`
(`leads.service.ts:561`) explicitly checks `dto.partnerId !== existing.partnerId`
and throws `BadRequestException('Use the audited attribution-correction
action to change a lead partner.')` (`:572-576`) — i.e. `UpdateAdminLeadDto`
(`dto/admin-lead.dto.ts:472`) *does* declare a `partnerId` field, but the
service deliberately blocks it from being the write path, forcing the audited
one. This is a deliberately guarded seam, not a gap.

**Commission implications**: `PartnerCommission.leadId` exists but there is no
code path found that automatically creates/adjusts a commission when a lead's
attribution is corrected or when a lead converts — commissions appear to be
created manually via `POST /partners/:partnerId/commissions`
(`CreatePartnerCommissionDto`), not derived. Re-attributing a lead after a
commission already exists for the previous partner does not appear to reconcile
or flag that commission (no code found that reads
`LeadAttributionCorrection` from the commission side).

## 4. Admin UI (`apps/admin`)

All six screens exist and are metadata-runtime-driven
(`RuntimeModulePage`/`RuntimeRecordRoute`), not bespoke:

| Route | File | Module key |
|---|---|---|
| `/partners` | `app/(internal)/partners/page.tsx` | `partners` |
| `/partners/new` | `.../partners/new/page.tsx` | `partners` (via `RuntimeRecordRoute`) |
| `/partners/[partnerId]` | `.../partners/[partnerId]/page.tsx` | `partners` |
| `/partner-inquiries` | `.../partner-inquiries/page.tsx` | `partner-inquiries` |
| `/partner-inquiries/[inquiryId]` | `.../partner-inquiries/[inquiryId]/page.tsx` | `partner-inquiries` |
| `/partner-onboarding` | `.../partner-onboarding/page.tsx` | `partner-onboarding` |
| `/partner-onboarding/[applicationId]` | `.../partner-onboarding/[applicationId]/page.tsx` | `partner-onboarding` |
| `/leads`, `/leads/new`, `/leads/[leadId]` | `app/(internal)/leads/` | `leads` |
| `/commissions`, `/commissions/[commissionId]` | `app/(internal)/commissions/` | `commissions` |
| `/customers`, `/customers/new`, `/customers/[customerAccountId]` | `app/(internal)/customers/` | `customers` |

**The 2026-08-15 QA run's HIGH UI finding is fixed.** It reported
`/partner-inquiries/[inquiryId]` and `/partner-onboarding/[applicationId]` as
unreachable (the list routes redirected into the `/partners` list, a
different entity). Both list pages now carry an explicit comment citing
**BUG-0019** describing exactly that defect and confirming the fix: they
render `RuntimeModulePage` with the correct `moduleKey` instead of
redirecting (`partner-inquiries/page.tsx:12-25`,
`partner-onboarding/page.tsx:12-20`). Sidebar navigation
(`app/_components/admin-sidebar.tsx:100-105`) now links `partners`,
`partner-inquiries` and `partner-onboarding` (labelled "Onboarding reviews")
as three separate items. Server-side, `platform-runtime.service.ts` resolves
`partner-inquiries` and `partner-onboarding` as their own list/detail/delete
cases (`:140-155`, `:236-254`, `:366-374`, `:391-404`, `:604-611`) distinct
from `partners`, so rows now link to the correct detail id space.

`PartnerType` has **no UI-side conditional behaviour**: `partners/new/page.tsx`
only sets an initial default value (`type: "COMPANY"`) for the runtime form;
there is no code anywhere in `apps/admin` that branches on
`INDIVIDUAL`/`COMPANY` (confirmed by repo-wide grep — zero matches for
`PartnerType.INDIVIDUAL`/`'INDIVIDUAL'`/`.type ===` outside the enum/DTO
declarations).

### Partner portal frontend

A real partner-portal frontend exists — **in `apps/web`, not `apps/landing`**:
`apps/web/app/partner/` (`layout.tsx`, `page.tsx` (overview), `leads/`
(list, new, `[reviewId]` detail), `referral-links/`, `contracts/`
(list + `[contractId]` detail), `profile/`), backed by
`apps/web/app/api/partner/auth/{login,logout}/route.ts` and
`apps/web/app/api/partner/portal/[[...path]]/route.ts` proxying to
`/partner-auth/*` and `/partner-portal/*`. **This contradicts the 2026-08-15
QA run's "Known Limitations" note that partner-portal lead submission routes
were permanent 403 stubs** — that appears to have been built out since; the
portal's lead create/update/submit pages call `PartnerPortalController`'s
`createLead`/`updateLead`/`submitLead` endpoints, which are live in
`partner-experience.controller.ts:100-118`. The public partner inquiry form
and public onboarding-by-token form remain in `apps/landing/app/partners/`
(`partner-inquiry-form.tsx`, `onboarding/[token]/partner-onboarding-form.tsx`),
which is the correct split (landing = anonymous public surface; web = the
authenticated partner actor).

## 5. Authorization pattern (architecture-consistency note, not a new defect)

Both `PartnersController` and the three `partner-experience` admin/portal
controllers rely on **service-internal** permission checks
(`assertRead`/`assertWrite` calling `userHasPlatformPermission(user,
'partners.read'|'partners.manage')`) rather than the
`@Permissions`/`@RequirePermission` decorator pair AGENTS.md documents as the
default backend pattern. This matches a risk area the 2026-08-15 QA run had
already named going in ("authorization-missing /
service-authorization-hidden — platform/* and partner-experience/* authorize
inside the service, not via decorators") and is covered by its own spec
(`partners-platform-authorization.spec.ts`). It is the established pattern for
this platform-side module family, not a regression, but it means a reviewer
cannot see the required permission by reading the controller — it has to be
traced into the service.

## 6. Audit coverage — a real gap

`services/api/src/modules/audit/audit.service.ts`'s `AuditService.log()` is
called:

- **7 times** in `leads.service.ts` (lead create/update/status
  transitions/attribution correction/bulk actions are audited).
- **Zero times** in `partners.service.ts` — confirmed by grep: no
  `AuditService` import, no injection in the constructor. Partner create,
  update, every lifecycle transition (`start-review`, `approve`, `reject`,
  `request-information`, `suspend`, `reactivate`, `deactivate`), referral-link
  create/enable/disable/expire/regenerate, and commission create/update are
  **not** written to `AuditService`/`PlatformAuditLog` — only to the
  bespoke `PartnerTimeline` table, which is partner-scoped, has a free-text
  `eventType` (no enum), and is not surfaced through the platform's general
  audit/report views the way `AuditService` rows are.
- **Zero times** in `partner-experience.service.ts` — confirmed by grep: no
  `AuditService` import/injection. Inquiry qualify/reject, onboarding
  send-invitation/submit/review, partner activation and partner-lead review
  all go through `PartnerTimeline` + `PlatformCommunicationsService.sendEmail`
  only; `PlatformEventsService.record()` is called exactly twice in the whole
  file (`:235`, `:363`).
- The **one** exception: `partner-deletion.service.ts` **does** inject and call
  `AuditService.log()` (action `PARTNER_BULK_DELETED` /
  `PARTNERINQUIRY_BULK_DELETED` / `PARTNERONBOARDINGAPPLICATION_BULK_DELETED`),
  so bulk-delete is the only partner-side mutation that reaches the generic
  audit trail.

Net: a compliance officer or auditor querying the platform audit log
(`AuditService`/`PlatformAuditLog`) for "who activated this partner" or "who
approved this onboarding application" will find nothing; that history exists
only in `Partner.timeline`, reachable only by opening that specific partner's
detail page. This is inconsistent with AGENTS.md's rule ("call
`AuditService.log()` for every state-changing operation ... an auditor would
need to see") and with how `leads.service.ts` in the same commercial funnel
already does it.

## 7. `PartnerType` behaviour matrix (as the code actually behaves)

| Dimension | `INDIVIDUAL` | `COMPANY` | Evidence |
|---|---|---|---|
| Required onboarding fields | Same as COMPANY: `legalName`, `registrationNumber`, `registeredAddress`, `authorizedSigner`, `privacyConsent` (+ tax/bank unless settings disable them) | Same | `validatePartnerOnboardingData()`, `partner-experience.service.ts:1320-1343` — **no branch on `type` at all** |
| Commission rate default/calc | Identical (`defaultCommissionRate`, `PartnerCommission`) | Identical | No `type` reference anywhere in `partners.service.ts` commission code |
| Lifecycle state machine | Identical `partnerTransition()` table | Identical | `partners.service.ts:576` — no `type` parameter |
| Contract/agreement type required | Identical (`PARTNER_AGREEMENT`/`MASTER_PARTNER_AGREEMENT`, via `partner-settings.requiredAgreementTypes`) | Identical | `sendOnboardingInvitation`, `activatePartner` |
| Duplicate detection | Identical (email/company-name only) | Identical | `submitInquiry()` |
| Admin UI form | Identical fields, `type` is a plain enum selector defaulted to `COMPANY` on create | Identical | `partners/new/page.tsx` |
| Portal account / referral link / lead review | Identical | Identical | No `type` reference in `partner-experience.service.ts` or `apps/web/app/partner/` |

**Conclusion: `PartnerType` is currently a pure data-capture field with zero
behavioural effect anywhere in the backend, frontend or validation.** It is
stored, displayed, and carried into `PartnerInquiry.type`/`Partner.type`, and
that is the entirety of what it does. This is consistent with — and confirms
— the schema comment at `schema.prisma:275-280` framing `PartnershipModel` as
the field that actually needs to drive reporting/behaviour; the same comment
does not claim `PartnerType` drives anything either, but nothing in the code
currently makes use of the distinction it captures (e.g. an `INDIVIDUAL`
partner is still asked for a company `registrationNumber` with no
individual-appropriate equivalent — a plausible **GAP** if individual/sole
proprietor partners are an intended, actively-onboarded category rather than
a rarely-used value).

Related **dead-enum-values GAP**: `PartnerStatus` declares `SUBMITTED`,
`UNDER_REVIEW` (partner-level, distinct from the inquiry-level status of the
same name), `INFORMATION_APPROVED`... wait — `INFORMATION_APPROVED` **is**
written (`reviewOnboarding`, approve branch). Values confirmed **never
written** by any service code found: `SUBMITTED`, `AGREEMENT_DRAFTING`,
`INTERNAL_APPROVAL`, `AWAITING_SIGNATURE`, `FULLY_SIGNED`,
`APPROVED_FOR_ACTIVATION` (all at `schema.prisma:441-448`). These look like an
earlier, more granular agreement-stage design for `Partner.status` that was
superseded by driving agreement state through `Contract.status` instead
(`ContractStatus` already has its own `SENT/VIEWED/FULLY_SIGNED/
FULLY_EXECUTED`), leaving orphaned enum members. Not urgent, but worth a
cleanup decision — an admin building a `PartnerQueryDto.status` filter UI
would offer six statuses no partner can ever have.

## 8. Tests

Colocated unit specs (all present, read for scope, not executed — this task
was discovery-only):

- `partners/partner-deletion.service.spec.ts`
- `partners/partner-lifecycle-guards.spec.ts`
- `partners/partners-platform-authorization.spec.ts`
- `partner-experience/partner-activation.workflow.spec.ts`
- `partner-experience/partner-experience.domain.spec.ts`
- `partner-experience/partner-inquiry-acquisition.spec.ts`
- `partner-experience/partner-onboarding.state-machine.spec.ts`
- `partner-experience/partner-portal-access.spec.ts`
- `partner-experience/partner-referral-resolver.service.spec.ts`
- `partner-experience/partnership-model-conversion.spec.ts`
- `leads/leads.contracting.spec.ts`, `leads.referral.spec.ts`,
  `leads.status-transition.spec.ts`, `public-lead-acquisition.spec.ts`,
  `public-leads.rate-limit.spec.ts`

**No e2e suite under `services/api/test/` covers the partner or lead
lifecycle.** The three commercial-flavoured e2e specs present
(`commercial-bootstrap.e2e-spec.ts`, `db-fixtures-contract.e2e-spec.ts`,
`identity-contract.e2e-spec.ts`) cover plan/price bootstrap and fixture/
identity contracts, not partners or leads — confirmed by reading
`commercial-bootstrap.e2e-spec.ts`'s test titles (plan pricing dedup/
idempotency, nothing partner- or lead-shaped). The only lifecycle-level
proof of the partner/lead journeys is the bespoke HTTP+SQL harness described
in `docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`, which is
not a repo-tracked automated suite and was not re-run as part of this
discovery task.

## 9. Prior QA findings — current status (re-verified against this branch's code)

| QA finding | Current status | Evidence |
|---|---|---|
| BUG-06 (partner onboarding review had no state machine) | **FIXED**, tracked as BUG-0016 | `partner-onboarding.state-machine.ts` header comment; guard wired into `reviewOnboarding()` |
| HIGH UI: `/partner-inquiries/[id]` and `/partner-onboarding/[id]` unreachable | **FIXED**, tracked as BUG-0019 | Both list pages' header comments; sidebar links; `platform-runtime.service.ts` per-module cases |
| "partner-portal lead submission routes are permanent 403 stubs" | **Superseded** — a full portal frontend + live endpoints now exist | `apps/web/app/partner/leads/*`, `PartnerPortalController` |
| "`CustomerAccount` has no origin-channel column" (A6.05) | **Fixed separately** — `originChannel` (`CustomerOriginChannel?`) exists (ITEM-0008) | `schema.prisma:2611-2618` |
| Governing-agreement gate matches on `relatedLeadId`/mutable columns (BUG-01, contracts module) | Out of this discovery's scope (contracts module); flagged as fixed in `docs/knowledge/modules/contracts-and-agreements.md` (BUG-0011) | `docs/knowledge/modules/contracts-and-agreements.md:30-42` |
| `CustomerAccount.leadId` has no unique constraint (residual risk noted) | **Fixed since** — `@@unique([leadId])` now present with an explanatory comment citing ITEM-0005 | `schema.prisma:2688-2692` |
| Not re-verified in this pass (out of scope: tenant provisioning, agreement signing/immutability, rate limiting) | — | — |

## 10. New defects / gaps found in this discovery pass

1. **GAP — HIGH-leaning, needs Architect triage**: `partners.service.ts` and
   `partner-experience.service.ts` never call `AuditService.log()`. Every
   partner lifecycle transition, onboarding review decision, and commission
   edit is invisible to the platform audit trail (§6). Contrast:
   `leads.service.ts` (same commercial funnel) audits 7 distinct actions, and
   `partner-deletion.service.ts` (same module family) does audit its one
   action. This reads as an omission rather than a decision — no comment
   anywhere states audit was intentionally scoped out of partner mutations.
2. **GAP — MEDIUM**: No duplicate detection at all on `POST /partners` (the
   internal admin create path) — email/company-name/tax-id collisions are
   possible with no warning, unlike the public inquiry path which has a weak
   (email/company-name only) check.
3. **GAP — MEDIUM**: No duplicate detection on `taxId`/`registrationNumber`
   anywhere, including the public inquiry path — the schema stores `taxId` on
   both `Partner` and `PartnerInquiry` but nothing reads it for dedup.
4. **GAP — LOW/MEDIUM, product question**: `PartnerType` (`INDIVIDUAL`/
   `COMPANY`) drives zero behaviour — same required onboarding fields
   (`registrationNumber`, `legalName`) apply to an individual as to a company,
   with no individual-appropriate alternative (e.g. a national ID field).
   Confirm whether `INDIVIDUAL` is an actively-used category or a placeholder
   value with a `default(COMPANY)` that nothing exercises.
5. **GAP — LOW**: `PartnerCommission.leadId`/`customerAccountId`/`invoiceId`
   are unenforced scalar references (no `@relation`, no `onDelete`) —
   deleting a `Lead`, `CustomerAccount` or `Invoice` can silently orphan a
   commission row that still says it is tied to one.
6. **GAP — LOW, cleanup**: `PartnerStatus` has at least six enum values
   (`SUBMITTED`, `AGREEMENT_DRAFTING`, `INTERNAL_APPROVAL`,
   `AWAITING_SIGNATURE`, `FULLY_SIGNED`, `APPROVED_FOR_ACTIVATION`) that no
   code path was found to write — likely superseded by driving agreement
   state through `Contract.status` instead. Worth an explicit decision to
   deprecate rather than leaving them selectable in query filters.
7. **Observation, not a defect**: rejecting a `PartnerInquiry`
   (`rejectInquiry()`) cascades `Partner.status = REJECTED` via a direct
   Prisma write, bypassing `partnerTransition()` entirely (no from-set check,
   no `PartnerTimeline` guard against doing this to an already-`ACTIVE`
   partner via this specific path — though in practice an active partner's
   inquiry would already be `CONVERTED`, so this looks unreachable rather
   than exploitable; flagging for the record since it is the same "governed
   machine bypassed by a sibling write path" shape as BUG-0016/BUG-0019 above).

## Key files (absolute paths)

- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\prisma\schema.prisma` (Partner block `2868-3016`, `3549-3684`, enums `275-480`, `644-670`, `728-`)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partners\partners.controller.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partners\partners.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partners\partner-deletion.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partners\dto\partner.dto.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partner-experience\partner-experience.controller.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partner-experience\partner-experience.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\partner-experience\partner-onboarding.state-machine.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\leads\admin-leads.controller.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\leads\leads.service.ts` (correctAttribution `744`, updateLead guard `572-576`)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\leads\dto\admin-lead.dto.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\platform-runtime\platform-runtime.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\partner-inquiries\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\partner-onboarding\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\_components\admin-sidebar.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\web\app\partner\` (portal frontend)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\landing\app\partners\` (public inquiry/onboarding forms)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\docs\knowledge\modules\contracts-and-agreements.md`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\docs\qa\runs\2026-08-15-commercial-onboarding-e2e-7bbab3d.md`
