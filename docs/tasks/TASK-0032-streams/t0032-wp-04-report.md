# WP-04 report — Partner domain (TASK-0032 / EXECPLAN-0051)

Stream report of [[TASK-0032]].

Branch `agent/pah-wp04-partners`, worktree `D:/My Work/hrm-dijipeople/dp-pah-wp04`.
Final commit: `e2cfbdcb`.

## IMPLEMENTED

1. **Partner type policy** — `services/api/src/modules/partners/partner-type-policy.ts`.
   One typed module declaring, per `PartnerType`:
   - `adminRequiredFields` — COMPANY needs `companyName`; INDIVIDUAL needs
     `contactFirstName` + `contactLastName`.
   - `onboardingRequiredFields` — COMPANY needs `registrationNumber`;
     INDIVIDUAL needs `nationalIdNumber` instead (everything else —
     `legalName`, `registeredAddress`, `authorizedSigner`, `privacyConsent`,
     and the settings-gated `taxInformation`/`bankingInformation` — is
     unchanged between types, because no evidence in the codebase
     distinguishes them).
   - `contractPartyType` — the `ContractPartyType` a generated agreement
     should record (`PARTNER` for COMPANY, `INDIVIDUAL` for INDIVIDUAL).
     Declared for reference; wiring it into `contracts.service.ts`'s
     default-party inference is out of this stream's module scope
     (`contracts` is a different module) — flagged as a follow-up below.
   - `PARTNERSHIP_MODEL_POLICY` — one entry per `PartnershipModel`, and every
     one states `noBehavioralDifferenceFromOtherModels: true`. Verified by
     grep: no service reads `partnershipModel` to change commission
     eligibility, lead ownership, or the required agreement type. This is
     recorded as fact, not invented as a distinction the product never asked
     for — see GAP below.
   Enforced at every identity-touching entry point (replacing scattered
   ad-hoc checks): admin create/update (`PartnersService`), public inquiry
   (`submitInquiry`), the inquiry→partner conversion path (`qualifyInquiry`),
   the onboarding submission (`submitOnboarding` via
   `validatePartnerOnboardingData`), and the admin onboarding form
   (`apps/landing`).

2. **Duplicate detection** — `services/api/src/modules/partners/partner-duplicate-detection.ts`.
   - `findPartnerDuplicate()` / `assertNoPartnerDuplicate()`: one function
     checking email (exact, case-insensitive), tax id (normalised: trim,
     uppercase, strip spaces/dashes) and company name (COMPANY only,
     case-insensitive) against every other `Partner`. Any match is a hard
     `409 Conflict` naming the existing partner's display name, code and
     status. Wired into `PartnersService.create()`/`update()` (previously had
     **no** duplicate check at all) and `PartnerExperienceService.qualifyInquiry()`'s
     create-branch (Scenario E — see below).
   - `findOnboardingIdentifierDuplicate()`: `registrationNumber`/`nationalIdNumber`
     and `taxInformation.taxId` exist only inside
     `PartnerOnboardingSubmission.data` (no column), so this scans the most
     recent submission per other partner and compares normalised values.
     Wired into `submitOnboarding()`.
   - `submitInquiry()`'s existing email/company-name check (with its
     "still-INQUIRY → update in place" merge semantics) was left as-is — it
     has different semantics than a hard block and rewriting it risked
     regressing `partnership-model-conversion.spec.ts`'s pinned assertions.

3. **Audit** — `partners.service.ts` and `partner-experience.service.ts` both
   gained an `AuditService` dependency (previously zero calls in either file,
   confirmed by the D2 discovery). Every mutation now calls
   `AuditService.log({ tenantId: 'platform', ... })`, exactly the pattern
   `leads.service.ts` already uses (so it routes to `PlatformAuditLog`):
   partner create/update, every lifecycle transition, referral-link
   create/enable/disable/expire/regenerate, commission create/update, inquiry
   qualify/reject, onboarding invitation/submission/review decisions, partner
   activation, and partner-lead review decisions. Snapshots exclude
   `applicationSnapshot` (raw original submission — duplicative) and `notes`;
   `Partner`/`PartnerCommission` carry no secret fields to begin with.
   `PartnerTimeline` is unchanged and still written alongside.

4. **Lead ↔ partner assignment UX**:
   - `LeadsService.correctAttribution()` (the one audited attribution path)
     now refuses a partner whose `status !== ACTIVE` — the same rule
     `PartnerReferralResolverService.resolve()` already applies to an
     *automatic* referral-code attribution, which this manual path had never
     matched. It also no-ops (no new `LeadAttributionCorrection`/
     `PartnerTimeline`/audit row) when the submitted partner+referral-link is
     identical to what the lead already has, returning
     `{ attributionUnchanged: true }`.
   - Admin `leads` module: the `partnerId` field is now read-only (the
     generic PATCH it used to submit through has been refused by
     `updateLead()` since the attribution endpoint was built — a real,
     pre-existing frontend/backend mismatch, REG-559) and its lookup, where
     still used, is filtered to `status=ACTIVE`. A new
     `LeadAttributionPanel` (`apps/admin/app/_components/leads/lead-attribution-panel.tsx`)
     provides a searchable partner lookup (reusing `SearchableSelect` /
     `useRuntimeLookupOptions`, the same infrastructure the generic runtime
     form uses), a required reason field, and Reassign/Remove actions with a
     confirm dialog, calling a new proxy route
     `apps/admin/app/api/super-admin/leads/[leadId]/attribution/route.ts` →
     `PATCH /super-admin/leads/:leadId/attribution`.
   - Lookup labels for any partner-shaped lookup item now show type and
     status (`Contoso Ltd — Company · Active`), via a scoped addition to
     `getRuntimeLookupLabel()` in `runtime-lookups.ts` (activates only when
     an item's `type` is `COMPANY`/`INDIVIDUAL`, which nothing else in this
     registry's lookups produces).

5. **WP-08 finding relayed mid-task (BUG-3566)**: `UpdatePartnerDto extends
   CreatePartnerDto {}` inherited every required field unchanged, so `PATCH
   /partners/:id` was never actually partial. Fixed: `UpdatePartnerDto` is now
   `PartialType(CreatePartnerDto)` (the established pattern elsewhere in this
   repo, e.g. `update-employment-type.dto.ts`). `PartnersService.update()` was
   rewritten to (a) validate identity-field policy and duplicate detection
   against the record as it would read *after* the patch — existing values
   merged with whatever the patch supplies — rather than the patch body alone,
   and (b) write only the columns the patch actually mentions
   (`partnerUpdateData()`), rather than spreading the whole DTO and defaulting
   missing fields (which would have silently reset `status` to `DRAFT` and
   thrown on `undefined.trim()` for `displayName`/`email`).

## CHANGED_BEHAVIOR

- `POST /partners` and `PATCH /partners/:id` now 400 when the type-required
  identity fields are missing, and 409 when email/tax id/company name
  collides with an existing partner. **Any existing caller relying on being
  able to create a COMPANY partner with no company name, or an INDIVIDUAL
  with no name, will now be refused.**
- `PATCH /partners/:id` is now a genuine partial patch. A caller that used to
  rely on the endpoint requiring (and therefore always receiving) the full
  record will see no difference; a caller sending a partial body that used to
  400 will now succeed.
- **A COMPANY (or INDIVIDUAL) partner whose identity fields were already
  non-compliant before this change** (created prior to policy enforcement,
  e.g. a COMPANY partner with no `companyName`) **will now be refused on
  *any* update, including one that touches an unrelated field**, until the
  missing identity field is supplied in the same patch. This is the explicit,
  intended effect of validating the merged record rather than the patch body
  in isolation — flagged under RISK_AREAS.
- `PATCH /super-admin/leads/:leadId/attribution` now refuses a non-ACTIVE
  partner (400) and returns `{ attributionUnchanged: true, ... }` instead of
  writing a new correction row when nothing actually changed.
- The admin `leads` form's `partnerId` field is read-only; reassignment now
  goes through the new "Partner attribution" panel only.
- `apps/landing`'s partner onboarding form sends `nationalIdNumber` instead
  of `registrationNumber` for an INDIVIDUAL applicant.
- `validatePartnerOnboardingData()`'s signature gained a third parameter
  (`type: PartnerType = PartnerType.COMPANY`); every existing call site was
  updated to pass the real type, and the default preserves prior behaviour
  for any caller that does not.

## RISK_AREAS

1. **Legacy non-compliant partners are now update-locked until fixed** (see
   above). If any exist in production (an INDIVIDUAL with no contact name, or
   a COMPANY with no company name), an operator editing *any* field on that
   record — including unrelated ones like `notes` — will be refused until
   they also supply the missing identity field in the same request. This was
   an explicit design choice per the owner brief ("Enforce required fields...
   server-side") and the coordinator's WP-08 instruction ("keep the type
   policy's required-field checks on the merged record"), but it is a real
   operational risk worth a query against production before this ships:
   `SELECT count(*) FROM "Partner" WHERE (type='COMPANY' AND (companyName IS
   NULL OR companyName = '')) OR (type='INDIVIDUAL' AND (contactFirstName IS
   NULL OR contactLastName IS NULL))`.
2. **`findOnboardingIdentifierDuplicate()` scans up to 500 recent onboarding
   submissions in application code**, not a database query, because
   `registrationNumber`/`nationalIdNumber`/`taxId` are not columns —
   normalisation (strip spaces/dashes, uppercase) cannot be expressed as a
   single Prisma `equals`. Fine at current partner volume; revisit if the
   platform's partner directory grows into the thousands.
3. **`ContractPartyType` per partner type is declared but not wired.**
   `contracts.service.ts`'s default-party inference always uses `PARTNER`
   regardless of `PartnerType`, even after this change — an INDIVIDUAL
   partner's generated agreement still records them as `PARTNER`, not
   `INDIVIDUAL`. Deliberately left alone: `contracts.service.ts` belongs to a
   different module, and touching it risked colliding with a concurrent
   TASK-0032 work package. Flagged for the Architect to route to whichever
   stream owns `contracts`.
4. **The admin lead-attribution UX is a purpose-built panel, not a generic
   runtime capability.** `RuntimeActionDefinition` has no mechanism for an
   action to collect structured input beyond a plain confirm dialog, so
   reassignment is a bespoke component (matching the existing
   `SupportCaseOperationsPanel`/`ContractPartiesPanel` precedent for exactly
   this situation) rather than a declarative registry entry. Future
   module-scoped "edit this field through an audited side-endpoint" needs
   will hit the same wall.
5. **`PartnershipModel`'s "no behavioural difference" is a fact about this
   commit, not a permanent guarantee.** If a future change makes commission
   calculation, agreement-type selection or referral-link limits depend on
   `partnershipModel`, `PARTNERSHIP_MODEL_POLICY` in `partner-type-policy.ts`
   must be updated in the same change, or the policy and the code will drift
   the way `contracts.service.ts`'s blocked-status list once did
   (BUG-0011/`divergent-duplicate-guard`).

## KNOWN_MISTAKES_TO_AVOID retrieved / avoided

- **BUG-0011 / `divergent-duplicate-guard`** (`docs/knowledge/modules/contracts-and-agreements.md`):
  "one rule, two implementations, and the copy is the one that drifts." Applied
  directly: the inactive-partner check in `LeadsService.correctAttribution()`
  reuses the exact rule `PartnerReferralResolverService.resolve()` already
  encodes (`status !== ACTIVE`), rather than writing a second, independently
  maintained version of it.
- **BUG-0016** (`partner-onboarding.state-machine.ts`'s header comment): a
  review/decision endpoint with no from-state check. Not repeated — every new
  check added here (`assertPartnerIdentityFields`, duplicate detection, the
  inactive-partner guard) throws *before* any write, matching that file's
  established pattern.
- **BUG-1425/BUG-1747** (`currencyCode` as a length check, not a currency
  check): confirmed `partner.dto.ts`'s existing `@IsIn(PLATFORM_CURRENCY_CODES)`
  guard was left untouched and is still exercised by
  `partner-currency.spec.ts`, which this stream did not modify.
- **"A read filter is not an access control"** class of bug: the new
  `status=ACTIVE` lookup filter on the admin `partnerId` field is UI
  convenience only — `LeadsService.correctAttribution()` enforces the same
  rule server-side independently, so a client that bypasses the filtered
  lookup (or calls the API directly) is still refused.

## TESTS_ADDED

Backend (`services/api`), all colocated:

| File | Proves |
|---|---|
| `partners/partner-type-policy.spec.ts` | Required admin identity fields per type; required onboarding fields per type (the BUG-3549 fix: INDIVIDUAL needs `nationalIdNumber` not `registrationNumber`); settings-gated tax/bank toggle unaffected by type; `PartnershipModel` matrix states no behavioural difference for every model. |
| `partners/partner-duplicate-detection.spec.ts` | Email/tax-id/company-name matching and precedence; normalisation (`normalizeIdentifier`); COMPANY-only company-name matching; self-exclusion on update; `assertNoPartnerDuplicate`'s 409 message; `findOnboardingIdentifierDuplicate` for registration number, national ID (same field), tax id, and self-exclusion. |
| `partners/partners-audit.spec.ts` | `create()`/`update()`/`lifecycleAction()` each call `AuditService.log()` with `tenantId: 'platform'`, the actor id, and a snapshot excluding `applicationSnapshot`. |
| `partners/partners-partial-update.spec.ts` | Service-level partial-patch behaviour: a single-field patch writes only that column; `status` is never silently reset to `DRAFT`; a patch clearing a COMPANY partner's `companyName` is refused; an unrelated patch on an already-compliant record is not re-demanded; switching `type` requires supplying the new type's required fields in the same patch. |
| `partners/dto/partner-update-partial.spec.ts` | DTO-level: `UpdatePartnerDto` accepts a single-field body, a tax-id-only body, and an empty body; still rejects an invalid or undeclared field; `CreatePartnerDto` itself is unaffected. |
| `partner-experience/partner-experience-audit.spec.ts` | `qualifyInquiry`/`rejectInquiry`/`reviewOnboarding`/`reviewPartnerLead` each call `AuditService.log()` with `tenantId: 'platform'`; a tenant-scoped user is refused on every platform-admin method (`assertPlatform`), including one carrying `partners.manage`. |
| `leads/lead-attribution-correction.spec.ts` | `correctAttribution` refuses SUSPENDED/INACTIVE/TERMINATED/REJECTED/DRAFT partners and allows ACTIVE; names the partner and its status in the refusal; no-ops (no new correction/timeline/audit row) on an identical re-assignment; still corrects when only the referral link changes; treats clearing an attribution as a real change. |

Modified specs (constructor signature updates only, no behaviour changes):
`partners-platform-authorization.spec.ts`, `partner-activation.workflow.spec.ts`,
`partner-portal-access.spec.ts`.

**Proved to fail without the fix** (verified by temporarily reverting the
fix and re-running, then restoring):
- `leads/lead-attribution-correction.spec.ts`: all 6 status-guard cases fail
  (partner accepted regardless of status) and the no-op case fails (writes a
  correction row) against the pre-fix code.
- `partners/dto/partner-update-partial.spec.ts`: 3/6 cases fail (single-field,
  tax-id-only and empty bodies all 400) when `UpdatePartnerDto` is reverted to
  `extends CreatePartnerDto {}`.
- `partner-type-policy.spec.ts`, `partner-duplicate-detection.spec.ts`,
  `partners-audit.spec.ts`, `partners-partial-update.spec.ts`,
  `partner-experience-audit.spec.ts` test genuinely new modules/behaviour that
  did not exist before this stream — their non-existence before this change
  is the "fails without the fix."

## TEST_HOOKS (for WP-09 browser QA)

- Admin: `/partners/new` — set Partner type to Individual, leave Company
  name blank → save should show a field error naming `companyName` is not
  required and `contactFirstName`/`contactLastName` are. Switch to Company
  with no company name → blocked.
- Admin: `/partners` list now shows a "Partnership" column; `/partners/[id]`
  edit form has a "Partnership model" field.
- Admin: `/leads/[leadId]` — the "Referral partner" field is read-only; a
  "Partner attribution" panel appears below the form with a searchable
  partner picker (options show `Name — Type · Status`), a reason field,
  Reassign, and (when a partner is already attributed) Remove attribution.
  Selecting a SUSPENDED/INACTIVE partner is impossible from the picker
  (filtered server-side); calling the API directly with one still 400s.
- API: `POST /partners` with a duplicate email/tax-id/company-name → 409
  naming the existing partner's code and status.
- API: `PATCH /partners/:id` with `{"notes": "x"}` alone now succeeds (used
  to 400).
- Landing: `/partners/onboarding/[token]` for an INDIVIDUAL invitation shows
  "National ID number" instead of "Registration number", and the field label
  reads "Full legal name".

## RECORD_CLOSURES

| Record | Commit(s) | Spec | Fails without fix |
|---|---|---|---|
| BUG-3549 (partner type drives no behaviour) | `5dfb4de4` (policy module + service enforcement), `392913e8` (landing form) | `partner-type-policy.spec.ts`, `partners-partial-update.spec.ts`, `partner-experience-audit.spec.ts`'s identity checks | Yes — policy/module did not exist before |
| BUG-3550 (no duplicate detection) | `5dfb4de4` | `partner-duplicate-detection.spec.ts` | Yes — module did not exist before |
| BUG-3551 (partner mutations not audited) | `5dfb4de4` | `partners-audit.spec.ts`, `partner-experience-audit.spec.ts` | Yes — `AuditService` was not injected before |
| REG-557/558 (attribution status guard + no-op) | `5dfb4de4` | `leads/lead-attribution-correction.spec.ts` | Yes — verified by temporary revert (6/6 and 1/1 respectively) |
| REG-559 (admin lead partner selector UX) | `9f3c3dd5` | Covered indirectly by the endpoint's own specs; verified by `check-types` | N/A — frontend wiring, no dedicated component harness in this repo |
| **BUG-3566 / WP-08 finding 3** (`UpdatePartnerDto` never partial) | `eb172564` | `partners/dto/partner-update-partial.spec.ts`, `partners-partial-update.spec.ts` | Yes — verified by temporary revert (3/6 DTO cases fail) |

Full regression entries (REG-550..559, plus REG-601 allocated by the Architect
allocation): `docs/qa/regressions/_incoming/wp04.md`.

## VALIDATION

| Command | Result |
|---|---|
| `npm --workspace api run check-types` | Pass |
| `npm --workspace api run test` (full suite) | 6972/6973 pass. **1 pre-existing failure, not caused by this stream**: `tenant-control-plane/tenant-erasure.constants.spec.ts` — "covers every tenant-owned model exactly once" fails because `UserMfaRecoveryCode` (added by WP-01, commit `10d5d148`, which this branch is based on) is missing from the tenant-erasure order list. Confirmed by inspecting `10d5d148`'s schema diff — this model was added in that commit and the erasure-order constants were not updated in the same commit. Out of this stream's module scope (`tenant-control-plane`, not `partners`). |
| `npm --workspace api run test -- --testPathPatterns="partners\|partner-experience\|leads"` | 23 suites, 172 tests, all pass |
| `cd services/api && npx eslint --fix <every file this stream touched>` | 0 errors. A handful of pre-existing `@typescript-eslint/no-unsafe-*` warnings in `normalizePartner()` (untouched generic helper, present before this stream) and in test-mock `expect.objectContaining` calls (loosely-typed jest matcher signatures) — no errors, nothing this stream introduced structurally. |
| `npm --workspace admin run check-types` | Pass |
| `npm --workspace admin run test` | 47 suites, 422 tests, all pass |
| `npm --workspace landing run check-types` | Pass |
| `npm --workspace landing run test` | Not run — this stream's only landing change is a client-side conditional-field edit in `partner-onboarding-form.tsx` with no colocated Jest spec in this repo for that component; verified by typecheck and by reading the resulting diff for correctness. |

## UNRESOLVED

- **`ContractPartyType` per `PartnerType` is declared, not wired** (see
  RISK_AREAS #3) — routing to whichever stream owns `contracts.service.ts`.
- **`SCHEMA_NEEDED`: none.** No schema change was required or made.
- **`PERMISSION_NEEDED`: none.** All work used existing `partners.read`/
  `partners.manage` platform permissions and the existing
  `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN` role check on
  `correctAttribution`.
- Legacy non-compliant partner records (RISK_AREAS #1) were not queried
  against a real database from this worktree (no production access, and the
  local throwaway database has no realistic partner data) — flagged for the
  Architect to check before this reaches `main`.
- `apps/landing`'s public partner inquiry form (`partner-inquiry-form.tsx`)
  was deliberately left unchanged: it already conditionally hides
  `companyName`/`website` for an INDIVIDUAL applicant client-side, and it
  never collected `taxId`/`registrationNumber` to begin with (those exist
  only from the onboarding stage onward), so there was nothing in this file
  the policy work needed to change.

---

## Partner Type Behaviour Matrix (as implemented)

| Dimension | INDIVIDUAL | COMPANY |
|---|---|---|
| **Purpose** | A sole person contracting directly (no company registration). | An organisation contracting as a legal entity. |
| **Lifecycle** (`PartnerStatus` state machine) | Identical — `partnerTransition()` takes no type parameter; both flow through the same 15 pre-ACTIVE states. | Identical. |
| **Onboarding — admin create/update required fields** | `contactFirstName` + `contactLastName` (full name). Never asked for `companyName`. | `companyName` (legal company name). |
| **Onboarding — submission required fields** | `legalName` (full legal name), `nationalIdNumber`, `registeredAddress`, `authorizedSigner`, `privacyConsent`, + `taxInformation`/`bankingInformation` if `partner-settings` requires them. | Same, with `registrationNumber` in place of `nationalIdNumber`. |
| **Agreements** | Same agreement types required (`PARTNER_AGREEMENT`/`MASTER_PARTNER_AGREEMENT`, per `partner-settings.requiredAgreementTypes`); same activation gate (fully signed agreement + approved onboarding). Generated agreement's counterparty `ContractPartyType` *should* be `INDIVIDUAL` per this policy — **not yet wired** into `contracts.service.ts` (see RISK_AREAS #3), so today both types still record `PARTNER`. | Same requirements; `ContractPartyType.PARTNER` (already correct, and unchanged by this work). |
| **Relations** (leads, commissions, agreements, referral links, portal users, timeline) | Identical schema and code paths — no `type` branch anywhere in `partners.service.ts` or `partner-experience.service.ts` for any relation. | Identical. |
| **Commission** | Identical calculation (`baseAmount * commissionRate`), identical `defaultCommissionRate`, no type-based rate difference. | Identical. |
| **Required data (duplicate detection)** | Email + tax id are hard-blocking identifiers; company name is never checked (field does not apply). Registration/national-id collision checked at onboarding submission. | Email + tax id + company name (case-insensitive) are all hard-blocking. Registration-number collision checked at onboarding submission. |
| **Portal features** | Identical — portal account provisioning, referral links, lead visibility, contract listing: no `type` reference anywhere in `partner-experience.service.ts`'s portal methods or `apps/web/app/partner/`. | Identical. |
| **Lead ownership / referral** | Identical — a lead can be attributed to any ACTIVE partner regardless of type; `LeadsService.correctAttribution()`'s new status guard applies equally to both. `PartnershipModel` (the commercial relationship) is the orthogonal axis that in principle differentiates referral-vs-reseller-vs-implementation, but drives no code today for either type (see `PARTNERSHIP_MODEL_POLICY`). | Identical. |
| **Customer interaction** | No direct interaction with a tenant's own customers — the partner relationship is with DijiPeople, not the tenant's customers, for both types. | Identical. |
| **Reporting** | Both types appear in the same `partners` list/columns; the new "Partnership" column and field surface `partnershipModel` for both, since that (not `type`) is what an operator actually triages reports by, per the schema's own design comment. | Identical. |

## Scenario table (owner brief A–F)

| Scenario | Behaviour now | Proven by |
|---|---|---|
| **A — Company applicant** | Requires `companyName` at admin create/inquiry; requires `registrationNumber` (not `nationalIdNumber`) at onboarding submission; duplicate-checked on email/taxId/companyName. | `partner-type-policy.spec.ts` ("requires a company name...", "requires a registration number for COMPANY, and never a national ID"); `partner-duplicate-detection.spec.ts` (company-name matching for COMPANY). |
| **B — Individual applicant** | Requires `contactFirstName`+`contactLastName`, never `companyName`; requires `nationalIdNumber` (not `registrationNumber`) at onboarding — the direct BUG-3549 fix; duplicate-checked on email/taxId only (no company-name collision possible). | `partner-type-policy.spec.ts` ("requires a full name for an INDIVIDUAL partner...", "requires a national ID for INDIVIDUAL instead of a company registration number"); `partner-duplicate-detection.spec.ts` ("an INDIVIDUAL candidate has no company name to collide on"). |
| **C — Rejected application** | `rejectInquiry()` unchanged in its state handling; now additionally audited (`PARTNER_APPLICATION_REJECTED` in `PlatformAuditLog`, not just `PartnerTimeline`). Onboarding rejection (`reviewOnboarding` with `decision: 'reject'`) is likewise now audited and still governed by `partnerOnboardingReviewRefusal()` (BUG-0016's existing state-machine guard, untouched). A rejected partner remains a practical dead end (no code path re-opens it), as before. | `partner-experience-audit.spec.ts` ("audits rejecting an inquiry"). |
| **D — Duplicate (email/tax id/company name already exists)** | `POST /partners` (admin create) and `qualifyInquiry()`'s create-branch both now hard-block with `409 Conflict`, naming the existing partner's display name, code and status. `submitOnboarding()` additionally blocks on a registration-number/national-id/tax-id collision against another partner's submission. | `partner-duplicate-detection.spec.ts` (full coverage); `partners-partial-update.spec.ts`/`partners-audit.spec.ts` exercise `create()`/`update()` end to end through the same check. |
| **E — Existing partner found during onboarding approval** | `qualifyInquiry()` updates the existing linked `Partner` in place when `inquiry.partnerId` is already set (the normal case — unchanged, already correct). For the edge case of an inquiry with no `partnerId` (data predating that link), a duplicate check now runs before any `Partner` row is created, refusing with 409 rather than silently creating a second partner. | `partnership-model-conversion.spec.ts` (pins the two legitimate `tx.partner.create` call sites are unchanged — i.e., no new create path was added); reasoning documented inline in `qualifyInquiry()`. |
| **F — Missing optional downstream data** (e.g. no referral link, no commission history) | Unaffected by this work: referral links, commissions, portal users and timeline all remain fully optional relations with no new requirement introduced. A duplicate check running against a partner with none of these still resolves correctly (matches only on identity fields). | Existing behaviour, unchanged; `partner-duplicate-detection.spec.ts`'s matches select only identity columns (`id, displayName, code, status, email, taxId, companyName`), never touching optional relations. |

---

Files changed (absolute paths):

- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partners\partner-type-policy.ts` (new)
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partners\partner-duplicate-detection.ts` (new)
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partners\partners.service.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partners\dto\partner.dto.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partner-experience\partner-experience.service.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\partner-experience\partner-experience.module.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\services\api\src\modules\leads\leads.service.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\admin\lib\runtime\platform-module-registry.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\admin\lib\runtime\runtime-lookups.ts`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\admin\app\_components\leads\lead-attribution-panel.tsx` (new)
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\admin\app\_components\runtime\runtime-record-page.tsx`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\admin\app\api\super-admin\leads\[leadId]\attribution\route.ts` (new)
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\apps\landing\app\partners\onboarding\[token]\partner-onboarding-form.tsx`
- `D:\My Work\hrm-dijipeople\dp-pah-wp04\docs\qa\regressions\_incoming\wp04.md` (new)
- Plus the spec files listed under TESTS_ADDED.
