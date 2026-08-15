---
ID: ITEM-0013
aliases: [ITEM-0013]
Title: Assert mechanically that every @Public() controller carries the rate-limit guard
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api]
Source: QA_RUN
OwnerAgent: backend-api
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0013
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0013 — Assert mechanically that every @Public() controller carries the rate-limit guard

## Summary

[[BUG-0013]] was one public controller missing `PublicRateLimitGuard` — the only
one in the codebase without it. Its regression test pins **that** controller.
Nothing pins the next one.

## Why It Matters

`AGENTS.md` states the rule: "Public endpoints (`@Public()`) additionally need
rate limiting (`PublicRateLimitGuard`), strict input validation and no tenant
enumeration." A rule enforced only by convention is a rule that is already broken
somewhere you have not looked — that is how BUG-0013 existed.

There are 24 `@Public()` handlers across 10 controllers at the documented
baseline, several of them on controllers that are only *partially* public. That
is exactly the shape a per-controller convention gets wrong.

## Evidence

`services/api/src/modules/leads/public-leads.rate-limit.spec.ts` — asserts the
guard metadata of one controller.
`docs/qa/regressions/index.md` REG-011.
Root `AGENTS.md`, Security section, and the `@Public()` handler count.

## Proposed Approach

Extend the existing invariant-spec pattern —
`common/constants/wiring-invariants.spec.ts` is the established home for this
kind of check. Enumerate handlers carrying the `@Public()` metadata, resolve
their controller's guards, and assert `PublicRateLimitGuard` is present.

Allow a documented exemption list with a stated reason per entry, so a genuine
exception (a health endpoint, say) is visible rather than silently absent.

## Acceptance Criteria

Adding a new `@Public()` handler to a controller without the guard fails the
suite, naming the controller. The current tree passes.

## Dependencies

None.

## Related Items

[[BUG-0013]] · bug pattern [[authorization-missing]] · module [[leads|Leads]] ·
architecture [[rbac|RBAC]]. Same "pin the rule, not the instance" shape as the
coverage test added for [[BUG-0006]].

## History

- 2026-08-15 — raised as the generalisable half of BUG-0013.
