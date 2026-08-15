---
ID: ITEM-0004
aliases: [ITEM-0004]
Title: Tenant activation to ACTIVE has never been reached in any test
Type: TEST_GAP
Status: BLOCKED
Priority: P1
Severity: HIGH
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: BLOCKED_EXTERNAL
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0015
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy: BUG-0015
---

# ITEM-0004 — Tenant activation to ACTIVE has never been reached in any test

## Summary

The commercial onboarding E2E proved every activation **gate** — five negative
scenarios, A16.01 through A16.05 — but never reached a successful activation,
because [[BUG-0015]] stranded the test tenant with no owner.

## Why It Matters

The gates are proven; the path through them is not. Everything after activation
is therefore unproven too: post-activation owner and session behaviour, and the
final eight-tab tenant verification the run planned as A17.

This is the end of the primary commercial journey. The product's most important
flow has a proven beginning, a proven middle and an unobserved end.

## Evidence

`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`:

- Scope, Not covered: "tenant activation to ACTIVE (blocked by a defect)".
- Known Limitations: "The activation *gates* were proven (A16.01–A16.05); the
  successful activation path, post-activation owner/session behaviour and the
  final eight-tab tenant verification (A17) are **unproven**."
- Verdict table: `TENANT_PROVISIONING` = **FAIL**.

Flow B stopped for the same reason after conversion and onboarding seed.

## Proposed Approach

Nothing to do until [[BUG-0015]] is fixed. Then re-run scenarios A11–A17 of the
existing run against a tenant provisioned cleanly, and record a new QA run rather
than amending the old one — runs are history.

## Acceptance Criteria

A tenant reaches `ACTIVE` in a recorded QA run, its owner can sign in, and the
eight tenant tabs render for that tenant.

## Dependencies

`BlockedBy: BUG-0015`. This is the clearest case in the backlog of blocked
rather than deferred: it is wanted now and cannot move.

## Related Items

[[BUG-0015]] · [[BUG-0022]] · modules [[tenant-provisioning|Tenant Provisioning]],
[[tenant-control-plane|Tenant Control Plane]] ·
requirement [[requirement-commercial-onboarding|Commercial Onboarding]].

## History

- 2026-08-15 — imported from the commercial onboarding E2E's Known Limitations.
