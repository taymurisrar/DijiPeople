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
