---
ID: ADR-0021
aliases: [ADR-0021]
Title: Owner decisions for TASK-0032 — countersign line, platform MFA, legal publishing
Status: ACCEPTED
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
---
# ADR-0021 — Owner decisions for TASK-0032: countersign line, platform MFA, legal publishing

## Status

Accepted — 2026-09-25, answered by the product owner during TASK-0032 when asked
directly. Each is `USER_CONFIRMED`. Related: [[TASK-0032]].

## Context

TASK-0032 raised three questions that the code could not answer, because each
is a product or legal choice rather than a technical one:

1. After QA agreements DEFECT-3 every system agreement template gained a
   signature block for DijiPeople and for the counterparty. DijiPeople is not a
   signatory on new agreements by default, so an executed partner or customer
   agreement printed "Not signed" beside DijiPeople's name.
2. ADR-0019 built TOTP MFA as available and optional for platform users.
3. ADR-0018's route mapping kept legal-document publishing Super Admin only,
   although the Legal Reviewer role holds `legal.manage`.

## Decision

1. **The DijiPeople signature line appears only when DijiPeople signs.** A
   paragraph marked `data-document-role="platform-signature"` (system
   templates) or carrying a `{{signature.platform.*}}` token (authored templates)
   is removed when no PLATFORM party signs: from previews by the agreement's
   parties, from the frozen signing version by the recipients being sent, and
   from executed copies by the signature evidence
   (`omitPlatformSignatureLines`, `platformSignsContract` in
   `services/api/src/modules/contracts/contracts.service.ts`).
2. **Platform MFA stays optional.** Operators enrol themselves; nothing forces
   enrolment at sign-in. Tenants can still require MFA for their own users.
3. **Legal documents stay Super Admin only.** Legal Reviewers review and approve
   agreements but do not publish Terms or Privacy documents.

## Consequences

- Partner and customer agreements without a DijiPeople signer read cleanly; one
  with a DijiPeople signer keeps its line, filled from that signer's evidence.
- Making platform MFA mandatory later is a policy change, not new
  infrastructure: the sign-in challenge already supports a setup-required step.
- `LEGAL_REVIEWER`'s `legal.manage` permission remains unused by the legal
  routes; granting it publishing later is one `@RequirePlatformPermission` line.
