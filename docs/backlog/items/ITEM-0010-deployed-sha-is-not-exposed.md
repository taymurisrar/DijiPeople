---
ID: ITEM-0010
aliases: [ITEM-0010]
Title: The running system does not expose its deployed SHA
Type: INFRA
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api]
Source: DEPLOYMENT
OwnerAgent: release-devops
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

# ITEM-0010 — The running system does not expose its deployed SHA

## Summary

There is no way to confirm from outside the system which commit is actually
serving traffic. Every release record has to assert the deployed SHA from the
deployment process rather than observe it from the deployed system.

## Why It Matters

This is the single fact every post-deployment question depends on. "Is the fix
live?", "did the rollback take?", "which code produced this error?" — all of them
start with knowing the SHA, and none of them can currently be answered without
trusting a record of what was *intended* to deploy.

`docs/deployment/release-history/README.md` says it plainly: release records
"are the only durable record of which SHA reached which environment, **because
the running system does not expose its commit**." That is a workaround, not a
design.

## Evidence

`.agent/agents/release-devops.md`, Observability expectations: "The deployed SHA
is not exposed, so there is no way to confirm from outside which commit is
actually serving traffic."
`docs/deployment/release-history/README.md`, as quoted above.

## Proposed Approach

Have the API surface a build identifier on its existing health endpoint —
populated from the platform's build-time commit environment variable, with an
explicit `unknown` when it is absent rather than a fabricated value.

Small, additive, no new dependency, and it makes the smoke-test suite able to
assert *what* it smoke-tested.

## Acceptance Criteria

- The health response carries the SHA the running process was built from.
- `scripts/smoke-deployment.mjs` asserts the deployed SHA matches the SHA being
  released, and fails the release when they differ.
- A release record can quote an observed SHA, not an intended one.

## Dependencies

Requires the deployment platform to supply the commit at build time, and the
variable registered per `AGENTS.md` — `packages/config` validation,
`turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md`.

## Related Items

[[ITEM-0009]], of which this is the first and cheapest step ·
architecture [[deployment-architecture|Deployment Architecture]] · `docs/deployment/smoke-tests.md`.

## History

- 2026-08-15 — imported from the Release/DevOps observability gap.
