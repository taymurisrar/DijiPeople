---
ID: ITEM-0041
aliases: [ITEM-0041]
Title: Repository ruleset No push matches no branch and is inert
Type: INFRA
Status: PRODUCT_DECISION
Priority: P3
Severity: LOW
AffectedModules: [.github]
Source: ARCHITECT
OwnerAgent: release-devops
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0041 — Repository ruleset No push matches no branch and is inert

## Summary

The repository's only ruleset, **No push** (id `15523234`, enforcement
`active`), declares a pull-request rule requiring one approving review. Its ref
condition is the literal string `refs/heads/"main", "develop"` rather than a ref
pattern, so it **matches no branch** and enforces nothing.

## Why It Matters

A ruleset shown as `active` in the GitHub UI reads as protection that is in
force. It is not. Anyone auditing this repository's controls would count a
one-approval requirement that does not exist — and `main` is in fact protected
solely by classic branch protection, which requires zero approvals.

The risk is not the missing rule. It is the false confidence, plus the fact that
a future rename or edit could make the pattern start matching and silently impose
an approval requirement nobody planned for, on both branches at once.

## Proposed Approach

This is a decision rather than a fix, which is why it was reported and not
repaired:

- **Delete it.** It enforces nothing and its presence misleads. Simplest, and
  loses nothing that currently works.
- **Repair the pattern.** It would then require one approving review on `main`
  *and* `develop`. GitHub forbids self-approval, so on a single-maintainer
  repository that blocks every merge into `main` — and on `develop` it
  contradicts the autonomous-integration model outright.
- **Leave it, documented.** `node scripts/verify-branch-policy.mjs` reports it on
  every run, so it cannot quietly begin matching.

The third is the current state. The first becomes correct as soon as somebody
confirms the ruleset was not meant to protect something else.

## Acceptance Criteria

- The ruleset is deleted, repaired, or explicitly accepted as documentation-only
  with that decision recorded here.
- `node scripts/verify-branch-policy.mjs` reports no ruleset finding.

## Related Items

[[ITEM-0040]] · [[TASK-0004]]

## History

- 2026-08-16 — found by the new branch-policy verifier on its first run.
