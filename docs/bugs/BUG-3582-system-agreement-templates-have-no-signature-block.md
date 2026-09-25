---
ID: BUG-3582
aliases: [BUG-3582]
Title: System agreement templates have no signature block
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [services/api/prisma, services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-614
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0021-owner-decisions-countersign-platform-mfa-legal-publishing.md
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3582 — System agreement templates have no signature block

## Summary

Seven of the nine seeded system agreement templates
(`PARTNER_REFERRAL_STANDARD`, `PARTNER_COMPANY_STANDARD`,
`PARTNER_INDIVIDUAL_STANDARD`, `CUSTOMER_ENTERPRISE_STANDARD`,
`NDA_STANDARD`, `DATA_PROCESSING_STANDARD`, `REFERRAL_ADDENDUM_STANDARD`)
shipped with no `signature.*` placeholders at all, so an executed agreement
generated from one of them showed no signature block whatsoever — the
document simply ended without any indication of who signed or when.

## Expected Behavior

Every system agreement template should end with a signature block naming both
the platform and the counterparty, with a mark and a date placeholder for
each, exactly as the two templates that already had one.

## Actual Behavior

`seedPlatformContractTemplates` shipped seven of nine templates missing the
`signature.*` tokens entirely, and because the seed writes content directly
rather than going through `createTemplate`'s ADR-0020 context validation,
nothing caught the omission before it reached production tenants.

## Reproduction

1. Generate an executed (signed) agreement from any of the seven affected
   system templates.
2. Read the generated document to its end.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 live QA,
"QA agreements DEFECT-3"): the seeded partner agreement template produced a
document with no signature section.

## Evidence

- `services/api/prisma/seed-config.ts` (`seedPlatformContractTemplates`) —
  seven of the nine seeded templates' HTML bodies contained no
  `{{signature.*}}` token.
- The seed writes `contentHtml` directly to the database, bypassing
  `createTemplate`'s placeholder-context validation (the same validation
  REG-562 added for the operator-facing create path).

## Root Cause

Seeded content is an `unvalidated-seed-state`: the seed script is not itself
routed through the same content validation the application enforces for
operator-created templates, so a template shipped incomplete stayed
incomplete until something read the generated document end to end.

## Impact

Any tenant using an unedited system template for a partner referral, company
partner, individual partner, enterprise customer, NDA, data-processing or
referral-addendum agreement produced a legally meaningless executed document —
one with no visible record of who signed it — until the operator manually
added a signature section themselves.

## Affected Areas

- `services/api/prisma/seed-config.ts` (`seedPlatformContractTemplates`)
- `services/api/src/modules/contracts` (template content structure)

## Proposed Resolution

Add a platform + counterparty signature block (name and date, for both
parties) to the end of each affected template's body, matching the two
templates that already had one; export the full list as
`PLATFORM_CONTRACT_TEMPLATES` and add a spec that validates every seeded
template both has a signature block and references only placeholders valid
for its own contract type. No ExecPlan needed — content and seed data only, no
schema change.

## Acceptance Criteria

- Every seeded system template contains `{{signature.platform.name}}`,
  `{{signature.platform.date}}`, `{{signature.counterparty.name}}` and
  `{{signature.counterparty.date}}`.
- `outOfContextPlaceholders` over every seeded template's content is empty.
- A future seed template referencing an out-of-context placeholder (e.g.
  `customer.*` in a partner agreement) fails the new spec.

## Regression Coverage

REG-614 (`services/api/src/modules/contracts/contract-templates.seed.spec.ts`
— "%s has a platform and counterparty signature block", "%s references only
registered placeholders valid for its type", run per template), proven to
fail against the pre-fix seed content. Additional coverage: REG-623 —
following this fix, agreements without a DijiPeople signer printed "Not
signed" beside DijiPeople, an owner decision (ADR-0021) resolved by
[[BUG-3587]]'s sibling fix and pinned in
`services/api/src/modules/contracts/platform-signature-lines.spec.ts`.

## Dependencies

None.

## Related Items

- ADR-0021 — DijiPeople's signature line appears only when DijiPeople signs
  (the follow-up decision this fix required, see REG-623).
- Modules — [[contracts-and-agreements]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commits `16218cc9` (`wip(TASK-0032 WP-11): checkpoint after a session
interruption` — the seed content edit) and `301eda2c` (`fix(seed): give every
system agreement template a signature block`): every seeded system template
now ends with a platform + counterparty signature block, exported as
`PLATFORM_CONTRACT_TEMPLATES` and validated by
`contract-templates.seed.spec.ts`. The follow-on visibility question this
raised (a platform line showing "Not signed" when DijiPeople never signs) was
resolved by ADR-0021 and commit `02d9bebf`
(`feat(contracts): DijiPeople's signature line appears only when DijiPeople
signs (ADR-0021)`), tracked as REG-623.

## QA Retest

Verified by TASK-0032 WP-09 live QA re-run against the throwaway stack after
the fix — see `docs/tasks/TASK-0032-streams/QA-summary.md` ("Seeded partner
agreement template has no signature block": Fixed, WP-11) — and the passing
`contract-templates.seed.spec.ts` / `platform-signature-lines.spec.ts`.

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA ("QA agreements DEFECT-3").
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `16218cc9`/
  `301eda2c`/`02d9bebf` and verified by WP-09/WP-11/WP-12 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[database-architecture]], [[contracts-and-agreements]]
- Regression — REG-614 (see the regression register)

<!-- GRAPH:END -->
