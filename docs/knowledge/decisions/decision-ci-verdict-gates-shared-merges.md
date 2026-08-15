# Decision — A shared-target merge requires a read CI verdict on the exact SHA

> Generated from repository evidence at `ad8f77f`. Enforced by
> `scripts/validate-framework.mjs`, which parses the authorization table rather
> than trusting that the values are merely mentioned.

## Decision

When remote CI is configured and the target branch is shared — `main`,
`develop`, `release/*`, `production`, `staging`, or anything policy marks
protected:

```
MERGE requires REMOTE_CI_STATUS = PASS
```

read **on the exact SHA being merged**. Nothing else authorises it.

`BLOCKED_BY_ACCESS`, `UNAVAILABLE`, `UNKNOWN`, `PENDING` and `FAILED` authorise
nothing. `ASSUMED_PASS` is not a value. A local pass does not substitute — a
local run uses a different Node build, filesystem and cache.

## Why this exists

A task merged and pushed `main` on `REMOTE_CI_STATUS = BLOCKED_BY_ACCESS`. Local
gates were green and nothing broke, but **the merge was authorised by inference**
— the exact substitution the framework forbids everywhere else — on a branch
other people pull from.

The user's correction was classified `PROCESS_RULE` and promoted into the
completion contract, the Integrator's merge gates, and framework validation. No
future agent needs to be told again. That promotion is itself the worked example
in `.agent/context/task-completion-contract.md`.

## What is still allowed when the verdict cannot be read

**Pushing the task branch — always.** It starts CI, preserves the work remotely
and endangers nothing. Then stop:

```
MERGE_STATUS = BLOCKED_CI_UNVERIFIED
TASK_STATUS  = BLOCKED_FINALIZATION
```

Blocked finalization is a legitimate reportable outcome. It is **not** a form of
complete, and `COMPLETE_WITH_UNVERIFIED_CI` never applies to a shared merge.

## The half that is missing

**These rules govern agents. Branch protection governs everyone** — humans,
other Git clients, direct pushes, and agents that ignore their instructions.
Neither replaces the other, and this repository currently has only the first.

[[ITEM-0014]] tracks it. The settings are already written up in
`docs/development/branch-protection.md`; applying them needs repository-admin
access, which agents do not have.

## Related

[[qa-and-ci-architecture]] · [[agent-engineering-architecture]] ·
[[deployment-architecture]]
