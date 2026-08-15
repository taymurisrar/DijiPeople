---
ID: ITEM-0011
aliases: [ITEM-0011]
Title: Framework validation should catch false absence claims in context documents
Type: TECH_DEBT
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [.agent/context, scripts]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0023
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0011 — Framework validation should catch false absence claims in context documents

## Summary

`validate-framework.mjs` already fails when a context document **references** a
file that does not exist. The inverse — a document asserting a file does *not*
exist, when it does — is invisible, and has already happened: [[BUG-0023]].

## Why It Matters

Absence claims age worse than any other kind of documentation, because nothing
breaks when they become false. A reference to a deleted file produces a broken
link somebody notices; a claim that a file is missing just quietly misleads every
agent that reads it, for as long as it survives.

The framework's own stated failure mode is "a file that referenced something
which did not exist". This is the mirror of that, and the same validator is the
natural place to catch it.

## Evidence

`scripts/validate-framework.mjs` — the existing check resolves every
`.agent/context/*.md` reference found in an agent role.
[[BUG-0023]] — `testing-architecture.md:128-129` asserts two e2e specs do not
exist; both do.

## Proposed Approach

Recognise a small, explicit phrasing convention rather than trying to parse
English. Something like a `<!-- absent: path -->` marker, or a validated
"**does not exist**" sentence adjacent to a backticked path, checked mechanically.

**Keep it narrow.** A check that tries to interpret prose will produce false
failures, and a validation nobody trusts gets bypassed — which is worse than not
having it. If a robust rule is not available cheaply, the honest alternative is
to require a `Last verified` refresh on any context file making an absence claim.

## Acceptance Criteria

A context document asserting a path is absent, while the path exists, fails
`node scripts/validate-framework.mjs` — with no false positive on the existing
context set.

## Dependencies

None.

## Related Items

[[BUG-0023]] · bug pattern [[doc-code-drift]] ·
architecture [[agent-engineering-architecture|Agent Engineering Architecture]].

## History

- 2026-08-15 — raised alongside BUG-0023 as the generalisable half of it.

- 2026-08-15 — Architect triage: FIX_NOW, with the record own warning treated as binding: keep it narrow. A validator that tries to interpret prose will produce false failures, and a validation nobody trusts gets bypassed. Implement the explicit-marker form or the `Last verified` refresh requirement — not an English parser.
