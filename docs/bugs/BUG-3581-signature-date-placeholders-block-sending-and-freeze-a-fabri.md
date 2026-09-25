---
ID: BUG-3581
aliases: [BUG-3581]
Title: Signature-date placeholders block sending and freeze a fabricated date into signed agreements
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-611
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3581 — Signature-date placeholders block sending and freeze a fabricated date into signed agreements

## Summary

A template with a dated signature line (`{{signature.platform.date}}` /
`{{signature.counterparty.date}}` — including the seeded
`CUSTOMER_SERVICE_STANDARD` template) could not be sent for signature at all,
because the "every token resolved" pre-send check did not recognise
`signature.*.date` as a signature field. The only workaround — typing a date
into document fields — then froze that fabricated date into the executed,
signed copy beside the real signing timestamp.

## Expected Behavior

A template containing signature-date placeholders should send normally; the
`signature.*` namespace should be exempt from the "every token resolved"
gate entirely (it can only ever be resolved by the act of signing), and the
executed document should print the real `SignatureEvidence.signedAt` for that
signer, never a manually typed value.

## Actual Behavior

`sendForSignature`'s pre-send validation exempted only tokens whose data type
was `SIGNATURE`/`INITIALS` — but `signature.*.date` is typed `DATE_TIME`, so
it was treated as an ordinary unresolved required field and blocked sending.
The only way to get past the gate was to type a literal date into document
fields via `saveDocumentFields`; that value was then frozen into the signing
version's snapshot and printed on the executed PDF next to the genuine
signing timestamp — e.g. "— 1 October 2026, 00:00 UTC" beside the real
signing time.

## Reproduction

1. Create an agreement from a template whose body includes
   `{{signature.platform.date}}` or `{{signature.counterparty.date}}` (e.g.
   the seeded `CUSTOMER_SERVICE_STANDARD`).
2. Attempt to send it for signature without filling that field.
3. Observe the send is refused as if the field were an ordinary unresolved
   required placeholder.
4. Type a date into the corresponding document field and send.
5. Complete signing and inspect the executed PDF.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 live QA,
"QA agreements DEFECT-2"; evidence `D15-b3-signed-copy.pdf`): the executed PDF
printed the manually typed date beside the real signing timestamp.

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts` — the pre-send
  "every token resolved" check exempted data types `SIGNATURE`/`INITIALS`
  only, not `DATE_TIME` fields under the `signature.*` namespace.
- `saveDocumentFields` accepted a manual value for `signature.*.date` with no
  guard, and that value was frozen into the signing snapshot.
- QA evidence: `D15-b3-signed-copy.pdf` (TASK-0032 WP-09).

## Root Cause

The pre-send gate's exemption was keyed on the placeholder's *data type*
(`SIGNATURE`/`INITIALS`) instead of its *namespace* (`signature.*`) — the
`wrong-question-in-a-guard` bug class. A dated signature line is legitimately
a `DATE_TIME` value, but it belongs to the same never-manually-set namespace
as the signer's name, and the guard asked the wrong question to notice that.

## Impact

Any template with a dated signature line could not be sent at all until an
operator discovered the workaround, and that workaround corrupted the
executed legal document with a fabricated date — a CRITICAL defect because it
put a wrong date into a signed, immutable agreement.

## Affected Areas

- `services/api/src/modules/contracts/contracts.service.ts`
  (`sendForSignature`, `saveDocumentFields`, `generateDocument`)

## Proposed Resolution

Exempt the entire `signature.*` namespace from the pre-send resolution gate;
strip it from the signing snapshot; refuse `saveDocumentFields` for any
`signature.*` field with a clear 400; ignore it at display time unless written
by the act of signing; and fill it at render time from the matching signer's
own `SignatureEvidence.signedAt`. No ExecPlan needed — a validation and
rendering fix, no schema change.

## Acceptance Criteria

- Sending a template with unresolved `signature.*.date` tokens succeeds.
- The signing version never freezes a stored `signature.*` value.
- `PATCH /contracts/:id/document-fields` refuses a `signature.*` field with
  `400 CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE`.
- The signed document renders each signature date from that signer's real
  `SignatureEvidence.signedAt`, never a manually entered value.
- A named signature slot with no signer reads "Not signed", never another
  party's name or date.

## Regression Coverage

REG-611
(`services/api/src/modules/contracts/contracts.agreement-rendering.spec.ts` —
"sends a template whose signature date lines are unresolved", "never freezes a
stored signature.* value into the signing version", "refuses a manual value
for a signature.* field with a clear 400", "fills every field of one slot from
the same signer", "a named slot with no signer reads 'Not signed', never
another party"; `common/errors/task-0032-error-codes.spec.ts` pins the new
`CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE` code), proven to fail against the
pre-fix service.

## Dependencies

None.

## Related Items

- [[BUG-3580]] — the general placeholder-rendering gap fixed in the same
  commit.
- [[BUG-3585]] — the new error code this fix introduced needed cataloguing.
- Modules — [[contracts-and-agreements]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commit `a7d8c7c5` (`fix(api): render agreement previews and signature
dates through one path`): the `signature.*` namespace is now exempt from the
resolution gate, stripped from the signing snapshot, refused by
`saveDocumentFields`, and filled at render time from the matching signer's
`SignatureEvidence.signedAt`.

## QA Retest

Verified by TASK-0032 WP-09 live QA re-run against the throwaway stack after
the fix — see `docs/tasks/TASK-0032-streams/QA-summary.md` ("Agreements … Two-
signer sequential signing …": Pass) and the passing
`contracts.agreement-rendering.spec.ts`.

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA ("QA agreements DEFECT-2").
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `a7d8c7c5`
  and verified by WP-09/WP-11 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-611 (see the regression register)

<!-- GRAPH:END -->
