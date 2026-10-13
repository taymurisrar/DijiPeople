---
ID: BUG-4191
aliases: [BUG-4191]
Title: Executed agreement renders signature blocks only for template slots; extra required signers missing
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-10-13
DetectedInSha: 202c1370
AffectedModules: [contracts]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-683
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/contract-signing-multiparty
CreatedAt: 2026-10-13
UpdatedAt: 2026-10-13
ResolvedAt: 2026-10-13
---

# BUG-4191 — Executed agreement renders signature blocks only for template slots; extra required signers missing

## Summary

An agreement template names a fixed set of signature slots — normally
`signature.platform.*` and `signature.counterparty.*`. When an agreement had
more required signers than slots (a customer signing through two people), the
extra signer appeared in the electronic signature appendix but had no signature
block in the agreement itself. The signed PDF also printed every paragraph
flattened to one line, so signatory details ran together and bold labels were
lost.

## Expected Behavior

Every required signer has exactly one correctly labelled signature block in
the agreement's signature section — name, party, signature mark, date and a
short evidence line — in the preview, on the signing page and in the executed
copy. The full evidence stays in a separate appendix. The agreement version on
the cover and in the appendix agree.

## Actual Behavior

`CON-20261012-E7421CC1` (FULLY_EXECUTED, three required signers: DijiPeople
PROVIDER, DijiPeople Demo Company CUSTOMER primary, Anou CUSTOMER secondary)
printed two signature blocks and three appendix entries. The header said
"Agreement Version: 1", the audit certificate "Version: 2".

## Reproduction

1. Create a customer agreement from the Master SaaS template.
2. Add a second CUSTOMER party, `isSignatory` and `signatureRequired`.
3. Send for signature to all three, sign each (any method).
4. Open the signed copy: two signature blocks, three appendix signers.

## Evidence

- Production, read-only: contract `09a7718c-…`, version 2 `SIGNED`,
  request `SIG-20261013-0E3BB48A` `COMPLETED`, three `SignatureEvidence` rows
  (DRAWN, UPLOADED, TYPED "Anoush").
- Stored copy `CON-20261012-E7421CC1-v2.pdf`, page 12 (two blocks) vs page 30
  (three signers); page 1 "Version: 1" vs page 30 "Version: 2".
- Frozen `placeholderSnapshot['contract.version']` = `1`;
  `ContractVersion.version` = `2`.

## Root Cause

1. `renderSignatureEvidenceTokens` filled only the slots the template names
   and had nowhere to put a signer no slot resolves to.
2. `signaturePlaceholderValues` recorded every counterparty signer under
   `signature.counterparty.*`, so in previews the last co-signer's mark
   replaced the primary customer's.
3. The `counterparty` slot took whichever counterparty signed first, so in a
   parallel request a co-signer could fill the primary customer's block.
4. `extractAgreementDocumentStructure` flattened each paragraph to one string,
   dropping `<br>` and `<strong>`; `createPdf` justified it.
5. The appendix printed `ContractVersion.version` (the record counter the
   signing freeze advances) instead of the issued `contract.version`.

## Impact

Any agreement with more signers than template slots. Legally, an executed
document whose signature section omits a required signatory. Reachable in
production; one executed agreement known.

## Affected Areas

`services/api/src/modules/contracts` — preview (`documentFields`),
`generateDocument` (draft, executed, signed copy), public signing session,
`completeSignature`.

## Proposed Resolution

Compute slot assignment in one place and generate a block per uncovered
signer at render time, never rewriting the frozen version.

## Acceptance Criteria

- 1, 2, 3 and 4+ signers each render exactly that many signatures, all before
  the schedules.
- Mixed DRAWN/UPLOADED/TYPED render as image, image, styled name.
- A non-required contact gets no block; no signer is duplicated.
- Freeze mode adds nothing; the frozen hash is unchanged.
- Cover and appendix print the same agreement version.

## Regression Coverage

`services/api/src/modules/contracts/signature-blocks.spec.ts` — REG-683.

## Dependencies

None.

## Related Items

- [[BUG-4192]] — the dialog used to send this request.
- [[BUG-3554]] — typed signature style in PDF/DOCX.

## Resolution

Branch `agent/contract-signing-multiparty`: new
`services/api/src/modules/contracts/signature-blocks.ts`; renderer, preview,
signing session and `completeSignature` use it; PDF/DOCX keep line breaks and
bold runs, gain a cover page, running header/footer and page numbers, and a
tabular evidence appendix. The executed `SIGNED_COPY` of
`CON-20261012-E7421CC1` is untouched; a regenerated copy (a new
`GENERATED_PDF`) shows all three blocks.

## QA Retest

Non-destructive local reconstruction of `CON-20261012-E7421CC1` from its
frozen version and evidence: three blocks on the signature page, appendix
"Agreement version 1 · Immutable signing snapshot 2".

## History

- 2026-10-13 — created from qa run at `202c1370`.
- 2026-10-13 — root cause established; fixed on `agent/contract-signing-multiparty`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0230]]
- Modules — [[contracts-and-agreements]]
- Regression — REG-683 (see the regression register)

<!-- GRAPH:END -->
