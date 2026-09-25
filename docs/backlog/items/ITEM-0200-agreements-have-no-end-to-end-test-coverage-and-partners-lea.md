---
ID: ITEM-0200
aliases: [ITEM-0200]
Title: Agreements have no end-to-end test coverage and partners/leads have no e2e lifecycle suite
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/contracts, services/api/src/modules/partners, services/api/src/modules/leads]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: TASK-0032
TargetMilestone: 
BlockedBy: 
---

# ITEM-0200 — Agreements have no end-to-end test coverage and partners/leads have no e2e lifecycle suite

## Summary

Neither the `contracts` module (agreements, templates, signatures) nor the
`partners`/`leads` module family has any end-to-end test coverage under
`services/api/test/`. Both are covered only by colocated unit specs (which
mock their way past the database and HTTP layer) and, for partners/leads,
a one-off bespoke HTTP+SQL harness described in a QA run document that is not
a repo-tracked automated suite.

## Why It Matters

`contracts` is a legally load-bearing module — agreement creation,
placeholder resolution, immutability after signing, and the public
`/public/signatures/:token/sign` flow all lack any test that exercises the
real HTTP layer and a real database. The three e2e specs whose names sound
contracts-related (`db-fixtures-contract.e2e-spec.ts`,
`identity-contract.e2e-spec.ts`) are a naming false-positive — they test the
test-fixture builder and identity/workspace invariants, not `modules/contracts`
at all. Similarly, the partner/lead commercial funnel (inquiry → onboarding →
activation → referral attribution → commission) has no automated e2e proof;
the only lifecycle-level verification that has ever existed for it is a
bespoke, non-repo-tracked HTTP+SQL harness run once for a QA report. Every
defect this same discovery pass found in both module families (BUG-3549
through BUG-3553 and others) was found by static reading, not by a failing
automated test — meaning a regression in either area would currently surface
in production before it surfaces in CI.

## Evidence

- `services/api/src/modules/contracts/*.spec.ts` — unit-level only:
  `contracts.agreement-immutability.spec.ts`, `contracts.contracting.spec.ts`,
  `contracts.domain.spec.ts`, `contracts.workflow.spec.ts`,
  `placeholder-formatting.spec.ts`, `source-fills-template.spec.ts`. None
  exercises a real HTTP request or a real database.
- `services/api/test/db-fixtures-contract.e2e-spec.ts` and
  `identity-contract.e2e-spec.ts` — read in full: the first tests the
  tenant/business-unit fixture-builder helper, the second tests identity/
  user-workspace invariants. Neither touches `modules/contracts`.
- No e2e spec anywhere exercises `POST /contracts`, `sendForSignature`, the
  public `/public/signatures/:token/sign` flow, cross-tenant isolation for
  contracts, or the platform-permission gate on the contracts controllers.
- `services/api/src/modules/partners/*.spec.ts` and
  `partner-experience/*.spec.ts` (11 files total, listed in discovery stream
  D2 §8) — all unit-level.
- The three commercial-flavoured e2e specs present
  (`commercial-bootstrap.e2e-spec.ts`, plus the two above) cover plan/price
  bootstrap and fixture/identity contracts — confirmed by reading
  `commercial-bootstrap.e2e-spec.ts`'s test titles (plan pricing dedup/
  idempotency), nothing partner- or lead-shaped.
- `docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md` — the only
  lifecycle-level proof of the partner/lead journeys that has ever existed,
  and it is a bespoke, one-off HTTP+SQL harness, not a repo-tracked automated
  suite; it was not re-run as part of this discovery.
- [[ITEM-0001]] — browser E2E tooling (Playwright) now exists for
  `apps/landing`/`apps/admin`/`apps/web`, which is the frontend half of this
  gap; this item is specifically about `services/api/test/` API-level e2e
  coverage, which is a separate test layer.

## Proposed Approach

Two independently shippable pieces, both extending the existing
`services/api/test/` e2e harness rather than building a new one:

1. **Contracts e2e suite**: a new `contracts.e2e-spec.ts` (or a small set)
   covering: create a `PARTNER_AGREEMENT`/`CUSTOMER_AGREEMENT` against a real
   partner/lead/customer fixture, send for signature, complete the public
   signature flow end-to-end (`/public/signatures/:token/sign`), assert
   immutability after signing (regression-pinning [[BUG-0011]]'s fix at the
   HTTP layer, not just the unit-test layer that already covers it), and
   assert the platform-permission gate refuses a non-platform caller.
2. **Partner/lead lifecycle e2e suite**: a new suite covering inquiry →
   onboarding invitation → submission → review decision → activation →
   default referral link creation → lead attribution → (optionally)
   commission creation, against a real database, replacing the bespoke
   one-off harness with something CI runs on every push.
No ExecPlan needed — this is test authoring against existing endpoints and
fixtures, not a schema or contract change. Follow the existing e2e patterns
in `services/api/test/` for fixture setup and teardown per
`.agent/context/test-resource-policy.md`.

## Acceptance Criteria

- `services/api/test/contracts.e2e-spec.ts` (or equivalent) exists and covers
  create → send → sign → immutability, running green in CI.
- A partner/lead lifecycle e2e suite exists and covers inquiry through
  activation, running green in CI.
- Both suites clean up exactly the fixtures they create, per
  `.agent/context/test-resource-policy.md`.

## Dependencies

None.

## Related Items

- [[ITEM-0001]] — the sibling frontend/browser E2E tooling item; this item is
  the API-level e2e layer, a distinct gap.
- [[BUG-0011]] — the agreement-immutability fix this item's contracts suite
  would additionally pin at the HTTP layer.
- [[BUG-3550]], [[BUG-3551]], [[BUG-3553]] — defects in the same module
  families this discovery pass found by static reading; an e2e suite existing
  earlier would have had a better chance of catching at least the lifecycle-
  shaped ones (duplicate creation, inactive-source creation) as failing tests
  rather than static findings.
- TASK-0032 — the program that found this.

## History

- 2026-09-25 — created at `75fec5b9`; discovery streams D2 §8 and D3 §7.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]], [[partners]], [[leads]]

<!-- GRAPH:END -->
