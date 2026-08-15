---
ID: ITEM-0015
aliases: [ITEM-0015]
Title: Make the tenant readiness() authorization assertion auditable
Type: FOLLOW_UP
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md
RelatedADR:
RelatedImplementation: docs/knowledge/implementations/2026-08-14-tenant-control-plane.md
TargetMilestone:
BlockedBy:
---

# ITEM-0015 — Make the tenant readiness() authorization assertion auditable

## Summary

`readiness()` in the tenant control plane carries no inline authorization
assertion. It is nonetheless authorized, because it delegates to `overview()`,
which asserts. The QA audit found it "correct-but-indirect" and flagged it as
the module's one soft spot.

## Why It Matters

The tenant control plane is a **cross-tenant** surface: it authorizes inside
services rather than through decorators, so "every reachable method asserts" is
the whole security model. A method that asserts only as a side effect of what it
happens to call is one refactor away from asserting nothing — and the refactor
that breaks it will look like an optimisation.

This module's bug pattern is already catalogued as
`service-authorization-hidden`. Indirect assertion is the same idea one step
further along.

## Evidence

`docs/qa/runs/2026-08-14-tenant-control-plane-ba1e818.md`:
Bugs Found — "The one candidate (S2, `readiness()` without an inline assertion)
resolved to correct-but-indirect on inspection."
Follow-up 3 — "Make S2 auditable: either inline the assertion in `readiness()`
or add a test that fails if it stops delegating to `overview()`."

## Proposed Approach

Prefer the inline assertion: it makes the method's authorization readable
without tracing a call chain, and costs one line. The test alternative pins
current behaviour but still requires a reader to know the indirection exists.

Whichever is chosen, the audit that found this — every reachable service method
asserts — should become the test, not stay a one-off reading. That generalises
the fix instead of patching the instance.

## Acceptance Criteria

`readiness()` either asserts directly, or a test fails if it stops delegating to
an asserting method. Better: a coverage test asserts that **every** public
method of the control-plane services performs an authorization check.

## Dependencies

None.

## Related Items

Module [[tenant-control-plane|Tenant Control Plane]] · bug patterns
[[service-authorization-hidden]], [[authorization-missing]] ·
architecture [[rbac|RBAC]], [[multi-tenancy|Multi-Tenancy]].

## History

- 2026-08-14 — raised as follow-up 3 of the tenant-control-plane QA run.
- 2026-08-15 — imported as a durable backlog item.

- 2026-08-15 — Architect triage: FIX_NOW. One line for the inline assertion, and the record is right that the generalised form — a coverage test asserting that every public control-plane service method authorizes — is the version worth building, since this module authorizes inside services rather than through decorators.
