# QA Run — Wave 3: Lead + Partner Acquisition

| | |
|---|---|
| **Date** | 2026-08-16 |
| **Base SHA** | `1695167` |
| **Branch** | `agent/lead-partner-acquisition-wave3` |
| **Scope** | Public contact form, public lead intake API, Lead schema, acquisition attribution, consent separation, PartnerInquiry schema |
| **Records** | BUG-0021 (closed), ITEM-0026 |
| **Result** | PASS — Lead path complete; partner form deferred with a record |

---

## Contact mapping matrix

| Website field | API DTO | Domain | DB column | Type | Required | Validation | Transformation |
|---|---|---|---|---|---|---|---|
| First name | `firstName` | `contactFirstName` | `Lead.contactFirstName` | text | yes | ≤100 | trim, collapse spaces |
| Last name | `lastName` | `contactLastName` | `Lead.contactLastName` | text | **no** | ≤100 | trim; **null when absent** |
| Work email | `workEmail` | `workEmail` | `Lead.workEmail` | email | yes | `IsEmail`, ≤160 | lowercase, trim |
| Company | `companyName` | `companyName` | `Lead.companyName` | text | yes | ≤160 | trim |
| Phone | `phoneNumber` | `phoneNumber` | `Lead.phoneNumber` | text | no | pattern, ≤40 | trim |
| Country | `country` | `country` | `Lead.country` | **ISO code** | no | select-bound | — |
| Company size | `companySize` | `companySize` | `Lead.companySize` | band | **no** | ≤40 | trim |
| What can we help with | `inquiryIntent` | `inquiryIntent` | `Lead.inquiryIntent` | **enum** | yes (UI) | `IsEnum` | — |
| Interest areas | `interestAreas` | `interestAreas` | `Lead.interestAreas` | text[] | no | ≤20, each ≤64, **catalogue-checked** | unknown dropped, de-duplicated |
| Message | `message` | `message` + `requirementsSummary` | both | text | no | ≤1500 | trim |
| Marketing checkbox | `marketingConsent` | `marketingConsent` | `Lead.marketingConsent` | bool | no | `IsBoolean` | absent → false |
| *(captured)* | `sourcePage`, `referrerUrl`, `utm*` | same | `Lead.*` | text | no | length-bounded | absent stays null |
| *(server)* | — | notice version | `Lead.privacyNoticeVersion` | text | — | **not client-settable** | server constant |
| *(server)* | — | correlation | `Lead.correlationId` | text | — | from `X-Request-Id` | — |
| *(server)* | — | dedupe | `Lead.submissionHash` | text unique | — | sha256 | email+company+intent+message+hour |
| **— removed —** | ~~`industry`~~ | — | `Lead.industry` | — | — | — | **no longer sent or derived** |

Event: `LEAD_SUBMITTED` carries intent, interest areas, source page, UTM, country
and marketing consent.

## Partner mapping matrix — current state

| Website field | DTO | DB column | Status |
|---|---|---|---|
| Partner type | `type` | `PartnerInquiry.type` (`INDIVIDUAL`/`COMPANY`) | Working — but this is the **entity type** |
| — | — | `PartnerInquiry.partnershipModel` | **Column added, form not yet wired — ITEM-0026** |
| Company, names, email, phone, country, website, message | existing | existing | Working |
| Notice acknowledgement | `consentAcceptedAt` | existing, required | Working |
| — | — | `privacyNoticeVersion`, `marketingConsent*`, `sourcePage`, `utm*` | **Columns added, form not yet wired — ITEM-0026** |

Existing and **not rebuilt**: `submissionHash` (unique) already gave partner
intake idempotency, `referenceNumber`, `originalSubmission`, and a
`PartnerInquiryStatus` lifecycle equivalent to what the requirement described.
No new partner state machine was created.

---

## Scenarios

| id | Scenario | Result |
|---|---|---|
| Contact — no fabrication | industry/companySize null when not given; not the invented strings | **PASS** |
| Contact — interest ≠ industry | interest areas do not reach `industry` or `interestedPlan` | **PASS** |
| Contact — sub-status | derived from intent; null when none; never `'Demo requested'` by default | **PASS** |
| Contact — catalogue validation | unknown interest keys dropped, inquiry still accepted, duplicates removed | **PASS** |
| Contact — attribution | UTM/referrer/sourcePage persisted as captured; absent stays null | **PASS** |
| Contact — notice version | server value recorded; client-supplied version ignored | **PASS** |
| Contact — marketing optional | submits without consent, records false; with consent records timestamp | **PASS** |
| Contact — missing flag | treated as declined, never as consent | **PASS** |
| Contact — idempotency | repeated submission returns the existing lead, creates nothing | **PASS** |
| Contact — legitimate repeat | different intent hashes differently → new lead | **PASS** |
| Contact — honeypot | silently dropped, nothing created | **PASS** (pre-existing, verified) |
| Contact — business event | `LEAD_SUBMITTED` carries acquisition context | **PASS** |
| Query context | `?intent=` validated server-side; unknown/injection → "" | **PASS** |
| Mass assignment | `status`/`ownerId`/`convertedAt` not in the DTO; `forbidNonWhitelisted` rejects | **PASS** by contract |
| Rate limiting | `PublicRateLimitGuard` on the intake controller | **PASS** (pre-existing) |

## Local validation

| Command | Result |
|---|---|
| `npm run prisma:validate` | **PASS** |
| `prisma migrate diff` vs canonical | **PASS** — migration is Prisma's own output, no drift |
| `npm run typecheck` | **PASS** — 8/8 |
| `npm --workspace api run test` | **PASS** — 152 suites, 1081 tests |
| `npm --workspace landing run test` | **PASS** — 3 suites, 49 tests |
| Monorepo production build | **PASS** — 6/6 |
| `npx eslint` (web, admin, landing) | **PASS** — 0 errors |
| `node scripts/validate-framework.mjs` | **PASS** — 714 checks |
| Wave 1/2 + BUG-0030 non-regression | **PASS** — 37 tests (`commercial-offer`, `plan-read-path-purity`, `public-feature-catalog`), app-urls 16 |

---

## Findings

### F1 — BUG-0021 was worse than recorded — **FIXED**

The record named three fabricated values. Two more were found:

- `industry: form.interestArea || 'General HR operations'` — the visitor's
  **interest area** was being written into the industry column, so the real
  interest was lost and the industry was wrong.
- `subStatus: 'Demo requested'` hardcoded on **every** lead, making the column
  say the same thing for everyone.

Root cause was schema-driven: three columns were `NOT NULL` that the form never
asked about. Fixed by making them nullable rather than by inventing better
defaults.

### F2 — Partner form not yet wired to the new columns — **DEFERRED (ITEM-0026)**

`PartnershipModel`, marketing consent, notice version and attribution columns
landed on `PartnerInquiry`, and the option list is exported and tested. The form
and Admin field are not done. Deferred rather than half-wired: a form collecting
a value Admin cannot display would look complete and would not be.

Nothing is broken — the columns are nullable and unpopulated.

### F3 — `PartnerType` cannot express a partnership model — **ADDRESSED IN SCHEMA**

`{ INDIVIDUAL, COMPANY }` is the contracting entity type. `PartnershipModel` was
added alongside rather than replacing it, because both facts are real and the
existing column is in use.

## Finding classification

| Finding | Disposition | Record |
|---|---|---|
| F1 — BUG-0021 | `FIXED` | BUG-0021, REG-021 |
| F2 — partner form | `DEFERRED` | ITEM-0026 |
| F3 — partner typing | `FIXED` (schema) | This run |

## Not observed

- `REAL_POSTGRES = VIA_CI_GATE` — no local PostgreSQL; the `database-migration`
  required gate applies the migration to an empty PostgreSQL 16 and runs
  `seed:config` / `seed:verify`.
- `RESPONSIVE_VISUAL = NOT_OBSERVED` — no browser tooling run. The form uses
  labelled controls with `htmlFor`/`id`, a `fieldset`/`legend` for the interest
  group, `role="alert"` + `aria-live` on errors, `role="status"` on success and
  `aria-busy` while sending, but that is structure rather than a rendered check.
- `ADMIN_DISPLAY = NOT_OBSERVED` — the new Lead fields are not yet added to the
  Admin runtime form or list. Recorded as part of ITEM-0026's scope.
- `PRODUCTION_DEPLOYMENT = NOT_OBSERVED`.
- `BUG_0030_DEPLOYMENT = DEPLOY_REQUIRED` — merged to `main`, not observed in
  production. Wave 3 is on a separate branch and does not depend on it.
