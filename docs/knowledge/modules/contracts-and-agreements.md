# Contracts and Agreements

> Generated from repository evidence at `ad8f77f`. Verified end to end by the
> 2026-08-15 commercial onboarding E2E, including real signing.

## Purpose

Agreements are the legal gate of the commercial funnel. A lead cannot become a
customer, and a partner cannot be activated, without an executed governing
agreement.

## Main API / services

`services/api/src/modules/contracts/`. `assertAgreementEditable` is the shared
immutability rule; `assertGoverningAgreementExecuted` is the conversion gate.

## Important business rules

Verified by scenario:

- **Signing is real and evidenced.** A recipient signs through the emailed
  public link; the final signature moves the agreement to `FULLY_EXECUTED` with
  `signedAt`. Signature evidence is **hash-chained** and attributable — chain,
  document hash, signer and IP. Re-signing is idempotent.
- **An executed agreement is immutable.** Everything downstream assumes it —
  the conversion gate, the evidence chain, the commercial record.
- Drafts through `APPROVED_FOR_SENDING` remain editable. `SENT`, `VIEWED`,
  `FULLY_EXECUTED`, `SUPERSEDED` and `TERMINATED` do not.

## Known bugs

[[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate]] —
VERIFIED, HIGH.

`ContractsService.update()` carried its **own inline copy** of the blocked-status
list and it had drifted from the shared assertion. A `FULLY_EXECUTED` agreement
was freely mutable, including `relatedLeadId` — and because the conversion gate
matches on that column, one edit moved the gate and converted a lead that had
never had an agreement.

The lesson is not about contracts. **One rule, two implementations, and the
copy is the one that drifts.** Pattern: [[divergent-duplicate-guard]].

## Authoring a template document

The template editor writes HTML that `cleanContractHtml` sanitises on save.
The allowlist is the binding constraint and it is easy to discover the expensive
way:

- `div` is **not** allowed, and neither is any `data-signature-*` attribute. A
  signature box built as a custom element or a `div` is deleted on first save,
  with no error raised anywhere — the author places it, saves, and finds it
  gone.
- `table`/`thead`/`tbody`/`tr`/`th`/`td` are allowed, and `table` may carry
  `data-document-role`. That is the hook every document-role style keys off, and
  it is why the signature box the editor inserts is a table.
- `td` styles are constrained to the `allowedStyles` list, which has no `border`
  or `width`. A signature block's rules therefore come from the editor and print
  stylesheets, not from inline style.

Anything that needs to survive a save should be asserted in
`contracts.domain.spec.ts` against `cleanContractHtml` itself, not against the
frontend that produced it — the API owns the allowlist and is the side that
decides.

**Signature placeholders resolve or print literally.** `signature.*` keys are
registered `required: false` with `fallbackBehavior: 'LEAVE_TOKEN'`, so a token
for a party the platform never fills is not an error — it prints
`{{signature.witness.name}}` into an executed agreement. Only `platform` and
`counterparty` are actually written, by `signaturePlaceholderValues`. A party
outside that set must be given ruled blank lines, never a token.

## Regressions

REG-009 — `contracts.agreement-immutability.spec.ts`; 19 assertions, **7 fail**
against the unfixed code.

## Residual risk

The fix tightens `PATCH /contracts/:id` for five statuses. If any workflow
legitimately reassigns an internal owner on an executed contract, it now needs a
governed action. No such caller exists in the frontends.

## Related

[[leads]] · [[customers]] · [[partners]] · [[partner-onboarding]] ·
[[commercial-onboarding-lifecycle]] · [[requirement-lead-conversion]]
