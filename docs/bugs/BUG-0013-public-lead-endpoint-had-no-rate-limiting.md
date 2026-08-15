---
ID: BUG-0013
aliases: [BUG-0013]
Title: The public lead endpoint had no rate limiting
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/leads]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-011
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-15
---

# BUG-0013 — The public lead endpoint had no rate limiting

## Summary

`PublicLeadsController` carried `@Public()` but no `PublicRateLimitGuard` — the
only public surface in the codebase without it.

## Expected Behavior

Every unauthenticated endpoint is rate limited. That is stated in `AGENTS.md` as
a standing requirement for `@Public()` handlers.

## Actual Behavior

25 of 25 rapid anonymous submissions were accepted. The identical burst against
`/public/partners/inquiries` was throttled — which is what proved the guard
works and the omission was local.

## Reproduction

Scenario A1.11, with A1.12 as the control: burst `POST /api/public/leads`
anonymously and observe no 429s.

## Evidence

QA run scenarios A1.11 / A1.12;
`services/api/src/modules/leads/public-leads.rate-limit.spec.ts`.

## Root Cause

A guard applied by convention rather than by anything mechanical. Nothing
enforced "every `@Public()` controller also carries the rate-limit guard", so
one omission was invisible.

## Impact

Two amplifiers on one endpoint: unbounded `Lead` row growth, and outbound email
— each accepted submission emails every active platform user in the sales and
admin roles.

## Affected Areas

`services/api/src/modules/leads`, and the platform notification path it triggers.

## Proposed Resolution

Resolved: `@UseGuards(PublicRateLimitGuard)` on `PublicLeadsController`.

## Acceptance Criteria

The controller's guard metadata is exactly `[PublicRateLimitGuard]` — present,
and never joined by an auth guard that would break the public funnel.

## Regression Coverage

[REG-011](../qa/regressions/index.md) — 3 assertions, proven to fail without the
fix.

## Dependencies

None. The generalised check — a test asserting every `@Public()` controller is
rate limited — is tracked as [[ITEM-0013]].

## Related Items

Bug pattern [[authorization-missing]]. Modules [[leads|Leads]].
Requirement [[requirement-lead-conversion|Lead Conversion]].

## Resolution

Fixed 2026-08-15 on branch `agent/qa-commercial-onboarding-e2e`.

## QA Retest

FIX3.01–02 PASS.

## History

- 2026-08-15 — found during the commercial onboarding E2E, fixed, REG-011 added.
- 2026-08-15 — imported into the durable bug system.
