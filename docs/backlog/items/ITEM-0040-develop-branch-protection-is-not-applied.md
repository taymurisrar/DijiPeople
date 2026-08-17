---
ID: ITEM-0040
aliases: [ITEM-0040]
Title: develop branch protection is not applied
Type: INFRA
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [.github]
Source: ARCHITECT
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0040 — develop branch protection is not applied

## Summary

`develop` is the autonomous integration branch and carries no branch protection
at all, so it can be force-pushed and deleted. The intended configuration, the
reasoning behind each setting and the exact command are in
[`branch-protection.md`](../../development/branch-protection.md); the payload is
committed at `docs/development/develop-protection.json`.

## Why It Matters

Everything else in the branch model is enforced by the framework rather than by
the platform: session records reject `TARGET_BRANCH: main` on an ordinary task,
the merge queue serialises integration, CI runs on every push. Those hold against
agents that follow their instructions.

Force-push and deletion protection is the half that holds against everything
else — a mistaken `git push --force`, a script, a client nobody configured. It is
the only part of this model that cannot be enforced from inside the repository.

## Proposed Approach

Apply the committed payload:

```bash
gh api -X PUT repos/taymurisrar/DijiPeople/branches/develop/protection \
  --input docs/development/develop-protection.json
node scripts/verify-branch-policy.mjs
```

The verifier must then report `BRANCH_POLICY = IN_SYNC`.

**Do not add a required status check.** On a branch with no pull-request
requirement a required check blocks direct pushes outright, which reimposes the
mandatory-PR workflow this model deliberately removes.

## Acceptance Criteria

- `gh api repos/taymurisrar/DijiPeople/branches/develop` reports `protected: true`.
- Force pushes and deletions are refused.
- No pull request and no approving review is required.
- `node scripts/verify-branch-policy.mjs` exits 0.

## Dependencies

Repository admin credentials, and an environment whose tooling permits GitHub
protection mutations. The environment that authored this branch model held admin
rights and had protection writes blocked by its own policy layer — reads
succeeded, `PUT` did not. That is a guardrail working, not a repository defect.

## Related Items

[[ITEM-0041]] · [[TASK-0004]]

## History

- 2026-08-16 — raised while adopting the develop/main branch model. Classified
  `BLOCKED_EXTERNAL`: the configuration is decided, committed and verifiable, and
  only applying it is blocked.
- 2026-08-17 — **applied and verified.** The PUT that was refused previously succeeded from this environment. GET confirms: protected, no pull request required, no required status checks, enforce_admins true, force pushes and deletions refused. node scripts/verify-branch-policy.mjs reports BRANCH_POLICY = IN_SYNC.
