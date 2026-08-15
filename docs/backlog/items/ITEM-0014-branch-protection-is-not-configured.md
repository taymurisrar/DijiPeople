---
ID: ITEM-0014
aliases: [ITEM-0014]
Title: Branch protection is not configured on the remote
Type: INFRA
Status: TRIAGE_REQUIRED
Priority: P2
Severity: MEDIUM
AffectedModules: [.github]
Source: ARCHITECT
OwnerAgent: integrator
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0014 — Branch protection is not configured on the remote

## Summary

The shared-target CI gate — "a merge into `main` requires `REMOTE_CI_STATUS =
PASS` on the exact SHA" — is enforced entirely by agent instructions. GitHub
branch protection, which would enforce it for everyone, is not configured.

## Why It Matters

The completion contract says it directly: *"These rules govern agent behaviour;
branch protection governs everyone — humans, other Git clients, direct pushes,
and agents that ignore their instructions. Neither replaces the other, and this
repository currently has only the first."*

The gate exists because a task once merged and pushed `main` on an unread CI
verdict. Instructions were then written to prevent it. Instructions are not a
control — they are a request that has so far been honoured.

## Evidence

`docs/development/branch-protection.md` — the required settings, written up and
not applied.
`.agent/context/task-completion-contract.md`, Shared targets section, as quoted.
`git branch -a` shows 17 remote branches with no protected-branch metadata
observable from a clone.

## Proposed Approach

Apply the settings already documented in `docs/development/branch-protection.md`
to `main`: require the `CI required gate` check, require branches to be up to
date before merging, and disallow force pushes and deletion.

**Requires repository-admin access**, which agents do not have — this is an
action for the repository owner. It is recorded here rather than in a chat
message precisely so it survives.

The "require branches to be up to date" setting is the one that matters most
beyond the obvious: `agent-orchestration.md` already warns that a green CI run
against a stale base proves nothing, and that setting is what enforces it.

## Acceptance Criteria

`main` rejects a direct push, rejects a merge whose `CI required gate` has not
passed, and rejects a merge from a branch behind `main`.

## Dependencies

Repository-admin access. Nothing engineering-side.

## Related Items

Architecture [[qa-and-ci-architecture|QA and CI Architecture]], [[agent-engineering-architecture|Agent Engineering Architecture]] ·
`docs/development/ci.md` · `.agent/agents/integrator.md`.

## History

- 2026-08-15 — imported from the standing gap recorded in the completion
  contract and `docs/development/branch-protection.md`.
