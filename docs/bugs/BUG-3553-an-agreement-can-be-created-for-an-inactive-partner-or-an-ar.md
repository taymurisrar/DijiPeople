---
ID: BUG-3553
aliases: [BUG-3553]
Title: An agreement can be created for an inactive partner or an archived lead or customer, and duplicate submissions create duplicate agreements
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-565
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3553 — An agreement can be created for an inactive partner or an archived lead or customer, and duplicate submissions create duplicate agreements

## Summary

`ContractsService`'s counterparty and source-resolution checks
(`validateCounterparty`, `resolveSource`) only verify that a referenced
partner/lead/customer **exists** — none of them check its lifecycle status.
An agreement can be created and sent for a `SUSPENDED`/`REJECTED`/`INACTIVE`
partner, or against an archived lead or customer, with no warning. Separately,
`POST /contracts` has no idempotency-key or duplicate-detection guard, so two
identical submissions each succeed and create two separate `Contract` rows.

## Expected Behavior

Creating or sending an agreement against a partner/lead/customer that is no
longer in an active, agreement-eligible state should be blocked or at least
flagged to the operator. A double-submission of the same create request
should not silently produce two separate agreements.

## Actual Behavior

- `validateCounterparty` (`contracts.service.ts:4879-4894`) only checks
  **presence** of `partnerId`/`customerAccountId`/`relatedLeadId` for the
  declared `contractType` — never the referenced record's `status`.
- `resolveSource('lead', id)` (`contracts.service.ts:4485`) only checks
  `if (!lead) throw NotFoundException` — no check for an archived/rejected
  lead status.
- `customerSource()` (`contracts.service.ts:5874`) has the same shape — no
  account-status check before building a source or creating an agreement.
- Plain `POST /contracts` has no idempotency-key or duplicate-detection guard;
  two calls with identical `partnerId`/`contractType`/`counterpartyName` each
  succeed, each getting a fresh `reference('CON')` contract number (no unique-
  constraint collision to catch it either).

## Reproduction

1. Set a `Partner` to `SUSPENDED` (or `REJECTED`/`INACTIVE`).
2. Create a `PARTNER_AGREEMENT` `Contract` referencing that partner via
   `POST /contracts` — the request succeeds with no warning about the
   partner's status.
3. Submit an identical `POST /contracts` payload twice in quick succession
   (e.g. a double-click on Save) — both succeed, producing two separate
   `Contract` rows for the same intended agreement.

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts:4879-4894`
  (`validateCounterparty`) — presence-only checks, no status read.
- `services/api/src/modules/contracts/contracts.service.ts:4485`
  (`resolveSource`, lead branch) — `if (!lead) throw NotFoundException` only.
- `services/api/src/modules/contracts/contracts.service.ts:5874`
  (`customerSource`) — same shape, no account-status check found.
- No `@ArrayMinSize`/idempotency-key equivalent found on `CreateContractDto`
  for `POST /contracts`; contrast `POST /contracts/copy`
  (`CopyContractDto`), which is an explicit, deliberate duplication path
  requiring a new `title` — the plain create path has no equivalent guard.
- Discovery stream D3's Agreement Scenario Matrix, scenarios 20 ("Partner
  inactive" — UNKNOWN/likely GAP), 21 ("Lead archived" — UNKNOWN/likely GAP),
  22 ("Customer archived" — UNKNOWN/likely GAP), and 27 ("Duplicate creation"
  — PARTIAL, no idempotency guard on plain `POST /contracts`).

## Root Cause

`validateCounterparty` and `resolveSource` were built to answer "does this
reference point at something that exists and satisfies the minimum shape for
this `contractType`" — never extended to "is that referenced record still in
a state where a new agreement makes sense." Separately, no idempotency
mechanism was ever added to the plain create endpoint; `copy` (an explicit
duplication feature) has its own required-title guard, but ordinary create
does not need equivalent protection against accidental double-submission.

## Impact

Medium data-integrity risk: an operator can generate a legally-framed
agreement against a partner/lead/customer that has already left the
relationship (suspended, rejected, archived), and a UI double-click or retry
can produce duplicate `Contract` rows with duplicate reference numbers for
what was meant to be one agreement — confusing for both revenue tracking and
compliance review. Reachable in production today; not a tenant-isolation or
authorization issue.

## Affected Areas

- `services/api/src/modules/contracts/contracts.service.ts`
  (`validateCounterparty`, `resolveSource`, `customerSource`, `create`)
- `services/api/src/modules/contracts/contracts.controller.ts` (`POST /contracts`)

## Proposed Resolution

1. Add a status check to `validateCounterparty`/`resolveSource`/
   `customerSource`: refuse (or warn, per product decision) when the
   referenced partner is not in an agreement-eligible status, or the lead/
   customer is archived/rejected.
2. Add a short-window idempotency guard to `POST /contracts` — e.g. an
   idempotency-key header, or a server-side check for an identical pending
   submission from the same actor within a short window — to prevent
   accidental double-submission from producing duplicate rows.
No ExecPlan needed — application-level validation, not a schema change.

## Acceptance Criteria

- Creating an agreement against a `SUSPENDED`/`REJECTED`/`INACTIVE` partner is
  refused or explicitly flagged (product decision on which).
- Creating an agreement against an archived lead or customer is refused or
  flagged.
- A rapid duplicate `POST /contracts` submission does not produce two
  `Contract` rows for the same intended agreement.

## Regression Coverage

REG-565 (suspended/terminated/rejected/inactive partner —
`services/api/src/modules/contracts/agreement-source-guards.spec.ts`,
`assertPartnerUsable`), REG-566 (archived/lost/converted/unqualified lead,
`assertLeadUsable`), REG-567 (archived/churned customer, `assertCustomerUsable`),
REG-568 (a lead attributed to a different partner cannot be linked to that
partner's agreement, `assertLeadAttributedToPartner`), REG-569 (no protection
against a duplicate non-terminal agreement, `findDuplicateAgreement` —
discovery D3 scenario 27), REG-574 (expired signature requests kept showing
`SENT`/`VIEWED` indefinitely, `applyPassiveSignatureExpiry`). All proven to
fail against the pre-fix code — none of these guard functions existed before
this branch.

## Dependencies

Resolved — WP-05 implemented block-outright (not warn-and-allow): a
non-agreement-eligible partner/lead/customer status refuses creation with a
400 naming the record and its status, rather than allowing the agreement with
a warning.

## Related Items

- [[BUG-1541]] — a related contracts-module defect about a template/source
  pairing that could never resolve; this record is a different gap (the
  source's own lifecycle state, not its placeholder shape).
- TASK-0032 — the program that found this.

## Resolution

Fixed on `agent/pah-wp05-agreements` (TASK-0032 WP-05, merged as `2204cd75`):
`assertPartnerUsable`/`assertLeadUsable`/`assertCustomerUsable`/
`assertLeadAttributedToPartner`/`findDuplicateAgreement` are wired into
`create`/`update`/`copy`, and `applyPassiveSignatureExpiry` transitions a past-
due signature request to `EXPIRED` on read. The dead `/signature-requests/:id/remind`
route (a byte-for-byte duplicate of `/resend`) is removed as part of the same
change.

## QA Retest

Verified by TASK-0032 WP-09 live QA ("Agreements … Source guards: suspended
partner, archived lead, archived customer, lead attributed to another
partner, duplicate agreement, required placeholder with no linked entity …
Pass, each with a specific message" — see
`docs/tasks/TASK-0032-streams/QA-summary.md`) and the passing
`agreement-source-guards.spec.ts` / `contracts.agreement-guards.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D3,
  scenarios 20-22 and 27.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032) — block-vs-warn on the
  inactive/archived-source check is left as an open question for the
  implementing specialist to raise if not obvious from context.
- 2026-09-25 — fixed on `agent/pah-wp05-agreements` (WP-05, merged
  `2204cd75`, decision: block outright); verified by WP-09 live QA; Architect
  disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-565 (see the regression register)

<!-- GRAPH:END -->
