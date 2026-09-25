---
ID: BUG-3580
aliases: [BUG-3580]
Title: Agreement preview documents print unresolved placeholders
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
RegressionId: REG-610
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3580 — Agreement preview documents print unresolved placeholders

## Summary

Generating a preview PDF or DOCX for a draft agreement printed raw
`{{namespace.field}}` tokens instead of the resolved values — the single most
visible failure an agreement can have, since it is the first artifact anyone
signing or reviewing a contract sees.

## Expected Behavior

A generated preview document should print the actual resolved values for
every placeholder the agreement's context can resolve (`platform.legalName`,
`partner.name`, etc.), with a stated, deliberate fallback only for a
placeholder genuinely unresolvable in the agreement's current state.

## Actual Behavior

`ContractsService.generateDocument`'s non-immutable (draft/preview) path used
`version.contentHtml` as stored and replaced only `{{signature.*}}` tokens —
every other placeholder reached the rendered PDF/DOCX untouched, printing the
literal `{{platform.legalName}}`, `{{partner.name}}`, etc. `documentFields()`
and `sendForSignature()` each called `renderContractPlaceholders`
independently, so three code paths rendered the same version three different
ways, and the preview path was the one nobody had wired.

## Reproduction

1. Create a draft `PARTNER_AGREEMENT` or `CUSTOMER_AGREEMENT` from a template
   whose body includes ordinary (non-signature) placeholders.
2. Call `POST /contracts/:id/generate/pdf` (or `/generate/docx`).
3. Extract the PDF/DOCX text.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 live QA,
"QA agreements DEFECT-1"; evidence `B1-partner-only.pdf`, `B3-customer.pdf`):
the extracted text contained literal `{{platform.legalName}}` and
`{{partner.name}}` tokens.

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts` —
  `generateDocument`'s draft-path branch built its PDF/DOCX content straight
  from `version.contentHtml`, calling only the signature-token substitution.
- `documentFields()` and `sendForSignature()` each called
  `renderContractPlaceholders` on their own, so a fix applied to one path did
  not reach the others — three renderers of one version.
- QA evidence: `B1-partner-only.pdf`, `B3-customer.pdf` (TASK-0032 WP-09).

## Root Cause

Three separate call sites (`generateDocument`'s draft path, `documentFields`,
`sendForSignature`) each independently decided how to render a contract
version's placeholders, and only two of the three actually called
`renderContractPlaceholders`. This is the `divergent-duplicate-guard` bug
class: one behaviour implemented three times, and the three implementations
drifted.

## Impact

Every draft or preview agreement generated before this fix printed raw
template syntax to anyone previewing it — a CRITICAL defect because it is the
first artifact a counterparty or internal reviewer sees, and it directly
undermines confidence in the platform's contract generation.

## Affected Areas

- `services/api/src/modules/contracts/contracts.service.ts`
  (`generateDocument`, `documentFields`, `sendForSignature`)

## Proposed Resolution

Collapse all three call sites onto one shared function,
`renderContractVersionHtml(html, rows, 'display' | 'freeze')`, so the preview,
document-fields view and the pre-send render agree by construction; keep the
immutable (post-signing) path rendering only from the frozen version plus
`SignatureEvidence`. No ExecPlan needed — a rendering-path consolidation, no
schema or contract change.

## Acceptance Criteria

- A draft partner or customer agreement's generated PDF/DOCX prints resolved
  values, never `{{…}}`, for every placeholder the agreement's context can
  resolve.
- The document-fields view renders through the same function as PDF/DOCX
  generation.
- After signing, the executed copy renders from the frozen version and
  `SignatureEvidence`, not from current (possibly since-changed) entity
  values.
- A required unresolved placeholder stays visibly marked in a draft preview; an
  optional one follows its configured empty-value fallback.

## Regression Coverage

REG-610
(`services/api/src/modules/contracts/contracts.agreement-rendering.spec.ts` —
"prints resolved values in the preview PDF, never `{{platform.*}}`", "prints
resolved values in the preview DOCX", "the document-fields view renders
through the same function", "renders from the frozen version and evidence, not
from current values"), proven to fail against the pre-fix service.

## Dependencies

None.

## Related Items

- [[BUG-3581]] — the signature-date variant of the same rendering gap, fixed in
  the same commit.
- [[BUG-3583]], [[BUG-3584]] — related placeholder-context defects found in the
  same QA pass.
- Modules — [[contracts]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commit `a7d8c7c5` (`fix(api): render agreement previews and signature
dates through one path`): all three call sites now render through
`renderContractVersionHtml`, and the immutable path renders only from the
frozen version and `SignatureEvidence`.

## QA Retest

Verified by TASK-0032 WP-09 live QA re-run against the throwaway stack after
the fix — see `docs/tasks/TASK-0032-streams/QA-summary.md` ("Agreements …"
rows: Pass) and the passing `contracts.agreement-rendering.spec.ts`.

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA ("QA agreements DEFECT-1").
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `a7d8c7c5`
  and verified by WP-09/WP-11 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-610 (see the regression register)

<!-- GRAPH:END -->
