---
ID: BUG-3554
aliases: [BUG-3554]
Title: The typed-signature style selector is cosmetic: the chosen style never reaches the signed document
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [apps/landing, services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-572
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3554 — The typed-signature style selector is cosmetic: the chosen style never reaches the signed document

## Summary

The public signing page's typed-signature step offers a "Classic / Script /
Formal" font-style selector, but only the typed name text is ever posted to
the API — the chosen style is discarded client-side. The signed document
always renders the typed name as plain bold text regardless of which style
was selected.

## Expected Behavior

If a signer is offered a choice of signature style, that choice should be
reflected in how their name is rendered on the final signed document — or the
selector should not be offered if the product has decided typed signatures
are always rendered identically.

## Actual Behavior

`signing-experience.tsx`'s typed-signature step keeps a `typedStyle` client
state for the selector, but `POST /public/signatures/:token/sign` is only ever
called with `typedName` (plus `consentAccepted`/`consentText`/timezone) —
`typedStyle` is never included in the request body. `generateDocument`'s
signature rendering always injects the typed name as plain bold text
(`<strong>`), with no font-style variation.

## Reproduction

1. Open a signature request link (`apps/landing/app/sign/[token]/`).
2. Choose "Typed" signature, enter a name, and select "Script" (or "Formal")
   from the style selector.
3. Complete signing.
4. Open the generated/signed document and observe the name is rendered as
   plain bold text — identical to what "Classic" (or any other style) would
   have produced.

## Evidence

- `apps/landing/app/sign/[token]/signing-experience.tsx` — the typed-signature
  step maintains `typedStyle` state for the "Classic / Script / Formal"
  `<select>`, but the POST to `/public/signatures/:token/sign` sends only
  `typedName` (data-flow confirmed: no `typedStyle` field in the payload
  construction for the sign request).
- `services/api/src/modules/contracts/contracts.service.ts:~3760-3800`
  (`generateDocument`'s signature-token substitution) — typed signatures are
  rendered as an injected `<strong>` text node with no style/font parameter
  read from `SignatureEvidence` (which itself has no stored style field for
  typed signatures).
- `SignatureEvidence` model (`schema.prisma`) — stores `method`, `typedName`,
  storage keys for drawn/uploaded images, hashes, consent and audit fields;
  no `style`/`font` field for a typed signature.

## Root Cause

The style selector was built into the signing UI, but the corresponding
server-side support (accepting and persisting a style, and rendering the
typed name with that style in the generated document) was never implemented —
the UI offers a choice with no effect.

## Impact

Cosmetic only — the signature itself, consent capture, hash-chain evidence
and legal validity of the signature are all unaffected; this is purely a
"the control does nothing" UX defect. A signer who deliberately picks "Script"
expecting their signed document to reflect that will be surprised it does
not. Reachable in production today (the signing page is a live public
surface).

## Affected Areas

- `apps/landing/app/sign/[token]/signing-experience.tsx` (typed-signature
  style selector)
- `services/api/src/modules/contracts/contracts.service.ts` (`completeSignature`,
  `generateDocument`'s signature-token rendering)

## Proposed Resolution

Either (a) remove the style selector from the signing UI if typed signatures
are always rendered identically by design, or (b) thread the selected style
through to the API (new field on the sign request and on `SignatureEvidence`)
and have `generateDocument` render the typed name using that style (e.g. a
different font-family in the generated PDF/DOCX). This is a product decision
on which direction to take; either is a small, scoped change with no ExecPlan
needed (option (b) would need a `SignatureEvidence` schema addition, which per
`prisma/AGENTS.md` is an additive, backward-compatible column — expand phase
only, no backfill required since it is optional and only used going forward).

## Acceptance Criteria

- Either: the style selector is removed and typed signatures are documented
  as always rendered one way; or: selecting a style visibly changes the
  rendering of the typed name in the generated/signed document.

## Regression Coverage

REG-572 (the typed-signature style now reaches the API —
`services/api/src/modules/contracts/contracts.agreement-guards.spec.ts`
asserts `tx.signatureEvidence.create` receives `typedStyle: 'SCRIPT'`) and
REG-573 (a signed document renders each style distinctly —
`contracts.domain.spec.ts`, PDF font selection and DOCX run persistence).
Both proven to fail against the pre-fix code.

## Dependencies

Resolved — WP-05 implemented option (b): the style is threaded through to the
API and the signed document.

## Related Items

- TASK-0032 — the program that found this.

## Resolution

Fixed on `agent/pah-wp05-agreements` (TASK-0032 WP-05, merged as `2204cd75`):
`CompleteSignatureDto` now accepts `typedStyle`, validated against
`TYPED_SIGNATURE_STYLES` (`CLASSIC`/`SCRIPT`/`FORMAL`) and persisted to
`SignatureEvidence.typedStyle`; `generateDocument`'s PDF renderer selects a
distinct font per style (e.g. `Times-Italic` for `SCRIPT` vs `Helvetica` for
`CLASSIC`) and the DOCX renderer writes an actual `Times New Roman` run,
surviving regeneration since the style is persisted, not recomputed.

## QA Retest

Verified by TASK-0032 WP-09 live QA ("Agreements … Two-signer sequential
signing (typed SCRIPT + drawn) …": Pass — see
`docs/tasks/TASK-0032-streams/QA-summary.md`) and the passing
`contracts.agreement-guards.spec.ts` / `contracts.domain.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D3 §5.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032) — direction (remove vs.
  implement) left as an open question for the implementing specialist to
  raise.
- 2026-09-25 — fixed on `agent/pah-wp05-agreements` (WP-05, merged
  `2204cd75`, decision: implement the style rather than remove it); verified
  by WP-09 live QA; Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]], [[contracts-and-agreements]]
- Regression — REG-572 (see the regression register)

<!-- GRAPH:END -->
