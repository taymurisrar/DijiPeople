# WP-05 — Agreements (TASK-0032 / EXECPLAN-0051)

Worktree `D:/My Work/hrm-dijipeople/dp-pah-wp05`, branch `agent/pah-wp05-agreements`.
Implements ADR-0020 and closes BUG-3552, BUG-3553, BUG-3554, BUG-3231.

---

## IMPLEMENTED

### 1. ADR-0020 — placeholder availability by agreement context

New file `services/api/src/modules/contracts/placeholder-context.ts`
(spec: `placeholder-context.spec.ts`, 19 tests):

- `ALWAYS_AVAILABLE_SOURCE_ENTITIES = ['contract','platform','counterparty','sla','signature']`.
  Four of these are ADR-0020's literal list; `sla` is added on evidence, not
  invention — `assertSourceCanFillTemplate`'s pre-existing `FILLED_AFTER_SOURCE`
  set already classified `sla.*` as "platform service defaults, identical for
  every source" alongside the other four. `contracts.service.ts` now imports
  this constant instead of keeping its own literal copy of the same five names
  (a second copy is exactly the BUG-0011 lesson — "one rule, two
  implementations, and the copy is the one that drifts").
- `contractAllowedSourceEntities(contractType)` — the type-level ceiling, from
  a small table (see **Agreement type table** below) plus the always-available
  set.
- `contractLinkedSourceEntities(contract)` — which entities are *actually
  linked* on one agreement instance (`partnerId`, `relatedLeadId`,
  `customerAccountId`/`customerOnboardingId`, `tenantId`).
- `contractInstanceContextEntities` — the intersection ADR-0020 calls "an
  agreement instance's context".
- `unresolvableRequiredPlaceholders` — builds the "X cannot be resolved
  because this agreement is not associated with Y" message per missing
  required placeholder.
- `outOfContextPlaceholders` — what a template of a given type has no
  business referencing.

**`ContractPlaceholderDefinition.sourceEntity` already existed** (computed
once in the pre-existing `placeholder()` factory from the key's namespace) —
this work populates and enforces the *type/instance context* dimension ADR-0020
asks for on top of it; it does not re-derive `sourceEntity` a second way.

**Question the task asked to resolve first**: does `resolveSource('lead', id)`
fill `customer.*` for a pre-conversion agreement? **Yes** — read directly in
`contracts.service.ts`'s `resolveSource`, with its own comment: "A lead is the
counterparty of the customer agreement before any customer record exists, so
it resolves the canonical `customer.*` and `commercial.*` namespaces
directly." This is why `lead` sits inside the customer family in the type
table, and why `customer` becomes part of an instance's context the moment
`relatedLeadId` is linked, without a `customerAccountId`. This is a real,
supported relationship, not the pre-conversion leak the owner's rule warns
against — it is filled from the lead's own data, labelled by the same
`customer.*` keys the eventual `CustomerAccount` will use, so a
pre-conversion document and its post-conversion continuation read identically.

**Wiring**:

- `GET /contracts/placeholder-definitions` now takes optional `contractType`
  and `contractId` query params (`PlaceholderDefinitionsQueryDto`).
  `listPlaceholderDefinitions` is now `async` (it looks up the contract's
  links when `contractId` is given) and filters the registry by
  `contractAllowedSourceEntities`/`contractInstanceContextEntities`
  accordingly; omitting both returns the full registry, unchanged from
  before this ADR.
- `apps/admin/.../contract-document-editor.tsx` takes a new `contractType`
  prop and refetches the placeholder rail whenever it changes;
  `contract-template-editor.tsx` passes its own `type` state through.
- `createTemplate`/`createTemplateVersion` call
  `assertTemplatePlaceholdersInContext`, refusing a save that references an
  out-of-context placeholder, naming each token and label.
- `listTemplates`/`getTemplate` add a read-only `contextIssues` field (the
  out-of-context keys in the *published* version), so existing templates
  saved before this ADR are visible without being mutated.
- `submitApproval`/`sendForSignature` call the new
  `assertPlaceholdersInContext` *before* the existing generic required-value
  check, so a missing-because-unlinked placeholder gets the specific
  association message rather than a bare "X is required".
- **Final guard against literal artifacts** (task item 3): rather than
  scanning finished HTML for the substrings `undefined`/`null`/
  `[object Object]` — which would false-positive on ordinary legal prose
  ("this clause is null and void") — the guard sits *at the substitution
  site* inside `renderContractPlaceholders`: a value that stringifies to one
  of those three literals is treated as no value (same fallback path as an
  empty one), never printed. Proven in `contracts.domain.spec.ts`, including
  the negative case (real prose containing "null" is untouched).

### 2. BUG-3553 — source guards, duplicate guard

New file `services/api/src/modules/contracts/agreement-source-guards.ts`
(spec: `agreement-source-guards.spec.ts`, 14 tests; wiring proven in
`contracts.agreement-guards.spec.ts`):

- `UNUSABLE_PARTNER_STATUSES = [TERMINATED, REJECTED, SUSPENDED, INACTIVE]`.
  Every other `PartnerStatus` (including the in-pipeline ones —
  `AGREEMENT_DRAFTING`, `AWAITING_SIGNATURE`, …) is deliberately left usable:
  those states *are* the process that produces the agreement.
- `UNUSABLE_LEAD_STATUSES = [ARCHIVED, CLOSED_LOST, UNQUALIFIED, CONVERTED]`.
  The first three mirror this repository's own `leadViewWhere`'s
  `lost-inactive` grouping (`leads.repository.ts`) rather than inventing a
  second definition of "dead lead"; `CONVERTED` is added because a converted
  lead already has a `CustomerAccount` — a new agreement belongs against the
  customer, not the lead it came from.
- `UNUSABLE_CUSTOMER_STATUSES = [ARCHIVED, CHURNED]`. `SUSPENDED` is
  deliberately excluded — reversible, unlike the other two, and a tenant
  admin may need a reinstatement addendum while suspended.
- `assertLeadAttributedToPartner` — when both `partnerId` and `relatedLeadId`
  are set, the lead's own `partnerId` must match (or be unset — a direct
  lead may be attached to any partner's agreement).
- `findDuplicateAgreement` — refuses a second non-terminal agreement of the
  same `contractType` sharing any of the same links (`partnerId`,
  `customerAccountId`, `relatedLeadId`, `customerOnboardingId`, `tenantId`),
  returning the conflicting agreement's id/number; exempt for `AMENDMENT`/
  `RENEWAL` (they exist to follow an executed agreement) and for `copy()`
  (an explicit, deliberate duplication path — `skipDuplicateGuard: true`).

**Wiring**: `ContractsService.create()` calls `assertLinkedEntitiesUsable`
(fetches partner/lead/customer by id, runs the three usability checks plus
attribution) and, unless `skipDuplicateGuard`, `findDuplicateAgreement` →
`ConflictException` (409) naming the existing agreement. `update()` re-runs
the same usability check **only when a link field is actually present in the
PATCH**, using the *resulting* value (new where given, existing otherwise) —
an unrelated edit (payment terms, notes) on a long-running agreement does not
start failing because its partner was terminated afterward; touching a link
does re-validate the whole resulting link set.

### 3. BUG-3231 — audit trail

`ContractsService` gains a fifth constructor dependency, `AuditService`
(`contracts.module.ts` now imports `AuditModule`). The `timeline`/
`timelineTx` private helpers — already the one path most of the module's
ContractTimeline writes went through — now also call a new `auditContract`
helper (`tenantId: 'platform'`, `entityType: 'Contract'`, `action` = the same
event-type string the timeline row already used, e.g. `CONTRACT_CREATED`,
`CONTRACT_VOIDED`, `PARTY_ADDED`, `SIGNATURE_REQUEST_SENT`), in the same
transaction where one is open. The nine call sites that wrote a
`ContractTimeline` row directly (bypassing the helper — upload, approval
paths, cancel/resend, sign/decline/changes-requested, version invalidation)
each gained an adjacent `auditContract` call. `createTemplate`/
`createTemplateVersion`/`cloneTemplate`/`updateTemplateState` (template-level,
no `contractId` to hang a `ContractTimeline` row off) call `AuditService.log`
directly against `entityType: 'ContractTemplate'`. `generateDocument` is
audited too (`DOCUMENT_GENERATED`/`SIGNED_DOCUMENT_GENERATED`) — producing the
contractual PDF/DOCX is exactly the kind of legally significant action
BUG-3231 named.

**Public signing has no platform user.** `completeSignature`/
`declineSignature`/`requestSignatureChanges` audit with `actorUserId: null`
and the recipient's name/email/role in `afterSnapshot` —
`AuditService.log`'s platform branch already writes
`platformActorUserId: input.actorUserId ?? null`, so a null actor is a
supported, pre-existing case, not a new one. Proven directly in
`contracts.agreement-guards.spec.ts`.

**`modules/audit/lifecycle-audit-coverage.spec.ts`** gains a `ContractsService`
entry. Its write-method names (`void`, `terminate`, `add`/`removeParty`,
`send`, `complete`/`decline`, `resend`, `clone`, `transition`, `decide`,
`generate`, `open`, `invalidate`, `apply`, …) do not fit the existing
`WRITE_METHOD_PATTERN`, so `Coverage` gained an optional per-entry `pattern`
field (default unchanged, so the three existing entries are unaffected) and a
`CONTRACT_WRITE_METHOD_PATTERN` covering this module's actual verbs. All 29
matched write methods are classified `audited` or `exempt` with a reason
(`createFromSource`/`copy` delegate to `create()`; `importDocument` persists
nothing; `syncDerivedPlaceholderValues` is a private helper of `update()`).
A future unaudited write method on `ContractsService` now fails this spec.

### 4. BUG-3554 — typed signature style

- `CompleteSignatureDto.typedStyle?: 'CLASSIC' | 'SCRIPT' | 'FORMAL'`
  (`TYPED_SIGNATURE_STYLES`, `@IsIn`-validated).
- `apps/landing/.../signing-experience.tsx`: the existing style `<select>`
  (previously local-only state) now sends `typedStyle` when `method ===
  'TYPED'`, and its values were renamed from `serif|script|formal` to the
  API's `CLASSIC|SCRIPT|FORMAL`. The line telling the signer "the style is
  presentation only" was removed — it became false the moment the style
  started being sent and persisted; no replacement copy was added (per the
  standing "no explanatory UI copy without asking" rule — this is a deletion
  of now-incorrect text, not new copy).
- `completeSignature` persists it to `SignatureEvidence.typedStyle` (only for
  `method === 'TYPED'`; the column already existed from WP-01).
- `generateDocument`'s evidence-driven `{{signature.*}}` substitution adds
  `data-signature-style="<STYLE>"` to the wrapping `<span>` (added to
  `cleanContractHtml`'s `span` allowlist).
  `extractAgreementDocumentStructure` reads that attribute off the containing
  `<p>` (every seeded signature line is its own short paragraph — this
  renderer flattens a whole paragraph to one line of text regardless, so
  per-run styling was never available; per-paragraph font choice is the fix
  at the altitude this renderer actually works at) and `createPdf` picks a
  **standard** PDFKit font per style (PDFKit ships no script face: `CLASSIC`
  → Helvetica, `SCRIPT` → Times-Italic as the closest standard-font
  approximation, `FORMAL` → Times-Roman). `createDocx` sets a real font
  (`Times New Roman` for `SCRIPT`/`FORMAL`) since DOCX supports actual font
  embedding, unlike PDFKit's fixed 14.
- **Confirmed, not a defect**: a drawn/uploaded signature image was already
  being decoded and drawn into the PDF (`decodeEmbeddedDocumentImage` →
  `document.image(...)` in `createPdf`) and into the DOCX (`ImageRun`) — read
  the code, and added a test that inspects the actual PDF bytes for a
  `/Subtype /Image` XObject to make that provable rather than merely
  observed. No fix was needed here; task item 6 asked to confirm this, and it
  is confirmed both by reading and by a new byte-level test.
- Both survive regeneration from stored evidence: `generateDocument` reads
  `SignatureEvidence` (including `typedStyle`) fresh on every call, never
  the frozen `ContractVersion.contentHtml`'s own `signature.*` tokens for
  the final rendering.

### 5. Expiry (discovery D3 scenario 16)

No scheduler infrastructure exists anywhere in this repository — grepped for
`@Cron`/`@Interval`/`SchedulerRegistry` across `services/api/src`, zero
matches. `assertTokenUsable` already reactively refuses an elapsed signer
link, but nothing transitioned the *durable* `SignatureRequest`/
`SignatureRecipient` status, so `SENT`/`VIEWED` persisted forever for anyone
who did not open the request from the admin side. New private
`applyPassiveSignatureExpiry`, called from `getSignatureRequest`: the first
read of an elapsed `SENT`/`VIEWED`/`PARTIALLY_SIGNED` request transitions it
(and its still-open recipients) to `EXPIRED`, writes a
`SIGNATURE_REQUEST_EXPIRED` timeline + audit row, and returns the updated
record — durable for every subsequent reader, not a per-caller projection.
The contracts list (`ContractsService.list`) additionally *displays* (without
writing — a list read must not fan out into 25–100 per-row transactions) the
same computed status via `displaySignatureStatus`.

### 6. Admin agreement UX

Read the existing `apps/admin/lib/runtime/platform-module-registry.ts`
`contracts` module definition in full before assuming a gap: **per-status
actions are already comprehensively gated** by `states` arrays — `edit`
excludes every status from `SENT` onward, `send-signature` is
`READY_FOR_SIGNATURE`/`APPROVED_FOR_SENDING` only, `amend`/`renew` require an
executed status, `terminate-agreement`/`void-agreement` are scoped correctly,
and delete is intentionally disabled in favour of `void-agreement` as the
safe removal path for a draft. Related-record tabs already surface
signature requests, documents, approval history, parties, field placements
and versions. This contradicts D3's "UNKNOWN, worth follow-up" flag — it is
verified, not a gap, and no rebuild was needed.

**One real duplicate found and removed**: `SignatureRequestsController` had
both `POST /signature-requests/:id/resend` and `.../remind`, calling the
identical service method. A repo-wide search found no caller of `/remind`
anywhere (the admin UI only ever calls `resend`), so the dead route was
removed rather than kept as a second name for the same action.

---

## Agreement type table

| Contract type | Family | Context entities beyond always-available (`platform`,`contract`,`counterparty`,`sla`,`signature`) | Counterparty requirement |
|---|---|---|---|
| `PARTNER_AGREEMENT` | Partner | `partner` | `partnerId` required (`validateCounterparty`) |
| `MASTER_PARTNER_AGREEMENT` | Partner | `partner` | `partnerId` required |
| `COMMISSION_ADDENDUM` | Partner | `partner` | Not enforced at DTO level (pre-existing; only the two types above are checked) — expected to carry `partnerId` in practice |
| `TERRITORY_ADDENDUM` | Partner | `partner` | As `COMMISSION_ADDENDUM` |
| `REFERRAL_ADDENDUM` | Partner | `partner` | As `COMMISSION_ADDENDUM`; seeded template only references `partner.name` |
| `CUSTOMER_AGREEMENT` | Customer | `lead`, `customer`, `commercial` | `customerAccountId` **or** `relatedLeadId` required (`validateCounterparty`) |
| `MASTER_SERVICES_AGREEMENT` | Customer | `lead`, `customer`, `commercial` | Not enforced at DTO level (same pre-existing gap) |
| `SUBSCRIPTION_AGREEMENT` | Customer | `lead`, `customer`, `commercial` | Not enforced at DTO level; this is the governing customer agreement (`GOVERNING_CUSTOMER_AGREEMENT_TYPES`) gating lead conversion |
| `DATA_PROCESSING_AGREEMENT` | Customer | `lead`, `customer`, `commercial` | Not enforced at DTO level |
| `SLA` | Customer | `lead`, `customer`, `commercial` | Not enforced at DTO level |
| `STATEMENT_OF_WORK` | Customer | `lead`, `customer`, `commercial` | Not enforced at DTO level |
| `SERVICE_AGREEMENT` | Tenant provisioning | `customer`, `commercial`, `tenant`, `serviceOrder`, `implementation`, `integration`, `hosting` (no `lead` — a raw lead is explicitly refused) | A converted `customerAccountId` with a fully executed governing agreement, when `lifecycleGatePurpose === TENANT_PROVISIONING` or sourced from a tenant/onboarding (`assertTenantServiceOrderEligible`) — otherwise an ordinary services agreement with no special requirement |
| `NDA`, `ADDENDUM`, `AMENDMENT`, `RENEWAL`, `TERMINATION`, `OTHER` | Generic | All of `partner`, `lead`, `customer`, `commercial`, `tenant`, `serviceOrder`, `implementation`, `integration`, `hosting` — the type places no ceiling beyond the always-available set; instance linkage does the narrowing | None enforced at DTO level — a generic type can attach to any counterparty or none |

Reasoning derived from `seed-config.ts`'s `seedPlatformContractTemplates` (the
only templates that exist, and which namespaces each one's HTML actually
references), `validateCounterparty`, `assertTenantServiceOrderEligible`, and
`governing-agreement.ts` — not merely enumerated. `AMENDMENT`/`RENEWAL` are
always created via `createDerivedContract`, copying the source agreement's own
links, so restricting them at the type level would only ever fight the
mechanism that creates them.

---

## Agreement Scenario Matrix (D3 §8, 30 scenarios)

| # | Scenario | Status after WP-05 | Proving spec |
|---|---|---|---|
| 1 | Partner, no customer | Unchanged (already correct) | `contracts.agreement-guards.spec.ts` |
| 2 | Partner, no lead | Unchanged (already correct) | — |
| 3 | Lead, no customer | Unchanged; placeholder resolution now correctly scoped (BUG-3552) | `placeholder-context.spec.ts` |
| 4 | Partner + lead | **Fixed** — attribution consistency enforced (BUG-3553) | `agreement-source-guards.spec.ts`, `contracts.agreement-guards.spec.ts` |
| 5 | Partner + customer | Unchanged — no owner instruction covered this pair; residual, out of WP-05 scope | — |
| 6 | Partner + lead + customer | Partially improved — the lead/partner pair is now checked; partner/customer and lead/customer cross-consistency remain unchecked | `agreement-source-guards.spec.ts` |
| 7 | Before lead conversion | Unchanged (already correct); `customer.*` context now explicitly scoped to the lead relationship | `placeholder-context.spec.ts` |
| 8 | After lead conversion | Unchanged (already correct) | — |
| 9 | Partner updated after draft created | Unchanged (already correct) | — |
| 10 | Template edited after contract created | Unchanged (already correct) | — |
| 11 | Regenerate before signing | Unchanged, now audited (BUG-3231) | `contracts.agreement-guards.spec.ts` (create-audit pattern; `generateDocument` uses the same `auditContract` helper) |
| 12 | Already signed (attempt further action) | Unchanged (already correct) | `contracts.agreement-immutability.spec.ts` (pre-existing) |
| 13 | One signatory | Unchanged (already correct) | — |
| 14 | Multiple signatories | Unchanged (already correct) | — |
| 15 | Decline | Unchanged, now audited with null actor (BUG-3231) | `lifecycle-audit-coverage.spec.ts` classification; pattern proven for `completeSignature` in `contracts.agreement-guards.spec.ts` |
| 16 | Expiry | **Fixed** — passive transition on read (BUG-3553 admin UX) | `contracts.agreement-guards.spec.ts` |
| 17 | Cancel | Unchanged, now audited | `lifecycle-audit-coverage.spec.ts` |
| 18 | Required placeholder missing | **Improved** — entity-specific message (BUG-3552) | `contracts.agreement-guards.spec.ts` |
| 19 | Optional placeholder missing | Unchanged (already correct) | `contracts.domain.spec.ts` (pre-existing) |
| 20 | Partner inactive | **Fixed** (BUG-3553) | `agreement-source-guards.spec.ts`, `contracts.agreement-guards.spec.ts` |
| 21 | Lead archived | **Fixed** (BUG-3553) | `agreement-source-guards.spec.ts` |
| 22 | Customer archived | **Fixed** (BUG-3553) | `agreement-source-guards.spec.ts` |
| 23 | Unauthorized access | Unchanged — still a binary platform-permission check, no row-level scope; pre-existing design, not a WP-05 bug record | — |
| 24 | Cross-tenant | Unchanged — `openDocument`'s residual `ContractDocument` tenant-scoping risk (FILE-15) is unfixed; not a named WP-05 bug record | — |
| 25 | Super admin | Unchanged (already correct) | — |
| 26 | Tenant admin | Unchanged — N/A by design | — |
| 27 | Duplicate creation | **Fixed** (BUG-3553) | `agreement-source-guards.spec.ts`, `contracts.agreement-guards.spec.ts` |
| 28 | Multiple applicable contract types | Unchanged mechanism (`assertSourceCanFillTemplate`); now formalised by the type table above (BUG-3552) | `placeholder-context.spec.ts` |
| 29 | Versioning | Unchanged (already correct) | — |
| 30 | Signed doc reopened after source data change | Unchanged (already correct); typed style confirmed to persist across regeneration (BUG-3554) | `contracts.domain.spec.ts` |

---

## CHANGED_BEHAVIOR

- `ContractsService.listPlaceholderDefinitions` is now `async` and accepts two
  new optional params — a source-compatible change for the one caller
  (`ContractsController`), but a breaking one for any test calling it
  directly without `await` (fixed the one pre-existing spec that did).
- `ContractsService`'s constructor takes a fifth argument, `AuditService` —
  breaking for any test instantiating it directly (fixed the two
  pre-existing spec files affected; both are proven passing).
- `POST /contracts` and `PATCH /contracts/:id` (when a link field is present)
  now reject a request that would attach an unusable partner/lead/customer,
  an inconsistent partner+lead pair, or a duplicate agreement — previously
  silent successes.
- `POST /contract-templates` and `.../:id/versions` now reject a save
  referencing an out-of-context placeholder — previously a silent success.
- `POST /contracts/:id/submit-approval` and `.../signature-requests` (send)
  now fail earlier, with a more specific message, when a required
  placeholder's entity is not linked — previously a generic
  "X is required" from the same call.
- `GET /contracts/placeholder-definitions` returns the full registry exactly
  as before when called with no query params; with `contractType` (and
  optionally `contractId`) it now returns a narrower list.
- `DELETE`-equivalent duplicate route `POST /signature-requests/:id/remind`
  no longer exists (nothing called it).
- Opening a signature request whose token has expired now durably flips its
  status to `EXPIRED` server-side, where it previously stayed `SENT`/`VIEWED`
  forever.

## RISK_AREAS

- The duplicate guard (`findDuplicateAgreement`) matches on whichever link
  fields the new agreement declares — an agreement declaring only
  `partnerId` will be treated as a duplicate of any other non-terminal
  agreement of the same type and partner, regardless of other fields it may
  or may not share. This is the intended, simple reading of "same
  counterparty/source" but could be too aggressive for a legitimate edge
  case not seen in the seeded data.
- `update()`'s guard re-validates the **whole resulting link set** whenever
  *any* one link field is present in the PATCH — touching `relatedLeadId`
  alone on an agreement whose untouched `partnerId` now points at a
  terminated partner will newly block that PATCH. Judged the safer default
  given the task's wording, but worth confirming against real operator
  workflows.
- `createDerivedContract` (amend/renew) funnels through `create()`, so the
  usability guard runs against the *carried-over* links too — amending an
  executed agreement whose partner has since been terminated will now be
  blocked. No amendment/renewal carve-out was added for the usability guard
  (only the duplicate guard exempts them), since the task named no such
  exception and blocking seems like the safer default, but this is a genuine
  judgment call.
- `applyPassiveSignatureExpiry` runs inside `getSignatureRequest`, so the
  very first admin read of an elapsed request after this deploy performs a
  write; if that read happens inside a read-only transaction or a context
  that does not expect a nested write, it would need adjustment — not
  observed as a problem in this module's call sites, but worth a second look
  under load.
- The `sla` addition to `ALWAYS_AVAILABLE_SOURCE_ENTITIES` extends ADR-0020's
  literal four-name list by one, on the strength of `assertSourceCanFillTemplate`'s
  existing comment. If that comment's premise (`sla.*` is uniform platform
  policy, never source-derived) is ever wrong for some future template, this
  would need revisiting.

## KNOWN_MISTAKES_AVOIDED

- BUG-0011's lesson (divergent duplicate guard) — reused
  `ALWAYS_AVAILABLE_SOURCE_ENTITIES` inside `assertSourceCanFillTemplate`
  instead of leaving its own literal copy of the same five names.
- BUG-1541's lesson (a source paired with the wrong template silently renders
  half-empty) — did not touch `assertSourceCanFillTemplate`'s behavior, only
  its internal reference to the always-available set; its own regression
  spec (`source-fills-template.spec.ts`) still passes unmodified.
- Did not invent a second "terminal lead status" list — reused this
  repository's own `leadViewWhere`'s `lost-inactive` grouping as the base for
  `UNUSABLE_LEAD_STATUSES`, documented in the source comment.
- Did not add explanatory UI copy — the stale "style is presentation only"
  line was deleted, not replaced with new copy, per the standing rule.
- Did not touch `services/api/prisma/schema.prisma`, `prisma/migrations/`,
  `common/constants/permissions.ts`, `common/constants/rbac-matrix.ts`, or
  `platform-auth/platform-permissions.ts` (WP-01/WP-02 owned).
- Did not touch `apps/admin/lib/runtime/platform-runtime.service.ts` — per
  the coordinator's note that BUG-3565 (contract-templates/signature-requests
  404 from the runtime `get()`) is being fixed by the Architect on the
  integration branch.

## TESTS_ADDED

| File | Proves |
|---|---|
| `services/api/src/modules/contracts/placeholder-context.spec.ts` (19 tests) | Type-level ceiling, instance-level linkage, the lead→customer.* pre-conversion rule, the entity-association blocking message, out-of-context template detection |
| `services/api/src/modules/contracts/agreement-source-guards.spec.ts` (14 tests) | Partner/lead/customer usability per status, lead↔partner attribution, duplicate detection and its AMENDMENT/RENEWAL exemption |
| `services/api/src/modules/contracts/contracts.agreement-guards.spec.ts` (11 tests) | The above wired into `ContractsService.create`/`update`/`sendForSignature`/`createTemplate`; the `create()` audit call; `completeSignature`'s null-actor audit and `typedStyle` persistence; `applyPassiveSignatureExpiry`'s transition (and its two negative cases) |
| `services/api/src/modules/contracts/contracts.domain.spec.ts` (+8 tests) | The undefined/null/[object Object] rendering guard (positive and negative); `data-signature-style` extraction; a drawn signature image actually drawn into PDF bytes (`/Subtype /Image`); SCRIPT vs CLASSIC producing different PDF fonts; the DOCX run actually carrying `Times New Roman` (read via `jszip`, since DOCX is compressed) |
| `services/api/src/modules/audit/lifecycle-audit-coverage.spec.ts` (+1 entry, 29 methods classified) | Every `ContractsService` write method is audited or exempt-with-reason; fails for a future unclassified one |
| `services/api/src/modules/contracts/contracts.contracting.spec.ts`, `contracts.workflow.spec.ts` (updated) | Pre-existing specs updated for the now-`async` `listPlaceholderDefinitions` and the new `AuditService` constructor argument |

All new specs pass; each was run and confirmed green (see VALIDATION). Fails
without the fix by construction — the guard functions, DTO field, audit
calls, and expiry transition did not exist before this branch's commits.

## TEST_HOOKS (for WP-09 browser QA)

- Admin: `/templates/new` and `/templates/:id` — pick a `PARTNER_AGREEMENT`
  type and confirm the fields rail only offers Platform/Partner/Contract/
  Service order(none)/Signatures groups, not Customer/Lead/Tenant. Try
  inserting `{{customer.legalName}}` by hand and saving — expect a 400 naming
  the token.
- Admin: `/contracts` — create a `PARTNER_AGREEMENT` against a partner whose
  status is `TERMINATED`/`SUSPENDED` — expect a 400 naming the partner and
  status. Create a second `PARTNER_AGREEMENT` for the same partner while the
  first is still `DRAFT`/anything non-terminal — expect a 409 naming the
  first agreement's number.
- Admin: `/signature-requests/:id` for a request whose `expiresAt` has
  elapsed and whose status is still `SENT` — reload the record and confirm
  the status reads `EXPIRED`.
- Landing: `/sign/:token` — choose "Script" before typing a signature, sign,
  then have the platform side (or trigger completion) regenerate the signed
  PDF — the signature line should render in an italic serif font distinct
  from the "Classic"/"Formal" choices.
- `GET /contracts/placeholder-definitions?contractType=SERVICE_AGREEMENT`
  vs `?contractType=NDA` — compare the `items`/`groups` returned.

## RECORD_CLOSURES

| Record | Commit(s) | Spec | Fails without fix |
|---|---|---|---|
| BUG-3552 | contents of `placeholder-context.ts`, its wiring in `contracts.service.ts`/`contracts.controller.ts`/`dto/contracts.dto.ts`, `contract-document-editor.tsx`/`contract-template-editor.tsx` | `placeholder-context.spec.ts`, `contracts.agreement-guards.spec.ts`, `contracts.domain.spec.ts` (artifact-literal tests) | Yes — the module did not exist before this branch |
| BUG-3553 | `agreement-source-guards.ts` and its wiring in `contracts.service.ts` (`create`/`update`/`copy`), plus `applyPassiveSignatureExpiry`/`getSignatureRequest`, plus the `/remind` route removal | `agreement-source-guards.spec.ts`, `contracts.agreement-guards.spec.ts` | Yes |
| BUG-3554 | `CompleteSignatureDto.typedStyle`, `completeSignature`'s persistence, `generateDocument`'s style attribute, `cleanContractHtml`'s span allowlist, `extractAgreementDocumentStructure`/`createPdf`/`createDocx` font selection, `signing-experience.tsx` | `contracts.domain.spec.ts`, `contracts.agreement-guards.spec.ts` | Yes |
| BUG-3231 | `auditContract`/`timeline`/`timelineTx` in `contracts.service.ts`, the nine adjacent `auditContract` calls, template-level audit calls, `contracts.module.ts`'s `AuditModule` import, `lifecycle-audit-coverage.spec.ts`'s new entry | `lifecycle-audit-coverage.spec.ts`, `contracts.agreement-guards.spec.ts` | Yes |

Regression entries REG-560..REG-574 filed at
`docs/qa/regressions/_incoming/wp05.md`, one per closure line above (several
records span multiple regressions — see that file for the full 15-entry
breakdown with bug class, root cause, and scenario per entry).

## VALIDATION

Run from `D:/My Work/hrm-dijipeople/dp-pah-wp05`, `DATABASE_URL` set to a
dummy value per COMMON-RULES (no spec here touches a real database):

```
npm --workspace api run check-types            PASS (prisma freshness OK, tsc clean)
npx eslint --fix <every api file changed>      0 errors on every file (warnings only,
                                                all pre-existing, none introduced)
npm --workspace api run test                   PASS — 349/350 suites, 6959/6960 tests
                                                (--maxWorkers=2; an unthrottled full run
                                                OOM'd in this sandboxed environment,
                                                which is an environment constraint, not
                                                a code failure — the same suites pass
                                                individually and in the throttled run)
```

**The one failing test is pre-existing, not WP-05's**:
`tenant-control-plane/tenant-erasure.constants.spec.ts` — "covers every
tenant-owned model exactly once" fails because `UserMfaRecoveryCode` (added by
WP-01, commit `10d5d148`, before this branch started) is missing from the
tenant-erasure order list. WP-05 never touched `tenant-control-plane`,
`schema.prisma`, or anything WP-01 added; this is WP-01's/the Architect's to
resolve, not re-litigated here per COMMON-RULES (single-writer files).

Every contracts-related and audit-related spec was also run individually and
in combination (135 tests across 10 files, then 11 more in
`contracts.agreement-guards.spec.ts`, then +8 in `contracts.domain.spec.ts`)
— all green, reported above.

```
npm --workspace admin run check-types          PASS
npm --workspace admin run test -- --testPathPatterns contract
                                                PASS — 39/39 (pre-existing suite,
                                                confirms the contractType prop change
                                                did not regress it)
npm --workspace landing run check-types        PASS
```

`npm --workspace web` was not run — this task never touched `apps/web`.

## UNRESOLVED

- **Scenario 5 / partial scenario 6** (partner+customer, and the
  partner/customer and lead/customer legs of the three-way combination) have
  no cross-consistency check — only lead↔partner was named by the task. If
  the owner wants full pairwise consistency across all three links, that is
  a follow-up, not implemented here.
- **Scenario 23/24** (coarse platform-permission authorization; `ContractDocument`'s
  missing `tenantId` in `openDocument`) are pre-existing, discovery-flagged
  residual risks with no assigned bug record in this task's scope — left
  untouched.
- `COMMISSION_ADDENDUM`/`TERRITORY_ADDENDUM`/`REFERRAL_ADDENDUM`/
  `MASTER_SERVICES_AGREEMENT`/`SUBSCRIPTION_AGREEMENT`/`DATA_PROCESSING_AGREEMENT`/
  `SLA`/`STATEMENT_OF_WORK` have no DTO-level counterparty requirement (only
  the two types `validateCounterparty` already checked before this task
  gained one) — pre-existing, not named by this task, not added.
- No `SCHEMA_NEEDED` / `PERMISSION_NEEDED` — this work needed neither a
  schema change (WP-01 already added `SignatureEvidence.typedStyle`) nor a
  new permission key (every new endpoint reuses `contracts.read`/
  `contracts.manage` through the existing `assertPlatform`/`assertWrite`).

---

## Final commit

Branch `agent/pah-wp05-agreements`. This report is committed as the final
commit of the package; `git log --oneline 10d5d148..HEAD` in the worktree
lists the full sequence — the implementation (`placeholder-context.ts`,
`agreement-source-guards.ts`, the `contracts.service.ts`/`.controller.ts`/
`.module.ts`/`dto/contracts.dto.ts` wiring, the admin/landing frontend
changes), the test commits, the regression file, and three
`wip(TASK-0032 WP-05): checkpoint …` commits the orchestrating harness
created automatically across session interruptions — left as-is per
instruction (not rewritten or squashed). The report's own commit SHA is
reported in the final handoff message.
