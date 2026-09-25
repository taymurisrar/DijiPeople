# WP-11 — Agreement defects found by live QA (TASK-0032 / EXECPLAN-0051)

Stream report of [[TASK-0032]].

Worktree `D:/My Work/hrm-dijipeople/dp-pah-wp11`, branch
`agent/pah-wp11-agreement-qa-fixes`, cut from `bbb61ab5`. REG range
REG-610..REG-619 (used 610–614). Closes the WP-09 live-QA findings
"QA agreements DEFECT-1..4" and verifies item 5 (partner source).

## IMPLEMENTED

1. **DEFECT-1 (critical): one renderer for a contract version.**
   `renderContractVersionHtml(html, rows, 'display' | 'freeze')` in
   `contracts.service.ts` is now the only path used by `documentFields()`
   (both `previewHtml` and `resolvedHtml`), `generateDocument()` (draft path)
   and `sendForSignature()` (freeze). The draft PDF/DOCX now prints resolved
   values. The immutable (signed) path still renders only from the frozen
   version plus `SignatureEvidence`, through the extracted
   `renderSignatureEvidenceTokens`. It never reads current placeholder values.
   - How unresolved values show in a preview: an optional placeholder follows
     its fallback, which is EMPTY. A required placeholder keeps its visible
     `{{token}}`, because that is what the operator still has to fill, and the
     send gate refuses it. `renderContractPlaceholders` already guarantees
     that `undefined`, `null` and `[object Object]` are never printed.
2. **DEFECT-2 (critical): the whole `signature.*` namespace is filled at
   signing.**
   - The send gate now exempts placeholders by namespace (`isSignaturePlaceholderKey`)
     instead of by data type. `signature.*.date` is `DATE_TIME`, and that
     type-based exemption is what blocked sending.
   - `signature.*` values are left out of the signing snapshot and out of the
     frozen HTML. A stored value is never substituted into a signature token
     at send.
   - `PATCH /contracts/:id/document-fields` refuses any `signature.*` key with
     a 400 and the new catalogued code `CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`
     (pinned in `task-0032-error-codes.spec.ts`). Before, signature keys were
     silently dropped, except dates, which were accepted. `documentFields`
     marks every `signature.*` field `editable: false`.
   - The display path takes a stored `signature.*` value only when its source
     is `signature`, which means `completeSignature` wrote it. Hand-typed dates
     left over from the old workaround are ignored. Anything still pending
     shows "Pending" for a date and "Electronic signature pending" for a mark.
   - The signed render fills `signature.<slot>.date` with the signer's real
     `signedAt`, formatted by `formatPlaceholderValue` (for example
     "25 September 2026, 10:36 UTC").
   - Signers are matched to slots the same way the signature image and name
     already were:
     - `platform`: the party with partyType PLATFORM.
     - `counterparty`: the first signer who is not PLATFORM.
     - `party.primary`: the primary signer who is not PLATFORM, otherwise the
       first signer who is not PLATFORM.
     - Any other slot: round-robin across signers.
   - Every field of one slot now comes from the same signer, and the result is
     cached per slot. Before, `party.primary.name` and `party.primary.date`
     could come from two different people.
   - `…initials` now renders as initials, not as the whole signature block.
3. **DEFECT-3 (medium): signature block in seeded templates.** Seven of the
   nine system templates had no `signature.*` tokens:
   - `PARTNER_REFERRAL_STANDARD`
   - `PARTNER_COMPANY_STANDARD`
   - `PARTNER_INDIVIDUAL_STANDARD`
   - `CUSTOMER_ENTERPRISE_STANDARD`
   - `NDA_STANDARD`
   - `DATA_PROCESSING_STANDARD`
   - `REFERRAL_ADDENDUM_STANDARD`

   Each now ends with a platform + counterparty block with a mark and a date,
   built by `signatureBlock(counterpartyName)`. The counterparty is named with
   a placeholder its type allows: `partner.name`, `partner.legalName`,
   `customer.legalName` or `counterparty.name`. The list is exported as
   `PLATFORM_CONTRACT_TEMPLATES` so a spec can run the ADR-0020 validator over
   it.
4. **DEFECT-4 (low):** `counterparty.*` now has its own "Counterparty" group,
   ordered right after "Platform". A partner agreement template no longer
   shows a "Customer" group.
5. **Item 5, verified and fixed:** partner values were never filled
   automatically. `resolveSource` has no partner branch, and `create()` stored
   `partnerId` without any `partner.*` value.
   - New `partnerPlaceholderValues()` and a private `linkedPartnerValues()`.
   - `create()` merges these values underneath explicit `placeholderValues`,
     so explicit values still win.
   - `syncDerivedPlaceholderValues()` (run on every contract edit) refreshes
     them from the partner record, except keys whose current source is
     `manual`.
   - Only data the partner record actually holds is used. The Partner model
     has no address or registration-number column, so those two placeholders
     stay for the operator to fill.
   - Legal name: `legalName` if set, otherwise the display name for an
     INDIVIDUAL partner, otherwise `companyName`.
   - Commission: the contract's own rate, otherwise the partner default, but
     only when that default is above 0 (0 is the column default and means
     "not configured").

## CHANGED_BEHAVIOR

- Draft `generate/pdf|docx` output now has resolved values and pending
  signature markers. Before, it printed raw tokens.
- `documentFields.previewHtml` and `resolvedHtml` now show pending signature
  markers instead of raw `{{signature.*}}` tokens. A stale signature value that
  was typed in by hand is no longer shown.
- Sending now succeeds for templates with signature date lines, including the
  seeded `CUSTOMER_SERVICE_STANDARD`. The signing snapshot no longer contains
  `signature.*` keys.
- `PATCH document-fields` with a `signature.*` key returns 400
  `CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`. The admin UI only sends edited
  fields, and it disables signature fields, so it is not affected.
- Signed copies:
  - Dates now read as a formatted, real `signedAt`.
  - **A platform slot with no PLATFORM-party signer now reads "Not signed".**
    Before, it silently borrowed the counterparty's signature through the
    round-robin fallback. The default parties created by `create()` mark the
    platform party `isSignatory: false`, so a template with a platform
    signature line now shows "Not signed" there unless a platform signer is
    added.
  - Existing executed versions are frozen. Any that were signed with the old
    workaround still carry the fabricated date in their frozen HTML, and that
    content cannot be changed.
- `POST /contracts` with a `partnerId` stores `partner.*` values. Editing a
  contract refreshes them from the partner record.
- **Production seed impact:** `seedPlatformContractTemplates` has always
  upserted **version 1** of each system template, and refreshed its content on
  every seed; the comment in the source says so. That existing path carries
  this change. Nothing new was added to it.
  - On the next production deploy, version 1 of the seven templates listed
    above gains the signature block.
  - Operator edits are unaffected. The app never rewrites a template version
    in place: `createTemplateVersion` always creates version N+1, and the only
    `contractTemplateVersion.update*` in the service unpublishes versions.
  - An operator's published v2+ stays the published version, because `create`
    takes the latest published version.
  - Contracts copy their content at creation, so existing agreements are
    unaffected.
  - Follow-up, not done here and pre-existing: because version 1 is mutated in
    place, "v1" of a system template does not keep a stable content history.
    A byte-identical "publish a new version" upgrade would change seed
    semantics for every system template. It was left as a decision for the
    Architect.

## RISK_AREAS

- **The "Not signed" platform slot.** A signing flow that uses a platform
  signer recipient with no `partyId` is treated as a counterparty signer. That
  signer would fill the counterparty slot, and the platform line would read
  "Not signed". This was already true for the platform match before; only the
  fallback was removed.
- **Partner refresh on edit.** It overwrites `create`- and `derived`-sourced
  `partner.*` rows. A caller that set `partner.name` through
  `placeholderValues` at creation loses it to the partner record on the next
  edit. A value set through document fields (`manual`) survives.
- **Unlinking a partner.** If `partnerId` is cleared, the stale `partner.*`
  rows stay. They are not referenced unless the template uses them.
- **PDF text in tests.** The spec extracts PDF text by inflating PDFKit
  content streams and decoding TJ hex strings. The extraction is proven not to
  pass vacuously: the positive assertions fail without the fix.

## KNOWN_MISTAKES_AVOIDED

- BUG-0011 / "one rule, two implementations": the three renderers are now one
  function. The exemption is decided by namespace in one place
  (`isSignaturePlaceholderKey`).
- Immutability (REG-009): the signed path never consults current values. A
  spec renames the partner after signing and asserts the executed copy
  unchanged.
- Seed discipline: the change was checked against the existing semantics.
  The seed only refreshes version 1, and no operator-authored version is
  touched.
- No schema or permission files were edited. No UI helper text was added.

## TESTS_ADDED

| Spec | Proves | Fails without fix |
|---|---|---|
| `contracts.agreement-rendering.spec.ts` (12 tests) | Preview PDF (text extracted) and DOCX contain the partner and platform names, no `{{`, and "Pending"; a hand-typed signature date is not printed; documentFields uses the same renderer and marks signature fields not editable; the signed PDF comes from the frozen version plus evidence after a partner rename and shows the real signedAt ("25 September 2026, 10:36 UTC"), with no fabricated date; one signer per slot; "Not signed" for an unmatched slot; send succeeds with date tokens unresolved; the snapshot and frozen HTML exclude stored `signature.*`; a manual `signature.*` value gets a 400 with the code; counterparty group label and order; no Customer group for PARTNER_AGREEMENT | Yes. Against the pre-fix service (with only the new helper exports appended so the file compiles), 7 of the 10 DEFECT-1/2 tests fail. The 3 that pass are pure-function tests of the new helpers. The 2 DEFECT-4 tests fail with the old mapping. |
| `contracts.partner-source.spec.ts` (6 tests) | `partnerPlaceholderValues` covers what it emits, never inventing a legal name or 0%, and the contract commission wins; `create()` stores `partner.*` for a partnerId; explicit values win; an edit refreshes `partner.name` and keeps a manual override | Yes. With `linkedPartnerValues` neutralised, the 2 wiring tests fail. |
| `contract-templates.seed.spec.ts` (18 tests) | Every seeded template has platform and counterparty mark and date tokens, uses only registered keys, and `outOfContextPlaceholders` is empty for its type | Yes. With `signatureBlock` returning `''`, the 7 templates that lacked a block fail. |
| `common/errors/task-0032-error-codes.spec.ts` (+1) | `CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE` is catalogued with status 400 | Yes (new code) |

## TEST_HOOKS

- Admin: open a draft PARTNER_AGREEMENT from `PARTNER_INDIVIDUAL_STANDARD`
  and generate the PDF. Expect the partner name, the platform legal name, and
  "Pending" on the signature lines.
- Send `CUSTOMER_SERVICE_STANDARD` without entering any signature date. It
  should succeed. Sign it, then generate the signed copy: each line shows the
  signer's real date, with no "1 October 2026".
- `PATCH /api/contracts/:id/document-fields` with
  `{ "values": { "signature.counterparty.date": "2026-10-01" } }`. Expect 400
  `CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`.
- `GET /contracts/placeholder-definitions?contractType=PARTNER_AGREEMENT`.
  The groups should include Counterparty, and no Customer.
- `POST /contracts` `{ contractType: PARTNER_AGREEMENT, partnerId }` with no
  placeholder values. The document fields should show `partner.name` and the
  other resolved `partner.*` values filled. The seed changes reach a local DB
  after `npm run seed:config`.

## RECORD_CLOSURES

| Record | REG | Commit | Spec | Fails without fix |
|---|---|---|---|---|
| QA agreements DEFECT-1 | REG-610 | `a7d8c7c5` | `contracts.agreement-rendering.spec.ts` | yes |
| QA agreements DEFECT-2 | REG-611 | `a7d8c7c5` | `contracts.agreement-rendering.spec.ts`, `task-0032-error-codes.spec.ts` | yes |
| QA agreements DEFECT-4 | REG-612 | `cd8aa6f1` | `contracts.agreement-rendering.spec.ts` (DEFECT-4 block) | yes |
| WP-11 item 5 (partner source) | REG-613 | `6a74cbd0` | `contracts.partner-source.spec.ts` | yes (wiring tests) |
| QA agreements DEFECT-3 | REG-614 | `16218cc9` (checkpoint of the seed edit) + `301eda2c` | `contract-templates.seed.spec.ts` | yes |

DEFECT-1 and DEFECT-2 share one commit because both are fixed by the same
shared renderer.

## VALIDATION

- `npm --workspace api run check-types`: PASS
- `npx eslint --fix` on every changed api file: 0 errors (warnings only)
  - `contracts.service.ts` has 15 warnings, the same count as its baseline.
  - The new specs are clean.
  - `seed-config.ts` has 2 warnings, both pre-existing.
- `jest src/modules/contracts src/common/errors src/modules/audit`: PASS,
  including `lifecycle-audit-coverage` (no new write methods).
- Full suite, `NODE_OPTIONS=--max-old-space-size=6144 npx jest -w 2` from
  `services/api`: **382/382 suites, 7346/7346 tests PASS**.

## UNRESOLVED

- Production follow-up: agreements already executed through the old date
  workaround keep the fabricated date in their frozen version. This is by
  design (immutability), and those records should be reviewed or amended.
- Architect decision: whether system-template upgrades should publish a new
  version instead of refreshing v1 in place. This is pre-existing seed
  behaviour and is not changed here.
- Platform signer: the default parties make the platform a non-signatory, so
  seeded platform signature lines read "Not signed" in executed copies unless
  a platform signer is added. The product needs to decide whether the
  platform should countersign by default.
- No SCHEMA_NEEDED or PERMISSION_NEEDED.
