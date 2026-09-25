---
ID: BUG-3552
aliases: [BUG-3552]
Title: The agreement template editor offers every placeholder group regardless of agreement type
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/contracts, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-560
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0020-agreement-placeholders-are-offered-by-agreement-context.md
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3552 — The agreement template editor offers every placeholder group regardless of agreement type

## Summary

`ContractPlaceholderDefinition` declares an `allowedContractTypes` field
intended to scope which placeholders make sense for which `ContractType`, but
it is empty/unused on every registry entry and nothing filters by it. The
template editor's placeholder picker (fed by `GET
/contracts/placeholder-definitions`) therefore offers the entire registry to
every template regardless of type — a `PARTNER_AGREEMENT` template is offered
`customer.*` and `lead.*` placeholders that can never resolve for a partner
agreement.

## Expected Behavior

When authoring a template for a given `ContractType` (e.g.
`PARTNER_AGREEMENT`), the placeholder picker should offer only placeholders
that are meaningful for that type, using the `allowedContractTypes` field
that already exists on the definition for exactly this purpose.

## Actual Behavior

`listPlaceholderDefinitions` (`contracts.service.ts:1089`) returns the entire
`CONTRACT_PLACEHOLDER_REGISTRY` unfiltered, and the template editor
(`contract-template-editor.tsx:201`) renders every group regardless of the
template's `contractType`. An operator authoring a `PARTNER_AGREEMENT`
template sees `customer.*`, `lead.*` and every other namespace's placeholders
alongside `partner.*`.

## Reproduction

1. In `apps/admin`, create or edit a contract template with
   `contractType: PARTNER_AGREEMENT`.
2. Open the placeholder picker in `contract-template-editor.tsx`.
3. Observe `customer.*`, `lead.*`, `commercial.*` and every other namespace's
   placeholders are offered alongside `partner.*`, with no filtering by type.

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts:230-285`
  (`placeholder()` factory / `CONTRACT_PLACEHOLDER_REGISTRY`) — each entry
  declares `allowedContractTypes`, but the field is empty/unused in every
  registry entry read; no per-contract-type filtering was found applied
  against it anywhere in the file.
- `services/api/src/modules/contracts/contracts.service.ts:1089`
  (`listPlaceholderDefinitions`) — returns each registry item plus `group`
  and a rendered `exampleHtml`, with no filter parameter for `contractType`.
- `apps/admin/app/_components/documents/contract-template-editor.tsx:201` —
  consumes `GET /contracts/placeholder-definitions` directly, with no
  client-side filtering by the template's own `contractType` either.

## Root Cause

`allowedContractTypes` was added to the placeholder definition shape
(presumably in anticipation of exactly this filtering) but the filtering logic
was never implemented on either the server (`listPlaceholderDefinitions`) or
the client (the template editor's picker) — the field exists as inert
metadata.

## Impact

Medium usability/data-quality risk: an operator can add a placeholder that
can never resolve for the template's actual type (e.g. `customer.name` in a
`PARTNER_AGREEMENT` template), producing a document with a permanently
unresolved token (`renderContractPlaceholders` leaves it as the literal
`{{key}}` string) or, if marked required, blocking every send for that
template with an unmet-placeholder error the operator did not expect. No
tenant-isolation or authorization impact. Reachable in production today.

## Affected Areas

- `services/api/src/modules/contracts/contracts.service.ts`
  (`listPlaceholderDefinitions`, `CONTRACT_PLACEHOLDER_REGISTRY`)
- `apps/admin/app/_components/documents/contract-template-editor.tsx`
  (placeholder picker)

## Proposed Resolution

1. Populate `allowedContractTypes` on each registry entry with the
   `ContractType` values it is actually meaningful for (namespace-driven:
   `customer.*`/`lead.*` for customer-facing types, `partner.*` for partner
   types, `platform.*`/`contract.*`/`signature.*` for all types, etc.).
2. Filter `listPlaceholderDefinitions` by an optional `contractType` query
   parameter, and have the template editor pass the template's own
   `contractType` when fetching.
3. Keep the unfiltered listing available (e.g. no parameter = full registry)
   for any caller that genuinely needs it, so this is additive rather than
   breaking.
No ExecPlan needed — this is application logic and registry data, not a
schema change.

## Acceptance Criteria

- The template editor's placeholder picker, for a `PARTNER_AGREEMENT`
  template, shows only placeholders whose `allowedContractTypes` includes
  `PARTNER_AGREEMENT` (plus any explicitly type-agnostic namespaces).
- `GET /contracts/placeholder-definitions?contractType=PARTNER_AGREEMENT`
  returns the filtered set; calling without the parameter still returns the
  full registry (backward compatible).

## Regression Coverage

REG-560 (offered groups scoped by type —
`services/api/src/modules/contracts/placeholder-context.spec.ts`, "BUG-3552 —
a partner agreement does not offer customer/lead/tenant groups"), REG-561
(`customer.*` resolvable pre-conversion only when a lead legitimately supports
it), REG-562 (saving a template refuses an out-of-context placeholder,
`contracts.agreement-guards.spec.ts`), REG-563 (missing-relationship
placeholders get an entity-association message, not a generic one), REG-564
(a stringified `undefined`/`null`/`[object Object]` can never reach a
rendered agreement). All proven to fail against the pre-fix code — the
`placeholder-context.ts` module and its wiring did not exist before this
branch.

## Dependencies

None.

## Related Items

- [[BUG-1541]] — a related, already-fixed defect in the same placeholder-
  resolution area (a template/source pairing that could never fully resolve),
  fixed by `assertSourceCanFillTemplate` — this record is the sibling gap on
  the *authoring* side rather than the *resolution* side.
- TASK-0032 — the program that found this.

## Resolution

Fixed on `agent/pah-wp05-agreements` (TASK-0032 WP-05, merged as `2204cd75`;
see ADR-0020, "agreement placeholders are offered by agreement context"):
`contractAllowedSourceEntities`/`contractInstanceContextEntities` now narrow
the offered/required placeholder groups by `ContractType` and by the
agreement's actual linked entities; `createTemplate`/`createTemplateVersion`
refuse an out-of-context placeholder on save; unresolved-because-unlinked
placeholders get a distinct, actionable message; and
`renderContractPlaceholders` never lets a stringified
`undefined`/`null`/`[object Object]` reach a rendered document.

## QA Retest

Verified by TASK-0032 WP-09 live QA ("Agreements … Placeholder groups by type
in the template editor; out-of-context token refused on save … Pass" — see
`docs/tasks/TASK-0032-streams/QA-summary.md`) and the passing
`placeholder-context.spec.ts` / `contracts.agreement-guards.spec.ts` /
`contracts.domain.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D3.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).
- 2026-09-25 — fixed on `agent/pah-wp05-agreements` (WP-05, merged
  `2204cd75`; ADR-0020); verified by WP-09 live QA; Architect disposition
  DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]], [[platform-admin]]
- Regression — REG-560 (see the regression register)

<!-- GRAPH:END -->
