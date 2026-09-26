# Agreements

The commercial contracting engine behind the partner and customer funnels:
agreement types, lifecycle, which data an agreement is allowed to pull in and
from where, template authoring, generation, signing and its evidence chain,
immutability, and the guards that stop an agreement being created against
data that cannot support it.

> **Last verified:** 2026-09-25
> **Verified against:** `services/api/src/modules/contracts/`
> (`contracts.service.ts`, `placeholder-context.ts`,
> `agreement-source-guards.ts`), `prisma/schema.prisma` (`Contract`,
> `ContractType`, `ContractStatus`, `SignatureEvidence`), ADR-0020, TASK-0032
> WP-05 and WP-11 (partial — see the WP-11 note below). Extends
> [`docs/knowledge/modules/contracts-and-agreements.md`](../knowledge/modules/contracts-and-agreements.md),
> which remains the home for pre-TASK-0032 history (BUG-0011, the
> hash-chained evidence design) and is not duplicated here.

> **WP-11 in progress at the time of writing.** Everything in this document
> reflects the integrated task branch at `0a84a58e`, **except** the two areas
> marked **(WP-11)** below — agreement preview rendering and signature-date
> placeholders — which were still being fixed on branch
> `agent/pah-wp11-agreement-rendering` when this document was written (commit
> `a7d8c7c5`, with further uncommitted work on top). The Architect should
> re-verify those two subsections against the merged state before relying on
> them.

---

## Purpose and scope boundary

Agreements are the legal gate of the commercial funnel: a lead cannot become
a customer, and a partner cannot be activated, without an executed governing
agreement (`assertGoverningAgreementExecuted`). This document describes the
implementation as extended by TASK-0032 (ADR-0020's contextual placeholders,
source guards, audit, typed-signature style, passive expiry). For the
underlying signing/evidence architecture and its own known-bug history,
read [`docs/knowledge/modules/contracts-and-agreements.md`](../knowledge/modules/contracts-and-agreements.md)
first — this document does not repeat it.

## Agreement types and families

`ContractType` groups into three families plus a generic catch-all, each with
a **type-level ceiling** on which source entities its context can ever hold
(`services/api/src/modules/contracts/placeholder-context.ts`,
`CONTRACT_TYPE_SOURCE_ENTITIES`). Every type additionally always has access to
`ALWAYS_AVAILABLE_SOURCE_ENTITIES = ['contract', 'platform', 'counterparty',
'sla', 'signature']` — four from ADR-0020's literal list plus `sla`, added on
the evidence that `assertSourceCanFillTemplate`'s pre-existing
`FILLED_AFTER_SOURCE` set already classified `sla.*` as uniform platform
policy, identical regardless of source.

| Contract type | Family | Context beyond always-available | Counterparty requirement |
|---|---|---|---|
| `PARTNER_AGREEMENT`, `MASTER_PARTNER_AGREEMENT`, `COMMISSION_ADDENDUM`, `TERRITORY_ADDENDUM`, `REFERRAL_ADDENDUM` | Partner | `partner` | `partnerId` required for the first two (`validateCounterparty`); not enforced at DTO level for the three addenda (pre-existing gap), expected to carry `partnerId` in practice |
| `CUSTOMER_AGREEMENT`, `MASTER_SERVICES_AGREEMENT`, `SUBSCRIPTION_AGREEMENT`, `DATA_PROCESSING_AGREEMENT`, `SLA`, `STATEMENT_OF_WORK` | Customer | `lead`, `customer`, `commercial` | `customerAccountId` **or** `relatedLeadId` required for `CUSTOMER_AGREEMENT`; not enforced at DTO level for the rest. `SUBSCRIPTION_AGREEMENT` is the governing customer agreement type gating lead conversion (`GOVERNING_CUSTOMER_AGREEMENT_TYPES`) |
| `SERVICE_AGREEMENT` | Tenant provisioning | `customer`, `commercial`, `tenant`, `serviceOrder`, `implementation`, `integration`, `hosting` (**no** `lead` — a raw lead is explicitly refused: "Convert the lead first.") | A converted `customerAccountId` with a fully executed governing agreement when sourced from tenant provisioning (`assertTenantServiceOrderEligible`); otherwise an ordinary services agreement with no special requirement |
| `NDA`, `ADDENDUM`, `AMENDMENT`, `RENEWAL`, `TERMINATION`, `OTHER` | Generic | All of `partner`, `lead`, `customer`, `commercial`, `tenant`, `serviceOrder`, `implementation`, `integration`, `hosting` — the type places no ceiling beyond always-available; instance linkage does the narrowing | None enforced at DTO level |

**`lead` sits inside the customer family, not a separate one.** A lead is the
prospective customer before any `CustomerAccount` row exists —
`resolveSource('lead', id)` resolves the canonical `customer.*` and
`commercial.*` namespaces directly from the `Lead` record. This is a
supported relationship, not the pre-conversion data leak ADR-0020 warns
against: it is filled from the lead's own data, labelled with the same
`customer.*` keys the eventual `CustomerAccount` will use, so a
pre-conversion document and its post-conversion continuation read
identically.

**`AMENDMENT`/`RENEWAL` are always created via `createDerivedContract`**,
copying the source agreement's own links — restricting them at the type
level would only fight the mechanism that creates them, so they carry the
generic (unrestricted) type-level ceiling and rely entirely on instance
linkage.

## Lifecycle

`ContractStatus` (`prisma/schema.prisma`):

```
DRAFT -> INTERNAL_REVIEW -> APPROVED_FOR_SENDING -> COMMERCIAL_APPROVAL
      -> LEGAL_APPROVAL -> COUNTERPARTY_REVIEW -> READY_FOR_SIGNATURE
      -> SENT -> VIEWED -> SIGNATURE_IN_PROGRESS -> PARTIALLY_SIGNED
      -> FULLY_SIGNED -> FULLY_EXECUTED
      -> ACTIVE -> EXPIRING -> EXPIRED
      -> DECLINED / VOIDED / SUPERSEDED / TERMINATED
```

`assertAgreementEditable` is the one shared immutability rule: drafts through
`APPROVED_FOR_SENDING` remain editable; `SENT`, `VIEWED`, `FULLY_EXECUTED`,
`SUPERSEDED` and `TERMINATED` do not (this is the rule BUG-0011 found
duplicated and drifted — `ContractsService.update()` now imports it rather
than keeping its own copy).

**Passive expiry** (new in TASK-0032, BUG-3553): no scheduler infrastructure
exists anywhere in this repository (`@Cron`/`@Interval`/`SchedulerRegistry` —
zero matches), so an elapsed `SENT`/`VIEWED`/`PARTIALLY_SIGNED` signature
request previously stayed in that status forever unless someone happened to
open it from the admin side. `applyPassiveSignatureExpiry`, called from
`getSignatureRequest`, durably transitions the first read of an elapsed
request (and its still-open recipients) to `EXPIRED`, writing a
`SIGNATURE_REQUEST_EXPIRED` timeline and audit row — durable for every
subsequent reader, not a per-caller projection. The contracts list additionally
*displays* (without writing, to avoid fanning a list read into per-row
transactions) the same computed status via `displaySignatureStatus`.

## Entity context and ADR-0020 placeholder availability

ADR-0020 ("Agreement placeholders are offered and resolved by agreement
context") replaced a flat registry — every placeholder available regardless
of agreement type — with three layers, all served by
`services/api/src/modules/contracts/placeholder-context.ts` so the editor,
validation and generation cannot drift from each other:

1. **`contractAllowedSourceEntities(contractType)`** — the type-level ceiling
   from the table above (used by template authoring).
2. **`contractLinkedSourceEntities(contract)`** — which entities are
   *actually linked* on one instance: `partner` if `partnerId` is set,
   `lead` if `relatedLeadId` is set, `customer`+`commercial` if any of
   `customerAccountId`/`relatedLeadId`/`customerOnboardingId` is set,
   `tenant`+`commercial`+`serviceOrder`+`implementation`+`integration`+
   `hosting` if `tenantId` is set.
3. **`contractInstanceContextEntities`** — the intersection: what this
   specific agreement can actually resolve, which can never exceed its
   type's ceiling.

`unresolvableRequiredPlaceholders` turns a missing linked entity into a
specific, actionable message rather than a bare "X is required":

> "Customer Legal Name cannot be resolved because this agreement is not
> associated with a customer."

`renderContractPlaceholders` also refuses to ever print a literal
`undefined`, `null` or `[object Object]` — the guard sits at the
substitution site (a value that stringifies to one of those three literals
is treated as no value), not as a post-hoc scan of finished HTML, which would
have false-positived on ordinary legal prose ("this clause is null and
void").

## Template authoring refusal

`createTemplate`/`createTemplateVersion` call
`assertTemplatePlaceholdersInContext`, refusing to save a template that
references a placeholder outside its declared contract type's context —
naming each out-of-context token and its label. `listTemplates`/`getTemplate`
additionally return a read-only `contextIssues` field (the out-of-context
keys in the *published* version) so a template saved before ADR-0020 is
visible without being silently mutated; republishing it requires removing
those tokens.

The template editor writes HTML that `cleanContractHtml` sanitises on save —
`div` and any `data-signature-*` attribute on a non-`table` element are
stripped with no error raised, which is why the signature box the editor
inserts is a `table` (the one element `cleanContractHtml` allows to carry
`data-document-role`). See
[`docs/knowledge/modules/contracts-and-agreements.md`](../knowledge/modules/contracts-and-agreements.md#authoring-a-template-document)
for the full allowlist detail; unchanged by TASK-0032.

**System templates are versioned by the seed too (ADR-0023).** `seed:config`
runs on every production deploy and never rewrites an existing template
version: a changed seeded template is published as the next version, the way
an operator edit is, and a version an operator published is left in place
(`planSystemContractTemplateWrite` in `services/api/prisma/seed-config.ts`).

## Generation: preview vs frozen (WP-11)

**Before WP-11's fix, a draft preview printed the stored version's raw HTML**,
so every pre-send PDF/DOCX showed literal, unresolved tokens like
`{{platform.legalName}}` instead of real values (found live by TASK-0032
WP-09 QA, "agreement preview/draft generation never resolved placeholders",
CRITICAL). WP-11's fix (commit `a7d8c7c5` on `agent/pah-wp11-agreement-rendering`,
REG-610) makes `documentFields`, `generateDocument` (draft preview) and
`sendForSignature` all resolve through one shared function,
`renderContractVersionHtml`, so a draft preview and the frozen sent content
can no longer render differently for the same reason BUG-0011 already
demonstrates for duplicated rules. **The executed copy is unaffected by this
change** — it still renders only from the frozen `ContractVersion` plus
`SignatureEvidence` (`renderSignatureEvidenceTokens`), never from a live
re-resolution, which is what "signed content stays frozen" requires.

## Signing

- **Methods**: typed (with a style — `CLASSIC`/`SCRIPT`/`FORMAL`, see below),
  drawn, or uploaded. A recipient signs through the emailed public link; the
  final signature moves the agreement to `FULLY_EXECUTED` with `signedAt`.
- **Evidence is hash-chained and attributable** — chain, document hash,
  signer and IP; re-signing is idempotent. Unchanged by TASK-0032; see
  [`docs/knowledge/modules/contracts-and-agreements.md`](../knowledge/modules/contracts-and-agreements.md)
  for the chain design.
- **Typed-signature style now actually reaches the document** (BUG-3554 — the
  style selector was previously cosmetic, never persisted or rendered).
  `CompleteSignatureDto.typedStyle` is validated against
  `TYPED_SIGNATURE_STYLES` and persisted to `SignatureEvidence.typedStyle`.
  `generateDocument`'s evidence-driven substitution adds
  `data-signature-style="<STYLE>"`; `createPdf` maps each style to the
  closest standard PDFKit font (`CLASSIC` → Helvetica, `SCRIPT` →
  Times-Italic — PDFKit ships no script face — `FORMAL` → Times-Roman);
  `createDocx` embeds a real font (`Times New Roman` for `SCRIPT`/`FORMAL`).
  Both survive regeneration, since `generateDocument` always reads
  `SignatureEvidence` fresh rather than the frozen version's own
  `signature.*` tokens.
- **A drawn or uploaded signature image was already correctly embedded** in
  both PDF and DOCX output before TASK-0032 — confirmed by reading the code
  and by a new byte-level test inspecting the actual PDF `/Subtype /Image`
  XObject, not re-implemented.

### Signature-date placeholders (WP-11)

**Before WP-11's fix**, the send-time placeholder gate exempted only the
`SIGNATURE`/`INITIALS` data types, so a `signature.*.date` placeholder
(data type `DATE_TIME`) blocked sending until a value was supplied — and the
workaround that unblocked it froze a fabricated date into the eventually
executed document (found live by TASK-0032 WP-09 QA, "signature-date
placeholders blocked sending; the workaround froze a fabricated date into
the signed document", CRITICAL). WP-11's fix (commit `a7d8c7c5`, REG-611)
exempts the **whole `signature.*` namespace** from the send gate, strips it
from the signing snapshot, refuses it on document-field updates
(`CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`), and fills it at render time from
the matching signer's real `signedAt` — every field of one signature slot
resolves to the same signer, and a named slot with no signer yet reads
"Not signed" rather than a fabricated or blank date.

## Signed-document immutability

Unchanged by TASK-0032, and everything above assumes it: an executed
agreement is immutable — the conversion gate, the evidence chain and the
commercial record all depend on this. See
[`docs/knowledge/modules/contracts-and-agreements.md`](../knowledge/modules/contracts-and-agreements.md)
(BUG-0011) for the history of how this rule was once duplicated and drifted.

## Source guards and duplicate guard (BUG-3553)

`services/api/src/modules/contracts/agreement-source-guards.ts` — wired into
`ContractsService.create()`/`update()` (when a link field is present in the
patch):

- **`UNUSABLE_PARTNER_STATUSES`**: `TERMINATED`, `REJECTED`, `SUSPENDED`,
  `INACTIVE`. Every in-pipeline pre-`ACTIVE` status is deliberately left
  usable — those states are the process that produces the agreement.
- **`UNUSABLE_LEAD_STATUSES`**: `ARCHIVED`, `CLOSED_LOST`, `UNQUALIFIED`,
  `CONVERTED`. The first three mirror this repository's own
  `leadViewWhere`'s "lost-inactive" grouping rather than a second
  independent definition; `CONVERTED` is added because a converted lead
  already has a `CustomerAccount` — a new agreement belongs against the
  customer.
- **`UNUSABLE_CUSTOMER_STATUSES`**: `ARCHIVED`, `CHURNED`. `SUSPENDED` is
  deliberately excluded — reversible, and a tenant admin may need a
  reinstatement addendum while suspended.
- **`assertLeadAttributedToPartner`** — when both `partnerId` and
  `relatedLeadId` are set, the lead's own `partnerId` must match (or be
  unset). A direct lead may be attached to any partner's agreement.
- **`findDuplicateAgreement`** — refuses a second non-terminal agreement of
  the same `contractType` sharing any of the same links (`partnerId`,
  `customerAccountId`, `relatedLeadId`, `customerOnboardingId`, `tenantId`),
  `409 Conflict` naming the conflicting agreement's number. Exempt for
  `AMENDMENT`/`RENEWAL` (they exist to follow an executed agreement) and for
  `copy()` (`skipDuplicateGuard: true`, an explicit, deliberate duplication).

`update()` re-validates the guard only when a link field is present in the
PATCH, against the *resulting* value (new where given, existing otherwise) —
an unrelated edit on a long-running agreement does not start failing because
its partner was terminated afterward, but touching any one link re-validates
the whole resulting link set (including one whose partner has since become
unusable — a deliberate, conservative default, not exempted for
amend/renew).

**Not yet checked**: partner+customer cross-consistency, and the
partner/customer and lead/customer legs of a three-way partner+lead+customer
combination — only lead↔partner attribution was named by the owner brief.

## Audit (BUG-3231)

`ContractsService` gained an `AuditService` dependency. The `timeline`/
`timelineTx` helpers — the one path most `ContractTimeline` writes already
went through — now also call `auditContract` (`tenantId: 'platform'`,
`entityType: 'Contract'`, the same event string the timeline row uses:
`CONTRACT_CREATED`, `CONTRACT_VOIDED`, `PARTY_ADDED`,
`SIGNATURE_REQUEST_SENT`, etc.). Nine call sites that wrote a
`ContractTimeline` row directly (upload, approval paths, cancel/resend,
sign/decline/changes-requested, version invalidation) each gained an
adjacent `auditContract` call. Template-level actions
(`createTemplate`/`createTemplateVersion`/`cloneTemplate`/`updateTemplateState`)
audit against `entityType: 'ContractTemplate'` directly, since there is no
`contractId` to hang a timeline row off. `generateDocument` is audited too
(`DOCUMENT_GENERATED`/`SIGNED_DOCUMENT_GENERATED`).

**Public signing has no platform user** — `completeSignature`/
`declineSignature`/`requestSignatureChanges` audit with `actorUserId: null`
and the recipient's name/email/role in the snapshot; `AuditService.log`'s
platform branch already supports a null actor as a pre-existing case.

`modules/audit/lifecycle-audit-coverage.spec.ts` enumerates every
`ContractsService` write method and classifies it `audited` or
`exempt`-with-reason, so a future unaudited write method fails this spec
rather than shipping silently uncovered.

## Agreement Scenario Matrix (30 scenarios, D3 §8)

Status column is TASK-0032 WP-05's implementation verdict; the **QA** column
adds TASK-0032 WP-09's live verdict where the scenario was exercised
end-to-end (`docs/tasks/TASK-0032-streams/QA-summary.md`).

| # | Scenario | WP-05 status | QA (WP-09) |
|---|---|---|---|
| 1 | Partner, no customer | Unchanged (already correct) | Pass |
| 2 | Partner, no lead | Unchanged (already correct) | Pass |
| 3 | Lead, no customer | Placeholder resolution correctly scoped (BUG-3552) | Pass |
| 4 | Partner + lead | **Fixed** — attribution consistency enforced (BUG-3553) | Pass |
| 5 | Partner + customer | Unchanged — no cross-consistency check; residual | Not separately exercised |
| 6 | Partner + lead + customer | Partially improved — lead/partner pair checked; partner/customer and lead/customer legs unchecked | Not separately exercised |
| 7 | Before lead conversion | Unchanged (already correct); `customer.*` context explicitly scoped to the lead relationship | Pass |
| 8 | After lead conversion | Unchanged (already correct) | Pass |
| 9 | Partner updated after draft created | Unchanged (already correct) | Not separately exercised |
| 10 | Template edited after contract created | Unchanged (already correct) | Not separately exercised |
| 11 | Regenerate before signing | Unchanged, now audited (BUG-3231) | **Defect found and fixed (WP-11, preview placeholders) — see above** |
| 12 | Already signed (attempt further action) | Unchanged (already correct) | Pass — "Signed: no edit/send" |
| 13 | One signatory | Unchanged (already correct) | Pass |
| 14 | Multiple signatories | Unchanged (already correct) | Pass — two-signer sequential signing |
| 15 | Decline | Unchanged, now audited with null actor (BUG-3231) | Pass — decline with reason |
| 16 | Expiry | **Fixed** — passive transition on read (BUG-3553) | Not separately exercised |
| 17 | Cancel | Unchanged, now audited | Pass |
| 18 | Required placeholder missing | **Improved** — entity-specific message (BUG-3552) | Pass — "each with a specific message" |
| 19 | Optional placeholder missing | Unchanged (already correct) | Not separately exercised |
| 20 | Partner inactive | **Fixed** (BUG-3553) | Pass — suspended partner refused |
| 21 | Lead archived | **Fixed** (BUG-3553) | Pass — archived lead refused |
| 22 | Customer archived | **Fixed** (BUG-3553) | Pass — archived customer refused |
| 23 | Unauthorized access | Unchanged — binary platform-permission check, no row-level scope; pre-existing, not a WP-05 record | Not separately exercised |
| 24 | Cross-tenant | Unchanged — `openDocument`'s residual `ContractDocument` tenant-scoping risk unfixed | Not separately exercised |
| 25 | Super admin | Unchanged (already correct) | Not separately exercised |
| 26 | Tenant admin | Unchanged — N/A by design | Not separately exercised |
| 27 | Duplicate creation | **Fixed** (BUG-3553) | Pass — duplicate agreement refused |
| 28 | Multiple applicable contract types | Formalised by the type table (BUG-3552) | Pass — placeholder groups by type |
| 29 | Versioning | Unchanged (already correct) | Not separately exercised |
| 30 | Signed doc reopened after source data change | Unchanged (already correct); typed style confirmed to persist | Pass — immutability after signing |

**Additional defects found by WP-09 beyond the 30-scenario matrix**, all
disposed:

| Defect | Severity | Disposition |
|---|---|---|
| Agreement preview/draft generation never resolved placeholders | CRITICAL | WP-11 (see Generation section above) |
| Signature-date placeholders blocked sending; the workaround froze a fabricated date | CRITICAL | WP-11 (see Signing section above) |
| Seeded partner agreement template has no signature block | MEDIUM | Routed to WP-11; not described further here — WP-11's brief was not explicit about this item at the time of writing |
| Counterparty placeholders grouped under "Customer" | LOW | Routed to WP-11; not described further here — WP-11's brief was not explicit about this item at the time of writing |
| Error codes introduced by TASK-0032 were uncatalogued (clients saw `SYSTEM_UNEXPECTED_ERROR`) | MEDIUM | Fixed `e52a345c`, `bbb61ab5` |

## Related

[[contracts-and-agreements]] (pre-existing design, BUG-0011, the hash-chain) ·
[[partners]] (the governing-agreement activation gate) · See also
[`partners.md`](partners.md), [ADR-0020](../decisions/ADR-0020-agreement-placeholders-are-offered-by-agreement-context.md).
