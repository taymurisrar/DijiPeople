---
ID: BUG-3584
aliases: [BUG-3584]
Title: A partner agreement never fills partner placeholders from its linked partner
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-613
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3584 — A partner agreement never fills partner placeholders from its linked partner

## Summary

Even after BUG-3580 fixed general placeholder rendering, a partner agreement
linked to a real `Partner` record still printed `{{partner.name}}` unresolved
in its preview, because nothing ever derived `partner.*` values from the
linked partner — `resolveSource` handled lead, customer, onboarding and
tenant sources, but never partner.

## Expected Behavior

Creating a `PARTNER_AGREEMENT` with a `partnerId` should populate
`partner.name`, `partner.legalName`, `partner.contact.*`, `partner.taxId` and
the partner's configured commission automatically from the linked record —
exactly as ADR-0020 promises for every other linked-entity namespace — while
still letting an operator override any value manually, and refreshing the
derived values (without clobbering manual overrides) on every subsequent edit.

## Actual Behavior

`resolveSource` had branches for `lead`, `customer`, `onboarding` and
`tenant`, but none for `partner`. `create()` stored `partnerId` on the
agreement without deriving any `partner.*` placeholder value, so a partner
agreement's preview printed `{{partner.name}}` unresolved until an operator
manually typed the partner's own name into a field the platform already had
on file.

## Reproduction

1. Create a `PARTNER_AGREEMENT` with `partnerId` pointing at an existing
   individual or company partner.
2. Preview the agreement.
3. Observe `{{partner.name}}` (and other `partner.*` tokens) print unresolved
   even though the linked partner record has that data.

**Discovered by TASK-0032 WP-11** while verifying the ADR-0020 "linked
entities feed their namespace" promise, surfaced while fixing BUG-3580
(DEFECT-1).

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts` (`resolveSource`,
  `create()`) — no `partner` case existed in `resolveSource`, and `create()`
  never called any partner-derivation helper.

## Root Cause

A `declared-but-unwired-step`: ADR-0020 promises that every linked entity
feeds its own placeholder namespace, but the `partner` source was simply never
implemented when `resolveSource` was written for the other three sources.

## Impact

Every partner agreement created through the normal flow required an operator
to manually retype data the platform already held about the partner —
undermining the entire point of linking an agreement to a partner record, and
risking a manually retyped value drifting from the partner's actual record
over time.

## Affected Areas

- `services/api/src/modules/contracts/contracts.service.ts` (`resolveSource`,
  `create`, contract edit path)

## Proposed Resolution

Add a `partner` branch to `resolveSource`; derive `partner.name`,
`partner.legalName` (using the individual's name where the partner is an
individual, never inventing a company legal name), `partner.contact.*`,
`partner.taxId` and the configured commission at `create()` time; add
`syncDerivedPlaceholderValues` so a subsequent edit refreshes the derived
values from the current partner record while preserving any value an operator
entered manually. No ExecPlan needed — service-level derivation logic, no
schema change.

## Acceptance Criteria

- `POST /contracts` with `{ contractType: PARTNER_AGREEMENT, partnerId }` for
  an individual partner stores `partner.name`, `partner.legalName` (the
  individual's own name), `partner.contact.*`, `partner.taxId` and the
  configured commission — never inventing a company legal name, a 0%
  commission, an address or a registration number the partner does not have.
- Renaming the partner then editing the draft updates `partner.name`.
- A manually entered `partner.contact.email` survives a subsequent
  resynchronisation.

## Regression Coverage

REG-613 (`services/api/src/modules/contracts/contracts.partner-source.spec.ts`
— "POST /contracts with a partnerId stores the partner values", "a contract
edit refreshes partner.* from the record, keeping manual overrides", plus
three `partnerPlaceholderValues` unit tests), proven to fail against the
pre-fix service (wiring tests).

## Dependencies

None.

## Related Items

- [[BUG-3580]] — the general rendering gap this fix builds on.
- Modules — [[contracts-and-agreements]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commit `6a74cbd0` (`fix(api): resolve partner.* from an agreement's
linked partner`): `create()` now derives `partner.*` from the linked partner
record (explicit `placeholderValues` still win), and
`syncDerivedPlaceholderValues` refreshes them on every contract edit while
preserving manual overrides.

## QA Retest

Verified by TASK-0032 WP-11's own regression suite
(`contracts.partner-source.spec.ts`) — see
`docs/tasks/TASK-0032-streams/t0032-wp-11-report.md` RECORD_CLOSURES ("WP-11 item 5
(partner source)").

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-11's
  ADR-0020 verification pass.
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `6a74cbd0`
  and verified by WP-11 retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]]
- Regression — REG-613 (see the regression register)

<!-- GRAPH:END -->
