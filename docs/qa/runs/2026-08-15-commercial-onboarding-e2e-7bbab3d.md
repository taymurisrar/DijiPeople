# QA Run — Commercial onboarding lifecycle E2E (website lead and partner journeys)

## Metadata

| | |
|---|---|
| Date / time | 2026-08-15, 08:45–14:20 local (UTC+3) |
| Branch | `agent/qa-commercial-onboarding-e2e` |
| Commit SHA | baseline `7bbab3d`; fixes committed on this branch |
| Worktree | primary checkout `d:\My Work\hrm-dijipeople\DijiPeople` |
| Environment | Local API (`npm --workspace api run start:dev`, port 4000) against **local PostgreSQL `dijipeople` @ localhost:5432**, 291 tables, `prisma migrate status` clean. Mailtrap sandbox SMTP. `TENANT_BASE_DOMAIN=e2e-dijipeople.test` exported for the API process only. |
| QA agent | QA (independent validation), with Architect, Backend/API and Integration input |
| Scope | Covered: Flow A (public website lead → agreement → signing → conversion → customer → onboarding → provisioning → tenant → owner → modules → readiness → activation gates) and Flow B (public partner inquiry → qualify → partner agreement → onboarding → activation → referral link → partner-referred lead → conversion), plus cross-flow authorization, isolation, state-machine and idempotency checks. **Not covered:** browser E2E (no tooling), tenant activation to ACTIVE (blocked by a defect, see BUG-05), Stripe billing (stubbed in code), partner portal lead submission (permanent 403 stubs in code). |

## Requirement

Prove the two complete commercial journeys end to end from their real public
entry points, without shortcutting intermediate business states, and verify UI
contract, API behaviour, database state, authorization and audit/events at each
step. This was a QA/E2E task: business behaviour was to be changed only where a
genuine defect was found.

## Environment findings recorded before testing

Two `.agent/context/testing-architecture.md` statements are **stale** and the
tooling wins (staleness rule):

- It states "Locally there is still no database on this workstation (no Docker,
  no `psql`)". A local PostgreSQL `dijipeople` is present, migrated and
  seeded. Database-backed E2E **is** now possible locally.
- It states `test/permission-propagation.e2e-spec.ts` and
  `test/attendance-integrations-isolation.e2e-spec.ts` do not exist. Both exist.

A third hazard, worth recording because it nearly produced a false result:
`services/api/.env` carries a **commented-out Neon cloud `DATABASE_URL` on line
10 above the active local one on line 11**. A naive `match(/DATABASE_URL=.../)`
picks up the commented cloud URL. The first connectivity probe in this run did
exactly that and read from a managed database before the mistake was caught.
Only read-only counts had run. The harness now selects the first
**uncommented** line and refuses any non-localhost host.

## Risk Areas

Derived from `docs/qa/known-bug-patterns/` and the modules in scope:

- `duplicate-route-bypass` — the lifecycle has several duplicated surfaces
  (`/super-admin/tenants/:id/status` vs `/platform/tenants/:id/status`;
  `/super-admin/tenants/:id/features` vs `/platform/tenants/:id/modules`).
- `authorization-missing` / `service-authorization-hidden` — `platform/*` and
  `partner-experience/*` authorize inside the service, not via decorators.
- `defined-but-unwired-permission` — generalised here to **declared-but-unwired
  provisioning steps**, which is what BUG-04 turned out to be.
- `doc-code-drift` — confirmed twice (above, and the provisioning step
  catalogue grew 6 → 8 steps during the run).
- Governing-agreement gates are enforced by matching contracts on
  `relatedLeadId` + `contractType` + status, so anything that can mutate those
  columns can move the gate. This is what BUG-01 turned out to be.

Regression register entries reviewed for these modules: REG-001…REG-008. None
covered contracts, leads, customer onboarding or tenant provisioning; this run
adds REG-009…REG-012.

## Concurrent-modification caveat (affects attribution of results)

At roughly 09:00, while this run was in progress, a large uncommitted feature
("tenant workspace domains") appeared in the working tree: 31 modified files,
~1,637 insertions, new `services/api/src/modules/tenant-domains/`, and a new
Prisma migration `20260815090000_tenant_workspace_domains` already applied to
the local database. The provisioning step catalogue changed from 6 to 8 steps
mid-run.

Consequences, stated explicitly:

- **BUG-01, BUG-02, BUG-03 were confirmed against committed `HEAD` 7bbab3d** and
  are independent of that work (`contracts.service.ts` and
  `public-leads.controller.ts` were unmodified; the BUG-02 seed line is
  identical in `HEAD`).
- **BUG-04, BUG-05 and BUG-06 concern the provisioning/partner paths as they
  now stand**, including the in-flight work, which the repository owner
  confirmed is complete and committable.
- Flow A results recorded before ~09:00 describe pre-change code for the
  provisioning steps only. Every provisioning result in this document was
  re-executed after the change.

## Scenarios

156 scenarios executed. Expected behaviour was written before execution in the
harness. Full machine-readable results are in the run artefacts (see below).
Summary by area; every non-PASS is explained.

| Area | Scenarios | PASS | Notes |
|---|---|---|---|
| A1 public website lead submission | 12 | 10 | 2 real defects (BUG-03, duplicate handling) |
| A2/A3 admin lead list + detail | 9 | 9 | |
| A4 qualification / conversion readiness | 5 | 5 | |
| A5 agreement lifecycle + real signing | 21 | 20 | 1 real defect (BUG-01) |
| A6/A7 conversion + customer record | 13 | 12 | 1 design observation (origin channel) |
| A8/A9 onboarding + readiness | 8 | 8 | after BUG-02 fix |
| A10 tenant provisioning + retry | 14 | 8 | BUG-04; plus superseded pre-config failures |
| A11–A16 tenant, owner, modules, readiness, activation | 20 | 14 | BUG-05 |
| B1–B3 public partner inquiry + qualification | 18 | 18 | |
| B4 partner agreement → onboarding → activation | 12 | 11 | 1 harness DTO error |
| B5 partner onboarding review controls | 2 | 0 | BUG-06 |
| B6/B7 referral attribution + referred-lead journey | 9 | 9 | |
| C3/C4/C5 authorization, isolation, state machine | 8 | 7 | dead bulk-delete route |
| FIX verification (post-fix re-runs) | 13 | 13 | |

### Scenario detail — the load-bearing ones

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| A1.01 | Valid website lead creates a Lead with server-owned source/status | happy | `source='Website'`, `status='NEW'`, `attributionStatus='DIRECT'` | PASS | Lead `8a725dd7` |
| A1.07 | Client cannot inject `tenantId`/`status` on public submit | negative | 400 `forbidNonWhitelisted` | PASS | |
| A1.08 | Honeypot submission silently dropped, no row, no id leaked | negative | `{submitted:true}`, 0 rows | PASS | |
| A1.11 | Public lead endpoint is rate limited | boundary | some 429s | **FAIL → fixed** | 0/25 throttled → BUG-03 |
| A1.12 | Control: partner inquiry endpoint *is* rate limited | boundary | some 429s | PASS | proves the guard works |
| A4.04 | Conversion blocked with no executed agreement | permission | 400 | PASS | |
| A5.16 | Recipient signs via the emailed public link | happy | 200 | PASS | real token from `PlatformOutboundEmail` |
| A5.17 | Final signature executes the agreement | happy | `FULLY_EXECUTED` + `signedAt` | PASS | |
| A5.18 | Hash-chained, attributable signature evidence | contract | chain intact, doc hash, signer, IP | PASS | |
| A5.21 | Executed agreement cannot be edited | negative | 4xx | **FAIL → fixed** | 200, title rewritten → BUG-01 |
| BUG02.06 | Executed agreement re-pointed to another lead satisfies that lead's gate | security | blocked | **FAIL → fixed** | victim lead converted to CustomerAccount `3d19486b` |
| A6.01 | Concurrent double conversion creates exactly one Customer | concurrency | 1 CustomerAccount | PASS | see residual risk |
| A6.06 | Converted lead cannot be re-converted | idempotency | 409 | PASS | |
| A9.02 | Readiness flips to ready only when every condition is met | happy | `isReadyForTenantCreation=true` | PASS | |
| A10.01 | Provisioning blocked while readiness fails | negative | 400 listing blockers | PASS | |
| A10.02 | No partial Tenant left by a blocked provisioning attempt | boundary | 0 tenants | PASS | |
| A10.10 | Failed provisioning can be retried | regression | 2xx | **FAIL → fixed** | BUG-04 |
| A12.05 | A retried tenant can still receive its owner | happy | owner created | **FAIL** | BUG-05, unresolved |
| A14.02 | Plan-excluded module cannot be enabled by override | permission | 400 | PASS | |
| A15.01 | Readiness is BLOCKED without an active owner | negative | `BLOCKED` + owner blocker | PASS | |
| A16.01 | Activation refused without an active owner | negative | 400 | PASS | |
| A16.03 | Lifecycle change without a reason rejected | validation | 400 | PASS | |
| A16.04 | Illegal transition `PENDING_SETUP → DECOMMISSIONED` rejected | state machine | 400 | PASS | |
| A16.05 | Activation refused while the only owner is INVITED | negative | 400 | PASS | `countActiveOwners` counts ACTIVE only |
| B1.05 | Duplicate partner inquiry deduplicated by `submissionHash` | idempotency | 1 row, same reference | PASS | contrast with A1.10 |
| B3.06 | Partner onboarding invitation blocked until the agreement is executed | permission | 400 | PASS | |
| B3.07 | Partner activation refused without agreement + approved onboarding | permission | 4xx | PASS | |
| B3.08 | Referral link cannot be minted for a non-ACTIVE partner | permission | 4xx | PASS | |
| B4.11 | Partner becomes ACTIVE once both gates are satisfied | happy | `status='ACTIVE'` | PASS | |
| B5.01 | Onboarding approval requires an actual submission | state machine | refused | **FAIL** | BUG-06, unresolved |
| B5.02 | An approved onboarding cannot later be flipped to REJECTED | state machine | 4xx | **FAIL** | BUG-06; cascaded an ACTIVE partner to REJECTED |
| B6.02 | Referral code resolves to the partner, `ATTRIBUTED` | happy | partner set | PASS | code `DP-P-UXEVPZDXJ4` |
| B6.03 | Invalid referral code recorded, never silently attributed | negative | `INVALID_CODE`, partner null, code retained | PASS | |
| B6.04 | Public submitter cannot set `partnerId` directly | security | 400 | PASS | |
| B7.04 | Customer retains partner attribution + originating lead through conversion | contract | all four fields retained | PASS | Customer `ab6c746a` |
| C3.01 | Unauthenticated requests rejected on 9 lifecycle endpoints | permission | 401/403 all | PASS | |
| C3.03 | Admin token replayed as the `web` client rejected | security | 4xx | PASS | `appClientId`/`aud` check |
| C4.01/02 | Unknown tenant/customer id returns 404, no cross-record leak | tenant | 404 | PASS | |
| C5.01/02 | A CONVERTED lead is terminal and read-only | state machine | 400 | PASS | |
| C5.03 | Bulk lead delete for a SUPER_ADMIN | permission | not a blanket 403 | **FAIL** | dead route, fails closed |

### Non-PASS results that are **not** product defects

Recorded so the numbers above are honest:

- **A5.19** (`signatureValues=3`) — my assertion was wrong. The three rows are
  three distinct placeholder keys (`signature.counterparty.name` / `.initials` /
  `.date`) from one signature, not duplicates. Re-signing **is** idempotent.
- **A8.02, A10.04–A10.08, A12.01(first run), B4.08, A13.01** — harness payloads
  that did not match the real DTOs (`limit` vs `pageSize`, `agreedSeats`,
  `tenantSlug`, `serviceAccountPurpose` vs `purpose`, the partner onboarding
  submit body). The 400s were **correct** `forbidNonWhitelisted` behaviour. Each
  was corrected and re-run.
- **A10.04 first attempt** — `TENANT_BASE_DOMAIN` was unset in the local
  environment. Genuine environment configuration, not a product defect, but it
  exposed BUG-07 (below).
- A **3-hour timestamp skew** initially observed was a harness artefact:
  Prisma columns are `timestamp without time zone` and `node-pg` parses them as
  local time. Not a product defect.

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run check-types` | `tsc --noEmit -p tsconfig.build.json` | clean | 0 | — | ~4 min |
| `npm --workspace api run test -- contracts.agreement-immutability` | REG-009 | 19 | 0 | 0 | 2.0 s |
| `npm --workspace api run test -- platform-lifecycle.onboarding-seed` | REG-010 | 11 | 0 | 0 | ~2 s |
| `npm --workspace api run test -- public-leads.rate-limit` | REG-011 | 3 | 0 | 0 | ~2 s |
| `npm --workspace api run test -- tenant-provisioning-retry` | REG-012 | 10 | 0 | 0 | ~2 s |

E2E itself was driven by a bespoke HTTP+SQL harness against the running API, not
by a repo suite — `services/api/test/` e2e suites were not used because none
cover this lifecycle.

### Regression-test proof

Each new spec was run against the unfixed code by stashing only its fix:

| Spec | With fix | Without fix |
|---|---|---|
| `contracts.agreement-immutability.spec.ts` | 19 pass | **7 fail** (5 drifted statuses + both retarget cases) |
| `platform-lifecycle.onboarding-seed.spec.ts` + `public-leads.rate-limit.spec.ts` | 14 pass | **4 fail** |
| `tenant-provisioning-retry.spec.ts` | 10 pass | **3 fail** |

## Bugs Found

### BUG-01 — HIGH — Signed agreements were mutable, defeating the lead-conversion gate

`ContractsService.update()` (`services/api/src/modules/contracts/contracts.service.ts:1735`)
carried its own inline copy of the blocked-status list, which had drifted from
the shared `assertAgreementEditable` (`:4758`): `SENT`, `VIEWED`,
`FULLY_EXECUTED`, `SUPERSEDED`, `TERMINATED` were all missing.

Reproduced: `PATCH /contracts/:id` with `{relatedLeadId: <other lead>}` on a
`FULLY_EXECUTED` agreement returned **200**; the victim lead — which had never
had an agreement — then converted to CustomerAccount `3d19486b`. The
conversion gate matches contracts by `relatedLeadId`, so one edit moved the gate.

Also mutable post-execution: `title`, `contractType`, `customerAccountId`,
`tenantId`, `partnerId`, `counterpartyName/Email`, `isGoverningAgreement`.

**Fix:** `update()` now delegates to `assertAgreementEditable`; one list.
**Regression:** REG-009. **Retest:** FIX1.01–04 PASS (drafts still editable).

### BUG-02 — HIGH — Every onboarding created by lead conversion was born unusable

`convertLeadToCustomer` seeded `CustomerOnboarding` with
`status: NOT_STARTED, subStatus: 'Agreement executed'`, but
`CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[NOT_STARTED]` is
`['Awaiting kickoff','Kickoff scheduled']`. `updateCustomerOnboarding` validates
the effective sub-status on every call, so **every** later PATCH failed —
including a notes-only edit — with "Onboarding sub-status is not valid for the
selected onboarding status." The only escape was to guess that a status change
had to be sent in the same request.

This blocked the primary journey at the first step after conversion.

**Fix:** the seed asks the catalogue via `getDefaultSubStatus`.
**Regression:** REG-010. **Retest:** FIX2.01–03 PASS.

### BUG-03 — MEDIUM — `POST /api/public/leads` had no rate limiting

The only public surface without `PublicRateLimitGuard`. 25/25 rapid anonymous
submissions accepted; the identical burst against
`/public/partners/inquiries` was throttled. Each accepted submission also emails
every active platform user in the sales/admin roles, making it an outbound email
amplifier as well as an unbounded `Lead` growth vector.

**Fix:** `@UseGuards(PublicRateLimitGuard)` on `PublicLeadsController`.
**Regression:** REG-011. **Retest:** FIX3.01–02 PASS.

### BUG-04 — HIGH — No tenant that failed provisioning could be retried

`TENANT_PROVISIONING_STEPS` declares `workspace-slug-reserved` and
`workspace-routing-verified` as `isRetryable: true`, but
`TenantOperationsService.runRetryableStep` had no branch for either, so it fell
through to `Step ${key} cannot be replayed automatically.` Retry replays
retryable steps in catalogue order and `workspace-slug-reserved` is the first,
so **every** retry died on its first step, wrote a FAILED run and left the
tenant in `PROVISIONING_FAILED` — permanently, since retry is the only recovery
path. The admin UI kept offering the button.

**Fix:** both steps implemented, mirroring the forward path
(`workspace-routing-verified` re-resolves the primary hostname and asserts it
maps back to this tenant). **Regression:** REG-012. **Retest:** FIX4.01–03 PASS
— the stuck tenant recovered to `PENDING_SETUP` with all 8 steps resolved.

### BUG-05 — HIGH — **Unresolved.** A tenant that fails before `identities-and-billing` is unrecoverable

`identities-and-billing` is deliberately non-retryable (replaying it would
create a second owner and a second invoice), so retry marks it `SKIPPED`. But
that step is the only thing that creates the tenant's business unit, owner,
service account and subscription. `POST /platform/tenants/:id/access` refuses
with *"This tenant has no business unit yet. Complete provisioning before adding
access."*, so no owner can ever be added; `countActiveOwners` stays 0, so the
tenant can never be activated.

Observed on tenant `f2ab6d93`: 9 roles, **0 business units, 0 users**, readiness
`BLOCKED` on `subscription`, `workspace-routing`, `owner`, `modules` — and no
supported route out. After BUG-04's fix the retry now reports **SUCCEEDED** and
moves the tenant to `PENDING_SETUP`, so it looks healthy while being permanently
unusable, which is arguably worse than the previous hard failure.

**Not fixed here.** Making `identities-and-billing` replayable touches owner,
subscription and invoice creation and needs an explicit decision — it is a
provisioning/billing change and warrants an ExecPlan per `PLANS.md`.
Recommendation: make the step idempotent against its natural anchors (owner
email uniqueness per tenant, one subscription per tenant, invoice
`idempotencyKey`) and mark it retryable, rather than allowing `POST /access` to
bootstrap a business unit — the latter would let an operator paper over a
half-provisioned tenant.

### BUG-06 — HIGH — **Unresolved.** Partner onboarding review has no state machine

`PartnerExperienceService.reviewOnboarding` looks the application up and writes
the decided status with **no check on the current status**. Two consequences,
both reproduced:

1. An application still in `INVITED`, with `legalName` and `iban` null — the
   partner never submitted anything — was **approved**, and the partner was then
   activated. The compliance/KYC gate is satisfiable without the information it
   exists to review.
2. An already-`APPROVED` application was flipped to `REJECTED` **after
   activation**, cascading the live `ACTIVE` partner (signed agreement, live
   referral link) to `REJECTED`.

**Not fixed here** because the correct transition table is a product decision
(which decisions are legal from `INVITED`/`SUBMITTED`/`UNDER_REVIEW`, and
whether an activated partner may be demoted through this endpoint at all).
Recommendation: require `SUBMITTED`/`UNDER_REVIEW`/`CHANGES_REQUESTED` to
approve or reject, refuse any decision once the partner is `ACTIVE`, and route
deactivation through the existing governed `partnerTransition` actions.

### BUG-07 — MEDIUM — **Unresolved.** The admin-editable tenant base domain does not drive hostname issuance

`TenantProvisioningService.settings()` resolves `tenantBaseDomain` from the
`tenant-provisioning` PlatformSetting (which `/settings/tenant-provisioning`
edits), then env, then a `digipeople.com` default. But `createSystemDomain` uses
`buildWorkspaceHostname` → `getPlatformDomainConfig` in
`packages/config/platform-domains.js:160`, which reads **environment variables
only** and never consults that setting. So the admin control cannot fix a
missing base domain — provisioning fails at `workspace-domain` regardless of
what an operator sets in the UI. This is what blocked provisioning in this run
until `TENANT_BASE_DOMAIN` was exported.

Two sources of truth for one value, with the operator-facing one inert. Needs an
ADR because `platform-domains.js` is shared by the API and all three frontends.

### BUG-08 — LOW — `DELETE /api/super-admin/leads` is unreachable for every role

`resolvePlatformPermission` has no `DELETE` mapping, so the permission resolves
to `null` and `PlatformPermissionsGuard` throws — 403 even for `SUPER_ADMIN`
(C5.03). The route is dead. It fails closed, so this is a correctness/UX defect
rather than a security one.

### Observations that are not defects

- **Duplicate website leads are not deduplicated** (A1.10): two identical
  submissions produce two `Lead` rows. The partner inquiry endpoint *does*
  deduplicate via `submissionHash`. For a demo-request form this is arguably
  intended, but the asymmetry is worth a product decision.
- **`CustomerAccount` has no origin-channel column** (A6.05): `Lead.source`
  ("Website" / "Partner Referral") has no counterpart, so origin is only
  reachable by joining back through `sourceLead`. `originatingPartnerId` *is*
  carried, so partner attribution survives; channel does not.

## Database Verification

Real local PostgreSQL throughout. Verified by direct SQL after each step:

| Field | Value |
|---|---|
| Database type | local PostgreSQL, database `dijipeople` @ localhost:5432 (not production, not shared) |
| Migration command | `npm --workspace api run prisma:migrate:status` → "Database schema is up to date" (192 migrations at start) |
| Destructive scenarios | none; all writes were additive E2E fixtures |
| Cleanup | **not performed** — records retained at the repository owner's request |

Key assertions made against the database rather than the API response: lead
server-owned fields, honeypot non-persistence, placeholder rows, contract party
rows, `accessTokenHash` (no plaintext token column exists), signature evidence
hash chain, conversion field mapping, onboarding seed state, tenant linkage,
provisioning run/step rows, referral attribution columns, tenant inventory
(business units / users / roles).

### Generated test identifiers

All E2E records are prefixed `E2E20260815`. Counts: 54 Leads, 4 CustomerAccounts,
21 Partners, 1 Tenant, 25 Contracts.

| Entity | Id |
|---|---|
| Flow A lead | `8a725dd7-8854-4f2c-b64a-57b9560d0b56` |
| Flow A agreement | `1e436460-909b-4d91-bc66-764af441e79c` |
| Flow A customer | `e29cb94b-95d8-417f-bed2-f6c72c94e633` |
| Flow A onboarding | `a2779a72-9b64-4db4-91db-8e4bf5905339` |
| Flow A tenant | `f2ab6d93-b9a4-40a9-ae06-298ed31fa0c9` (slug `e2e-msu6dzpm`) |
| Bypass-victim customer (BUG-01 evidence) | `3d19486b-73db-4408-b447-021dd2e77069` |
| Flow B partner inquiry | `6c104d50-c80e-450b-9b94-3ea4f284fa89` |
| Flow B partner | `74e5be52-008a-4797-b51a-d650ccba3410` (referral code `DP-P-UXEVPZDXJ4`) |
| Flow B partner agreement | `e43e8e04-b9e5-4689-bb96-713861e50ab2` |
| Flow B referred lead | `f40e53da-1dfc-4013-b9f5-64090b111f2b` |
| Flow B referred customer | `ab6c746a-214e-43f6-bc44-963732a5f1b6` |

Test identity: platform super admin `superadmin@dijipeople.local`
(`SUPER_ADMIN`). No passwords, tokens or connection strings recorded.

## Audit / Timeline / Events

Verified present with correct actor and entity references:
`LEAD_SUBMITTED` (38 total, one per accepted public lead),
`PARTNER_INQUIRY_SUBMITTED` (source `LANDING`), `LEAD_CONVERTED`,
`CUSTOMER_ONBOARDING_INITIALIZED`, `LEAD_CONVERSION_BLOCKED` on refused
conversions, `PLATFORM_LEAD_CONVERTED_TO_CUSTOMER` audit row,
`CONTRACT_SIGNATURE_REQUEST`, `AGREEMENT_FULLY_SIGNED`. Provisioning runs and
steps are recorded per attempt with `trigger`, `attempt` and `failedStepKey`.

No duplicate or noisy emission was observed on the paths exercised.

## UI / UX

Assessed from code, not a browser (see Known Limitations). Findings that matter
to these journeys:

- **CRITICAL** — the admin "Retry provisioning" button was offered on a path
  that could never succeed (BUG-04), and now succeeds while leaving the tenant
  unusable (BUG-05). The operations panel reports run success, not tenant
  usability.
- **HIGH** — `/partner-inquiries/[inquiryId]` and
  `/partner-onboarding/[applicationId]` are bespoke review screens with **no
  inbound link anywhere in the app**; the list routes redirect to
  `/partners?viewId=…`, whose rows navigate to `/partners/{partnerId}`. The
  `partner-inquiries` view filters **Partner** rows by status, a different
  entity from the `PartnerInquiry` the detail page loads. The review screens are
  effectively unreachable.
- **MEDIUM** — `window.prompt` is used for governed reasons (lead `disqualify`,
  contract `stage-back`) while tenant lifecycle correctly uses `PanelDialog`.
  Inconsistent with the design system and untestable.
- **MEDIUM** — the landing `/contact` form fabricates lead data
  (`industry: 'General HR operations'`, `companySize: 'Unknown'`,
  `lastName: 'Contact'` for a one-word name) and has no honeypot, unlike
  `/request-demo`.
- **MEDIUM** — "Provision tenant" has no confirmation step despite being the
  most consequential create in the lifecycle; double-submit protection
  everywhere is disabled-button-only, with no idempotency key.
- **LOW** — `start-onboarding` in the admin UI only navigates to
  `/onboarding/new?customerId=…`; the `/start-onboarding` API and its proxy have
  no caller.

## Known Limitations

- **BROWSER_E2E = BLOCKED_INFRASTRUCTURE.** No Playwright, Cypress or Puppeteer
  in any workspace; web/admin jest run in a node environment with no jsdom. All
  UI findings above are code-read, not observed in a browser. Adding a browser
  stack was **not** done — it is a large dependency addition requiring an
  explicit architecture decision, which this QA task did not have.
- **Tenant activation to `ACTIVE` was never reached**, blocked by BUG-05. The
  activation *gates* were proven (A16.01–A16.05); the successful activation path,
  post-activation owner/session behaviour and the final eight-tab tenant
  verification (A17) are **unproven**.
- **Flow B did not repeat the full tenant journey** for the referred customer
  (B7 stopped after conversion and onboarding seed). The tenant phase is already
  characterised by Flow A and blocked by the same BUG-05.
- Stripe billing is a stub in code; partner-portal lead submission routes are
  permanent 403 stubs. Neither was testable.
- The partner **public onboarding submission** (B4.08) was not exercised — the
  harness payload did not match the DTO. The subsequent approval succeeded
  anyway, which is how BUG-06 was found, but the submit path itself is unproven.

## Verdict

**PASS WITH RISKS**, with two unresolved HIGH defects.

| Area | Verdict |
|---|---|
| WEBSITE_LEAD_FLOW | PASS (after BUG-02, BUG-03 fixes) |
| PARTNER_FLOW | PASS_WITH_RISKS (BUG-06 unresolved) |
| CUSTOMER_CONVERSION | PASS |
| CUSTOMER_ONBOARDING | PASS (after BUG-02 fix) |
| TENANT_PROVISIONING | FAIL (BUG-05 unresolved; BUG-04 fixed) |
| AGREEMENTS | PASS (after BUG-01 fix) |
| AUTHORIZATION | PASS |
| DATABASE | PASS |
| BROWSER_E2E | BLOCKED_INFRASTRUCTURE |
| AUDIT_EVENTS | PASS |
| UI_UX | PASS_WITH_RISKS |
| **OVERALL** | **PASS_WITH_RISKS** |

## Residual risks

- **BUG-05 and BUG-06 are live.** A tenant whose provisioning fails early is
  unrecoverable, and partner onboarding approval is ungoverned.
- `CustomerAccount.leadId` has **no unique constraint** (plain nullable FK,
  non-unique index) and the pre-check runs outside the conversion transaction.
  The concurrent double-conversion test produced exactly one customer (A6.01),
  so the race did not materialise here, but nothing in the schema prevents it.
- BUG-01's fix tightens `PATCH /contracts/:id` for `SENT`, `VIEWED`,
  `FULLY_EXECUTED`, `SUPERSEDED` and `TERMINATED`. If any workflow legitimately
  reassigns an internal owner on an executed contract, it now needs a governed
  action. No such caller was found in the frontends.
